import { getCourse, saveCourse } from './courseCache';
import { fetchCourseHolesFromBackend } from './golfApi';
import { getMockGpsCourse } from './gpsMockCourses';

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

  const local = await getCourse(courseId);
  if (local) {
    return {
      course: local,
      cached: true,
      teeOptions: getGpsTeeOptions(local),
      holeCount: Array.isArray(local?.holes) ? local.holes.length : 0,
    };
  }

  try {
    const remote = await fetchCourseHolesFromBackend(courseId);
    await saveCourse(courseId, remote);
    return {
      course: remote,
      cached: false,
      teeOptions: getGpsTeeOptions(remote),
      holeCount: Array.isArray(remote?.holes) ? remote.holes.length : 0,
    };
  } catch (error) {
    const mockCourse = getMockGpsCourse(courseId);
    if (!mockCourse) throw error;
    await saveCourse(courseId, mockCourse);
    return {
      course: mockCourse,
      cached: false,
      teeOptions: getGpsTeeOptions(mockCourse),
      holeCount: Array.isArray(mockCourse?.holes) ? mockCourse.holes.length : 0,
    };
  }
}
