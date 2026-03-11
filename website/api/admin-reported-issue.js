export const config = {
  runtime: "nodejs",
};

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  "";
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const ALLOWED_UPDATE_KEYS = new Set([
  "adminNote",
  "status",
  "completedAt",
  "completedBy",
  "completedByEmail",
  "thread",
  "updatedAt",
]);
const MAX_BODY_BYTES = 256 * 1024;
const LOOKUP_TIMEOUT_MS = 10000;
const MAX_ADMIN_NOTE_LENGTH = 2000;
const MAX_THREAD_ENTRIES = 100;
const MAX_THREAD_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 90;
const MAX_UID_LENGTH = 128;
const MAX_EMAIL_LENGTH = 320;
const MAX_ISSUE_ID_LENGTH = 256;
const MAX_BEARER_TOKEN_LENGTH = 4096;
const ISSUE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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

const toFirestoreValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "object") return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
};

const toFirestoreFields = (obj) => {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) fields[k] = toFirestoreValue(v);
  return fields;
};

const readBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    const sizeBytes = Buffer.byteLength(JSON.stringify(req.body));
    if (sizeBytes > MAX_BODY_BYTES) {
      const err = new Error("Payload too large");
      err.code = "PAYLOAD_TOO_LARGE";
      throw err;
    }
    return req.body;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const err = new Error("Payload too large");
      err.code = "PAYLOAD_TOO_LARGE";
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON");
    err.code = "INVALID_JSON";
    throw err;
  }
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

const authedFetch = (url, token, init = {}, timeoutMs = LOOKUP_TIMEOUT_MS) =>
  fetchWithTimeout(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  }, timeoutMs);

const fetchWithTimeout = async (url, init = {}, timeoutMs = LOOKUP_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const sanitizeThread = (value) => {
  if (!Array.isArray(value)) return null;
  return value
    .slice(0, MAX_THREAD_ENTRIES)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const from = entry.from === "admin" ? "admin" : "user";
      const message = normalizeText(entry.message, MAX_THREAD_MESSAGE_LENGTH);
      if (!message) return null;
      const createdAt = sanitizeTimestamp(entry.createdAt) || new Date().toISOString();
      return { from, message, createdAt };
    })
    .filter(Boolean);
};

const getClientIp = (req) => {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
};

const getRateLimitStore = () => {
  if (!globalThis.__gsAdminReportedIssueRateLimit) {
    globalThis.__gsAdminReportedIssueRateLimit = new Map();
  }
  return globalThis.__gsAdminReportedIssueRateLimit;
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

const normalizeText = (value, maxLength) =>
  String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeTimestamp = (value) => {
  if (value == null || value === "") return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
};

const sanitizeUpdates = (updates) => {
  const out = {};
  for (const [k, v] of Object.entries(updates || {})) {
    if (ALLOWED_UPDATE_KEYS.has(k)) out[k] = v;
  }
  if ("status" in out && out.status !== "open" && out.status !== "completed") {
    delete out.status;
  }
  if ("adminNote" in out) {
    out.adminNote = normalizeText(out.adminNote, MAX_ADMIN_NOTE_LENGTH);
  }
  if ("completedBy" in out) {
    out.completedBy = normalizeText(out.completedBy, MAX_UID_LENGTH);
  }
  if ("completedByEmail" in out) {
    out.completedByEmail = normalizeText(out.completedByEmail, MAX_EMAIL_LENGTH);
    if (out.completedByEmail && !EMAIL_PATTERN.test(out.completedByEmail)) delete out.completedByEmail;
  }
  if ("completedAt" in out) {
    const ts = sanitizeTimestamp(out.completedAt);
    if (ts) out.completedAt = ts;
    else delete out.completedAt;
  }
  if ("updatedAt" in out) {
    const ts = sanitizeTimestamp(out.updatedAt);
    if (ts) out.updatedAt = ts;
    else delete out.updatedAt;
  }
  if ("thread" in out) {
    out.thread = sanitizeThread(out.thread);
    if (!out.thread || out.thread.length === 0) delete out.thread;
  }
  // Keep completion fields coherent with status transitions.
  if (out.status === "open") {
    out.completedAt = null;
    out.completedBy = null;
    out.completedByEmail = null;
  }
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

async function getIssueById(issueId, token) {
  const resp = await authedFetch(`${FIRESTORE_BASE}/reportedIssues/${encodeURIComponent(issueId)}`, token, {}, LOOKUP_TIMEOUT_MS);
  if (!resp.ok) return null;
  const data = await resp.json();
  return { id: data.name?.split("/").pop(), ...fromFirestoreFields(data.fields || {}) };
}

async function patchDoc(path, updates, token) {
  const fieldPaths = Object.keys(updates || {})
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const url = `${FIRESTORE_BASE}/${path}${fieldPaths ? `?${fieldPaths}` : ""}`;
  const resp = await authedFetch(url, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(updates) }),
  }, LOOKUP_TIMEOUT_MS);
  return resp.ok;
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

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: "forbidden_origin" });
  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) return res.status(500).json({ error: "server_error" });

  const auth = parseBearerToken(req);
  if (auth.invalid) return res.status(400).json({ error: "invalid_authorization" });
  if (!auth.token) return res.status(401).json({ error: "unauthorized" });
  const token = auth.token;
  if (!(await assertAdmin(token))) return res.status(403).json({ error: "forbidden" });
  const contentType = String(req.headers["content-type"] || "");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    return res.status(415).json({ error: "unsupported_content_type" });
  }

  let body = null;
  try {
    body = await readBody(req);
  } catch (error) {
    if (error?.code === "PAYLOAD_TOO_LARGE") return res.status(413).json({ error: "payload_too_large" });
    if (error?.code === "INVALID_JSON") return res.status(400).json({ error: "invalid_json" });
    return res.status(400).json({ error: "invalid_request" });
  }
  const issueInput = body?.issue || null;
  const updates = sanitizeUpdates(body?.updates || {});

  if (!issueInput?.uid || typeof issueInput.uid !== "string" || issueInput.uid.length > MAX_UID_LENGTH) {
    return res.status(400).json({ error: "invalid_issue_uid" });
  }
  if (
    issueInput?.id &&
    (typeof issueInput.id !== "string" ||
      issueInput.id.length > MAX_ISSUE_ID_LENGTH ||
      !ISSUE_ID_PATTERN.test(issueInput.id))
  ) {
    return res.status(400).json({ error: "invalid_issue_id" });
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "no_valid_updates" });
  }

  const now = new Date().toISOString();
  const baseIssue = issueInput?.id ? await getIssueById(issueInput.id, token) : issueInput;
  if (!baseIssue) return res.status(404).json({ error: "not_found" });
  if (baseIssue?.uid && baseIssue.uid !== issueInput.uid) {
    return res.status(400).json({ error: "issue_uid_mismatch" });
  }

  const nextIssue = {
    ...baseIssue,
    ...updates,
    updatedAt: updates.updatedAt || now,
    status: updates.status || baseIssue.status || "open",
  };
  if (nextIssue.status === "completed" && !nextIssue.completedAt) {
    nextIssue.completedAt = now;
  }
  if (nextIssue.status === "open") {
    nextIssue.completedAt = null;
    nextIssue.completedBy = null;
    nextIssue.completedByEmail = null;
  }

  const userPatched = await patchDoc(
    `users/${encodeURIComponent(issueInput.uid)}`,
    {
      lastReportedIssue: nextIssue,
      lastReportedIssueAt: baseIssue.createdAt || issueInput.createdAt || now,
    },
    token
  );
  if (!userPatched) return res.status(502).json({ error: "upstream_failure" });

  if (issueInput?.id) {
    const reportPatched = await patchDoc(
      `reportedIssues/${encodeURIComponent(issueInput.id)}`,
      { ...updates, updatedAt: updates.updatedAt || now },
      token
    );
    if (!reportPatched) return res.status(502).json({ error: "upstream_failure" });
  }

  return res.status(200).json({ ok: true, issue: nextIssue });
}
