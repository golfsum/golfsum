/**
 * golfapi.io Service
 * Provides course search and detailed GPS/course data from golfapi.io.
 * Set EXPO_PUBLIC_GOLFAPI_IO_TOKEN in your .env to enable.
 *
 * API v2.3 endpoints used:
 *   GET /clubs?name=...&city=...       → search clubs/courses
 *   GET /coordinates/{courseID}         → GPS hole coordinates
 *
 * Coordinate POI codes (reverse-engineered):
 *   poi=1  : Tee box       (location 1=front, 2=middle, 3=back; sideFW=2 center)
 *   poi=2-5: Fairway points (sideFW 1=left, 2=center, 3=right)
 *   poi=9  : Hazard / bunker
 *   poi=11 : Front of green (location=2, center)
 *   poi=12 : Back of green  (location=2, center)
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

/** Lightweight course reference returned by club search. */
export interface GolfApiCourse {
  id: string;          // courseID from golfapi.io
  clubId: string;      // clubID
  name: string;        // courseName (or clubName if only 1 course)
  clubName: string;    // clubName
  city: string;
  state: string;
  country: string;
  address: string;
  latitude: number;
  longitude: number;
  holes: number;
  hasGPS: boolean;
}

/** Raw coordinate point from /coordinates/{courseID}. */
interface RawCoordinate {
  poi: number;
  location: number;
  sideFW: number;
  hole: number;
  latitude: number;
  longitude: number;
}

/** Transformed POI in the format GpsRoundScreen expects. */
export interface AppPoi {
  POI: string;
  Location: string;         // 'F' | 'C' | 'B' or empty
  SideOfFairway?: string;   // 'L' | 'C' | 'R'
  Latitude: number;
  Longitude: number;
}

/** Hole with GPS POIs. */
export interface GpsHole {
  hole: number;
  par: number;
  pois: AppPoi[];
  fairwayCenterline?: Array<[number, number]>;  // [lng, lat] pairs
  tees: Array<{ name: string; color: string; yards: number }>;
}

/** Full course with GPS data. */
export interface GolfApiCourseDetail {
  id: string;
  clubId: string;
  name: string;
  clubName: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  holes: number;
  holesData: GpsHole[];
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
        clubName: data.clubName,
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

/**
 * Normalise a club+course entry from the /clubs search response.
 * The API returns: { clubID, clubName, city, state, country, address, courses: [...] }
 * Each course has: { courseID, courseName, numHoles, hasGPS }
 */
function normaliseClubSearchResults(clubs: any[]): GolfApiCourse[] {
  const results: GolfApiCourse[] = [];

  for (const club of clubs) {
    const clubId = String(club.clubID ?? club.clubId ?? '');
    const clubName = String(club.clubName ?? club.ClubName ?? '').trim();
    const city = String(club.city ?? club.City ?? '').trim();
    const state = String(club.state ?? club.State ?? '').trim();
    const country = String(club.country ?? club.Country ?? '').trim();
    const address = String(club.address ?? club.Address ?? '').trim();

    const courses = Array.isArray(club.courses) ? club.courses : [];

    if (courses.length === 0) {
      // Club with no courses listed — create a single entry using club info
      results.push({
        id: clubId,
        clubId,
        name: clubName,
        clubName,
        city,
        state,
        country,
        address,
        latitude: 0,
        longitude: 0,
        holes: 18,
        hasGPS: false,
      });
    } else {
      for (const course of courses) {
        results.push({
          id: String(course.courseID ?? course.courseId ?? ''),
          clubId,
          name: String(course.courseName ?? clubName).trim(),
          clubName,
          city,
          state,
          country,
          address,
          latitude: 0,
          longitude: 0,
          holes: Number(course.numHoles ?? 18),
          hasGPS: Number(course.hasGPS ?? 0) === 1,
        });
      }
    }
  }

  return results.filter((c) => c.id);
}

// ─── Coordinate → POI transformation ────────────────────────────────────────

const POI_NAME_MAP: Record<number, string> = {
  1: 'Tee',
  9: 'Fairway Bunker',
  11: 'Green',   // front of green
  12: 'Green',   // back of green
};

const LOCATION_MAP: Record<number, string> = {
  1: 'F',  // Front
  2: 'C',  // Center
  3: 'B',  // Back
};

const SIDE_MAP: Record<number, string> = {
  1: 'L',  // Left
  2: 'C',  // Center
  3: 'R',  // Right
};

function haversineYards(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const metres = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return metres * 1.09361; // metres → yards
}

function estimatePar(teeToGreenYards: number): number {
  if (teeToGreenYards <= 0) return 4;
  if (teeToGreenYards < 250) return 3;
  if (teeToGreenYards <= 470) return 4;
  return 5;
}

/**
 * Transform raw golfapi.io coordinates into per-hole GPS data
 * in the format GpsRoundScreen expects.
 */
function transformCoordinates(coords: RawCoordinate[]): GpsHole[] {
  // Group by hole number
  const byHole = new Map<number, RawCoordinate[]>();
  for (const c of coords) {
    const arr = byHole.get(c.hole) || [];
    arr.push(c);
    byHole.set(c.hole, arr);
  }

  const holes: GpsHole[] = [];

  for (const [holeNum, holeCoords] of byHole) {
    const pois: AppPoi[] = [];

    // ── Tee box (poi=1) ──
    const teeCoords = holeCoords.filter((c) => c.poi === 1);
    const teeBack = teeCoords.find((c) => c.location === 3) || teeCoords[teeCoords.length - 1];
    const teeMid = teeCoords.find((c) => c.location === 2);
    const teeFront = teeCoords.find((c) => c.location === 1) || teeCoords[0];

    if (teeBack) {
      pois.push({ POI: 'Tee Back', Location: 'C', Latitude: teeBack.latitude, Longitude: teeBack.longitude });
    }
    if (teeMid) {
      pois.push({ POI: 'Tee Middle', Location: 'C', Latitude: teeMid.latitude, Longitude: teeMid.longitude });
    }
    if (teeFront) {
      pois.push({ POI: 'Tee Front', Location: 'C', Latitude: teeFront.latitude, Longitude: teeFront.longitude });
    }

    // ── Green (poi=11 = front, poi=12 = back) ──
    const greenFrontCoord = holeCoords.find((c) => c.poi === 11);
    const greenBackCoord = holeCoords.find((c) => c.poi === 12);

    if (greenFrontCoord) {
      pois.push({ POI: 'Green', Location: 'F', Latitude: greenFrontCoord.latitude, Longitude: greenFrontCoord.longitude });
    }
    if (greenBackCoord) {
      pois.push({ POI: 'Green', Location: 'B', Latitude: greenBackCoord.latitude, Longitude: greenBackCoord.longitude });
    }
    // Green center = midpoint of front and back
    if (greenFrontCoord && greenBackCoord) {
      pois.push({
        POI: 'Green',
        Location: 'C',
        Latitude: (greenFrontCoord.latitude + greenBackCoord.latitude) / 2,
        Longitude: (greenFrontCoord.longitude + greenBackCoord.longitude) / 2,
      });
    } else if (greenFrontCoord) {
      // Only have front — use it as center too
      pois.push({ POI: 'Green', Location: 'C', Latitude: greenFrontCoord.latitude, Longitude: greenFrontCoord.longitude });
    } else if (greenBackCoord) {
      pois.push({ POI: 'Green', Location: 'C', Latitude: greenBackCoord.latitude, Longitude: greenBackCoord.longitude });
    }

    // ── Hazards (poi=9) ──
    const hazardCoords = holeCoords.filter((c) => c.poi === 9);
    for (const h of hazardCoords) {
      const side = SIDE_MAP[h.sideFW] || 'C';
      // Determine if it's near the green or fairway based on proximity
      const greenCenter = pois.find((p) => p.POI === 'Green' && p.Location === 'C');
      let hazardType = 'Fairway Bunker';
      if (greenCenter) {
        const distToGreen = haversineYards(h.latitude, h.longitude, greenCenter.Latitude, greenCenter.Longitude);
        if (distToGreen < 40) hazardType = 'Green Bunker';
      }
      pois.push({
        POI: hazardType,
        Location: LOCATION_MAP[h.location] || 'C',
        SideOfFairway: side,
        Latitude: h.latitude,
        Longitude: h.longitude,
      });
    }

    // ── Fairway centerline (poi=2,3,4,5 with sideFW=2) ──
    const fairwayCenterCoords = holeCoords
      .filter((c) => [2, 3, 4, 5].includes(c.poi) && c.sideFW === 2)
      .sort((a, b) => a.poi - b.poi || a.location - b.location);

    // Build centerline: tee → fairway center points → green
    const centerline: Array<[number, number]> = [];
    if (teeBack) centerline.push([teeBack.longitude, teeBack.latitude]);
    for (const fc of fairwayCenterCoords) {
      centerline.push([fc.longitude, fc.latitude]);
    }
    const greenCenterPoi = pois.find((p) => p.POI === 'Green' && p.Location === 'C');
    if (greenCenterPoi) centerline.push([greenCenterPoi.Longitude, greenCenterPoi.Latitude]);

    // If no dedicated fairway center points, add fairway L/R midpoints
    if (fairwayCenterCoords.length === 0) {
      const fwPoints = holeCoords.filter((c) => [2, 3, 4, 5].includes(c.poi));
      // Group by poi number, compute midpoints of L/R pairs
      const poiGroups = new Map<number, RawCoordinate[]>();
      for (const fp of fwPoints) {
        const arr = poiGroups.get(fp.poi) || [];
        arr.push(fp);
        poiGroups.set(fp.poi, arr);
      }
      for (const [, group] of [...poiGroups.entries()].sort((a, b) => a[0] - b[0])) {
        const left = group.filter((c) => c.sideFW === 1);
        const right = group.filter((c) => c.sideFW === 3);
        if (left.length > 0 && right.length > 0) {
          const midLat = (left[0].latitude + right[0].latitude) / 2;
          const midLng = (left[0].longitude + right[0].longitude) / 2;
          centerline.splice(centerline.length - 1, 0, [midLng, midLat]);
        }
      }
    }

    // ── Dogleg detection from fairway points ──
    // If poi=4 or poi=5 exists with sideFW != 2, it might indicate a dogleg
    const doglegCoords = holeCoords.filter(
      (c) => [4, 5].includes(c.poi) && c.sideFW !== 2
    );
    if (doglegCoords.length > 0) {
      // Use the first one to determine dogleg direction
      const first = doglegCoords[0];
      const side = first.sideFW === 1 ? 'L' : 'R';
      pois.push({
        POI: 'Dogleg',
        Location: '',
        SideOfFairway: side,
        Latitude: first.latitude,
        Longitude: first.longitude,
      });
    }

    // ── Calculate tee-to-green yardage & estimate par ──
    const teeRef = teeBack || teeMid || teeFront;
    let teeToGreenYards = 0;
    if (teeRef && greenCenterPoi) {
      teeToGreenYards = Math.round(
        haversineYards(teeRef.latitude, teeRef.longitude, greenCenterPoi.Latitude, greenCenterPoi.Longitude)
      );
    }
    const par = estimatePar(teeToGreenYards);

    // ── Build tee entries (calculated yardages from tee positions to green center) ──
    const tees: Array<{ name: string; color: string; yards: number }> = [];
    if (greenCenterPoi) {
      if (teeBack) {
        const yards = Math.round(haversineYards(teeBack.latitude, teeBack.longitude, greenCenterPoi.Latitude, greenCenterPoi.Longitude));
        tees.push({ name: 'Back', color: '#1F2937', yards });
      }
      if (teeMid) {
        const yards = Math.round(haversineYards(teeMid.latitude, teeMid.longitude, greenCenterPoi.Latitude, greenCenterPoi.Longitude));
        tees.push({ name: 'Middle', color: '#F9FAFB', yards });
      }
      if (teeFront) {
        const yards = Math.round(haversineYards(teeFront.latitude, teeFront.longitude, greenCenterPoi.Latitude, greenCenterPoi.Longitude));
        tees.push({ name: 'Front', color: '#EF4444', yards });
      }
    }

    holes.push({
      hole: holeNum,
      par,
      pois,
      fairwayCenterline: centerline.length >= 2 ? centerline : undefined,
      tees,
    });
  }

  // Sort by hole number
  holes.sort((a, b) => a.hole - b.hole);
  return holes;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Search courses via the /clubs endpoint.
 * Supports searching by club name and optionally city.
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
    // Try searching by club name first
    const params = new URLSearchParams({ name: name.trim() });
    const res = await fetchWithTimeout(`${BASE_URL}/clubs?${params.toString()}`, {
      headers: authHeader(),
    });

    if (!res.ok) {
      logger.warn(`⚠️ golfapi.io search failed: ${res.status}`);
      return [];
    }

    const json = await res.json();
    const raw: any[] = Array.isArray(json) ? json : (json?.clubs ?? json?.result ?? []);
    const results = normaliseClubSearchResults(raw).filter((c) => c.hasGPS);

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
 * Search courses by city name via the /clubs endpoint.
 */
export async function searchCoursesByCity(city: string): Promise<GolfApiCourse[]> {
  if (!city.trim()) return [];
  if (!canCallDirectly()) return [];

  if (!TOKEN) return [];

  try {
    const params = new URLSearchParams({ city: city.trim() });
    const res = await fetchWithTimeout(`${BASE_URL}/clubs?${params.toString()}`, {
      headers: authHeader(),
    });

    if (!res.ok) return [];

    const json = await res.json();
    const raw: any[] = Array.isArray(json) ? json : (json?.clubs ?? json?.result ?? []);
    return normaliseClubSearchResults(raw).filter((c) => c.hasGPS);
  } catch {
    return [];
  }
}

/**
 * Fetch GPS coordinates for a course and transform into per-hole data.
 * Checks Firestore cache first, then fetches from /coordinates/{courseID}.
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

  // 2. Fetch coordinates from API
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/coordinates/${courseId}`, {
      headers: authHeader(),
    });

    if (!res.ok) {
      logger.warn(`⚠️ golfapi.io coordinates failed: ${res.status} for ${courseId}`);
      return null;
    }

    const json = await res.json();
    const rawCoords: RawCoordinate[] = Array.isArray(json?.coordinates) ? json.coordinates : [];

    if (rawCoords.length === 0) {
      logger.warn(`⚠️ golfapi.io: no coordinates returned for ${courseId}`);
      return null;
    }

    const holesData = transformCoordinates(rawCoords);

    // Compute course center from first tee
    const firstTee = holesData[0]?.pois.find((p) => p.POI === 'Tee Back' || p.POI === 'Tee Middle');

    const detail: GolfApiCourseDetail = {
      id: courseId,
      clubId: '',
      name: '', // Will be filled by caller or from search
      clubName: '',
      city: '',
      state: '',
      country: '',
      latitude: firstTee?.Latitude ?? 0,
      longitude: firstTee?.Longitude ?? 0,
      holes: holesData.length,
      holesData,
    };

    // 3. Save to Firestore (fire-and-forget)
    saveToFirestore(courseId, detail).catch(() => {});

    logger.debug(`✅ golfapi.io: fetched ${rawCoords.length} coordinates for ${courseId} (${holesData.length} holes)`);
    return detail;
  } catch (err: any) {
    logger.warn('⚠️ golfapi.io coordinates error:', err?.message);
    return null;
  }
}

/**
 * Resolve an OSM course to a golfapi.io course by name match.
 * Tries club name search, then city-based search.
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
      // Prefer exact/fuzzy name match, then closest by distance
      const nameMatched = findBestNameMatch(osmName, results);
      if (nameMatched) {
        logger.debug(`✅ golfapi.io: resolved "${osmName}" → "${nameMatched.name}" (${nameMatched.id})`);
        return nameMatched;
      }
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
    variants.push(words.slice(0, 3).join(' '));
    variants.push(words.slice(-2).join(' '));
  } else if (words.length === 3) {
    variants.push(words.slice(0, 2).join(' '));
  }

  return [...new Set(variants)];
}

function findBestNameMatch(query: string, results: GolfApiCourse[]): GolfApiCourse | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Try exact match on course name or club name
  for (const r of results) {
    const cName = r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clubName = r.clubName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cName === q || clubName === q) return r;
  }

  // Try substring/contains match
  for (const r of results) {
    const cName = r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clubName = r.clubName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cName.includes(q) || q.includes(cName) || clubName.includes(q) || q.includes(clubName)) return r;
  }

  // Return first result (API returns most relevant first)
  return results[0];
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
 * Convert a GolfApiCourseDetail to the app's CourseDetails shape.
 */
function toAppCourseDetails(detail: GolfApiCourseDetail): CourseDetails {
  const teeBoxes: TeeBox[] = [];

  // Collect unique tee names from all holes
  const teeNames = new Map<string, { color: string }>();
  for (const hole of detail.holesData) {
    for (const t of hole.tees) {
      if (!teeNames.has(t.name)) {
        teeNames.set(t.name, { color: t.color });
      }
    }
  }

  for (const [teeName, teeMeta] of teeNames) {
    const holes: HoleDetail[] = detail.holesData.map((h, idx) => {
      const tee = h.tees.find((t) => t.name === teeName) ?? h.tees[0];
      return {
        hole: h.hole || idx + 1,
        par: h.par || 4,
        yardage: tee?.yards ?? 0,
        handicap: idx + 1,
      };
    });

    const totalYardage = holes.reduce((s, h) => s + h.yardage, 0);

    teeBoxes.push({
      name: teeName,
      color: teeMeta.color,
      rating: 72.0,
      slope: 113,
      yardage: totalYardage,
      holes,
    });
  }

  // Sort tees longest first
  teeBoxes.sort((a, b) => b.yardage - a.yardage);

  const primaryTee = teeBoxes[0];
  const totalPar = primaryTee?.holes.reduce((s, h) => s + h.par, 0) ?? 72;

  return {
    id: `golfapiio_${detail.id}`,
    name: detail.name || detail.clubName,
    city: detail.city,
    state: detail.state || '',
    country: detail.country,
    holes: detail.holes,
    par: totalPar,
    rating: 72.0,
    slope: 113,
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
 */
export async function fetchCourseAsDetails(courseId: string): Promise<CourseDetails | null> {
  const detail = await getCourseDetail(courseId);
  if (!detail) return null;

  const appDetails = toAppCourseDetails(detail);

  // Persist to local AsyncStorage cache
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
