export const config = {
  runtime: "nodejs",
};

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  "";
const LOOKUP_TIMEOUT_MS = 20000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 120;
const MAX_BEARER_TOKEN_LENGTH = 4096;
const BEARER_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const ALLOWED_ORIGINS = new Set(
  String(process.env.GS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
);

const fromFirestoreValue = (v) => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("nullValue" in v) return null;
  return null;
};

const fromFirestoreFields = (fields) => {
  const obj = {};
  for (const [k, v] of Object.entries(fields || {})) obj[k] = fromFirestoreValue(v);
  return obj;
};

const setSecurityHeaders = (res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
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

const fetchWithTimeout = async (url, init = {}, timeoutMs = LOOKUP_TIMEOUT_MS) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
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

const getRateLimitStore = () => {
  if (!globalThis.__gsUserRoundsRateLimit) globalThis.__gsUserRoundsRateLimit = new Map();
  return globalThis.__gsUserRoundsRateLimit;
};

const checkRateLimit = (ip) => {
  const now = Date.now();
  const store = getRateLimitStore();
  const entry = store.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    store.set(ip, { start: now, count: 1 });
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT_MAX) return { allowed: false };
  entry.count += 1;
  return { allowed: true };
};

const getClientIp = (req) => {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
};

const assertAdmin = async (token) => {
  const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "";
  if (!FIREBASE_API_KEY) return false;
  try {
    const resp = await fetchWithTimeout(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      },
      8000
    );
    if (!resp.ok) return false;
    const data = await resp.json().catch(() => null);
    const uid = data?.users?.[0]?.localId;
    if (!uid) return false;
    const adminDoc = await authedFetch(`${FIRESTORE_BASE}/admins/${encodeURIComponent(uid)}`, token);
    return adminDoc.status === 200;
  } catch {
    return false;
  }
};

async function getUserRounds(uid, token) {
  const structuredQuery = {
    from: [{ collectionId: "rounds" }],
    orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }],
    limit: 200,
  };

  const resp = await authedFetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}:runQuery`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery }),
    }
  );

  if (!resp.ok) return [];
  const data = await resp.json().catch(() => []);
  return (Array.isArray(data) ? data : [])
    .map((row) => row.document)
    .filter(Boolean)
    .map((doc) => ({
      id: doc.name?.split("/").pop(),
      ...fromFirestoreFields(doc.fields || {}),
    }));
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader("Vary", "Origin");

  const ip = getClientIp(req);
  if (!checkRateLimit(ip).allowed) return res.status(429).json({ error: "rate_limited" });

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: "forbidden_origin" });
  if (!FIREBASE_PROJECT_ID) return res.status(500).json({ error: "server_error" });

  const auth = parseBearerToken(req);
  if (auth.invalid) return res.status(400).json({ error: "invalid_authorization" });
  if (!auth.token) return res.status(401).json({ error: "unauthorized" });

  const uid = Array.isArray(req.query.uid) ? req.query.uid[0] : req.query.uid;
  if (!uid || typeof uid !== "string" || uid.length < 4 || uid.length > 128) {
    return res.status(400).json({ error: "invalid_uid" });
  }

  if (!(await assertAdmin(auth.token))) return res.status(403).json({ error: "forbidden" });

  try {
    const rounds = await getUserRounds(uid, auth.token);
    return res.status(200).json({ rounds });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
}
