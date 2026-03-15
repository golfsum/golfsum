import { Platform } from 'react-native';
import { getCourse, saveCourse, getCourseFromFirestore, saveCourseToFirestore } from './courseCache';
import { fetchCourseHolesFromBackend } from './golfApi';
import { getCourseDetail } from './golfApiIoService';

function normalizeTeeName(name) {
  return String(name || '').trim().toLowerCase();
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

export async function loadGpsRoundSetup(courseId) {
  if (!courseId) {
    throw new Error('Missing course ID');
  }

  // 1. Local device cache
  const local = await getCourse(courseId);
  if (local) {
    return {
      course: local,
      cached: true,
      teeOptions: getGpsTeeOptions(local),
      holeCount: Array.isArray(local?.holes) ? local.holes.length : 0,
    };
  }

  // 2. Firestore community cache
  const firestored = await getCourseFromFirestore(courseId);
  if (firestored) {
    await saveCourse(courseId, firestored); // backfill local cache
    return {
      course: firestored,
      cached: true,
      teeOptions: getGpsTeeOptions(firestored),
      holeCount: Array.isArray(firestored?.holes) ? firestored.holes.length : 0,
    };
  }

  // 3. golfapi.io direct (primary source — native only due to CORS)
  //    Try this BEFORE the Firebase Function since it doesn't require Firebase config.
  if (Platform.OS !== 'web') {
    const apiId = courseId.startsWith('golfapiio_') ? courseId.slice('golfapiio_'.length) : courseId;
    try {
      const detail = await getCourseDetail(apiId);
      if (detail && detail.holesData && detail.holesData.length > 0) {
        const course = { ...detail, holes: detail.holesData };
        await saveCourse(courseId, course);
        saveCourseToFirestore(courseId, course).catch(() => {});
        return {
          course,
          cached: false,
          teeOptions: getGpsTeeOptions(course),
          holeCount: course.holes.length,
        };
      }
    } catch (_) {
      // fall through to Firebase Function
    }
  }

  // 4. Firebase Function → server-side fetch (works on all platforms including web)
  try {
    const remote = await fetchCourseHolesFromBackend(courseId);
    await saveCourse(courseId, remote);
    saveCourseToFirestore(courseId, remote).catch(() => {}); // fire-and-forget
    return {
      course: remote,
      cached: false,
      teeOptions: getGpsTeeOptions(remote),
      holeCount: Array.isArray(remote?.holes) ? remote.holes.length : 0,
    };
  } catch (_) {
    // fall through to shell
  }

  // Course not found in any source — return a shell with standard tee options
  // so the GPS round can still start. Hole GPS data (distances to green) won't
  // be available, but the map and scoring will work normally.
  return {
    course: null,
    cached: false,
    teeOptions: [
      { name: 'Back', color: '#1F2937', totalYards: 0 },
      { name: 'Middle', color: '#F9FAFB', totalYards: 0 },
      { name: 'Front', color: '#EF4444', totalYards: 0 },
    ],
    holeCount: 18,
  };
}
