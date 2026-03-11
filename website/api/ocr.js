const crypto = require('crypto');
let sql = null;
try {
  ({ sql } = require('@vercel/postgres'));
} catch {
  sql = null;
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const MAX_OCR_BODY_BYTES = 15 * 1024 * 1024;
const OCR_UPSTREAM_TIMEOUT_MS = 30000;
const ALLOWED_MODES = new Set(['course', 'completed']);
const HMAC_SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const USE_PERSISTENT_RATE_LIMIT = process.env.OCR_RATE_LIMIT_USE_POSTGRES === '0'
  ? false
  : Boolean(sql);
const ALLOWED_ORIGINS = new Set(
  String(process.env.GS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function getRateLimitStore() {
  if (!globalThis.__gsRateLimit) {
    globalThis.__gsRateLimit = new Map();
  }
  return globalThis.__gsRateLimit;
}

function sweepRateLimitStore(store, now) {
  for (const [key, value] of store) {
    if (!value || now - value.start > RATE_LIMIT_WINDOW_MS) {
      store.delete(key);
    }
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const store = getRateLimitStore();
  if (store.size > RATE_LIMIT_MAX * 10) sweepRateLimitStore(store, now);
  const entry = store.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    store.set(ip, { start: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetMs: RATE_LIMIT_WINDOW_MS - (now - entry.start) };
  }
  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

async function ensureRateLimitTable() {
  if (!USE_PERSISTENT_RATE_LIMIT) return;
  await sql`
    create table if not exists ocr_rate_limit (
      window_start bigint not null,
      client_ip text not null,
      request_count integer not null default 0,
      primary key (window_start, client_ip)
    );
  `;
}

async function checkRateLimitPersistent(ip) {
  const now = Date.now();
  const windowStart = Math.floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
  const resetMs = RATE_LIMIT_WINDOW_MS - (now - windowStart);

  await ensureRateLimitTable();

  await sql`
    insert into ocr_rate_limit (window_start, client_ip, request_count)
    values (${windowStart}, ${ip}, 1)
    on conflict (window_start, client_ip)
    do update set request_count = ocr_rate_limit.request_count + 1;
  `;

  const { rows } = await sql`
    select request_count
    from ocr_rate_limit
    where window_start = ${windowStart} and client_ip = ${ip}
    limit 1;
  `;
  const count = Number(rows?.[0]?.request_count || 0);

  // Opportunistic cleanup to keep table bounded.
  await sql`
    delete from ocr_rate_limit
    where window_start < ${windowStart - (RATE_LIMIT_WINDOW_MS * 3)};
  `;

  if (count > RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetMs };
  }
  return { allowed: true, remaining: Math.max(0, RATE_LIMIT_MAX - count), resetMs };
}

async function checkRateLimitAny(ip) {
  if (!USE_PERSISTENT_RATE_LIMIT) return checkRateLimit(ip);
  try {
    return await checkRateLimitPersistent(ip);
  } catch {
    return checkRateLimit(ip);
  }
}

function verifySignature(req) {
  const secret = process.env.GS_API_SIGNING_SECRET;
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!secret) {
    return { ok: !isProd, code: 'missing_signing_secret' };
  }

  const timestampRaw = req.headers['x-gs-timestamp'];
  const signatureRaw = req.headers['x-gs-signature'];
  const timestamp = Array.isArray(timestampRaw) ? timestampRaw[0] : timestampRaw;
  const signature = Array.isArray(signatureRaw) ? signatureRaw[0] : signatureRaw;
  if (!timestamp || !signature) return { ok: false, code: 'missing_signature_headers' };
  if (!HMAC_SHA256_HEX_PATTERN.test(String(signature))) return { ok: false, code: 'invalid_signature' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, code: 'invalid_timestamp' };

  const maxSkewMs = 5 * 60 * 1000;
  if (Math.abs(Date.now() - ts) > maxSkewMs) return { ok: false, code: 'timestamp_skew' };

  const url = new URL(req.url, 'http://localhost');
  const mode = url.searchParams.get('mode') || '';
  const payload = `${timestamp}.${req.method}.${url.pathname}.${mode}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    return { ok, code: ok ? null : 'invalid_signature' };
  } catch {
    return { ok: false, code: 'invalid_signature' };
  }
}

function isAllowedOrigin(req) {
  if (ALLOWED_ORIGINS.size === 0) return true;
  const raw = req.headers?.origin || req.headers?.Origin || '';
  const origin = Array.isArray(raw) ? raw[0] : String(raw || '').trim();
  if (!origin) return false;
  try {
    const normalized = new URL(origin).origin;
    return ALLOWED_ORIGINS.has(normalized);
  } catch {
    return false;
  }
}

async function readRawBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_OCR_BODY_BYTES) {
      const err = new Error('Payload too large');
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
}

module.exports = async (req, res) => {
  setSecurityHeaders(res);
  res.setHeader('Vary', 'Origin');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('method_not_allowed');
    return;
  }
  if (!isAllowedOrigin(req)) {
    res.statusCode = 403;
    res.end('forbidden_origin');
    return;
  }

  const ip = getClientIp(req);
  const rate = await checkRateLimitAny(ip);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX.toString());
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.allowed) {
    if (rate.resetMs) res.setHeader('Retry-After', String(Math.ceil(rate.resetMs / 1000)));
    res.statusCode = 429;
    res.end('rate_limited');
    return;
  }

  const signatureCheck = verifySignature(req);
  if (!signatureCheck.ok) {
    if (signatureCheck.code === 'missing_signing_secret') {
      res.statusCode = 500;
      res.end('server_error');
      return;
    }
    res.statusCode = 401;
    res.end('unauthorized');
    return;
  }

  const backendBase = process.env.OCR_BACKEND_URL || '';
  if (!backendBase) {
    res.statusCode = 500;
    res.end('server_error');
    return;
  }

  const upstreamBase = backendBase.replace(/\/+$/, '');
  const upstreamUrl = new URL(req.url, 'http://localhost');
  const mode = upstreamUrl.searchParams.get('mode');
  if (mode && !ALLOWED_MODES.has(mode)) {
    res.statusCode = 400;
    res.end('invalid_mode');
    return;
  }
  const targetUrl = `${upstreamBase}/scorecard/parse${mode ? `?mode=${encodeURIComponent(mode)}` : ''}`;

  let body;
  const contentTypeRaw = String(req.headers['content-type'] || '');
  const contentTypeLower = contentTypeRaw.toLowerCase();
  const allowedContentType =
    contentTypeLower.startsWith('multipart/form-data') ||
    contentTypeLower.startsWith('image/') ||
    contentTypeLower.startsWith('application/octet-stream') ||
    contentTypeLower.startsWith('application/pdf');
  if (!allowedContentType) {
    res.statusCode = 415;
    res.end('unsupported_content_type');
    return;
  }
  try {
    body = await readRawBody(req);
  } catch (error) {
    if (error?.code === 'PAYLOAD_TOO_LARGE') {
      res.statusCode = 413;
      res.end('payload_too_large');
      return;
    }
    res.statusCode = 400;
    res.end('invalid_request');
    return;
  }
  const ocrApiKey = process.env.OCR_API_KEY || '';

  let upstreamResponse;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OCR_UPSTREAM_TIMEOUT_MS);
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': contentTypeRaw,
        ...(ocrApiKey ? { 'X-API-Key': ocrApiKey } : {}),
      },
      body,
      signal: controller.signal
    });
  } catch (error) {
    res.statusCode = error?.name === 'AbortError' ? 504 : 502;
    res.end(error?.name === 'AbortError' ? 'upstream_timeout' : 'upstream_failure');
    return;
  } finally {
    clearTimeout(timeoutId);
  }

  res.statusCode = upstreamResponse.status;
  const responseContentType = upstreamResponse.headers.get('content-type');
  if (responseContentType) res.setHeader('content-type', responseContentType);
  const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
  res.end(responseBody);
};
