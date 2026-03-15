import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseEnabled } from './firebase';

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

export async function getCourseFromFirestore(courseId) {
  if (!courseId || !db || !isFirebaseEnabled) return null;
  try {
    const snap = await getDoc(doc(db, 'courses', courseId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data?.gpsData ?? data ?? null;
  } catch {
    return null;
  }
}

export async function saveCourseToFirestore(courseId, data) {
  if (!courseId || !data || !db || !isFirebaseEnabled) return;
  try {
    await setDoc(
      doc(db, 'courses', courseId),
      { gpsData: data, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    // Non-critical — swallow silently
  }
}

// ─── Course Mapping (OSM name → golfapi.io courseID) ────────────────────────

/**
 * Normalize a course name into a stable document ID for Firestore lookups.
 * e.g. "North Haven Golf Club" → "northhavengolfclub"
 */
function normalizeNameToDocId(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Look up a cached OSM → golfapi.io course mapping in Firestore.
 * Returns { golfApiIoCourseId, golfApiIoClubName, ... } or null.
 */
export async function getCourseMappingFromFirestore(osmName) {
  if (!osmName || !db || !isFirebaseEnabled) return null;
  const docId = normalizeNameToDocId(osmName);
  if (!docId) return null;
  try {
    const snap = await getDoc(doc(db, 'courseMappings', docId));
    if (!snap.exists()) return null;
    return snap.data();
  } catch {
    return null;
  }
}

/**
 * Save an OSM → golfapi.io course mapping to Firestore so future lookups
 * skip the golfapi.io search API entirely.
 */
export async function saveCourseMappingToFirestore(osmName, mapping) {
  if (!osmName || !mapping || !db || !isFirebaseEnabled) return;
  const docId = normalizeNameToDocId(osmName);
  if (!docId) return;
  try {
    await setDoc(
      doc(db, 'courseMappings', docId),
      { ...mapping, resolvedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    // Non-critical — swallow silently
  }
}

