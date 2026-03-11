import AsyncStorage from '@react-native-async-storage/async-storage';

const keyForCourse = (courseId) => `golfsum_course_${courseId}`;

export async function getCourse(courseId) {
  if (!courseId) return null;
  const raw = await AsyncStorage.getItem(keyForCourse(courseId));
  return raw ? JSON.parse(raw) : null;
}

export async function saveCourse(courseId, data) {
  if (!courseId || !data) return;
  await AsyncStorage.setItem(keyForCourse(courseId), JSON.stringify(data));
}

export async function isCourseCached(courseId) {
  return !!(await getCourse(courseId));
}

export async function removeCourse(courseId) {
  if (!courseId) return;
  await AsyncStorage.removeItem(keyForCourse(courseId));
}

