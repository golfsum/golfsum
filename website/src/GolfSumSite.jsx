import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { Analytics } from "@vercel/analytics/react";
import { C } from "./site/constants";
import TutorialPage from "./pages/TutorialPage";
import Nav from "./components/site/Nav";
import Footer from "./components/site/Footer";
import HomePage from "./pages/HomePage";
import FeaturesPage from "./pages/FeaturesPage";
import PricingPage from "./pages/PricingPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";

// ─── Shared Constants ───

// ─── Firebase Config ───
const IS_PROD_BUILD = import.meta.env.PROD;
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
};
const FIREBASE_AUTH_READY = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId);
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
const firebaseApp = FIREBASE_AUTH_READY ? initializeApp(FIREBASE_CONFIG) : null;
const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
const HEALTHCHECK_TIMEOUT_MS = 8000;
const AUTH_TIMEOUT_MS = 12000;

// ─── Service Health Checks ───
const SERVICE_CHECKS = [
  {
    name: "Cloud Run OCR",
    key: "ocr",
    url: "https://golfsum-ocr-1037127791438.us-central1.run.app/health",
    critical: true,
    parse: (data) => data?.status === "ok" ? "ok" : "down",
  },
  {
    name: "Firebase Auth",
    key: "firebase_auth",
    url: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`,
    method: "POST",
    body: JSON.stringify({}),
    critical: true,
    parse: (data, status) => (status === 400 || status === 200) ? "ok" : "down",
    acceptError: true,
  },
  {
    name: "Golf Course API",
    key: "golf_api",
    url: "https://api.golfcourseapi.com/v1/search?search_query=test",
    critical: false,
    parse: (data, status) => status > 0 ? "ok" : "down",
    acceptError: true,
  },
  {
    name: "Open-Meteo Weather",
    key: "weather",
    url: "https://api.open-meteo.com/v1/forecast?latitude=34.05&longitude=-118.24&current_weather=true",
    critical: false,
    parse: (data) => data?.current_weather ? "ok" : "degraded",
  },
  {
    name: "Nominatim Geocoding",
    key: "nominatim",
    url: "https://nominatim.openstreetmap.org/search?q=pebble+beach+golf&format=json&limit=1",
    critical: false,
    parse: (data) => Array.isArray(data) ? "ok" : "degraded",
  },
  {
    name: "Overpass (OSM Courses)",
    key: "overpass",
    url: "https://overpass-api.de/api/status",
    critical: false,
    parse: (data, status) => status === 200 ? "ok" : "degraded",
    isText: true,
  },
];

async function runHealthChecks(authCtx) {
  const token = await resolveAuthToken(authCtx);
  const results = {};
  const checks = SERVICE_CHECKS.map(async (svc) => {
    const start = Date.now();
    try {
      const opts = { method: svc.method || "GET", headers: {} };
      if (svc.body) opts.body = svc.body;
      if (svc.method === "POST") opts.headers["Content-Type"] = "application/json";
      if (svc.useToken && token) opts.headers.Authorization = `Bearer ${token}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS);
      let resp;
      try {
        resp = await fetch(svc.url, { ...opts, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      let data = null;
      try {
        data = svc.isText ? await resp.text() : await resp.json();
      } catch {}
      const parsed = svc.parse(data, resp.status);
      const status = typeof parsed === "object" ? parsed.status : parsed;
      results[svc.key] = { name: svc.name, status, latency_ms: Date.now() - start, critical: svc.critical, http_status: resp.status };
    } catch (e) {
      results[svc.key] = { name: svc.name, status: "down", latency_ms: Date.now() - start, critical: svc.critical, error: e?.message || "error" };
    }
  });
  await Promise.allSettled(checks);
  return results;
}

// ─── Firestore Helpers ───
const fromFirestoreValue = (v) => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
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
  if (v instanceof Date) return { timestampValue: v.toISOString() };
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

const parseJwtExpiryMs = (idToken) => {
  try {
    const parts = String(idToken || "").split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Number(payload?.exp) * 1000;
  } catch {
    return null;
  }
};
const isTokenExpiringSoon = (idToken, withinMs = 5 * 60 * 1000) => {
  const expMs = parseJwtExpiryMs(idToken);
  if (!expMs) return true;
  return expMs - Date.now() <= withinMs;
};
const sessionFromFirebaseUser = async (fbUser, { forceRefresh = false } = {}) => {
  if (!fbUser) return null;
  const idToken = await fbUser.getIdToken(forceRefresh);
  return { uid: fbUser.uid, email: fbUser.email || "", idToken };
};
const ensureFreshSession = async (session) => {
  if (!session) return null;
  if (firebaseAuth?.currentUser && (!session.uid || firebaseAuth.currentUser.uid === session.uid)) {
    try { return await sessionFromFirebaseUser(firebaseAuth.currentUser); } catch {}
  }
  if (!session?.idToken || !isTokenExpiringSoon(session.idToken)) return session;
  try {
    if (firebaseAuth?.currentUser) return await sessionFromFirebaseUser(firebaseAuth.currentUser, { forceRefresh: true });
  } catch {}
  return session;
};
const resolveAuthToken = async (authCtx, { forceRefresh = false } = {}) => {
  if (!authCtx) return null;
  if (typeof authCtx === "string") return authCtx;
  if (firebaseAuth?.currentUser && (!authCtx.uid || firebaseAuth.currentUser.uid === authCtx.uid)) {
    try { return await firebaseAuth.currentUser.getIdToken(forceRefresh); } catch {}
  }
  const fresh = await ensureFreshSession(authCtx);
  return fresh?.idToken || authCtx?.idToken || null;
};
const firestoreAuthedFetch = async (url, init = {}, authCtx) => {
  const token = await resolveAuthToken(authCtx);
  const headers = token ? { ...(init.headers || {}), Authorization: `Bearer ${token}` } : { ...(init.headers || {}) };
  return fetch(url, { ...init, headers });
};
const fetchJsonWithTimeout = async (url, init = {}, timeoutMs = AUTH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    let data = null;
    try { data = await resp.json(); } catch {}
    return { resp, data };
  } finally {
    clearTimeout(timeoutId);
  }
};
const verifyAdminViaApi = async (authCtx) => {
  // In local/dev there may be no /api route wired (Vite without proxy),
  // so fall back to Firestore admin check.
  if (!IS_PROD_BUILD) {
    const uid = typeof authCtx === "object" ? authCtx?.uid : null;
    return isAdminUser(uid, authCtx);
  }
  const token = await resolveAuthToken(authCtx);
  if (!token) return false;
  try {
    const { resp, data } = await fetchJsonWithTimeout(
      "/api/admin-check",
      { headers: { Authorization: `Bearer ${token}` } },
      10000
    );
    if (resp.ok) return true;
    // Only hard-fail when backend explicitly says this user is unauthorized.
    if (resp.status === 401 || resp.status === 403) return false;
    console.warn("Admin API check unavailable; falling back to Firestore admin check.", resp.status, data?.error || "");
    return true;
  } catch (err) {
    console.warn("Admin API check failed; falling back to Firestore admin check.", err?.message || err);
    return true;
  }
};
const signInWithEmail = async (email, password) => {
  if (!firebaseAuth) throw new Error("auth/not-configured");
  const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
  const idToken = await cred.user.getIdToken();
  return { localId: cred.user.uid, email: cred.user.email || email, idToken };
};
const signUpWithEmail = async (email, password) => {
  if (!firebaseAuth) throw new Error("auth/not-configured");
  const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  const idToken = await cred.user.getIdToken();
  return { localId: cred.user.uid, email: cred.user.email || email, idToken };
};
const firestoreList = async (path, authCtx, pageSize = 100) => {
  const r = await firestoreAuthedFetch(`${FIRESTORE_BASE}/${path}?pageSize=${pageSize}`, {}, authCtx);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.documents || []).map((doc) => ({ id: doc.name.split("/").pop(), ...fromFirestoreFields(doc.fields || {}) }));
};
const firestoreQuery = async (structuredQuery, authCtx) => {
  const r = await firestoreAuthedFetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents:runQuery`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ structuredQuery }) },
    authCtx
  );
  if (!r.ok) return [];
  const d = await r.json();
  return d.map((row) => row.document).filter(Boolean).map((doc) => ({ id: doc.name.split("/").pop(), ...fromFirestoreFields(doc.fields || {}) }));
};
const firestoreAggregateCount = async (structuredQuery, authCtx, alias = "count") => {
  const r = await firestoreAuthedFetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents:runAggregationQuery`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ structuredAggregationQuery: { structuredQuery, aggregations: [{ alias, count: {} }] } }) },
    authCtx
  );
  if (!r.ok) return null;
  const d = await r.json();
  const v = d?.[0]?.result?.aggregateFields?.[alias];
  if (!v) return null;
  return v.integerValue != null ? Number(v.integerValue) : v.doubleValue ?? null;
};
const firestorePatch = async (path, authCtx, updates) => {
  const params = Object.keys(updates || {}).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const url = `${FIRESTORE_BASE}/${path}${params ? `?${params}` : ""}`;
  const r = await firestoreAuthedFetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: toFirestoreFields(updates) }) }, authCtx);
  return r.ok;
};
const firestorePatchWithFieldPaths = async (path, authCtx, updates, fieldPaths = []) => {
  const params = (fieldPaths || []).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const url = `${FIRESTORE_BASE}/${path}${params ? `?${params}` : ""}`;
  const r = await firestoreAuthedFetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: toFirestoreFields(updates) }) }, authCtx);
  return r.ok;
};
const firestoreGet = async (path, authCtx) => {
  const r = await firestoreAuthedFetch(`${FIRESTORE_BASE}/${path}`, {}, authCtx);
  if (!r.ok) return null;
  const d = await r.json();
  return { id: d.name.split("/").pop(), ...fromFirestoreFields(d.fields || {}) };
};
const isAdminUser = async (uid, authCtx) => {
  if (!uid) return false;
  try { return !!(await firestoreGet(`admins/${uid}`, authCtx)); } catch { return false; }
};
const listAllUsers = async (authCtx) => {
  const r = await firestoreAuthedFetch(`${FIRESTORE_BASE}/users?pageSize=300`, {}, authCtx);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.documents || []).map((doc) => ({ uid: doc.name.split("/").pop(), ...fromFirestoreFields(doc.fields || {}) }));
};
const getUserRounds = async (uid, authCtx) => firestoreList(`users/${uid}/rounds`, authCtx, 300);
const updateLastLogin = async (uid, authCtx) => firestorePatch(`users/${uid}`, authCtx, {
  lastLoginAt: new Date().toISOString(),
  lastLoginDevice: {
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    platform: typeof navigator !== "undefined" ? navigator.platform : "",
  },
});

// ─── Icons & Utility ───
const Icon = ({ name, size = 20, color = C.textMuted }) => {
  const s = { width: size, height: size, display: "inline-block", verticalAlign: "middle" };
  const paths = {
    golf: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M12 18V3l7 4-7 4"/><path d="M9 17c-2.2.5-4 1.3-4 2.5C5 21 8.1 22 12 22s7-1 7-2.5c0-1.2-1.8-2-4-2.5"/></svg>,
    chart: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
    users: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
    target: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    camera: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
    brain: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M9.5 2A5.5 5.5 0 005 7.5c0 1 .3 2 .8 2.8A5.5 5.5 0 003 15c0 3 2.5 5.5 5.5 5.5h1M14.5 2A5.5 5.5 0 0120 7.5c0 1-.3 2-.8 2.8A5.5 5.5 0 0121 15c0 3-2.5 5.5-5.5 5.5h-1M12 2v20"/></svg>,
    arrow: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
    search: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
    logout: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
    tool: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
    flag: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/></svg>,
    download: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
    check: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>,
    home: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>,
  };
  return paths[name] || null;
};
const fmt = (n, d = 1) => n != null ? Number(n).toFixed(d) : "—";
const pct = (hit, total) => total > 0 ? Math.round((hit / total) * 100) + "%" : "—";
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 999;
const getUserEmail = (u) => u.email || u.profile?.email || "—";
const getUserName = (u) => u.personalInfo?.name || u.profile?.personalInfo?.name || u.name || u.email || "—";
const getUserScoringMode = (u) => u.scoringMode || u.profile?.scoringMode || "basic";
const getUserHomeCourse = (u) => u.coursePreferences?.homeCourseName || u.profile?.coursePreferences?.homeCourseName || "—";
const getUserLastLoginAt = (u) => u.lastLoginAt || u.profile?.lastLoginAt;
const getUserLastLoginDevice = (u) => u.lastLoginDevice || u.profile?.lastLoginDevice || null;
const getSubscriptionStateObj = (u) => u.subscriptionState || u.subscription || u.billing || u.profile?.subscriptionState || u.profile?.subscription || {};
const getSubscriptionInfo = (u) => {
  const sub = getSubscriptionStateObj(u);
  const trialUsed = Number(sub.trialRoundsUsed ?? u.trialRoundsUsed ?? 0) || 0;
  const trialTotal = Number(sub.trialRoundsTotal ?? 3) || 3;
  const tier = String(sub.tier || sub.plan || "free").toLowerCase();
  const expiry = sub.proExpiresAt || sub.expiresAt || sub.expirationDate || null;
  const cancelledAt = sub.proCancelledAt || sub.cancelledAt || null;
  const isPro = tier === "pro" || Boolean(expiry && new Date(expiry).getTime() > Date.now());
  if (isPro) return { tier: "pro", label: "Pro", className: "badge-green", expiry, cancelledAt, trialUsed, trialTotal };
  if (trialUsed < trialTotal) return { tier: "trial", label: `Trial (${trialTotal - trialUsed} left)`, className: "badge-amber", expiry: null, cancelledAt: null, trialUsed, trialTotal };
  return { tier: "free", label: "Free", className: "badge-blue", expiry, cancelledAt, trialUsed, trialTotal };
};
const getRoundEntryMethod = (round) => {
  const source = String(round?.source || round?.origin || round?.importSource || "").toLowerCase();
  if (source.includes("ocr") || source.includes("import") || round?.imageUri || round?.thumbnailUri) return "OCR";
  return "Manual";
};
const getUserVersionKey = (u) => {
  const appVersion = u.appVersion || u.profile?.appVersion || getUserLastLoginDevice(u)?.appVersion || "unknown";
  const buildNumber = u.buildNumber || u.profile?.buildNumber || getUserLastLoginDevice(u)?.buildNumber || "";
  return buildNumber ? `${appVersion} (${buildNumber})` : String(appVersion);
};
const classifyOcrError = (err) => {
  const text = `${err?.reason || ""} ${err?.message || ""} ${err?.error?.message || ""}`.toLowerCase();
  if (text.includes("timeout")) return "timeout";
  if (text.includes("network") || text.includes("fetch") || text.includes("offline")) return "network";
  if (text.includes("low confidence") || text.includes("confidence")) return "low_confidence";
  if (text.includes("parse") || text.includes("schema") || text.includes("json")) return "parsing";
  return "other";
};
const toTime = (value) => {
  const ts = new Date(value || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
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
const fireAndForget = (promise) => { Promise.resolve(promise).catch(() => {}); };
const isPrivateOrLocalHost = (hostname) => {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) return true;
  return /^0\.|^10\.|^127\.|^169\.254\.|^192\.168\./.test(host);
};
const safeExternalUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (!/^https?:$/i.test(url.protocol) || isPrivateOrLocalHost(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
};
const truncateText = (value, maxChars = 12000) => {
  const str = typeof value === "string" ? value : value == null ? "" : String(value);
  return str.length > maxChars ? `${str.slice(0, maxChars)}\n...truncated...` : str;
};
const safeJsonPreview = (value, maxChars = 12000) => {
  try { return truncateText(JSON.stringify(value, null, 2), maxChars); } catch { return "Unable to render context"; }
};

// ─── Styles ───
const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Instrument+Serif:ital@0;1&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.text}; line-height: 1.6; -webkit-font-smoothing: antialiased; }
::selection { background: ${C.brandGlow}; color: ${C.text}; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: ${C.bg}; }
::-webkit-scrollbar-thumb { background: ${C.borderLight}; border-radius: 3px; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes kenburns { 0% { transform: scale(1.05); } 100% { transform: scale(1.15); } }
.fade-up { animation: fadeUp 0.6s ease-out both; }
.fade-in { animation: fadeIn 0.4s ease-out both; }
.stagger-1 { animation-delay: 0.1s; }.stagger-2 { animation-delay: 0.2s; }.stagger-3 { animation-delay: 0.3s; }.stagger-4 { animation-delay: 0.4s; }.stagger-5 { animation-delay: 0.5s; }
.serif { font-family: 'Instrument Serif', Georgia, serif; }
a { color: ${C.brand}; text-decoration: none; transition: color 0.2s; } a:hover { color: #34D399; }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; border: none; cursor: pointer; transition: all 0.2s; font-family: inherit; }
.btn-primary { background: ${C.brand}; color: #fff; } .btn-primary:hover { background: #0DA874; transform: translateY(-1px); box-shadow: 0 4px 20px ${C.brandGlow}; }
.btn-secondary { background: ${C.bgElevated}; color: ${C.text}; border: 1px solid ${C.border}; } .btn-secondary:hover { background: ${C.bgHover}; border-color: ${C.borderLight}; }
.btn-ghost { background: transparent; color: ${C.textMuted}; padding: 8px 16px; } .btn-ghost:hover { color: ${C.text}; background: ${C.bgElevated}; }
.btn-sm { padding: 8px 16px; font-size: 13px; border-radius: 8px; }
.btn-social { width: 100%; justify-content: center; border: 1px solid ${C.borderLight}; background: ${C.bgElevated}; color: ${C.text}; font-weight: 600; }
.btn-social:hover { background: ${C.bgHover}; border-color: ${C.borderLight}; }
.btn-google { border-color: rgba(59,130,246,0.35); } .btn-apple { border-color: rgba(255,255,255,0.2); }
.social-divider { display: flex; align-items: center; gap: 12px; margin: 18px 0 14px; color: ${C.textDim}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
.social-divider::before, .social-divider::after { content: ""; flex: 1; height: 1px; background: ${C.border}; }
.card { background: ${C.bgCard}; border: 1px solid ${C.border}; border-radius: 16px; padding: 24px; transition: border-color 0.2s; } .card:hover { border-color: ${C.borderLight}; }
.input { width: 100%; padding: 12px 16px; background: ${C.bgElevated}; border: 1px solid ${C.border}; border-radius: 10px; color: ${C.text}; font-size: 15px; font-family: inherit; transition: border-color 0.2s; outline: none; }
.input:focus { border-color: ${C.brand}; box-shadow: 0 0 0 3px ${C.brandDim}; } .input::placeholder { color: ${C.textDim}; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.badge-green { background: ${C.brandDim}; color: ${C.brand}; }.badge-red { background: rgba(239,68,68,0.12); color: ${C.red}; }.badge-amber { background: rgba(245,158,11,0.12); color: ${C.amber}; }.badge-blue { background: rgba(59,130,246,0.12); color: ${C.blue}; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.stat-box { background: ${C.bgElevated}; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid ${C.border}; }
.stat-value { font-size: 28px; font-weight: 700; color: ${C.text}; line-height: 1.2; } .stat-label { font-size: 12px; color: ${C.textMuted}; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
.table { width: 100%; border-collapse: collapse; } .table th { text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.textDim}; border-bottom: 1px solid ${C.border}; font-weight: 600; }
.table td { padding: 12px; border-bottom: 1px solid ${C.border}; font-size: 14px; color: ${C.textMuted}; } .table tr:hover td { background: ${C.bgElevated}; }
.loading-bar { height: 3px; background: linear-gradient(90deg, transparent, ${C.brand}, transparent); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 2px; }
.photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; grid-auto-flow: dense; }
.photo-grid .wide { grid-column: span 2; } .photo-grid img { width: 100%; height: 200px; object-fit: cover; border-radius: 12px; transition: transform 0.4s, filter 0.4s; filter: brightness(0.85); }
.photo-grid img:hover { transform: scale(1.02); filter: brightness(1); }
@media (max-width: 768px) { .photo-grid { grid-template-columns: repeat(2, 1fr); } .photo-grid .wide { grid-column: span 2; } .photo-grid img { height: 140px; } }
`;

// ─── App ───
export default function GolfSumSite() {
  const aliveRef = useRef(true);
  const loginSeqRef = useRef(0);
  const authSeqRef = useRef(0);
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    return () => { aliveRef.current = false; };
  }, []);

  const routeToPage = useCallback((path) => {
    const p = (path || "/").toLowerCase();
    if (p === "/" || p === "") return "home";
    if (p.startsWith("/features")) return "features";
    if (p.startsWith("/pricing")) return "pricing";
    if (p.startsWith("/tutorial")) return "tutorial";
    if (p.startsWith("/privacy")) return "privacy";
    if (p.startsWith("/terms")) return "terms";
    if (p.startsWith("/login")) return "login";
    if (p.startsWith("/dashboard")) return "dashboard";
    if (p.startsWith("/admin")) return "admin";
    return "home";
  }, []);

  const pageToRoute = useCallback((nextPage) => {
    switch (nextPage) {
      case "features":
        return "/features";
      case "pricing":
        return "/pricing";
      case "tutorial":
        return "/tutorial";
      case "privacy":
        return "/privacy";
      case "terms":
        return "/terms";
      case "login":
        return "/login";
      case "dashboard":
        return "/dashboard";
      case "admin":
        return "/admin";
      default:
        return "/";
    }
  }, []);

  const navigate = useCallback((nextPage, { replace } = {}) => {
    const path = pageToRoute(nextPage);
    try {
      if (replace) {
        window.history.replaceState({}, "", path);
      } else {
        window.history.pushState({}, "", path);
      }
    } catch {}
    setPage(nextPage);
  }, [pageToRoute]);

  useEffect(() => {
    if (!firebaseAuth) {
      setUser(null);
      setIsAdmin(false);
      return () => {};
    }
    let alive = true;
    const unsub = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      const authSeq = authSeqRef.current;
      if (!fbUser) {
        if (alive && authSeq === authSeqRef.current) {
          setUser(null);
          setIsAdmin(false);
        }
        return;
      }
      try {
        const session = await sessionFromFirebaseUser(fbUser);
        if (!alive || authSeq !== authSeqRef.current || !session) return;
        setUser(session);
        const admin = await verifyAdminViaApi(session);
        if (alive && authSeq === authSeqRef.current) setIsAdmin(admin);
      } catch {}
    });
    return () => { alive = false; unsub(); };
  }, []);

  useEffect(() => {
    const applyRoute = () => {
      const next = routeToPage(window.location?.pathname);
      setPage(next);
    };
    applyRoute();
    const onPop = () => applyRoute();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [routeToPage]);

  useEffect(() => {
    if (page === "dashboard" && !user) {
      navigate("login", { replace: true });
      return;
    }
    if (page !== "admin") return;
    if (!user || !isAdmin) {
      navigate("home", { replace: true });
      return;
    }
    let alive = true;
    (async () => {
      const allowed = await verifyAdminViaApi(user);
      if (!alive || allowed) return;
      setIsAdmin(false);
      navigate("home", { replace: true });
    })();
    return () => {
      alive = false;
    };
  }, [page, user, isAdmin, navigate]);

  const handleLogin = async (u) => {
    const seq = ++loginSeqRef.current;
    const authSeq = ++authSeqRef.current;
    const fresh = await ensureFreshSession(u);
    if (!aliveRef.current || seq !== loginSeqRef.current || authSeq !== authSeqRef.current) return;
    setUser(fresh);
    const admin = await verifyAdminViaApi(fresh);
    if (!aliveRef.current || seq !== loginSeqRef.current || authSeq !== authSeqRef.current) return;
    setIsAdmin(admin);
    navigate("dashboard");
  };
  const handleLogout = async () => {
    authSeqRef.current += 1;
    loginSeqRef.current += 1;
    try { if (firebaseAuth) await signOut(firebaseAuth); } catch {}
    setUser(null); setIsAdmin(false);
    navigate("home");
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <style>{css}</style>
      <Nav page={page} nav={navigate} user={user} isAdmin={isAdmin} onLogout={handleLogout} Icon={Icon} />
      {page === "home" && <HomePage nav={navigate} Icon={Icon} />}
      {page === "features" && <FeaturesPage Icon={Icon} />}
      {page === "pricing" && <PricingPage Icon={Icon} />}
      {page === "tutorial" && <TutorialPage />}
      {page === "privacy" && <PrivacyPage />}
      {page === "terms" && <TermsPage />}
      {page === "login" && <LoginPage onLogin={handleLogin} />}
      {page === "dashboard" && user && <DashboardPage user={user} />}
      {page === "admin" && user && isAdmin && <AdminPage user={user} />}
      <Footer nav={navigate} />
      <Analytics />
    </div>
  );
}

// ─── Login ───
function LoginPage({ onLogin }) {
  const aliveRef = useRef(true);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("signin");
  const [socialLoading, setSocialLoading] = useState(false);

  useEffect(() => {
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    if (!firebaseAuth && aliveRef.current) {
      setError("Sign-in is temporarily unavailable on this website.");
    }
  }, []);

  const validatePassword = (pw) => {
    const errs = [];
    if (pw.length < 8) errs.push("at least 8 characters");
    if (!/[A-Z]/.test(pw)) errs.push("one uppercase letter");
    if (!/[a-z]/.test(pw)) errs.push("one lowercase letter");
    if (!/[0-9]/.test(pw)) errs.push("one number");
    return errs;
  };
  const isValidEmail = (value) => {
    const normalized = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return false;
    if (normalized.includes("..")) return false;
    const [localPart, domain] = normalized.split("@");
    if (!localPart || !domain) return false;
    if (localPart.startsWith(".") || localPart.endsWith(".")) return false;
    if (domain.startsWith("-") || domain.endsWith("-")) return false;
    if (domain.includes("-.") || domain.includes(".-")) return false;
    return true;
  };
  const mapAuthError = (error, { social = false } = {}) => {
    const code = String(error?.code || "");
    if (code === "auth/not-configured") return "Sign-in is temporarily unavailable on this website.";
    if (social) {
      if (code === "auth/popup-blocked") return "Popup blocked. Please allow popups and try again.";
      if (code === "auth/cancelled-popup-request") return "Popup closed. Please try again.";
      if (code === "auth/account-exists-with-different-credential") return "Account exists with a different sign-in method.";
      return "Social login failed. Please try again.";
    }
    if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
      return "Invalid email or password.";
    }
    if (code === "auth/email-already-in-use") return "This email is already in use.";
    if (code === "auth/weak-password") return "Password is too weak.";
    if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
    if (code === "auth/network-request-failed") return "Network error. Please try again.";
    return "Sign in failed. Please try again.";
  };

  const handleSocialLogin = async (provider) => {
    if (!firebaseAuth) {
      if (aliveRef.current) setError("Sign-in is temporarily unavailable on this website.");
      return;
    }
    if (aliveRef.current) {
      setError("");
      setSocialLoading(true);
    }
    try {
      let authProvider = null;
      if (provider === "Google") {
        authProvider = new GoogleAuthProvider();
        authProvider.setCustomParameters({ prompt: "select_account" });
      } else if (provider === "Apple") {
        authProvider = new OAuthProvider("apple.com");
        authProvider.addScope("email");
        authProvider.addScope("name");
      } else {
        throw new Error("Unknown provider");
      }
      const cred = await signInWithPopup(firebaseAuth, authProvider);
      const idToken = await cred.user.getIdToken();
      const session = { uid: cred.user.uid, email: cred.user.email, idToken };
      await onLogin(session);
      fireAndForget(updateLastLogin(cred.user.uid, session));
    } catch (e) {
      if (aliveRef.current) setError(mapAuthError(e, { social: true }));
    }
    if (aliveRef.current) setSocialLoading(false);
  };

  const handleSubmit = async () => {
    if (!firebaseAuth) {
      if (aliveRef.current) setError("Sign-in is temporarily unavailable on this website.");
      return;
    }
    if (aliveRef.current) {
      setError("");
      setLoading(true);
    }
    try {
      if (mode === "signup") {
        if (!isValidEmail(email)) {
          if (aliveRef.current) {
            setError("Please enter a valid email address");
            setLoading(false);
          }
          return;
        }
        const pwErrors = validatePassword(pass);
        if (pwErrors.length > 0) {
          if (aliveRef.current) {
            setError("Password requires: " + pwErrors.join(", "));
            setLoading(false);
          }
          return;
        }
        if (pass !== confirmPass) {
          if (aliveRef.current) {
            setError("Passwords do not match");
            setLoading(false);
          }
          return;
        }
      }
      const res = await (mode === "signin" ? signInWithEmail : signUpWithEmail)(email, pass);
      const session = { uid: res.localId, email: res.email, idToken: res.idToken };
      await onLogin(session);
      fireAndForget(updateLastLogin(res.localId, session));
    } catch (e) {
      if (aliveRef.current) {
        setError(mapAuthError(e));
      }
    }
    if (aliveRef.current) setLoading(false);
  };

  return (
    <section style={{ padding: "100px 24px", maxWidth: 420, margin: "0 auto" }}>
      <div className="card fade-up" style={{ padding: 36 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>{mode === "signin" ? "Welcome back" : "Create account"}</h2>
        <p style={{ fontSize: 14, color: C.textMuted, textAlign: "center", marginBottom: 28 }}>
          {mode === "signin" ? "Sign in to view your dashboard" : "Get started with GolfSum"}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
          <button
            className="btn btn-social btn-google"
            onClick={() => handleSocialLogin("Google")}
            disabled={socialLoading || loading}
          >
            Continue with Google
          </button>
          <button
            className="btn btn-social btn-apple"
            onClick={() => handleSocialLogin("Apple")}
            disabled={socialLoading || loading}
          >
            Continue with Apple
          </button>
        </div>
        <div className="social-divider">or</div>
        {error && <div className="badge badge-red" style={{ marginBottom: 16, width: "100%", justifyContent: "center", padding: "8px 12px" }}>{error}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (mode === "signup" ? document.getElementById("gs-confirm-pw")?.focus() : handleSubmit())} />
          {mode === "signup" && (
            <>
              <input id="gs-confirm-pw" className="input" type="password" placeholder="Confirm Password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
              <p style={{ fontSize: 12, color: C.textDim, margin: "-4px 0 0" }}>Min 8 characters with uppercase, lowercase, and a number</p>
            </>
          )}
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Loading..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </div>
        <p style={{ fontSize: 13, color: C.textDim, textAlign: "center", marginTop: 20 }}>
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "signin" ? "signup" : "signin"); setError(""); setConfirmPass(""); }}>
            {mode === "signin" ? "Sign up" : "Sign in"}
          </a>
        </p>
      </div>
    </section>
  );
}

// ─── User Dashboard ───
function DashboardPage({ user }) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getUserRounds(user.uid, user);
        if (!alive) return;
        setRounds([...data].sort((a, b) => toTime(b.date) - toTime(a.date)));
      } catch (e) { console.error(e); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  const stats = useMemo(() => {
    if (!rounds.length) return null;
    const scored = rounds.filter((r) => r.score > 0);
    const avgScore = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : 0;
    const puttRounds = scored.filter((r) => r.stats?.putts);
    const avgPutts = puttRounds.length ? puttRounds.reduce((s, r) => s + r.stats.putts, 0) / puttRounds.length : 0;
    const firRounds = scored.filter((r) => r.stats?.fairwaysPossible > 0);
    const firPct = firRounds.length ? firRounds.reduce((s, r) => s + (r.stats.fairways || 0), 0) / firRounds.reduce((s, r) => s + r.stats.fairwaysPossible, 0) * 100 : null;
    const girRounds = scored.filter((r) => r.stats?.greensPossible > 0);
    const girPct = girRounds.length ? girRounds.reduce((s, r) => s + (r.stats.greens || 0), 0) / girRounds.reduce((s, r) => s + r.stats.greensPossible, 0) * 100 : null;
    const bestScore = scored.length ? Math.min(...scored.map((r) => r.score)) : null;
    const last5 = scored.slice(0, 5);
    const last5Avg = last5.length ? last5.reduce((s, r) => s + r.score, 0) / last5.length : null;
    return { total: scored.length, avgScore, avgPutts, firPct, girPct, bestScore, last5Avg };
  }, [rounds]);

  if (loading) return <section style={{ padding: "80px 24px", textAlign: "center" }}><div className="loading-bar" style={{ maxWidth: 200, margin: "40px auto" }} /><p style={{ color: C.textMuted }}>Loading your rounds...</p></section>;

  return (
    <section style={{ padding: "40px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="fade-up" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Your Dashboard</h1>
        <p style={{ fontSize: 14, color: C.textMuted }}>{user.email} · {rounds.length} round{rounds.length !== 1 ? "s" : ""}</p>
      </div>
      {!rounds.length ? (
        <div className="card fade-up" style={{ textAlign: "center", padding: 48 }}>
          <Icon name="golf" size={40} color={C.textDim} />
          <h3 style={{ fontSize: 18, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>No rounds yet</h3>
          <p style={{ color: C.textMuted, fontSize: 14 }}>Open the GolfSum app and track your first round to see your stats here.</p>
        </div>
      ) : (
        <>
          <div className="stat-grid fade-up stagger-1" style={{ marginBottom: 24 }}>
            <div className="stat-box"><div className="stat-value">{stats.total}</div><div className="stat-label">Rounds</div></div>
            <div className="stat-box"><div className="stat-value">{fmt(stats.avgScore, 1)}</div><div className="stat-label">Avg Score</div></div>
            <div className="stat-box"><div className="stat-value">{fmt(stats.avgPutts, 1)}</div><div className="stat-label">Avg Putts</div></div>
            <div className="stat-box"><div className="stat-value">{stats.bestScore || "—"}</div><div className="stat-label">Best Score</div></div>
            <div className="stat-box"><div className="stat-value">{stats.firPct != null ? fmt(stats.firPct, 0) + "%" : "—"}</div><div className="stat-label">FIR%</div></div>
            <div className="stat-box"><div className="stat-value">{stats.girPct != null ? fmt(stats.girPct, 0) + "%" : "—"}</div><div className="stat-label">GIR%</div></div>
            <div className="stat-box"><div className="stat-value">{stats.last5Avg ? fmt(stats.last5Avg, 1) : "—"}</div><div className="stat-label">Last 5 Avg</div></div>
            <div className="stat-box"><div className="stat-value" style={{ color: C.brand }}>—</div><div className="stat-label">Player Rating</div></div>
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
            {["overview", "history"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", padding: "10px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: tab === t ? 600 : 400, color: tab === t ? C.text : C.textMuted, borderBottom: tab === t ? `2px solid ${C.brand}` : "2px solid transparent", textTransform: "capitalize" }}>{t}</button>
            ))}
          </div>
          {tab === "overview" && (
            <div className="fade-in">
              <div className="card" style={{ marginBottom: 20, padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Scoring Trend</h3>
                {(() => {
                  const trendRounds = rounds.slice(0, 20).filter((r) => Number.isFinite(Number(r.score)));
                  if (trendRounds.length === 0) {
                    return <p style={{ fontSize: 13, color: C.textMuted }}>No scoring data available.</p>;
                  }
                  const trendScores = trendRounds.map((r) => Number(r.score));
                  const min = Math.min(...trendScores);
                  const max = Math.max(...trendScores);
                  const range = max - min || 1;
                  return (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
                      {[...trendRounds].reverse().map((r, i) => {
                        const score = Number(r.score);
                        const h = ((score - min) / range) * 60 + 20;
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <div
                              style={{
                                width: "100%",
                                maxWidth: 28,
                                height: h,
                                borderRadius: 4,
                                background: score <= (min + range * 0.3)
                                  ? C.brand
                                  : score >= (min + range * 0.7)
                                    ? "rgba(239,68,68,0.5)"
                                    : C.borderLight,
                              }}
                            />
                            <span style={{ fontSize: 10, color: C.textDim }}>{score}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}><h3 style={{ fontSize: 15, fontWeight: 600 }}>Recent Rounds</h3></div>
                <table className="table"><thead><tr><th>Date</th><th>Course</th><th>Score</th><th>Putts</th><th>FIR</th><th>GIR</th><th>Scorecard</th></tr></thead><tbody>
                  {rounds.slice(0, 10).map((r, i) => {
                    const scorecardUrl = safeExternalUrl(r.imageUri || r.thumbnailUri);
                    return (
                    <tr key={i}>
                      <td>{fmtDate(r.date)}</td>
                      <td style={{ color: C.text, fontWeight: 500 }}>{r.courseName || "—"}</td>
                      <td style={{ fontWeight: 600, color: C.text }}>{r.score}</td>
                      <td>{r.stats?.putts || "—"}</td>
                      <td>{pct(r.stats?.fairways, r.stats?.fairwaysPossible)}</td>
                      <td>{pct(r.stats?.greens, r.stats?.greensPossible)}</td>
                      <td>
                        {scorecardUrl ? (
                          <a
                            href={scorecardUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <img
                              src={scorecardUrl}
                              alt="Scorecard"
                              style={{ width: 44, height: 32, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }}
                            />
                            <span style={{ fontSize: 12, color: C.textMuted }}>View</span>
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  );})}
                </tbody></table>
              </div>
            </div>
          )}
          {tab === "history" && (
            <div className="fade-in card" style={{ padding: 0, overflow: "auto" }}>
              <table className="table"><thead><tr><th>Date</th><th>Course</th><th>Tee</th><th>Score</th><th>Putts</th><th>FIR</th><th>GIR</th><th>Rating</th><th>Slope</th><th>Diff</th><th>Scorecard</th></tr></thead><tbody>
                {rounds.map((r, i) => {
                  const scorecardUrl = safeExternalUrl(r.imageUri || r.thumbnailUri);
                  return (
                  <tr key={i}>
                    <td>{fmtDate(r.date)}</td>
                    <td style={{ color: C.text, fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.courseName || "—"}</td>
                    <td>{r.stats?.teeBox || "—"}</td>
                    <td style={{ fontWeight: 600, color: C.text }}>{r.score}</td>
                    <td>{r.stats?.putts || "—"}</td>
                    <td>{pct(r.stats?.fairways, r.stats?.fairwaysPossible)}</td>
                    <td>{pct(r.stats?.greens, r.stats?.greensPossible)}</td>
                    <td>{r.stats?.courseRating || "—"}</td>
                    <td>{r.stats?.slopeRating || "—"}</td>
                    <td>{r.differential != null ? fmt(r.differential, 1) : "—"}</td>
                    <td>
                      {scorecardUrl ? (
                        <a
                          href={scorecardUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          <img
                            src={scorecardUrl}
                            alt="Scorecard"
                            style={{ width: 44, height: 32, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }}
                          />
                          <span style={{ fontSize: 12, color: C.textMuted }}>View</span>
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                );})}
              </tbody></table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Admin ───
function AdminPage({ user }) {
  const aliveRef = useRef(true);
  const reloadSeqRef = useRef(0);
  const statusSeqRef = useRef(0);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roundCounts, setRoundCounts] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRounds, setSelectedRounds] = useState([]);
  const [loadingUser, setLoadingUser] = useState(false);
  const [tab, setTab] = useState("overview");
  const [ocrStats, setOcrStats] = useState({ total: null, last: null });
  const [ocrErrors, setOcrErrors] = useState([]);
  const [ocrSearchTerm, setOcrSearchTerm] = useState("");
  const [ocrDateFrom, setOcrDateFrom] = useState("");
  const [ocrDateTo, setOcrDateTo] = useState("");
  const [selectedOcrError, setSelectedOcrError] = useState(null);
  const [selectedErrorUser, setSelectedErrorUser] = useState(null);
  const [expandedTopError, setExpandedTopError] = useState(null);
  const [siteStats, setSiteStats] = useState({ visits: null, visitors: null });
  const [serviceStatus, setServiceStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [lastStatusCheck, setLastStatusCheck] = useState(null);
  const [reportedIssues, setReportedIssues] = useState([]);
  const [reportedSearchTerm, setReportedSearchTerm] = useState("");
  const [reportedDateFrom, setReportedDateFrom] = useState("");
  const [reportedDateTo, setReportedDateTo] = useState("");
  const [selectedReportedIssue, setSelectedReportedIssue] = useState(null);
  const [reportNoteDraft, setReportNoteDraft] = useState("");
  const [adminReplyDraft, setAdminReplyDraft] = useState("");
  const [updatingReport, setUpdatingReport] = useState(false);
  const [refreshingReports, setRefreshingReports] = useState(false);
  const [homeCourseDraft, setHomeCourseDraft] = useState("");
  const [savingHomeCourse, setSavingHomeCourse] = useState(false);
  const [pushSummary, setPushSummary] = useState({
    activeDevices: null,
    marketingDevices: null,
    maintenanceDevices: null,
    recentCampaigns: [],
  });
  const [pushAudience, setPushAudience] = useState("marketing");
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushScreen, setPushScreen] = useState("pro-upgrade");
  const [pushTab, setPushTab] = useState("profile");
  const [pushSending, setPushSending] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  useEffect(() => {
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    reloadAdminData(true);
  }, [user]);

  // Run health checks on mount and every 5 minutes
  const refreshStatus = useCallback(async () => {
    const seq = ++statusSeqRef.current;
    if (aliveRef.current) setStatusLoading(true);
    try {
      const results = await runHealthChecks(user);
      if (!aliveRef.current || seq !== statusSeqRef.current) return;
      setServiceStatus(results);
      setLastStatusCheck(new Date().toLocaleTimeString());
    } catch {}
    if (aliveRef.current && seq === statusSeqRef.current) setStatusLoading(false);
  }, [user]);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const reloadAdminData = async (showLoader = false) => {
    const seq = ++reloadSeqRef.current;
    if (showLoader && aliveRef.current) setLoading(true);
    try {
      const token = await resolveAuthToken(user);
      if (!token) throw new Error("Missing admin token");
      const { resp: adminResp, data: adminData } = await fetchJsonWithTimeout(
        "/api/admin-dashboard",
        { headers: { Authorization: `Bearer ${token}` } },
        30000
      );
      if (!adminResp.ok || !adminData) throw new Error("Admin dashboard fetch failed");
      if (!aliveRef.current || seq !== reloadSeqRef.current) return;
      setUsers(Array.isArray(adminData.users) ? adminData.users : []);
      setRoundCounts(adminData.roundCounts && typeof adminData.roundCounts === "object" ? adminData.roundCounts : {});
      setOcrStats(adminData.ocrStats || { total: null, last: null });
      setReportedIssues(Array.isArray(adminData.reportedIssues) ? adminData.reportedIssues : []);
      const ocrErrorItems = Array.isArray(adminData.ocrErrors) ? adminData.ocrErrors : [];
      if (!aliveRef.current || seq !== reloadSeqRef.current) return;
      setOcrErrors(ocrErrorItems);
      void loadPushSummary(token);
      try {
        const { resp: sr, data: sd } = await fetchJsonWithTimeout("/api/analytics-stats", {
          headers: { Authorization: `Bearer ${token}` },
        }, 10000);
        if (!aliveRef.current || seq !== reloadSeqRef.current) return;
        if (sr.ok) {
          setSiteStats({
            visits: sd?.visits ?? null,
            visitors: sd?.visitors ?? null,
          });
        }
      } catch {}
    } catch (e) { console.error(e); }
    if (showLoader && aliveRef.current && seq === reloadSeqRef.current) setLoading(false);
  };

  const refreshReports = async () => {
    if (aliveRef.current) setRefreshingReports(true);
    await reloadAdminData(false);
    if (aliveRef.current) setRefreshingReports(false);
  };

  const loadPushSummary = useCallback(async (tokenOverride = null) => {
    try {
      const token = tokenOverride || await resolveAuthToken(user);
      if (!token) return;
      const { resp, data } = await fetchJsonWithTimeout(
        "/api/admin-push-campaign",
        { headers: { Authorization: `Bearer ${token}` } },
        15000
      );
      if (!resp.ok || !aliveRef.current) return;
      setPushSummary({
        activeDevices: data?.activeDevices ?? 0,
        marketingDevices: data?.marketingDevices ?? 0,
        maintenanceDevices: data?.maintenanceDevices ?? 0,
        recentCampaigns: Array.isArray(data?.recentCampaigns) ? data.recentCampaigns : [],
      });
    } catch {}
  }, [user]);

  const sendPushCampaign = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) return;
    if (aliveRef.current) {
      setPushSending(true);
      setPushResult(null);
    }
    try {
      const token = await resolveAuthToken(user);
      if (!token) throw new Error("Missing admin token");
      const payload = {
        audience: pushAudience,
        title: pushTitle.trim(),
        body: pushBody.trim(),
        screen: pushScreen || null,
        tab: pushTab || null,
        source: pushAudience === "marketing" ? "promo-offer" : "maintenance",
      };
      const { resp, data } = await fetchJsonWithTimeout(
        "/api/admin-push-campaign",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
        30000
      );
      if (!aliveRef.current) return;
      if (!resp.ok) {
        setPushResult({
          ok: false,
          message: data?.error || "Push send failed",
        });
        return;
      }
      setPushResult({
        ok: true,
        message: `Queued ${data?.sentCount ?? 0} sends from ${data?.targetedCount ?? 0} eligible devices.`,
      });
      await loadPushSummary(token);
    } catch (error) {
      if (!aliveRef.current) return;
      setPushResult({
        ok: false,
        message: error?.message || "Push send failed",
      });
    } finally {
      if (aliveRef.current) setPushSending(false);
    }
  };

  const loadUserDetail = async (usr) => {
    if (!aliveRef.current) return;
    setSelectedUser(usr); setLoadingUser(true); setTab("user");
    setHomeCourseDraft(getUserHomeCourse(usr) === "—" ? "" : getUserHomeCourse(usr));
    setSelectedRounds([]);
    try {
      const token = await resolveAuthToken(user);
      if (!token || !aliveRef.current) return;
      const { resp, data } = await fetchJsonWithTimeout(
        `/api/admin-user-rounds?uid=${encodeURIComponent(usr.uid)}`,
        { headers: { Authorization: `Bearer ${token}` } },
        15000
      );
      if (!aliveRef.current) return;
      const rounds = resp.ok && Array.isArray(data?.rounds) ? data.rounds : [];
      setSelectedRounds([...rounds].sort((a, b) => toTime(b.date) - toTime(a.date)));
    } catch {
      if (!aliveRef.current) return;
      setSelectedRounds([]);
    }
    if (aliveRef.current) setLoadingUser(false);
  };

  const updateReportedIssue = async (issue, updates = {}) => {
    if (!issue?.uid) return;
    if (aliveRef.current) setUpdatingReport(true);
    try {
      const token = await resolveAuthToken(user);
      if (!token) return;
      const { resp, data } = await fetchJsonWithTimeout(
        "/api/admin-reported-issue",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ issue, updates }),
        },
        15000
      );
      if (!resp.ok || !data?.issue) return;
      const nextIssue = data.issue;
      if (!aliveRef.current) return;
      setUsers((prev) => prev.map((u) => u.uid === issue.uid ? {
        ...u,
        lastReportedIssue: nextIssue,
        lastReportedIssueAt: nextIssue.createdAt || issue.createdAt || new Date().toISOString(),
      } : u));
      setReportedIssues((prev) => prev.map((i) => i.id === issue.id ? { ...i, ...updates, ...nextIssue } : i));
      setSelectedReportedIssue((prev) => prev ? { ...prev, ...updates, ...nextIssue } : prev);
    } finally {
      if (aliveRef.current) setUpdatingReport(false);
    }
  };

  const sendAdminReply = async () => {
    if (!selectedReportedIssue?.uid) return;
    if (!adminReplyDraft.trim()) return;
    const now = new Date().toISOString();
    const existingThread = Array.isArray(selectedReportedIssue.thread) ? selectedReportedIssue.thread : [];
    const seededThread = existingThread.length
      ? existingThread
      : (selectedReportedIssue.message ? [{ from: "user", message: selectedReportedIssue.message, createdAt: selectedReportedIssue.createdAt || now }] : []);
    const nextThread = [
      ...seededThread,
      { from: "admin", message: adminReplyDraft.trim(), createdAt: now },
    ];
    await updateReportedIssue(selectedReportedIssue, {
      adminNote: adminReplyDraft.trim(),
      thread: nextThread,
      updatedAt: now,
    });
    if (aliveRef.current) setAdminReplyDraft("");
  };

  const handleSaveHomeCourse = async () => {
    if (!selectedUser) return;
    if (aliveRef.current) setSavingHomeCourse(true);
    try {
      const token = await resolveAuthToken(user);
      if (!token) throw new Error("Missing admin token");
      const { resp, data } = await fetchJsonWithTimeout(
        "/api/admin-user-home-course",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            uid: selectedUser.uid,
            homeCourseName: homeCourseDraft.trim(),
          }),
        },
        15000
      );
      if (resp.ok && data?.ok && aliveRef.current) {
        const updated = {
          ...selectedUser,
          coursePreferences: {
            ...(selectedUser.coursePreferences || {}),
            homeCourseName: homeCourseDraft.trim(),
          },
        };
        setSelectedUser(updated);
        setUsers((prev) => prev.map((u) => u.uid === updated.uid ? updated : u));
      }
    } finally {
      if (aliveRef.current) setSavingHomeCourse(false);
    }
  };

  const totalRounds = Object.values(roundCounts).reduce((s, n) => s + (n ?? 0), 0);
  const activeUsers = Object.values(roundCounts).filter((n) => (n ?? 0) > 0).length;
  const recentRounds = null;
  const recentLogins = users.filter((u) => daysSince(getUserLastLoginAt(u)) <= 7).length;
  const ocrLastAt = ocrStats.last?.lastVerifiedAt ? new Date(ocrStats.last.lastVerifiedAt).toISOString() : (ocrStats.last?.updatedAt || null);
  const ocrLastName = ocrStats.last?.name || "—";
  const errorUsers = (() => {
    const byKey = new Map();
    users
      .filter((u) => u.lastError?.message || u.lastError?.stack)
      .forEach((u) => {
        const key = `${u.uid}|${u.lastError?.createdAt || ""}|${u.lastError?.message || ""}`;
        if (!byKey.has(key)) byKey.set(key, u);
      });
    return Array.from(byKey.values());
  })();

  // Top errors grouped by message — count of users hitting each, most recent occurrence, affected users list
  const topErrors = (() => {
    const grouped = new Map();
    users
      .filter((u) => u.lastError?.message)
      .forEach((u) => {
        const msg = u.lastError.message;
        if (!grouped.has(msg)) {
          grouped.set(msg, {
            message: msg,
            name: u.lastError.name || null,
            count: 0,
            lastSeen: u.lastError.createdAt || "",
            users: [],
          });
        }
        const entry = grouped.get(msg);
        entry.count += 1;
        entry.users.push({ uid: u.uid, name: getUserName(u), email: getUserEmail(u), createdAt: u.lastError.createdAt });
        if (u.lastError.createdAt && u.lastError.createdAt > entry.lastSeen) {
          entry.lastSeen = u.lastError.createdAt;
        }
      });
    return Array.from(grouped.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  })();
  const userLookup = users.reduce((acc, u) => { acc[u.uid] = u; return acc; }, {});
  const userReportedIssues = users
    .filter((u) => u.lastReportedIssue?.message || u.lastReportedIssueAt)
    .map((u) => {
      const issue = u.lastReportedIssue || {};
      return {
        ...issue,
        uid: issue.uid || u.uid,
        email: issue.email || getUserEmail(u),
        createdAt: u.lastReportedIssueAt || issue.createdAt,
        lastLoginAt: issue.lastLoginAt || getUserLastLoginAt(u) || null,
        lastError: issue.lastError || u.lastError || null,
        status: issue.status || "open",
        __source: "user",
      };
    });
  const mergedReportedIssues = (() => {
    const byBase = new Map();
    const getBaseKey = (issue) => `${issue?.uid || "unknown"}|${issue?.createdAt || ""}|${issue?.message || ""}`;
    const chooseEntry = (current, next) => {
      if (!current) return next;
      if (current.__source !== "collection" && next.__source === "collection") return next;
      return current;
    };
    const pushIssue = (issue, source) => {
      if (!issue) return;
      const baseKey = getBaseKey(issue);
      const entry = { ...issue, __source: source };
      const existing = byBase.get(baseKey);
      byBase.set(baseKey, chooseEntry(existing, entry));
    };
    // Prefer collection issues over user doc fallback and dedupe by uid/createdAt/message
    (reportedIssues || []).forEach((issue) => pushIssue(issue, "collection"));
    (userReportedIssues || []).forEach((issue) => pushIssue(issue, "user"));
    return Array.from(byBase.values());
  })();

  const parseDateInput = (value, isEnd = false) => {
    if (!value) return null;
    const dt = new Date(value);
    if (!Number.isFinite(dt.getTime())) return null;
    if (isEnd) dt.setHours(23, 59, 59, 999);
    else dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  };

  const withinRange = (isoDate, fromDate, toDate) => {
    const fromTs = parseDateInput(fromDate, false);
    const toTs = parseDateInput(toDate, true);
    if (fromTs == null && toTs == null) return true;
    if (!isoDate) return false;
    const ts = new Date(isoDate).getTime();
    if (!Number.isFinite(ts)) return false;
    if (fromTs != null && ts < fromTs) return false;
    if (toTs != null && ts > toTs) return false;
    return true;
  };

  const filtered = searchTerm ? users.filter((u) => {
    const t = searchTerm.toLowerCase();
    return (u.personalInfo?.name || "").toLowerCase().includes(t)
      || (u.email || "").toLowerCase().includes(t)
      || u.uid.toLowerCase().includes(t);
  }) : users;

  const filteredOcrErrors = ocrErrors
    .filter((err) => {
      const t = ocrSearchTerm.trim().toLowerCase();
      if (!t) return true;
      const owner = userLookup[err.uid] || {};
      return (
        (err.uid || "").toLowerCase().includes(t) ||
        (err.email || getUserEmail(owner) || "").toLowerCase().includes(t) ||
        (err.reason || "").toLowerCase().includes(t) ||
        (err.error?.message || err.message || "").toLowerCase().includes(t)
      );
    })
    .filter((err) => withinRange(err.createdAt, ocrDateFrom, ocrDateTo));

  const filteredReportedIssues = mergedReportedIssues
    .filter((issue) => {
      const t = reportedSearchTerm.trim().toLowerCase();
      if (!t) return true;
      const owner = userLookup[issue.uid] || {};
      return (
        (issue.uid || "").toLowerCase().includes(t) ||
        (issue.email || getUserEmail(owner) || "").toLowerCase().includes(t) ||
        (issue.message || "").toLowerCase().includes(t) ||
        (issue.lastError?.message || "").toLowerCase().includes(t)
      );
    })
    .filter((issue) => withinRange(issue.createdAt, reportedDateFrom, reportedDateTo));

  const usersWith2PlusRounds = users.filter((u) => (roundCounts[u.uid] ?? 0) >= 2).length;
  const returnedAfter7Days = null;
  const paidUsers = users.filter((u) => getSubscriptionInfo(u).tier === "pro").length;
  const trialCompletedUsers = users.filter((u) => {
    const sub = getSubscriptionInfo(u);
    return sub.trialUsed >= sub.trialTotal;
  }).length;
  const trialToPaidRate = trialCompletedUsers > 0 ? Math.round((paidUsers / trialCompletedUsers) * 100) : 0;
  const churnedUsers = users.filter((u) => {
    const sub = getSubscriptionInfo(u);
    return sub.tier !== "pro" && !!sub.cancelledAt;
  }).length;

  const ocrUploads = Number(ocrStats.total || 0);
  const ocrErrorsCount = ocrErrors.length;
  const ocrAttempts = ocrUploads + ocrErrorsCount;
  const ocrSuccessPct = ocrAttempts > 0 ? Math.round((ocrUploads / ocrAttempts) * 100) : null;
  const ocrErrorBreakdown = ocrErrors.reduce((acc, err) => {
    const key = classifyOcrError(err);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const selectedOcrImageUrl = safeExternalUrl(selectedOcrError?.imageUrl);

  const appVersionCounts = users.reduce((acc, u) => {
    const key = getUserVersionKey(u);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const appVersionDistribution = Object.entries(appVersionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const recentErrorUsers = useMemo(
    () => [...errorUsers].sort((a, b) => toTime(b.lastError?.createdAt) - toTime(a.lastError?.createdAt)).slice(0, 20),
    [errorUsers]
  );
  const mostActiveUsers = useMemo(
    () => [...users].sort((a, b) => (roundCounts[b.uid] ?? 0) - (roundCounts[a.uid] ?? 0)).slice(0, 15),
    [users, roundCounts]
  );

  const exportUsersCsv = () => {
    const rows = filtered.map((u) => {
      const sub = getSubscriptionInfo(u);
      return {
        name: getUserName(u),
        email: getUserEmail(u),
        uid: u.uid,
        scoringMode: getUserScoringMode(u),
        subscription: sub.label,
        subscriptionExpiry: sub.expiry || "",
        rounds: roundCounts[u.uid] ?? 0,
        lastLogin: getUserLastLoginAt(u) || "",
        appVersion: getUserVersionKey(u),
        device: getUserLastLoginDevice(u)?.platform || "",
        homeCourse: getUserHomeCourse(u),
      };
    });
    const headers = Object.keys(rows[0] || {
      name: "",
      email: "",
      uid: "",
      scoringMode: "",
      subscription: "",
      subscriptionExpiry: "",
      rounds: "",
      lastLogin: "",
      appVersion: "",
      device: "",
      homeCourse: "",
    });
    const escapeCsv = (value) => {
      const str = value == null ? "" : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `golfsum-users-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <section style={{ padding: "80px 24px", textAlign: "center" }}><div className="loading-bar" style={{ maxWidth: 200, margin: "40px auto" }} /></section>;

  return (
    <section style={{ padding: "40px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="fade-up" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="tool" size={22} color={C.amber} /> Admin Dashboard
        </h1>
        <p style={{ fontSize: 14, color: C.textMuted }}>Monitor users, rounds, and troubleshoot issues</p>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        {["overview", "users", "ocr", "reported", "push", ...(selectedUser ? ["user"] : [])].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", padding: "10px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: tab === t ? 600 : 400, color: tab === t ? C.text : C.textMuted, borderBottom: tab === t ? `2px solid ${C.brand}` : "2px solid transparent", textTransform: "capitalize" }}>
            {t === "user" && selectedUser
              ? `User: ${selectedUser.personalInfo?.name || selectedUser.uid.slice(0, 8)}`
              : t === "ocr"
                ? "OCR Errors"
              : t === "reported"
                ? "Reported Issues"
                : t === "push"
                  ? "Push Campaigns"
                : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="fade-in">
          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="stat-box"><div className="stat-value" style={{ color: C.brand }}>{users.length}</div><div className="stat-label">Total Users</div></div>
            <div className="stat-box"><div className="stat-value">{siteStats.visitors != null ? siteStats.visitors : "—"}</div><div className="stat-label">Unique Visitors</div></div>
            <div className="stat-box"><div className="stat-value">{siteStats.visits != null ? siteStats.visits : "—"}</div><div className="stat-label">Total Visits</div></div>
            <div className="stat-box"><div className="stat-value">{activeUsers}</div><div className="stat-label">Active (1+ round)</div></div>
            <div className="stat-box"><div className="stat-value">{totalRounds}</div><div className="stat-label">Total Rounds</div></div>
            <div className="stat-box"><div className="stat-value">{recentRounds !== null ? recentRounds : "—"}</div><div className="stat-label">Rounds (7 days)</div></div>
            <div className="stat-box"><div className="stat-value">{recentLogins}</div><div className="stat-label">Logins (7 days)</div></div>
            <div className="stat-box"><div className="stat-value">{users.length ? (totalRounds / users.length).toFixed(1) : "0"}</div><div className="stat-label">Avg Rounds/User</div></div>
            <div className="stat-box"><div className="stat-value">{users.length ? Math.round((activeUsers / users.length) * 100) : 0}%</div><div className="stat-label">Activation Rate</div></div>
            <div className="stat-box"><div className="stat-value">{ocrStats.total != null ? ocrStats.total : "—"}</div><div className="stat-label">OCR Uploads</div></div>
            <div className="stat-box"><div className="stat-value">{ocrErrors.length}</div><div className="stat-label">OCR Errors</div></div>
            <div className="stat-box"><div className="stat-value">{ocrSuccessPct != null ? `${ocrSuccessPct}%` : "—"}</div><div className="stat-label">OCR Success Rate</div></div>
            <div className="stat-box"><div className="stat-value" style={{ fontSize: 13 }}>{ocrLastAt ? fmtDate(ocrLastAt) : "—"}</div><div className="stat-label">Last OCR: {ocrLastName}</div></div>
            <div className="stat-box"><div className="stat-value">{mergedReportedIssues.length}</div><div className="stat-label">Reported Issues</div></div>
            <div className="stat-box"><div className="stat-value">{usersWith2PlusRounds}</div><div className="stat-label">Users with 2+ rounds</div></div>
            <div className="stat-box"><div className="stat-value">{returnedAfter7Days !== null ? returnedAfter7Days : "—"}</div><div className="stat-label">Returned after 7 days</div></div>
            <div className="stat-box"><div className="stat-value">{trialToPaidRate}%</div><div className="stat-label">Trial → Paid</div></div>
            <div className="stat-box"><div className="stat-value">{churnedUsers}</div><div className="stat-label">Churned subscriptions</div></div>
          </div>
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 8 }}>App Version Distribution</div>
            {appVersionDistribution.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textMuted }}>No version data yet.</div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {appVersionDistribution.map(([version, count]) => (
                  <span key={version} className="badge badge-blue" style={{ fontSize: 11 }}>
                    {version}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>System Status</h3>
                <p style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                  {lastStatusCheck ? `Last checked: ${lastStatusCheck}` : "Checking..."}
                </p>
                <p style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                  Firebase: <a href="https://status.firebase.google.com/" target="_blank" rel="noreferrer">Status Dashboard</a>
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={refreshStatus}
                disabled={statusLoading}
                style={{ fontSize: 12 }}
              >
                {statusLoading ? "Checking..." : "Refresh"}
              </button>
            </div>
            {!serviceStatus ? (
              <div style={{ padding: 20, fontSize: 13, color: C.textMuted }}>Running health checks...</div>
            ) : (
              <div>
                {Object.values(serviceStatus).map((svc, i) => {
                  const color = svc.status === "ok" ? "#10B981"
                    : svc.status === "degraded" ? "#F59E0B"
                    : "#EF4444";
                  const icon = svc.status === "ok" ? "●"
                    : svc.status === "degraded" ? "◐"
                    : "●";
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 20px",
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <span style={{ color, fontSize: 16, minWidth: 20 }}>{icon}</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{svc.name}</span>
                        {svc.critical && (
                          <span style={{ fontSize: 10, color: C.textDim, marginLeft: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>critical</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: C.textDim, minWidth: 60, textAlign: "right" }}>
                        {svc.latency_ms != null ? `${svc.latency_ms}ms` : "—"}
                      </span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color,
                        textTransform: "uppercase",
                        minWidth: 60,
                        textAlign: "right",
                      }}>
                        {svc.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Top Errors by Frequency</h3>
              <p style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Grouped by error message · users currently affected</p>
            </div>
            {topErrors.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: C.textMuted }}>No errors recorded.</div>
            ) : (
              <div>
                {topErrors.map((err, i) => (
                  <div key={i}>
                    <div
                      onClick={() => setExpandedTopError(expandedTopError === i ? null : i)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 20px",
                        borderBottom: `1px solid ${C.border}`,
                        cursor: "pointer",
                        background: expandedTopError === i ? "rgba(16,185,129,0.04)" : "transparent",
                      }}
                    >
                      <div style={{
                        minWidth: 36, height: 36, borderRadius: 8,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, fontSize: 15,
                        background: err.count >= 5 ? "rgba(239,68,68,0.15)" : err.count >= 2 ? "rgba(245,158,11,0.15)" : "rgba(107,114,128,0.1)",
                        color: err.count >= 5 ? "#EF4444" : err.count >= 2 ? "#F59E0B" : C.textMuted,
                      }}>
                        {err.count}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, color: C.text, fontWeight: 500,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {err.message}
                        </div>
                        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                          {err.name ? `${err.name} · ` : ""}{err.count} user{err.count !== 1 ? "s" : ""} · last seen {err.lastSeen ? fmtDate(err.lastSeen) : "—"}
                        </div>
                      </div>
                      <div style={{ fontSize: 14, color: C.textDim }}>{expandedTopError === i ? "▲" : "▼"}</div>
                    </div>
                    {expandedTopError === i && (
                      <div style={{ padding: "12px 20px 16px", background: "rgba(16,185,129,0.02)", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 8 }}>Affected Users</div>
                        <table className="table" style={{ marginBottom: 0 }}>
                          <thead><tr><th>User</th><th>Email</th><th>When</th><th></th></tr></thead>
                          <tbody>
                            {[...err.users].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt)).map((u, j) => (
                              <tr key={j}>
                                <td style={{ color: C.text, fontWeight: 500 }}>{u.name || u.uid.slice(0, 8)}</td>
                                <td style={{ fontSize: 13, color: C.textMuted }}>{u.email || "—"}</td>
                                <td style={{ fontSize: 12 }}>{u.createdAt ? fmtDate(u.createdAt) : "—"}</td>
                                <td><button className="btn btn-ghost btn-sm" onClick={() => { const fullUser = users.find(x => x.uid === u.uid); if (fullUser) { setSelectedErrorUser(fullUser); } }}>View Full</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}><h3 style={{ fontSize: 15, fontWeight: 600 }}>Recent Errors</h3></div>
            {errorUsers.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: C.textMuted }}>No errors recorded.</div>
            ) : (
              <table className="table"><thead><tr><th>User</th><th>Email</th><th>When</th><th>Message</th><th>Stack</th><th></th></tr></thead><tbody>
                {recentErrorUsers.map((u, i) => (
                  <tr key={i}>
                    <td style={{ color: C.text, fontWeight: 500 }}>{getUserName(u)}</td>
                    <td style={{ fontSize: 13, color: C.textMuted }}>{getUserEmail(u)}</td>
                    <td style={{ fontSize: 12 }}>{u.lastError?.createdAt ? fmtDate(u.lastError.createdAt) : "—"}</td>
                    <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.lastError?.message || "—"}</td>
                    <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11 }}>{u.lastError?.stack || "—"}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setSelectedErrorUser(u)}>View</button></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
          {selectedErrorUser?.lastError && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Full Error</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedErrorUser(null)}>Close</button>
              </div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8 }}>
                <span style={{ color: C.text, fontWeight: 600 }}>{getUserName(selectedErrorUser)}</span> · {getUserEmail(selectedErrorUser)}
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>{selectedErrorUser.lastError.createdAt || "—"}</div>
              <div style={{ fontSize: 13, color: C.text, marginBottom: 10 }}>{selectedErrorUser.lastError.message}</div>
              {selectedErrorUser.lastError.stack && (
                <pre style={{ fontSize: 11, color: C.textMuted, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", margin: 0, maxWidth: "100%" }}>{truncateText(selectedErrorUser.lastError.stack, 12000)}</pre>
              )}
              {selectedErrorUser.lastError.args && (
                <pre style={{ fontSize: 11, color: C.textDim, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", marginTop: 10, maxWidth: "100%" }}>{truncateText(selectedErrorUser.lastError.args, 12000)}</pre>
              )}
            </div>
          )}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}><h3 style={{ fontSize: 15, fontWeight: 600 }}>Most Active Users</h3></div>
            <table className="table"><thead><tr><th>User</th><th>Email</th><th>UID</th><th>Rounds</th><th>Best</th><th>Last Round</th><th>Last Login</th><th>Device</th><th></th></tr></thead><tbody>
              {mostActiveUsers.map((u, i) => {
                const count = roundCounts[u.uid] ?? 0;
                const device = getUserLastLoginDevice(u);
                return (<tr key={i}>
                  <td style={{ color: C.text, fontWeight: 500 }}>{getUserName(u)}</td>
                  <td style={{ fontSize: 13, color: C.textMuted }}>{getUserEmail(u)}</td>
                  <td style={{ fontSize: 12, fontFamily: "monospace" }}>{u.uid.slice(0, 12)}...</td>
                  <td style={{ fontWeight: 600, color: C.text }}>{count}</td>
                  <td>{"—"}</td>
                  <td>{"—"}</td>
                  <td>{getUserLastLoginAt(u) ? fmtDate(getUserLastLoginAt(u)) : "—"}</td>
                  <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{device?.platform || device?.userAgent || "—"}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => loadUserDetail(u)}>View</button></td>
                </tr>);
              })}
            </tbody></table>
          </div>
        </div>
      )}

      {tab === "ocr" && (
        <div className="fade-in">
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="input"
                placeholder="Search OCR errors by user, email, reason, message..."
                value={ocrSearchTerm}
                onChange={(e) => setOcrSearchTerm(e.target.value)}
                style={{ flex: 1, minWidth: 280 }}
              />
              <input className="input" type="date" value={ocrDateFrom} onChange={(e) => setOcrDateFrom(e.target.value)} style={{ maxWidth: 160 }} />
              <input className="input" type="date" value={ocrDateTo} onChange={(e) => setOcrDateTo(e.target.value)} style={{ maxWidth: 160 }} />
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="badge badge-blue">Uploads: {ocrUploads}</span>
              <span className="badge badge-red">Errors: {ocrErrorsCount}</span>
              <span className="badge badge-green">Success: {ocrSuccessPct != null ? `${ocrSuccessPct}%` : "—"}</span>
              {Object.entries(ocrErrorBreakdown).map(([reason, count]) => (
                <span key={reason} className="badge badge-amber">{reason}: {count}</span>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: "auto", marginBottom: 20 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>OCR Errors</h3>
              <p style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Latest OCR failures with attached images (if available)</p>
            </div>
            {filteredOcrErrors.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: C.textMuted }}>No OCR errors recorded.</div>
            ) : (
              <table className="table"><thead><tr><th>Date</th><th>User</th><th>Email</th><th>Reason</th><th>Message</th><th>Mode</th><th>Photo</th><th></th></tr></thead><tbody>
                {filteredOcrErrors
                  .slice()
                  .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
                  .map((err, i) => {
                    const u = userLookup[err.uid] || {};
                    const msg = err.error?.message || err.message || "—";
                    const ocrImageUrl = safeExternalUrl(err.imageUrl);
                    return (
                      <tr key={i}>
                        <td>{err.createdAt ? fmtDate(err.createdAt) : "—"}</td>
                        <td style={{ color: C.text, fontWeight: 500 }}>{getUserName(u) || err.uid?.slice?.(0, 8) || "—"}</td>
                        <td style={{ fontSize: 13, color: C.textMuted }}>{err.email || getUserEmail(u) || "—"}</td>
                        <td style={{ fontSize: 12, color: C.textMuted }}>{err.reason || "—"}</td>
                        <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg}</td>
                        <td style={{ fontSize: 12 }}>{err.mode || "—"}</td>
                        <td>
                          {ocrImageUrl ? (
                            <img src={ocrImageUrl} alt="OCR" style={{ width: 52, height: 36, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
                          ) : "—"}
                        </td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => setSelectedOcrError(err)}>View</button></td>
                      </tr>
                    );
                  })}
              </tbody></table>
            )}
          </div>
          {selectedOcrError && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>OCR Error Detail</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedOcrError(null)}>Close</button>
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>
                {selectedOcrError.createdAt ? fmtDate(selectedOcrError.createdAt) : "—"}
              </div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 10 }}>
                <span style={{ color: C.text, fontWeight: 600 }}>{selectedOcrError.email || "Unknown user"}</span>
                {" · "}
                {selectedOcrError.uid || "—"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["Reason", selectedOcrError.reason],
                  ["Mode", selectedOcrError.mode],
                  ["Platform", selectedOcrError.platform],
                  ["App Version", selectedOcrError.appVersion],
                  ["Build", selectedOcrError.buildNumber],
                ].map(([label, value], idx) => (
                  <div key={idx}>
                    <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontSize: 13, color: C.textMuted }}>{value || "—"}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 14, color: C.text, marginBottom: 10 }}>{selectedOcrError.error?.message || "—"}</div>
              {selectedOcrError.error?.stack && (
                <pre style={{ fontSize: 11, color: C.textMuted, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", margin: "0 0 12px" }}>{truncateText(selectedOcrError.error.stack, 12000)}</pre>
              )}
              {selectedOcrImageUrl && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 6 }}>Image</div>
                  <img src={selectedOcrImageUrl} alt="OCR" style={{ width: "100%", maxWidth: 520, borderRadius: 12, border: `1px solid ${C.border}` }} />
                </div>
              )}
              {selectedOcrError.flags?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 6 }}>Flags</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selectedOcrError.flags.map((f, i) => <span key={i} className="badge badge-amber" style={{ fontSize: 11 }}>{f}</span>)}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {tab === "users" && (
        <div className="fade-in">
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input className="input" placeholder="Search by name, email, or UID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
            <button className="btn btn-ghost btn-sm" onClick={exportUsersCsv}>
              <Icon name="download" size={14} color={C.textMuted} /> Export CSV
            </button>
          </div>
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table className="table"><thead><tr><th>Name</th><th>Email</th><th>UID</th><th>Mode</th><th>Subscription</th><th>Rounds</th><th>Last Login</th><th>Device</th><th>Home Course</th><th></th></tr></thead><tbody>
              {filtered.map((u, i) => (
                <tr key={i}>
                  <td style={{ color: C.text, fontWeight: 500 }}>{getUserName(u)}</td>
                  <td style={{ fontSize: 13, color: C.textMuted }}>{getUserEmail(u)}</td>
                  <td style={{ fontSize: 12, fontFamily: "monospace" }}>{u.uid.slice(0, 16)}...</td>
                  <td><span className={`badge ${getUserScoringMode(u) === "advanced" ? "badge-green" : "badge-blue"}`}>{getUserScoringMode(u)}</span></td>
                  <td>
                    {(() => {
                      const sub = getSubscriptionInfo(u);
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span className={`badge ${sub.className}`}>{sub.label}</span>
                          {sub.expiry ? <span style={{ fontSize: 11, color: C.textDim }}>exp {fmtDate(sub.expiry)}</span> : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td>{roundCounts[u.uid] ?? 0}</td>
                  <td>{getUserLastLoginAt(u) ? fmtDate(getUserLastLoginAt(u)) : "—"}</td>
                  <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getUserLastLoginDevice(u)?.platform || getUserLastLoginDevice(u)?.userAgent || "—"}</td>
                  <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getUserHomeCourse(u)}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => loadUserDetail(u)}>Inspect</button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}

      {tab === "push" && (
        <div className="fade-in">
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            <div className="stat-box">
              <div className="stat-value" style={{ color: C.brand }}>{pushSummary.activeDevices ?? "—"}</div>
              <div className="stat-label">Active Devices</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{pushSummary.marketingDevices ?? "—"}</div>
              <div className="stat-label">Marketing Opt-In</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{pushSummary.maintenanceDevices ?? "—"}</div>
              <div className="stat-label">Maintenance Opt-In</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Send Push Campaign</h3>
                <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                  Use marketing for offers and launches. Use maintenance for outages, windows, and urgent service notices.
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => loadPushSummary()} disabled={pushSending}>
                Refresh
              </button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: C.textDim, textTransform: "uppercase" }}>Audience</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    ["marketing", "Marketing"],
                    ["maintenance", "Maintenance"],
                    ["all", "All Active"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPushAudience(value)}
                      style={{
                        borderColor: pushAudience === value ? C.brand : C.border,
                        color: pushAudience === value ? C.text : C.textMuted,
                        background: pushAudience === value ? "rgba(16,185,129,0.10)" : "transparent",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: C.textDim, textTransform: "uppercase" }}>Title</div>
                <input className="input" value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="March offer: 7 days free Pro" maxLength={80} />
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: C.textDim, textTransform: "uppercase" }}>Message</div>
                <textarea
                  value={pushBody}
                  onChange={(e) => setPushBody(e.target.value)}
                  placeholder="Open GolfSum to claim the latest offer."
                  maxLength={240}
                  style={{
                    width: "100%",
                    minHeight: 96,
                    background: C.bgElevated,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    color: C.text,
                    padding: "10px 12px",
                    fontFamily: "inherit",
                    fontSize: 13,
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: C.textDim, textTransform: "uppercase", marginBottom: 8 }}>Open Screen</div>
                  <select className="input" value={pushScreen} onChange={(e) => setPushScreen(e.target.value)}>
                    <option value="pro-upgrade">Pro Upgrade</option>
                    <option value="history">History</option>
                    <option value="averages">Averages</option>
                    <option value="insights">Insights</option>
                    <option value="profile">Profile</option>
                    <option value="upload">Play</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.textDim, textTransform: "uppercase", marginBottom: 8 }}>Tab Hint</div>
                  <select className="input" value={pushTab} onChange={(e) => setPushTab(e.target.value)}>
                    <option value="profile">Profile</option>
                    <option value="history">History</option>
                    <option value="averages">Averages</option>
                    <option value="insights">Insights</option>
                    <option value="upload">Play</option>
                  </select>
                </div>
              </div>
              {pushResult && (
                <div
                  style={{
                    fontSize: 13,
                    color: pushResult.ok ? "#10B981" : "#F87171",
                    background: pushResult.ok ? "rgba(16,185,129,0.10)" : "rgba(248,113,113,0.10)",
                    border: `1px solid ${pushResult.ok ? "rgba(16,185,129,0.30)" : "rgba(248,113,113,0.30)"}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  {pushResult.message}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" onClick={sendPushCampaign} disabled={pushSending || !pushTitle.trim() || !pushBody.trim()}>
                  {pushSending ? "Sending..." : "Send Push"}
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Recent Campaigns</h3>
            </div>
            {pushSummary.recentCampaigns.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: C.textMuted }}>No campaigns sent yet.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Audience</th>
                    <th>Title</th>
                    <th>Target</th>
                    <th>Accepted</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {pushSummary.recentCampaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>{campaign.sentAt ? fmtDate(campaign.sentAt) : "—"}</td>
                      <td style={{ textTransform: "capitalize" }}>{campaign.audience || "—"}</td>
                      <td style={{ color: C.text, fontWeight: 500 }}>{campaign.title || "—"}</td>
                      <td>{campaign.targetedCount ?? 0}</td>
                      <td>{campaign.sentCount ?? 0}</td>
                      <td>{campaign.errorCount ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "reported" && (
        <div className="fade-in">
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input"
              placeholder="Search reports by user, email, message, recent error..."
              value={reportedSearchTerm}
              onChange={(e) => setReportedSearchTerm(e.target.value)}
              style={{ flex: 1, minWidth: 280 }}
            />
            <input className="input" type="date" value={reportedDateFrom} onChange={(e) => setReportedDateFrom(e.target.value)} style={{ maxWidth: 160 }} />
            <input className="input" type="date" value={reportedDateTo} onChange={(e) => setReportedDateTo(e.target.value)} style={{ maxWidth: 160 }} />
            <button className="btn btn-ghost btn-sm" onClick={refreshReports} disabled={refreshingReports}>
              {refreshingReports ? "Refreshing..." : "Refresh Reports"}
            </button>
          </div>
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            {filteredReportedIssues.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: C.textMuted }}>No reported issues yet.</div>
            ) : (
              <table className="table"><thead><tr><th>Date</th><th>User</th><th>Email</th><th>Message</th><th>Last Login</th><th>Recent Error</th><th></th></tr></thead><tbody>
                {filteredReportedIssues
                  .slice()
                  .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
                  .map((issue, i) => {
                    const u = userLookup[issue.uid] || {};
                    const lastLogin = issue.lastLoginAt || getUserLastLoginAt(u);
                    const recentError = issue.lastError?.message || u.lastError?.message || "—";
                    return (
                      <tr key={i}>
                        <td>{issue.createdAt ? fmtDate(issue.createdAt) : "—"}</td>
                        <td style={{ color: C.text, fontWeight: 500 }}>{getUserName(u) || issue.uid?.slice?.(0, 8) || "—"}</td>
                        <td style={{ fontSize: 13, color: C.textMuted }}>{issue.email || getUserEmail(u) || "—"}</td>
                        <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.message || "—"}</td>
                        <td>{lastLogin ? fmtDate(lastLogin) : "—"}</td>
                        <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recentError}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => { setSelectedReportedIssue(issue); setReportNoteDraft(issue.adminNote || ""); setAdminReplyDraft(""); }}>View</button></td>
                      </tr>
                    );
                  })}
              </tbody></table>
            )}
          </div>
          {selectedReportedIssue && (
            <div className="card" style={{ marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Full Report</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedReportedIssue(null)}>Close</button>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <span className={`badge ${selectedReportedIssue.status === "completed" ? "badge-green" : "badge-amber"}`}>
                  {selectedReportedIssue.status === "completed" ? "Completed" : "Open"}
                </span>
                {selectedReportedIssue.completedAt && (
                  <span style={{ fontSize: 12, color: C.textDim }}>Completed {fmtDate(selectedReportedIssue.completedAt)}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>
                {selectedReportedIssue.createdAt ? fmtDate(selectedReportedIssue.createdAt) : "—"}
              </div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 10 }}>
                <span style={{ color: C.text, fontWeight: 600 }}>{selectedReportedIssue.email || "Unknown user"}</span>
                {" · "}
                {selectedReportedIssue.uid || "—"}
              </div>
              <div style={{ fontSize: 14, color: C.text, marginBottom: 12 }}>{selectedReportedIssue.message || "—"}</div>
              {(() => {
                const thread = Array.isArray(selectedReportedIssue.thread) ? selectedReportedIssue.thread : [];
                if (!thread.length) return null;
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 6 }}>Thread</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {thread.map((entry, idx) => (
                        <div key={idx} style={{
                          background: entry.from === "admin" ? "rgba(59,130,246,0.12)" : "rgba(16,185,129,0.12)",
                          border: `1px solid ${entry.from === "admin" ? "rgba(59,130,246,0.35)" : "rgba(16,185,129,0.35)"}`,
                          borderRadius: 10,
                          padding: "8px 10px",
                        }}>
                          <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 4 }}>
                            {entry.from === "admin" ? "Admin" : "User"}
                          </div>
                          <div style={{ fontSize: 13, color: C.text }}>{entry.message}</div>
                          {entry.createdAt && (
                            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
                              {fmtDate(entry.createdAt)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 6 }}>Admin Note</div>
                <textarea
                  value={reportNoteDraft}
                  onChange={(e) => setReportNoteDraft(e.target.value)}
                  placeholder="Add a note for the user..."
                  style={{
                    width: "100%",
                    minHeight: 80,
                    background: C.bgElevated,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    color: C.text,
                    padding: "10px 12px",
                    fontFamily: "inherit",
                    fontSize: 13,
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={updatingReport}
                    onClick={() => updateReportedIssue(selectedReportedIssue, { adminNote: reportNoteDraft })}
                  >
                    {updatingReport ? "Saving..." : "Save Note"}
                  </button>
                  {selectedReportedIssue.status !== "completed" ? (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={updatingReport}
                      onClick={() => updateReportedIssue(selectedReportedIssue, {
                        status: "completed",
                        adminNote: reportNoteDraft,
                        completedAt: new Date().toISOString(),
                        completedBy: user.uid,
                        completedByEmail: user.email || null,
                      })}
                    >
                      {updatingReport ? "Updating..." : "Mark Completed"}
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={updatingReport}
                      onClick={() => updateReportedIssue(selectedReportedIssue, {
                        status: "open",
                        completedAt: null,
                        completedBy: null,
                        completedByEmail: null,
                      })}
                    >
                      {updatingReport ? "Updating..." : "Reopen"}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 6 }}>Reply to User</div>
                <textarea
                  value={adminReplyDraft}
                  onChange={(e) => setAdminReplyDraft(e.target.value)}
                  placeholder="Send a reply..."
                  style={{
                    width: "100%",
                    minHeight: 80,
                    background: C.bgElevated,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    color: C.text,
                    padding: "10px 12px",
                    fontFamily: "inherit",
                    fontSize: 13,
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={updatingReport || !adminReplyDraft.trim()}
                    onClick={sendAdminReply}
                  >
                    {updatingReport ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["Platform", selectedReportedIssue.platform],
                  ["Device", selectedReportedIssue.deviceModel],
                  ["App Version", selectedReportedIssue.appVersion],
                  ["Build", selectedReportedIssue.buildNumber],
                  ["Last Login", selectedReportedIssue.lastLoginAt ? fmtDate(selectedReportedIssue.lastLoginAt) : "—"],
                ].map(([label, value], idx) => (
                  <div key={idx}>
                    <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontSize: 13, color: C.textMuted }}>{value || "—"}</div>
                  </div>
                ))}
              </div>
              {selectedReportedIssue.lastError?.message && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 6 }}>Recent Error</div>
                  <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>{selectedReportedIssue.lastError.message}</div>
                  {selectedReportedIssue.lastError.stack && (
                    <pre style={{ fontSize: 11, color: C.textMuted, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", margin: 0, maxWidth: "100%" }}>{truncateText(selectedReportedIssue.lastError.stack, 12000)}</pre>
                  )}
                </div>
              )}
              {selectedReportedIssue.context && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 6 }}>Context</div>
                  <pre style={{ fontSize: 11, color: C.textMuted, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", margin: 0, maxWidth: "100%" }}>
                    {safeJsonPreview(selectedReportedIssue.context, 12000)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "user" && selectedUser && (
        <div className="fade-in">
          {loadingUser ? <div className="loading-bar" style={{ maxWidth: 200, margin: "40px auto" }} /> : (
            <>
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{getUserName(selectedUser) || "Unnamed User"}</h3>
                    <p style={{ fontSize: 13, color: C.textMuted, fontFamily: "monospace" }}>UID: {selectedUser.uid}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span className={`badge ${getUserScoringMode(selectedUser) === "advanced" ? "badge-green" : "badge-blue"}`}>{getUserScoringMode(selectedUser)} mode</span>
                    <span className="badge badge-amber">{selectedRounds.length} rounds</span>
                  </div>
                </div>
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  {[
                    ["Email", getUserEmail(selectedUser)],
                    ["Home Course", getUserHomeCourse(selectedUser)],
                    ["Player Rating", selectedUser.coursePreferences?.typicalHandicap || selectedUser.profile?.coursePreferences?.typicalHandicap],
                    ["Favorite Tee", selectedUser.coursePreferences?.favoriteTee || selectedUser.profile?.coursePreferences?.favoriteTee],
                    ["Subscription", getSubscriptionInfo(selectedUser).label],
                    ["Subscription Expiry", getSubscriptionInfo(selectedUser).expiry ? fmtDate(getSubscriptionInfo(selectedUser).expiry) : "—"],
                    ["Last Login", getUserLastLoginAt(selectedUser) ? fmtDate(getUserLastLoginAt(selectedUser)) : "—"],
                    ["Device", getUserLastLoginDevice(selectedUser)?.platform || getUserLastLoginDevice(selectedUser)?.userAgent || "—"],
                    ["Last Error", selectedUser.lastError?.message || "—"],
                  ].map(([l, v], i) => (
                    <div key={i}><span style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase" }}>{l}</span><p style={{ fontSize: 14, color: C.textMuted }}>{v || "—"}</p></div>
                  ))}
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    className="input"
                    placeholder="Set home course..."
                    value={homeCourseDraft}
                    onChange={(e) => setHomeCourseDraft(e.target.value)}
                    style={{ maxWidth: 360 }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={handleSaveHomeCourse} disabled={savingHomeCourse}>
                    {savingHomeCourse ? "Saving..." : "Save Home Course"}
                  </button>
                </div>
                {selectedUser.statPreferences && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase" }}>Stat Preferences</span>
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.entries(selectedUser.statPreferences).map(([k, v]) => <span key={k} className={`badge ${v ? "badge-green" : "badge-red"}`} style={{ fontSize: 11 }}>{k}</span>)}
                    </div>
                  </div>
                )}
                {selectedUser.goals && Object.values(selectedUser.goals).some((v) => v != null) && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase" }}>Goals</span>
                    <div style={{ marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {Object.entries(selectedUser.goals).filter(([, v]) => v != null).map(([k, v]) => (
                        <div key={k} style={{ fontSize: 13, color: C.textMuted }}><span style={{ color: C.text, fontWeight: 600 }}>{v}</span> {k.replace(/([A-Z])/g, " $1").toLowerCase()}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {selectedRounds.length > 0 && (
                <div className="stat-grid" style={{ marginBottom: 20 }}>
                  {(() => {
                    const sc = selectedRounds.filter((r) => r.score > 0);
                    return [
                      { v: sc.length ? (sc.reduce((s, r) => s + r.score, 0) / sc.length).toFixed(1) : "—", l: "Avg Score" },
                      { v: sc.length ? Math.min(...sc.map((r) => r.score)) : "—", l: "Best" },
                      { v: sc.length ? Math.max(...sc.map((r) => r.score)) : "—", l: "Worst" },
                      { v: sc.filter((r) => r.stats?.putts).length ? (sc.filter((r) => r.stats?.putts).reduce((s, r) => s + r.stats.putts, 0) / sc.filter((r) => r.stats?.putts).length).toFixed(1) : "—", l: "Avg Putts" },
                    ].map((s, i) => <div key={i} className="stat-box"><div className="stat-value">{s.v}</div><div className="stat-label">{s.l}</div></div>);
                  })()}
                </div>
              )}
              <div className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>User Timeline</h3>
                {(() => {
                  const timeline = [];
                  if (selectedUser.createdAt) timeline.push({ at: selectedUser.createdAt, label: "Account created", detail: getUserEmail(selectedUser) });
                  if (getUserLastLoginAt(selectedUser)) timeline.push({ at: getUserLastLoginAt(selectedUser), label: "Last login", detail: getUserLastLoginDevice(selectedUser)?.platform || "device unknown" });
                  if (selectedUser.lastError?.createdAt) timeline.push({ at: selectedUser.lastError.createdAt, label: "Last app error", detail: selectedUser.lastError.message || "error logged" });
                  if (selectedUser.lastReportedIssueAt) timeline.push({ at: selectedUser.lastReportedIssueAt, label: "Reported issue", detail: selectedUser.lastReportedIssue?.message || "issue submitted" });
                  const subInfo = getSubscriptionInfo(selectedUser);
                  if (subInfo.expiry) timeline.push({ at: subInfo.expiry, label: "Subscription expiry", detail: subInfo.label });
                  if (subInfo.cancelledAt) timeline.push({ at: subInfo.cancelledAt, label: "Subscription cancelled", detail: subInfo.label });
                  if (!timeline.length) return <div style={{ fontSize: 13, color: C.textMuted }}>No timeline events yet.</div>;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {timeline
                        .slice()
                        .sort((a, b) => toTime(b.at) - toTime(a.at))
                        .map((item, idx) => (
                          <div key={idx} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px" }}>
                            <div style={{ fontSize: 12, color: C.text }}>{item.label}</div>
                            <div style={{ fontSize: 11, color: C.textDim }}>{item.at ? fmtDate(item.at) : "—"} {item.detail ? `· ${item.detail}` : ""}</div>
                          </div>
                        ))}
                    </div>
                  );
                })()}
              </div>
              <div className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Subscription History</h3>
                {(() => {
                  const history = selectedUser.subscriptionHistory || selectedUser.billingHistory || selectedUser.profile?.subscriptionHistory || [];
                  if (!Array.isArray(history) || history.length === 0) {
                    const sub = getSubscriptionInfo(selectedUser);
                    return (
                      <div style={{ fontSize: 13, color: C.textMuted }}>
                        Current: {sub.label}{sub.expiry ? ` · expires ${fmtDate(sub.expiry)}` : ""}
                      </div>
                    );
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {history
                        .slice()
                        .sort((a, b) => toTime(b.date || b.createdAt) - toTime(a.date || a.createdAt))
                        .map((entry, idx) => (
                          <div key={idx} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px" }}>
                            <div style={{ fontSize: 12, color: C.text }}>{entry.status || entry.type || "Subscription event"}</div>
                            <div style={{ fontSize: 11, color: C.textDim }}>
                              {fmtDate(entry.date || entry.createdAt)}{entry.productId ? ` · ${entry.productId}` : ""}
                            </div>
                          </div>
                        ))}
                    </div>
                  );
                })()}
              </div>
              <div className="card" style={{ padding: 0, overflow: "auto" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}><h3 style={{ fontSize: 15, fontWeight: 600 }}>Round History</h3></div>
                <table className="table"><thead><tr><th>Date</th><th>Course</th><th>Score</th><th>Entry</th><th>Putts</th><th>FIR</th><th>GIR</th><th>Tee</th><th>Rating/Slope</th><th>Diff</th><th>Holes</th><th>Scorecard</th><th>Status</th></tr></thead><tbody>
                  {selectedRounds.map((r, i) => {
                    const scorecardUrl = safeExternalUrl(r.imageUri || r.thumbnailUri);
                    return (
                    <tr key={i}><td>{fmtDate(r.date)}</td><td style={{ color: C.text, fontWeight: 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.courseName || "—"}</td><td style={{ fontWeight: 700, color: C.text }}>{r.score}</td><td><span className={`badge ${getRoundEntryMethod(r) === "OCR" ? "badge-amber" : "badge-blue"}`}>{getRoundEntryMethod(r)}</span></td><td>{r.stats?.putts || "—"}</td><td>{pct(r.stats?.fairways, r.stats?.fairwaysPossible)}</td><td>{pct(r.stats?.greens, r.stats?.greensPossible)}</td><td>{r.stats?.teeBox || "—"}</td><td>{r.stats?.courseRating || "—"}/{r.stats?.slopeRating || "—"}</td><td>{r.differential != null ? fmt(r.differential, 1) : "—"}</td><td>{r.holeCount || "18"}</td><td>
                      {scorecardUrl ? (
                        <a
                          href={scorecardUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          <img
                            src={scorecardUrl}
                            alt="Scorecard"
                            style={{ width: 44, height: 32, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }}
                          />
                          <span style={{ fontSize: 12, color: C.textMuted }}>View</span>
                        </a>
                      ) : "—"}
                    </td><td>
                      {r.isAcceptableForHandicap === false ? <span className="badge badge-red">Unrated</span> : r.isIncomplete ? <span className="badge badge-amber">Incomplete</span> : r.isNineHoleRound ? <span className="badge badge-blue">9 holes</span> : <span className="badge badge-green">OK</span>}
                    </td></tr>
                  );})}
                </tbody></table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
