import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseEnabled } from './firebase';
import { getCurrentUser } from './firebaseAuthService';
import { fetchCourseHolesFromBackend } from './golfApi';

const keyForCourse = (courseId) => `golfsum_course_${courseId}`;

// ---------------------------------------------------------------------------
// Local cache (AsyncStorage)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Firestore cache (courses/{courseId}.gpsData)
// Stores the full GPS hole payload so it can be shared across devices
// without hitting the backend API every time.
// ---------------------------------------------------------------------------

/**
 * Read GPS course data from Firestore.
 * Returns null silently on any error (offline, not authenticated, etc.).
 */
export async function getCourseFromFirestore(courseId) {
  if (!courseId || !db || !isFirebaseEnabled) return null;
  try {
    const snap = await getDoc(doc(db, 'courses', courseId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data?.gpsData ?? null;
  } catch {
    return null;
  }
}

/**
 * Write GPS course data to Firestore. Fire-and-forget — never throws.
 * Merges into the existing course document so scorecard data is preserved.
 */
export async function saveCourseToFirestore(courseId, data) {
  if (!courseId || !data || !db || !isFirebaseEnabled) return;
  if (!getCurrentUser()) return; // only write when authenticated
  try {
    await setDoc(
      doc(db, 'courses', courseId),
      { gpsData: data, gpsUpdatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    // non-critical — local cache is always the source of truth
  }
}

// ---------------------------------------------------------------------------
// Pre-download: fetch, save locally + Firestore in one call
// ---------------------------------------------------------------------------

export async function downloadCourse(courseId, courseName, latitude, longitude) {
  const courseData = await fetchCourseHolesFromBackend(courseId, courseName, latitude, longitude);
  if (!courseData) throw new Error('No course data returned');

  // Save with download timestamp
  const withMeta = { ...courseData, cachedAt: new Date().toISOString(), source: 'pre_download' };
  await saveCourse(courseId, withMeta);
  await saveCourseToFirestore(courseId, withMeta);
  return withMeta;
}

export async function getCourseDownloadStatus(courseId) {
  const cached = await getCourse(courseId);
  if (!cached) return { downloaded: false, cachedAt: null, holeCount: 0 };
  return {
    downloaded: true,
    cachedAt: cached.cachedAt || null,
    holeCount: cached.holes?.length ?? 0,
  };
}
