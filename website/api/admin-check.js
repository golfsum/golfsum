export const config = {
  runtime: "nodejs",
};

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  "";
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY ||
  process.env.VITE_FIREBASE_API_KEY ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const LOOKUP_TIMEOUT_MS = 10000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 180;
const MAX_BEARER_TOKEN_LENGTH = 4096;
const BEARER_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ALLOWED_ORIGINS = new Set(
  String(process.env.GS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const setSecurityHeaders = (res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
};

const parseBearerToken = (req) => {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const value = Array.isArray(raw) ? raw[0] : raw;
  const m = /^Bearer\s+(.+)$/i.exec(String(value));
  const token = m?.[1] || "";
  if (!token) return { token: null, invalid: false };
  if (token.length > MAX_BEARER_TOKEN_LENGTH) return { token: null, invalid: true };
  if (!BEARER_JWT_PATTERN.test(token)) return { token: null, invalid: true };
  return { token, invalid: false };
};

const isAllowedOrigin = (req) => {
  if (ALLOWED_ORIGINS.size === 0) return true;
  const raw = req.headers?.origin || req.headers?.Origin || "";
  const origin = Array.isArray(raw) ? raw[0] : String(raw || "").trim();
  if (!origin) return false;
  try {
    const normalized = new URL(origin).origin;
    return ALLOWED_ORIGINS.has(normalized);
  } catch {
    return false;
  }
};

const authedFetch = (url, token, init = {}) =>
  fetchWithTimeout(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

const fetchWithTimeout = async (url, init = {}, timeoutMs = LOOKUP_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const getClientIp = (req) => {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
};

const getRateLimitStore = () => {
  if (!globalThis.__gsAdminCheckRateLimit) {
    globalThis.__gsAdminCheckRateLimit = new Map();
  }
  return globalThis.__gsAdminCheckRateLimit;
};

const sweepRateLimitStore = (store, now) => {
  for (const [key, value] of store) {
    if (!value || now - value.start > RATE_LIMIT_WINDOW_MS) {
      store.delete(key);
    }
  }
};

const checkRateLimit = (ip) => {
  const now = Date.now();
  const store = getRateLimitStore();
  if (store.size > RATE_LIMIT_MAX * 10) sweepRateLimitStore(store, now);
  const entry = store.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    store.set(ip, { start: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      remaining: 0,
      resetSeconds: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.start)) / 1000),
    };
  }
  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
};

async function assertAdmin(token) {
  try {
    if (!FIREBASE_API_KEY) return false;
    const lookupResp = await fetchWithTimeout(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }
    );
    if (!lookupResp.ok) return false;
    const lookupData = await lookupResp.json().catch(() => null);
    const uid = lookupData?.users?.[0]?.localId;
    if (!uid) return false;
    const adminResp = await authedFetch(`${FIRESTORE_BASE}/admins/${encodeURIComponent(uid)}`, token);
    return adminResp.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader("Vary", "Origin");

  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
  res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  if (!rate.allowed) {
    if (rate.resetSeconds) res.setHeader("Retry-After", String(rate.resetSeconds));
    return res.status(429).json({ error: "rate_limited" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: "forbidden_origin" });
  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) return res.status(500).json({ error: "server_error" });

  const auth = parseBearerToken(req);
  if (auth.invalid) return res.status(400).json({ error: "invalid_authorization" });
  if (!auth.token) return res.status(401).json({ error: "unauthorized" });

  const isAdmin = await assertAdmin(auth.token);
  if (!isAdmin) return res.status(403).json({ error: "forbidden" });
  return res.status(200).json({ ok: true });
}
