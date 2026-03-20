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
const LOOKUP_TIMEOUT_MS = 30000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 60;
const DASHBOARD_USER_LIMIT = 100;
const MAX_BEARER_TOKEN_LENGTH = 4096;
const BEARER_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ALLOWED_ORIGINS = new Set(
  String(process.env.GS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
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

const fetchWithTimeout = async (url, init = {}, timeoutMs = LOOKUP_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const authedFetch = (url, token, init = {}, timeoutMs = LOOKUP_TIMEOUT_MS) =>
  fetchWithTimeout(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  }, timeoutMs);

const getClientIp = (req) => {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
};

const getRateLimitStore = () => {
  if (!globalThis.__gsAdminDashboardRateLimit) {
    globalThis.__gsAdminDashboardRateLimit = new Map();
  }
  return globalThis.__gsAdminDashboardRateLimit;
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

const mapWithConcurrency = async (items, limit, worker) => {
  const out = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx++;
      out[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return out;
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
      },
      10000
    );
    if (!lookupResp.ok) return false;
    const lookupData = await lookupResp.json().catch(() => null);
    const uid = lookupData?.users?.[0]?.localId;
    if (!uid) return false;
    const adminResp = await authedFetch(`${FIRESTORE_BASE}/admins/${encodeURIComponent(uid)}`, token, {}, 10000);
    return adminResp.ok;
  } catch {
    return false;
  }
}

async function listCollection(path, token, pageSize = 300) {
  const resp = await authedFetch(`${FIRESTORE_BASE}/${path}?pageSize=${pageSize}`, token);
  if (!resp.ok) return [];
  const data = await resp.json().catch(() => null);
  return (data?.documents || []).map((doc) => ({
    id: doc.name?.split("/").pop(),
    ...fromFirestoreFields(doc.fields || {}),
  }));
}

async function getDocument(path, token) {
  const resp = await authedFetch(`${FIRESTORE_BASE}/${path}`, token);
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  if (!data?.fields) return null;
  return {
    id: data.name?.split("/").pop(),
    ...fromFirestoreFields(data.fields || {}),
  };
}

async function runAggregationQuery(structuredQuery, token, alias = "count") {
  const resp = await authedFetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runAggregationQuery`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery,
          aggregations: [{ alias, count: {} }],
        },
      }),
    }
  );
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  const value = data?.[0]?.result?.aggregateFields?.[alias];
  if (!value) return null;
  return value.integerValue != null ? Number(value.integerValue) : value.doubleValue ?? null;
}

async function runQuery(structuredQuery, token) {
  const resp = await authedFetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery }),
    }
  );
  if (!resp.ok) return [];
  const data = await resp.json().catch(() => []);
  return data
    .map((row) => row.document)
    .filter(Boolean)
    .map((doc) => ({
      id: doc.name?.split("/").pop(),
      ...fromFirestoreFields(doc.fields || {}),
    }));
}

async function listRecentUsers(token, pageSize = DASHBOARD_USER_LIMIT) {
  const structuredQuery = {
    from: [{ collectionId: "users" }],
    orderBy: [{ field: { fieldPath: "lastLoginAt" }, direction: "DESCENDING" }],
    limit: pageSize,
  };

  const resp = await authedFetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
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

async function getRoundCount(uid, token) {
  const resp = await authedFetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}:runAggregationQuery`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery: {
            from: [{ collectionId: "rounds" }],
          },
          aggregations: [{ alias: "count", count: {} }],
        },
      }),
    }
  );

  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  const value = data?.[0]?.result?.aggregateFields?.count;
  if (!value) return 0;
  return value.integerValue != null ? Number(value.integerValue) : value.doubleValue ?? 0;
}

async function fetchDashboardData(token) {
  const usersRaw = await listRecentUsers(token, DASHBOARD_USER_LIMIT);
  const users = usersRaw
    .map((u) => ({ ...u, uid: u.uid || u.id || "" }))
    .filter((u) => typeof u.uid === "string" && u.uid.length > 0);

  const roundCounts = {};
  await mapWithConcurrency(users, 20, async (usr) => {
    if (!usr?.uid) return;
    roundCounts[usr.uid] = await getRoundCount(usr.uid, token);
  });

  const ocrBase = {
    from: [{ collectionId: "courses" }],
    where: { fieldFilter: { field: { fieldPath: "source" }, op: "EQUAL", value: { stringValue: "USER_OCR" } } },
  };
  const [ocrTotal, ocrLastArr, reportedIssues, ocrErrors, golfApiUsage] = await Promise.all([
    runAggregationQuery(ocrBase, token, "ocrCount"),
    runQuery({ ...ocrBase, orderBy: [{ field: { fieldPath: "lastVerifiedAt" }, direction: "DESCENDING" }], limit: 1 }, token),
    listCollection("reportedIssues", token, 200),
    listCollection("ocrErrors", token, 200),
    getDocument("adminMetrics/golfApiUsage", token),
  ]);

  return {
    users,
    roundCounts,
    hasMore: users.length === DASHBOARD_USER_LIMIT,
    ocrStats: { total: ocrTotal, last: ocrLastArr?.[0] || null },
    reportedIssues,
    ocrErrors,
    golfApiUsage,
  };
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
  const token = auth.token;
  if (!(await assertAdmin(token))) return res.status(403).json({ error: "forbidden" });

  try {
    const result = await fetchDashboardData(token);
    return res.status(200).json(result);
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
}
