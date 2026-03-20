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

const BASE_URL = 'https://golfapi.io/api/v2.3';
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
  state?: string;
  country: string;
  latitude: number;
  longitude: number;
  holes: number;
  clubName?: string;
  distance?: number;
}

export interface GolfApiHole {
  hole: number;
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
const POI_NAMES: Record<number, string> = {
  1: 'Green',
  2: 'Green Bunker',
  3: 'Fairway Bunker',
  4: 'Water',
  5: 'Trees',
  6: '100 Marker',
  7: '150 Marker',
  8: '200 Marker',
  9: 'Dogleg',
  10: 'Road',
  11: 'Tee Front',
  12: 'Tee Back',
};

const LOCATION_CODES: Record<number, string> = {
  1: 'F',
  2: 'C',
  3: 'B',
};

const FAIRWAY_SIDE_CODES: Record<number, string> = {
  1: 'L',
  2: 'C',
  3: 'R',
};

function normaliseCourse(raw: any): GolfApiCourse {
  return {
    id: String(raw.courseID ?? raw.CourseID ?? raw.courseId ?? raw.id ?? ''),
    name: raw.courseName ?? raw.CourseName ?? raw.clubName ?? raw.ClubName ?? raw.name ?? '',
    city: raw.city ?? raw.City ?? '',
    state: raw.state ?? raw.State ?? '',
    country: raw.country ?? raw.Country ?? '',
    latitude: parseFloat(raw.latitude ?? raw.Latitude ?? '0'),
    longitude: parseFloat(raw.longitude ?? raw.Longitude ?? '0'),
    holes: Number(raw.numHoles ?? raw.NumberOfHoles ?? raw.holes ?? 18),
    clubName: raw.clubName ?? raw.ClubName ?? raw.name ?? '',
    distance: raw.distance != null ? Number(raw.distance) : undefined,
  };
}

function normalisePois(rawCoordinates: any[]): Array<any> {
  return rawCoordinates
    .map((poi: any) => ({
      POI: POI_NAMES[Number(poi?.poi)] || String(poi?.poi || ''),
      Location: LOCATION_CODES[Number(poi?.location)] || 'C',
      SideOfFairway: FAIRWAY_SIDE_CODES[Number(poi?.sideFW)] || 'C',
      Latitude: Number(poi?.latitude),
      Longitude: Number(poi?.longitude),
    }))
    .filter((poi) => Number.isFinite(poi.Latitude) && Number.isFinite(poi.Longitude));
}

function normaliseDetail(courseRaw: any, coordinatesRaw: any, base: GolfApiCourse): GolfApiCourseDetail {
  const holeCount = Math.max(
    Number(courseRaw?.numHoles ?? 0),
    Array.isArray(courseRaw?.parsMen) ? courseRaw.parsMen.length : 0,
    Array.isArray(courseRaw?.parsWomen) ? courseRaw.parsWomen.length : 0,
    18
  );
  const pars = Array.isArray(courseRaw?.parsMen) && courseRaw.parsMen.length ? courseRaw.parsMen : courseRaw?.parsWomen;
  const handicaps = Array.isArray(courseRaw?.indexesMen) && courseRaw.indexesMen.length
    ? courseRaw.indexesMen
    : courseRaw?.indexesWomen;
  const teesRaw = Array.isArray(courseRaw?.tees) ? courseRaw.tees : [];
  const coordinates = Array.isArray(coordinatesRaw?.coordinates) ? coordinatesRaw.coordinates : [];

  const holesData: GolfApiHole[] = Array.from({ length: holeCount }, (_, index) => {
    const holeNumber = index + 1;
    return {
      hole: holeNumber,
      number: holeNumber,
      par: Number(pars?.[index] ?? 4),
      handicap: handicaps?.[index] != null ? Number(handicaps[index]) : undefined,
      tees: teesRaw.map((tee: any) => ({
        name: tee?.teeName ?? tee?.name ?? '',
        color: tee?.teeColor ?? tee?.color ?? '#10B981',
        yards: Number(tee?.[`length${holeNumber}`] ?? 0),
        rating: tee?.courseRatingMen != null ? Number(tee.courseRatingMen) : undefined,
        slope: tee?.slopeMen != null ? Number(tee.slopeMen) : undefined,
      })),
      pois: normalisePois(coordinates.filter((poi: any) => Number(poi?.hole) === holeNumber)),
    };
  });

  return {
    ...base,
    rating: courseRaw?.tees?.[0]?.courseRatingMen != null ? Number(courseRaw.tees[0].courseRatingMen) : undefined,
    slope: courseRaw?.tees?.[0]?.slopeMen != null ? Number(courseRaw.tees[0].slopeMen) : undefined,
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
    const params = new URLSearchParams({ name: name.trim() });
    if (latitude != null && longitude != null) {
      params.set('lat', String(latitude));
      params.set('lng', String(longitude));
      params.set('measureUnit', 'mi');
    }

    const res = await fetchWithTimeout(`${BASE_URL}/courses?${params.toString()}`, {
      headers: authHeader(),
    });

    if (!res.ok) {
      logger.warn(`⚠️ golfapi.io search failed: ${res.status}`);
      return [];
    }

    const json = await res.json();
    const raw: any[] = Array.isArray(json?.courses)
      ? json.courses
      : Array.isArray(json)
      ? json
      : [];

    const results = raw
      .filter((course) => Number(course?.hasGPS ?? 1) !== 0)
      .map(normaliseCourse)
      .filter((c) => c.id && c.name);
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

export async function searchNearbyClubs(
  latitude: number,
  longitude: number,
  city?: string,
  state?: string,
  country: string = 'USA'
): Promise<GolfApiCourse[]> {
  if (!canCallDirectly()) return [];
  if (!TOKEN) {
    logger.warn('⚠️ golfapi.io: no token set — set EXPO_PUBLIC_GOLFAPI_IO_TOKEN');
    return [];
  }

  try {
    const params = new URLSearchParams({
      lat: String(latitude),
      lng: String(longitude),
      measureUnit: 'mi',
    });
    if (city) params.set('city', city);
    if (state) params.set('state', state);
    if (country) params.set('country', country);

    const res = await fetchWithTimeout(`${BASE_URL}/clubs?${params.toString()}`, {
      headers: authHeader(),
    });

    if (!res.ok) {
      logger.warn(`⚠️ golfapi.io nearby clubs failed: ${res.status}`);
      return [];
    }

    const json = await res.json();
    const clubs: any[] = Array.isArray(json?.clubs)
      ? json.clubs
      : Array.isArray(json?.result)
      ? json.result
      : [];

    const results = clubs.flatMap((club: any) => {
      const clubCourses = Array.isArray(club?.courses) ? club.courses : [];
      return clubCourses
        .filter((course: any) => Number(course?.hasGPS ?? 1) !== 0)
        .map((course: any) =>
          normaliseCourse({
            ...course,
            clubName: club?.clubName ?? '',
            city: club?.city ?? '',
            state: club?.state ?? '',
            country: club?.country ?? '',
            latitude,
            longitude,
            distance: club?.distance,
            name: course?.courseName ?? club?.clubName ?? '',
          })
        );
    });

    return results.filter((course, index, array) => array.findIndex((item) => item.id === course.id) === index);
  } catch (err: any) {
    logger.warn('⚠️ golfapi.io nearby clubs error:', err?.message);
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
    const [courseRes, coordinatesRes] = await Promise.all([
      fetchWithTimeout(`${BASE_URL}/courses/${courseId}`, {
        headers: authHeader(),
      }),
      fetchWithTimeout(`${BASE_URL}/coordinates/${courseId}`, {
        headers: authHeader(),
      }),
    ]);

    if (!courseRes.ok || !coordinatesRes.ok) {
      logger.warn(`⚠️ golfapi.io detail failed: course=${courseRes.status} coordinates=${coordinatesRes.status} for ${courseId}`);
      return null;
    }

    const [courseRaw, coordinatesRaw] = await Promise.all([courseRes.json(), coordinatesRes.json()]);
    if (!courseRaw || !coordinatesRaw) return null;

    const base = normaliseCourse(courseRaw);
    const detail = normaliseDetail(courseRaw, coordinatesRaw, base);

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
  // Municipal prefixes common in OSM names: "City of X", "Town of X", etc.
  const municipalPrefixes = ['city of ', 'town of ', 'village of ', 'county of ', 'township of '];

  const clean = name.trim();
  const lower = clean.toLowerCase();
  const variants: string[] = [clean];

  // Strip trailing golf suffix (e.g. "Haven Golf Club" → "Haven")
  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) {
      const stripped = clean.slice(0, clean.length - suffix.length).trim();
      if (stripped.length > 2) variants.push(stripped);
      break;
    }
  }

  // Strip municipal prefix (e.g. "City of Green Valley" → "Green Valley")
  for (const prefix of municipalPrefixes) {
    if (lower.startsWith(prefix)) {
      const stripped = clean.slice(prefix.length).trim();
      if (stripped.length > 2) variants.push(stripped);
      break;
    }
  }

  const words = clean.split(/\s+/);
  if (words.length > 3) {
    variants.push(words.slice(0, 3).join(' ')); // first 3 words
    variants.push(words.slice(-2).join(' '));    // last 2 words (often the real name)
  } else if (words.length === 3) {
    variants.push(words.slice(0, 2).join(' ')); // first 2 words
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
