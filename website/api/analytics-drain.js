import { sql } from "@vercel/postgres";
import crypto from "node:crypto";

export const config = {
  runtime: "nodejs",
};
const IS_PROD = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

const verifyDrainSecret = (req) => {
  const expected = process.env.ANALYTICS_DRAIN_SECRET || "";
  if (!expected) return { ok: !IS_PROD, code: "missing_secret" };

  const raw = req.headers["x-gs-drain-secret"] || req.headers["X-GS-DRAIN-SECRET"] || "";
  const provided = Array.isArray(raw) ? raw[0] : String(raw);
  if (!provided) return { ok: false, code: "missing_header" };
  if (provided.length > MAX_DRAIN_SECRET_LENGTH) return { ok: false, code: "invalid_secret" };
  try {
    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(provided, "utf8");
    if (expectedBuf.length !== providedBuf.length) return { ok: false, code: "invalid_secret" };
    if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) return { ok: false, code: "invalid_secret" };
  } catch {
    return { ok: false, code: "invalid_secret" };
  }
  return { ok: true, code: null };
};

const MAX_DRAIN_BODY_BYTES = 5 * 1024 * 1024;
const MAX_DRAIN_EVENTS = 5000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 500;
const MAX_PROJECT_ID_LENGTH = 64;
const MAX_EVENT_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
const MAX_DRAIN_SECRET_LENGTH = 512;
const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const ANALYTICS_PROJECT_ALLOWLIST = new Set(
  String(process.env.ANALYTICS_PROJECT_ALLOWLIST || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
);
const ALLOWED_ORIGINS = new Set(
  String(process.env.GS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const ensureTables = async () => {
  await sql`
    create table if not exists analytics_daily (
      day date not null,
      project_id text not null,
      pageviews bigint not null default 0,
      unique_visitors bigint not null default 0,
      primary key (day, project_id)
    );
  `;
  await sql`
    create table if not exists analytics_devices_day (
      day date not null,
      project_id text not null,
      device_id bigint not null,
      primary key (day, project_id, device_id)
    );
  `;
};

const readBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_DRAIN_BODY_BYTES) {
      const err = new Error("Payload too large");
      err.code = "PAYLOAD_TOO_LARGE";
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return null;
  return raw;
};

const parseEvents = (body) => {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (typeof body === "object") return [body];
  if (typeof body !== "string") return null;
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  let hasInvalidLine = false;
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        hasInvalidLine = true;
        return null;
      }
    })
    .filter(Boolean)
    .concat(hasInvalidLine ? [null] : []);
};

const toDay = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const getClientIp = (req) => {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
};

const getRateLimitStore = () => {
  if (!globalThis.__gsAnalyticsDrainRateLimit) {
    globalThis.__gsAnalyticsDrainRateLimit = new Map();
  }
  return globalThis.__gsAnalyticsDrainRateLimit;
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

const normalizeProjectId = (value) => {
  const projectId = String(value || "").trim();
  if (!projectId || projectId.length > MAX_PROJECT_ID_LENGTH) return null;
  if (!PROJECT_ID_PATTERN.test(projectId)) return null;
  if (ANALYTICS_PROJECT_ALLOWLIST.size > 0 && !ANALYTICS_PROJECT_ALLOWLIST.has(projectId)) return null;
  return projectId;
};

const normalizeDeviceId = (value) => {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > Number.MAX_SAFE_INTEGER) return null;
  return value;
};

const isValidEventTimestamp = (value, now = Date.now()) => {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return false;
  if (ts > now + MAX_FUTURE_SKEW_MS) return false;
  if (ts < now - MAX_EVENT_AGE_MS) return false;
  return true;
};

const normalizePageviewEvents = (events) => {
  const now = Date.now();
  return events
    .filter((e) => e && typeof e === "object" && e.eventType === "pageview")
    .filter((e) => isValidEventTimestamp(e.timestamp, now))
    .map((e) => {
      const hasProjectId = e.projectId != null && String(e.projectId).trim() !== "";
      const projectId = hasProjectId
        ? normalizeProjectId(e.projectId)
        : (ANALYTICS_PROJECT_ALLOWLIST.size === 0 ? "unknown" : null);
      const day = toDay(e.timestamp);
      const deviceId = normalizeDeviceId(e.deviceId);
      if (!day || !projectId) return null;
      return { day, projectId, deviceId };
    })
    .filter(Boolean);
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

const groupPageviews = (pageviews) => {
  const grouped = new Map();
  for (const evt of pageviews) {
    const key = `${evt.day}|${evt.projectId}`;
    let row = grouped.get(key);
    if (!row) {
      row = { day: evt.day, projectId: evt.projectId, pageviews: 0, deviceIds: new Set() };
      grouped.set(key, row);
    }
    row.pageviews += 1;
    if (evt.deviceId != null) row.deviceIds.add(evt.deviceId);
  }
  return Array.from(grouped.values());
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

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader("Vary", "Origin");

  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
  res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  if (!rate.allowed) {
    if (rate.resetSeconds) res.setHeader("Retry-After", String(rate.resetSeconds));
    return res.status(429).json({ ok: false, error: "rate_limited" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ ok: false, error: "forbidden_origin" });
  }
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType && !contentType.includes("application/json") && !contentType.includes("text/plain")) {
    return res.status(415).json({ ok: false, error: "unsupported_content_type" });
  }

  const auth = verifyDrainSecret(req);
  if (!auth.ok) {
    if (auth.code === "missing_secret") {
      return res.status(500).json({ ok: false, error: "analytics_drain_secret_not_configured" });
    }
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (IS_PROD && ANALYTICS_PROJECT_ALLOWLIST.size === 0) {
    return res.status(500).json({ ok: false, error: "analytics_project_allowlist_not_configured" });
  }

  try {
    await ensureTables();
    const body = await readBody(req);
    const events = parseEvents(body);
    if (!events || events.some((evt) => evt === null)) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }
    if (events.length > MAX_DRAIN_EVENTS) {
      return res.status(413).json({ ok: false, error: "too_many_events" });
    }
    const pageviews = normalizePageviewEvents(events);
    const groupedPageviews = groupPageviews(pageviews);

    for (const evt of groupedPageviews) {
      const { day, projectId, pageviews: pageviewCount, deviceIds } = evt;
      let uniqueInc = 0;
      for (const deviceId of deviceIds) {
        const insertDevice = await sql`
          insert into analytics_devices_day (day, project_id, device_id)
          values (${day}, ${projectId}, ${deviceId})
          on conflict do nothing;
        `;
        if (insertDevice.rowCount > 0) uniqueInc += 1;
      }

      await sql`
        insert into analytics_daily (day, project_id, pageviews, unique_visitors)
        values (${day}, ${projectId}, ${pageviewCount}, ${uniqueInc})
        on conflict (day, project_id) do update
        set pageviews = analytics_daily.pageviews + ${pageviewCount},
            unique_visitors = analytics_daily.unique_visitors + ${uniqueInc};
      `;
    }

    return res.status(200).json({ ok: true, received: pageviews.length });
  } catch (e) {
    if (e?.code === "PAYLOAD_TOO_LARGE") {
      return res.status(413).json({ ok: false, error: "payload_too_large" });
    }
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
