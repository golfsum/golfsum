/**
 * golfapi.io Service
 * Provides course search and detailed GPS/course data from golfapi.io.
 * Set EXPO_PUBLIC_GOLFAPI_IO_TOKEN in your .env to enable.
 *
 * API docs: https://www.golfapi.io/docs
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseEnabled } from './firebase';
import { getCurrentUser } from './firebaseAuthService';
import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { CourseDetails, TeeBox, HoleDetail } from './golfCourseApiService';

const BASE_URL = 'https://www.golfapi.io/api/v2.7';
const TOKEN = process.env.EXPO_PUBLIC_GOLFAPI_IO_TOKEN ?? '';

// golfapi.io REST API is CORS-blocked from browsers — only call directly on native.
const canCallDirectly = () => Platform.OS !== 'web';

const SEARCH_CACHE_KEY = '@GolfSum:GolfApiIoSearchCache';
const SEARCH_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GolfApiCourse {
  id: string;          // CourseID from golfapi.io
  name: string;        // ClubName
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  holes: number;
}

export interface GolfApiHole {
  number: number;
  par: number;
  handicap?: number;
  tees: Array<{
    name: string;
    color: string;
    yards: number;
    rating?: number;
    slope?: number;
  }>;
  // GPS POIs: tee boxes, greens, etc. (if returned by the API)
  pois?: Array<{
    type: string;
    latitude: number;
    longitude: number;
  }>;
}

export interface GolfApiCourseDetail extends GolfApiCourse {
  rating?: number;
  slope?: number;
  holesData: GolfApiHole[];
}

// ─── Auth header ─────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  if (!TOKEN) return {};
  return { Authorization: `Bearer ${TOKEN}` };
}

// ─── Firestore helpers ───────────────────────────────────────────────────────

async function saveToFirestore(courseId: string, data: GolfApiCourseDetail): Promise<void> {
  if (!courseId || !db || !isFirebaseEnabled || !getCurrentUser()) return;
  try {
    await setDoc(
      doc(db, 'courses', `golfapiio_${courseId}`),
      {
        source: 'GOLFAPI_IO',
        courseId,
        name: data.name,
        city: data.city,
        country: data.country,
        latitude: data.latitude,
        longitude: data.longitude,
        holes: data.holes,
        gpsData: data,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    logger.debug(`✅ golfapi.io: saved course ${courseId} to Firestore`);
  } catch (err: any) {
    logger.debug(`ℹ️ golfapi.io: Firestore save skipped for ${courseId}:`, err?.message);
  }
}

async function getFromFirestore(courseId: string): Promise<GolfApiCourseDetail | null> {
  if (!courseId || !db || !isFirebaseEnabled) return null;
  try {
    const snap = await getDoc(doc(db, 'courses', `golfapiio_${courseId}`));
    if (!snap.exists()) return null;
    const data = snap.data();
    return (data?.gpsData as GolfApiCourseDetail) ?? null;
  } catch {
    return null;
  }
}

// ─── Local AsyncStorage cache for search results ────────────────────────────

interface SearchCacheEntry {
  results: GolfApiCourse[];
  ts: number;
}

async function getSearchCache(): Promise<Record<string, SearchCacheEntry>> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setSearchCache(cache: Record<string, SearchCacheEntry>): Promise<void> {
  try {
    await AsyncStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

// ─── API response normalisation ──────────────────────────────────────────────

// golfapi.io returns fields with initial caps (CourseID, ClubName, etc.)
// Normalise to our internal shape.
function normaliseCourse(raw: any): GolfApiCourse {
  return {
    id: String(raw.CourseID ?? raw.courseId ?? raw.id ?? ''),
    name: raw.ClubName ?? raw.name ?? '',
    city: raw.City ?? raw.city ?? '',
    country: raw.Country ?? raw.country ?? '',
    latitude: parseFloat(raw.Latitude ?? raw.latitude ?? '0'),
    longitude: parseFloat(raw.Longitude ?? raw.longitude ?? '0'),
    holes: Number(raw.NumberOfHoles ?? raw.holes ?? 18),
  };
}

function normaliseDetail(raw: any, base: GolfApiCourse): GolfApiCourseDetail {
  const holesRaw: any[] = Array.isArray(raw.holes) ? raw.holes : [];
  const holesData: GolfApiHole[] = holesRaw.map((h: any) => ({
    number: Number(h.hole ?? h.number ?? 0),
    par: Number(h.par ?? 0),
    handicap: h.handicap != null ? Number(h.handicap) : undefined,
    tees: Array.isArray(h.tees)
      ? h.tees.map((t: any) => ({
          name: t.name ?? t.TeeName ?? '',
          color: t.color ?? t.Color ?? '#10B981',
          yards: Number(t.yards ?? t.Yards ?? 0),
          rating: t.rating != null ? Number(t.rating) : undefined,
          slope: t.slope != null ? Number(t.slope) : undefined,
        }))
      : [],
    pois: Array.isArray(h.pois) ? h.pois : undefined,
  }));

  return {
    ...base,
    rating: raw.rating != null ? Number(raw.rating) : undefined,
    slope: raw.slope != null ? Number(raw.slope) : undefined,
    holesData,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Search courses by name (and optionally nearby location).
 * Results are cached locally for 12 h.
 */
export async function searchCoursesByName(
  name: string,
  latitude?: number,
  longitude?: number
): Promise<GolfApiCourse[]> {
  if (!name.trim()) return [];
  if (!canCallDirectly()) return []; // CORS-blocked on web

  const cacheKey = `${name.trim().toLowerCase()}|${latitude ?? ''}|${longitude ?? ''}`;
  const cache = await getSearchCache();
  const entry = cache[cacheKey];
  if (entry && Date.now() - entry.ts < SEARCH_CACHE_TTL_MS) {
    logger.debug(`📦 golfapi.io: returning cached search for "${name}"`);
    return entry.results;
  }

  if (!TOKEN) {
    logger.warn('⚠️ golfapi.io: no token set — set EXPO_PUBLIC_GOLFAPI_IO_TOKEN');
    return [];
  }

  try {
    const params = new URLSearchParams({ ClubName: name.trim() });
    if (latitude != null && longitude != null) {
      params.set('Latitude', String(latitude));
      params.set('Longitude', String(longitude));
      params.set('Radius', '30'); // 30-mile radius
    }

    const res = await fetchWithTimeout(`${BASE_URL}/courses/?${params.toString()}`, {
      headers: authHeader(),
    });

    if (!res.ok) {
      logger.warn(`⚠️ golfapi.io search failed: ${res.status}`);
      return [];
    }

    const json = await res.json();
    const raw: any[] = Array.isArray(json?.result)
      ? json.result
      : Array.isArray(json?.courses)
      ? json.courses
      : Array.isArray(json)
      ? json
      : [];

    const results = raw.filter(Boolean).map(normaliseCourse).filter((c) => c.id && c.name);
    logger.debug(`✅ golfapi.io: found ${results.length} courses for "${name}"`);

    // Cache locally
    cache[cacheKey] = { results, ts: Date.now() };
    await setSearchCache(cache);

    return results;
  } catch (err: any) {
    logger.warn('⚠️ golfapi.io search error:', err?.message);
    return [];
  }
}

/**
 * Fetch full course detail (including hole GPS data) by golfapi.io course ID.
 * Checks Firestore cache first, then fetches from API and saves back to Firestore.
 */
export async function getCourseDetail(courseId: string): Promise<GolfApiCourseDetail | null> {
  if (!courseId) return null;

  // 1. Firestore cache (works on web — Firestore SDK handles its own auth/CORS)
  const cached = await getFromFirestore(courseId);
  if (cached) {
    logger.debug(`📦 golfapi.io: Firestore cache hit for ${courseId}`);
    return cached;
  }

  if (!canCallDirectly()) return null; // REST API is CORS-blocked on web

  if (!TOKEN) {
    logger.warn('⚠️ golfapi.io: no token — set EXPO_PUBLIC_GOLFAPI_IO_TOKEN');
    return null;
  }

  // 2. Fetch from API
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/courses/${courseId}/`, {
      headers: authHeader(),
    });

    if (!res.ok) {
      logger.warn(`⚠️ golfapi.io detail failed: ${res.status} for ${courseId}`);
      return null;
    }

    const json = await res.json();
    const raw = json?.result ?? json?.course ?? json;
    if (!raw) return null;

    const base = normaliseCourse(raw);
    const detail = normaliseDetail(raw, base);

    // 3. Save to Firestore (fire-and-forget)
    saveToFirestore(courseId, detail).catch(() => {});

    logger.debug(`✅ golfapi.io: fetched detail for ${courseId}`);
    return detail;
  } catch (err: any) {
    logger.warn('⚠️ golfapi.io detail error:', err?.message);
    return null;
  }
}

/**
 * Resolve an OSM course to a golfapi.io course by name match.
 * Tries the full name, then progressively stripped variants.
 * Returns the best match or null.
 */
export async function resolveOsmCourseToGolfApiIo(
  osmName: string,
  latitude?: number,
  longitude?: number
): Promise<GolfApiCourse | null> {
  const variants = buildNameVariants(osmName);

  for (const variant of variants) {
    const results = await searchCoursesByName(variant, latitude, longitude);
    if (results.length > 0) {
      // Prefer the result closest to the OSM location if we have coords
      if (latitude != null && longitude != null) {
        results.sort((a, b) => {
          const da = distKm(latitude, longitude, a.latitude, a.longitude);
          const db2 = distKm(latitude, longitude, b.latitude, b.longitude);
          return da - db2;
        });
      }
      logger.debug(`✅ golfapi.io: resolved "${osmName}" → "${results[0].name}" (${results[0].id})`);
      return results[0];
    }
  }

  logger.debug(`⚠️ golfapi.io: could not resolve "${osmName}"`);
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildNameVariants(name: string): string[] {
  const suffixes = [
    'golf links', 'golf course', 'golf club', 'country club',
    'links', 'course', 'club', 'gc', 'cc',
  ];
  const clean = name.trim();
  const lower = clean.toLowerCase();
  const variants: string[] = [clean];

  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) {
      const stripped = clean.slice(0, clean.length - suffix.length).trim();
      if (stripped.length > 2) variants.push(stripped);
      break;
    }
  }

  // Also try first two words only
  const words = clean.split(/\s+/);
  if (words.length > 2) {
    variants.push(words.slice(0, 2).join(' '));
  }

  // Deduplicate preserving order
  return [...new Set(variants)];
}

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── CourseDetails bridge ─────────────────────────────────────────────────────

/**
 * Convert a GolfApiCourseDetail to the app's CourseDetails shape so it can
 * flow through the existing scorecard / course-selection UI unchanged.
 */
function toAppCourseDetails(detail: GolfApiCourseDetail): CourseDetails {
  const teeBoxes: TeeBox[] = [];

  // Collect all unique tee names across holes
  const teeNames = new Map<string, { color: string; rating?: number; slope?: number }>();
  for (const hole of detail.holesData) {
    for (const t of hole.tees) {
      if (!teeNames.has(t.name)) {
        teeNames.set(t.name, { color: t.color, rating: t.rating, slope: t.slope });
      }
    }
  }

  for (const [teeName, teeMeta] of teeNames) {
    const holes: HoleDetail[] = detail.holesData.map((h, idx) => {
      const tee = h.tees.find((t) => t.name === teeName) ?? h.tees[0];
      return {
        hole: h.number || idx + 1,
        par: h.par || 4,
        yardage: tee?.yards ?? 0,
        handicap: h.handicap ?? idx + 1,
      };
    });

    const totalYardage = holes.reduce((s, h) => s + h.yardage, 0);
    const par = holes.reduce((s, h) => s + h.par, 0);

    teeBoxes.push({
      name: teeName,
      color: teeMeta.color,
      rating: teeMeta.rating ?? 72.0,
      slope: teeMeta.slope ?? 113,
      yardage: totalYardage,
      holes,
    });
  }

  // Sort tees longest first (most common convention)
  teeBoxes.sort((a, b) => b.yardage - a.yardage);

  const primaryTee = teeBoxes[0];
  const totalPar = primaryTee?.holes.reduce((s, h) => s + h.par, 0) ?? 72;

  return {
    id: `golfapiio_${detail.id}`,
    name: detail.name,
    city: detail.city,
    state: '',
    country: detail.country,
    holes: detail.holes,
    par: totalPar,
    rating: primaryTee?.rating,
    slope: primaryTee?.slope,
    latitude: detail.latitude,
    longitude: detail.longitude,
    teeBoxes: teeBoxes.length > 0 ? teeBoxes : generateDefaultTeeBoxes(totalPar, detail.holes),
    source: 'GOLFAPI_IO',
    version: 1,
    lastVerifiedAt: Date.now(),
  };
}

function generateDefaultTeeBoxes(par: number, holeCount = 18): TeeBox[] {
  const holes: HoleDetail[] = Array.from({ length: holeCount }, (_, i) => ({
    hole: i + 1,
    par: i % 3 === 0 ? 3 : i % 5 === 0 ? 5 : 4,
    yardage: 0,
    handicap: i + 1,
  }));
  return [{ name: 'White', color: '#FFFFFF', rating: 72.0, slope: 113, yardage: 0, holes }];
}

/**
 * Fetch a course from golfapi.io, map it to CourseDetails, cache locally
 * (AsyncStorage) and in Firestore, then return it.
 *
 * Used by the course-selection / scorecard flow when an OSM course is tapped.
 */
export async function fetchCourseAsDetails(courseId: string): Promise<CourseDetails | null> {
  const detail = await getCourseDetail(courseId);
  if (!detail) return null;

  const appDetails = toAppCourseDetails(detail);

  // Persist to local AsyncStorage cache (same key format as golfCourseApiService)
  try {
    const CACHE_KEY = '@GolfSum:CourseCache';
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const cache: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    cache[appDetails.id] = { course: appDetails, cachedAt: Date.now(), source: 'GOLFAPI_IO' };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}

  // Persist to Firestore community catalog (fire-and-forget)
  try {
    const { saveCommunityCourse } = await import('./courseCatalogService');
    await saveCommunityCourse(appDetails, { source: 'GOLFAPI_IO' });
  } catch (err: any) {
    logger.debug('ℹ️ golfapi.io: community catalog save skipped:', err?.message);
  }

  return appDetails;
}
