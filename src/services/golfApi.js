import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, isFirebaseEnabled } from './firebase';

const FUNCTIONS_REGION = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1';
const CALL_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS = 2;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const normalizeFunctionError = (error) => {
  const code = error?.code ? String(error.code) : '';
  const message = error?.message ? String(error.message) : '';

  if (code.includes('deadline-exceeded') || code.includes('unavailable')) {
    return 'Course download timed out. Please try again.';
  }
  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
    return 'Permission denied while downloading course.';
  }
  if (code.includes('resource-exhausted')) {
    return 'Course service is busy. Please try again in a moment.';
  }
  return message || 'Course download failed.';
};

export async function fetchCourseHolesFromBackend(courseId) {
  if (!courseId) throw new Error('Missing courseId');
  if (!isFirebaseEnabled || !app) {
    throw new Error('Firebase is not configured for course download.');
  }
  const functions = getFunctions(app, FUNCTIONS_REGION);
  const getCourseHoles = httpsCallable(functions, 'getCourseHoles');

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await withTimeout(
        getCourseHoles({ courseId }),
        CALL_TIMEOUT_MS,
        'Course download timed out. Please try again.'
      );
      const payload = result?.data;
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid course payload from Firebase function.');
      }
      if (payload.error === 'not_found') {
        throw new Error('Course not found');
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await wait(400 * attempt);
      }
    }
  }

  throw new Error(normalizeFunctionError(lastError));
}
