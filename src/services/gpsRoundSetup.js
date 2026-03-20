import { Platform } from 'react-native';
import { getCourse, saveCourse, getCourseFromFirestore, saveCourseToFirestore } from './courseCache';
import { fetchCourseHolesFromBackend } from './golfApi';
import { getCourseDetail } from './golfApiIoService';
import { buildRoutingOptionsFromHoles } from '../utils/courseRouting';

function normalizeTeeName(name) {
  return String(name || '').trim().toLowerCase();
}

function hasGpsHoleData(course) {
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

function buildSetupPayload(course, cached) {
  return {
    course,
    cached,
    teeOptions: getGpsTeeOptions(course),
    holeCount: Array.isArray(course?.holes) ? course.holes.length : 0,
    routeOptions: buildRoutingOptionsFromHoles(course?.holes),
  };
}

export async function loadGpsRoundSetup(courseId, courseName, latitude, longitude) {
  if (!courseId) {
    throw new Error('Missing course ID');
  }

  // 1. Local device cache
  const local = await getCourse(courseId);
  if (local && hasGpsHoleData(local)) {
    return buildSetupPayload(local, true);
  }

  // 2. Firestore community cache
  const firestored = await getCourseFromFirestore(courseId);
  if (firestored && hasGpsHoleData(firestored)) {
    await saveCourse(courseId, firestored); // backfill local cache
    return buildSetupPayload(firestored, true);
  }

  // 3. Firebase Function → golfapi.io (server-side, works on all platforms including web)
  try {
    const remote = await fetchCourseHolesFromBackend(courseId, courseName, latitude, longitude);
    await saveCourse(courseId, remote);
    saveCourseToFirestore(courseId, remote).catch(() => {}); // fire-and-forget
    return buildSetupPayload(remote, false);
  } catch (_) {
    // fall through to golfapi.io direct (native only — blocked by CORS on web)
  }

  // 4. golfapi.io direct (native fallback only — CORS blocked on web)
  if (Platform.OS !== 'web') {
    const apiId = courseId.startsWith('golfapiio_') ? courseId.slice('golfapiio_'.length) : courseId;
    try {
      const detail = await getCourseDetail(apiId);
      if (detail) {
        const course = { ...detail, holes: detail.holesData };
        await saveCourse(courseId, course);
        saveCourseToFirestore(courseId, course).catch(() => {});
        return buildSetupPayload(course, false);
      }
    } catch (_) {
      // fall through to mock
    }
  }

  // Course not found in any source — return a shell with standard tee options
  // so the GPS round can still start. Hole GPS data (distances to green) won't
  // be available, but the map and scoring will work normally.
  return {
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
