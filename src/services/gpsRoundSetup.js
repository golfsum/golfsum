import { Platform } from 'react-native';
import { getCourse, saveCourse, getCourseFromFirestore, saveCourseToFirestore } from './courseCache';
import { fetchCourseHolesFromBackend } from './golfApi';
import { getMockGpsCourse } from './gpsMockCourses';
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

  // 3. Firebase Function → golfapi.io (server-side, works on all platforms including web)
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
        return {
          course,
          cached: false,
          teeOptions: getGpsTeeOptions(course),
          holeCount: course.holes.length,
        };
      }
    } catch (_) {
      // fall through to mock
    }
  }

  const mockCourse = getMockGpsCourse(courseId);
  if (!mockCourse) {
    if (Platform.OS === 'web') {
      // On web, CORS blocks all API calls — return a shell so the GPS screen
      // can still open. Tee/hole data will load on device.
      return { course: null, cached: false, teeOptions: [], holeCount: 18 };
    }
    throw new Error('Course not found. Make sure EXPO_PUBLIC_GOLFAPI_IO_TOKEN is set.');
  }
  await saveCourse(courseId, mockCourse);
  return {
    course: mockCourse,
    cached: false,
    teeOptions: getGpsTeeOptions(mockCourse),
    holeCount: Array.isArray(mockCourse?.holes) ? mockCourse.holes.length : 0,
  };
}
