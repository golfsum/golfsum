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
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const REQUEST_TIMEOUT_MS = 30000;
const MAX_BEARER_TOKEN_LENGTH = 4096;
const BEARER_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ALLOWED_AUDIENCES = new Set(["all", "marketing", "maintenance"]);
const ALLOWED_SCREENS = new Set(["pro-upgrade", "history", "averages", "insights", "profile", "upload"]);
const ALLOWED_TABS = new Set(["history", "averages", "upload", "insights", "profile"]);

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

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "object") return { mapValue: { fields: toFirestoreFields(value) } };
  return { stringValue: String(value) };
};

const toFirestoreFields = (obj) => {
  const fields = {};
  for (const [key, value] of Object.entries(obj || {})) fields[key] = toFirestoreValue(value);
  return fields;
};

const setSecurityHeaders = (res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
};

const parseBearerToken = (req) => {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = /^Bearer\s+(.+)$/i.exec(String(value));
  const token = match?.[1] || "";
  if (!token) return { token: null, invalid: false };
  if (token.length > MAX_BEARER_TOKEN_LENGTH) return { token: null, invalid: true };
  if (!BEARER_JWT_PATTERN.test(token)) return { token: null, invalid: true };
  return { token, invalid: false };
};

const fetchWithTimeout = async (url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const authedFetch = (url, token, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) =>
  fetchWithTimeout(
    url,
    {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    },
    timeoutMs
  );

async function assertAdmin(token) {
  try {
    if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) return false;
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
  return (Array.isArray(data) ? data : [])
    .map((row) => row.document)
    .filter(Boolean)
    .map((doc) => ({
      id: doc.name?.split("/").pop(),
      path: (doc.name || "").split("/documents/")[1] || "",
      ...fromFirestoreFields(doc.fields || {}),
    }));
}

async function patchDocument(path, token, updates) {
  const fieldPaths = Object.keys(updates || {});
  const params = fieldPaths.map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
  const resp = await authedFetch(
    `${FIRESTORE_BASE}/${path}${params ? `?${params}` : ""}`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(updates) }),
    }
  );
  return resp.ok;
}

async function createDocument(collectionPath, token, payload) {
  const resp = await authedFetch(
    `${FIRESTORE_BASE}/${collectionPath}`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(payload) }),
    }
  );
  return resp.ok;
}

async function listPushDevices(token) {
  return runQuery(
    {
      from: [{ collectionId: "pushDevices", allDescendants: true }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: "active" },
        },
      },
      limit: 2000,
    },
    token
  );
}

async function listRecentCampaigns(token) {
  return runQuery(
    {
      from: [{ collectionId: "pushCampaigns" }],
      orderBy: [{ field: { fieldPath: "sentAt" }, direction: "DESCENDING" }],
      limit: 10,
    },
    token
  );
}

const chunk = (items, size) => {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
};

const normalizeBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return typeof req.body === "object" ? req.body : {};
};

const filterDevicesForAudience = (devices, audience) =>
  devices.filter((device) => {
    if (!device?.expoPushToken || typeof device.expoPushToken !== "string") return false;
    if (device.notificationsEnabled !== true) return false;
    if (audience === "marketing") return device.marketingEnabled === true;
    if (audience === "maintenance") return device.maintenanceEnabled !== false;
    return true;
  });

async function sendExpoMessages(messages) {
  const responses = [];
  for (const group of chunk(messages, 100)) {
    const resp = await fetchWithTimeout(
      EXPO_PUSH_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(group),
      },
      20000
    );
    const data = await resp.json().catch(() => ({}));
    responses.push({
      ok: resp.ok,
      data: Array.isArray(data?.data) ? data.data : [],
      errors: Array.isArray(data?.errors) ? data.errors : [],
    });
  }
  return responses;
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) {
    return res.status(500).json({ error: "Missing Firebase configuration" });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, invalid } = parseBearerToken(req);
  if (invalid) return res.status(400).json({ error: "Malformed bearer token" });
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const admin = await assertAdmin(token);
  if (!admin) return res.status(403).json({ error: "Admin access required" });

  if (req.method === "GET") {
    const [devices, recentCampaigns] = await Promise.all([
      listPushDevices(token),
      listRecentCampaigns(token),
    ]);
    return res.status(200).json({
      activeDevices: devices.length,
      marketingDevices: devices.filter((device) => device.marketingEnabled === true && device.notificationsEnabled === true).length,
      maintenanceDevices: devices.filter((device) => device.maintenanceEnabled !== false && device.notificationsEnabled === true).length,
      recentCampaigns,
    });
  }

  const body = normalizeBody(req);
  const audience = typeof body.audience === "string" ? body.audience : "marketing";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = typeof body.body === "string" ? body.body.trim() : "";
  const screen = typeof body.screen === "string" ? body.screen.trim() : "";
  const tab = typeof body.tab === "string" ? body.tab.trim() : "";
  const source = typeof body.source === "string" ? body.source.trim() : "";

  if (!ALLOWED_AUDIENCES.has(audience)) {
    return res.status(400).json({ error: "Invalid audience" });
  }
  if (!title || title.length > 80) {
    return res.status(400).json({ error: "Title is required and must be 80 characters or fewer" });
  }
  if (!message || message.length > 240) {
    return res.status(400).json({ error: "Body is required and must be 240 characters or fewer" });
  }
  if (screen && !ALLOWED_SCREENS.has(screen)) {
    return res.status(400).json({ error: "Invalid destination screen" });
  }
  if (tab && !ALLOWED_TABS.has(tab)) {
    return res.status(400).json({ error: "Invalid destination tab" });
  }

  const devices = await listPushDevices(token);
  const targetDevices = filterDevicesForAudience(devices, audience);
  if (targetDevices.length === 0) {
    return res.status(200).json({
      ok: true,
      targetedCount: 0,
      sentCount: 0,
      errorCount: 0,
      invalidatedCount: 0,
    });
  }

  const routeData = {
    ...(screen ? { screen } : {}),
    ...(tab ? { tab } : {}),
    ...(source ? { source } : {}),
  };
  const messages = targetDevices.map((device) => ({
    to: device.expoPushToken,
    title,
    body: message,
    sound: "default",
    data: routeData,
  }));

  const expoResponses = await sendExpoMessages(messages);
  let sentCount = 0;
  let errorCount = 0;
  const invalidPaths = [];
  let globalErrors = 0;
  let baseIndex = 0;

  for (const response of expoResponses) {
    globalErrors += response.errors.length;
    response.data.forEach((ticket, ticketIndex) => {
      const device = targetDevices[baseIndex + ticketIndex];
      if (!device) return;
      if (ticket?.status === "ok") {
        sentCount += 1;
        return;
      }
      errorCount += 1;
      if (ticket?.details?.error === "DeviceNotRegistered") {
        invalidPaths.push(device.path);
      }
    });
    baseIndex += response.data.length;
  }

  const invalidatedCount = invalidPaths.length;
  await Promise.all(
    invalidPaths.map((path) =>
      patchDocument(path, token, {
        status: "invalid",
        expoPushToken: null,
        updatedAt: new Date().toISOString(),
      }).catch(() => false)
    )
  );

  const sentAt = new Date().toISOString();
  await createDocument("pushCampaigns", token, {
    audience,
    title,
    body: message,
    screen: screen || null,
    tab: tab || null,
    source: source || null,
    targetedCount: targetDevices.length,
    sentCount,
    errorCount: errorCount + globalErrors,
    invalidatedCount,
    sentAt,
  }).catch(() => false);

  return res.status(200).json({
    ok: true,
    targetedCount: targetDevices.length,
    sentCount,
    errorCount: errorCount + globalErrors,
    invalidatedCount,
    sentAt,
  });
}
