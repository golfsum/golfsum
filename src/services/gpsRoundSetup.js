import { Platform } from 'react-native';
import { getCourse, saveCourse, getCourseFromFirestore, saveCourseToFirestore } from './courseCache';
import { fetchCourseHolesFromBackend } from './golfApi';
import { getCourseDetail } from './golfApiIoService';
import { getCourseDetails } from './golfCourseApiService';
import { buildRoutingOptionsFromHoles } from '../utils/courseRouting';

function normalizeTeeName(name) {
  return String(name || '').trim().toLowerCase();
}

/** True if the course has usable GPS/tee data (local, Firestore, or API). */
export function hasGpsHoleData(course) {
  const holes = Array.isArray(course?.holes) ? course.holes : [];
  return holes.some((hole) => {
    const tees = Array.isArray(hole?.tees) ? hole.tees : [];
    const pois = Array.isArray(hole?.pois) ? hole.pois : [];
    return tees.some((tee) => Number(tee?.yards) > 0) || pois.length > 0;
  });
}

export function getGpsTeeOptions(course) {
  const holes = Array.isArray(course?.holes) ? course.holes : [];
  const teeMap = new Map();

  for (const hole of holes) {
    for (const tee of hole?.tees || []) {
      const key = normalizeTeeName(tee?.name);
      if (!key) continue;
      const existing = teeMap.get(key) || {
        name: tee.name,
        color: tee.color || '#10B981',
        totalYards: 0,
      };
      existing.totalYards += Number(tee?.yards || 0);
      teeMap.set(key, existing);
    }
  }

  return [...teeMap.values()].sort((a, b) => b.totalYards - a.totalYards);
}

/**
 * Try to enrich GPS tee options with the full tee list from the Golf Course API.
 * The GPS data source often only has 2-3 tees, while the course API has all of them.
 */
async function enrichTeeOptions(courseId, gpsTeeOptions) {
  try {
    const details = await getCourseDetails(courseId);
    if (!details?.teeBoxes?.length) return gpsTeeOptions;

    const gpsMap = new Map(
      gpsTeeOptions.map((t) => [normalizeTeeName(t.name), t])
    );

    const merged = details.teeBoxes.map((tb) => {
      const gpsMatch = gpsMap.get(normalizeTeeName(tb.name));
      return {
        name: tb.name,
        color: tb.color || gpsMatch?.color || '#10B981',
        totalYards: gpsMatch?.totalYards || tb.yardage || 0,
      };
    });

    // Add any GPS tees not in the API (unlikely but safe)
    for (const [key, gpsTee] of gpsMap) {
      if (!merged.some((t) => normalizeTeeName(t.name) === key)) {
        merged.push(gpsTee);
      }
    }

    return merged.sort((a, b) => b.totalYards - a.totalYards);
  } catch {
    return gpsTeeOptions;
  }
}

function buildSetupPayload(course, cached) {
  const fromSnapshot =
    Array.isArray(course?.teeOptionsSnapshot) && course.teeOptionsSnapshot.length > 0
      ? course.teeOptionsSnapshot
      : null;
  return {
    course,
    cached,
    teeOptions: fromSnapshot || getGpsTeeOptions(course),
    holeCount: Array.isArray(course?.holes) ? course.holes.length : 0,
    routeOptions: buildRoutingOptionsFromHoles(course?.holes),
  };
}

export async function loadGpsRoundSetup(courseId, courseName, latitude, longitude) {
  if (!courseId) {
    throw new Error('Missing course ID');
  }

  let payload;

  // 1. Local device cache
  const local = await getCourse(courseId);
  if (local && hasGpsHoleData(local)) {
    payload = buildSetupPayload(local, true);
  }

  // 2. Firestore community cache
  if (!payload) {
    const firestored = await getCourseFromFirestore(courseId);
    if (firestored && hasGpsHoleData(firestored)) {
      await saveCourse(courseId, firestored); // backfill local cache
      payload = buildSetupPayload(firestored, true);
    }
  }

  // 3. Firebase Function → golfapi.io (server-side, works on all platforms including web)
  if (!payload) {
    try {
      const remote = await fetchCourseHolesFromBackend(courseId, courseName, latitude, longitude);
      await saveCourse(courseId, remote);
      saveCourseToFirestore(courseId, remote).catch(() => {}); // fire-and-forget
      payload = buildSetupPayload(remote, false);
    } catch (_) {
      // fall through to golfapi.io direct (native only — blocked by CORS on web)
    }
  }

  // 4. golfapi.io direct (native fallback only — CORS blocked on web)
  if (!payload && Platform.OS !== 'web') {
    const apiId = courseId.startsWith('golfapiio_') ? courseId.slice('golfapiio_'.length) : courseId;
    try {
      const detail = await getCourseDetail(apiId);
      if (detail) {
        const course = { ...detail, holes: detail.holesData };
        await saveCourse(courseId, course);
        saveCourseToFirestore(courseId, course).catch(() => {});
        payload = buildSetupPayload(course, false);
      }
    } catch (_) {
      // fall through to fallback
    }
  }

  // Course not found in any source — return a shell with standard tee options
  // so the GPS round can still start. Hole GPS data (distances to green) won't
  // be available, but the map and scoring will work normally.
  if (!payload) {
    payload = {
      course: null,
      cached: false,
      teeOptions: [
        { name: 'Black', color: '#1F2937', totalYards: 0 },
        { name: 'Blue', color: '#3B82F6', totalYards: 0 },
        { name: 'White', color: '#F9FAFB', totalYards: 0 },
        { name: 'Yellow', color: '#F59E0B', totalYards: 0 },
        { name: 'Red', color: '#EF4444', totalYards: 0 },
      ],
      holeCount: 18,
      routeOptions: [],
    };
  }

  // Enrich tee options with full tee list from Golf Course API (has all tees with ratings/slopes)
  payload.teeOptions = await enrichTeeOptions(courseId, payload.teeOptions);

  // Persist full tee list on cached course so offline / next launch shows every tee, not just GPS-derived subset.
  if (payload.course && Array.isArray(payload.teeOptions) && payload.teeOptions.length > 0) {
    try {
      const mergedCourse = { ...payload.course, teeOptionsSnapshot: payload.teeOptions };
      await saveCourse(courseId, mergedCourse);
      payload.course = mergedCourse;
    } catch {
      // non-fatal
    }
  }

  return payload;
}
