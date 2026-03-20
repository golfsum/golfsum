import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, isFirebaseEnabled } from './firebase';

const FUNCTIONS_REGION = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_ATTEMPTS = 2;

function getCallable(name) {
  if (!isFirebaseEnabled || !app) {
    throw new Error('Firebase is not configured.');
  }
  const functions = getFunctions(app, FUNCTIONS_REGION);
  return httpsCallable(functions, name);
}

const normalizeFunctionError = (error) => {
  const code = error?.code ? String(error.code) : '';
  const message = error?.message ? String(error.message) : '';
  if (code.includes('deadline-exceeded') || code.includes('unavailable')) return 'Course download timed out. Please try again.';
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return 'Permission denied while downloading course.';
  if (code.includes('resource-exhausted')) return 'Course service is busy. Please try again in a moment.';
  return message || 'Course download failed.';
};

export async function fetchCourseHolesFromBackend(courseId, courseName, latitude, longitude) {
  if (!courseId) throw new Error('Missing courseId');

  console.log('fetchCourseHolesFromBackend called with courseId:', courseId);

  const body = { courseId: String(courseId) };
  if (courseName) body.courseName = courseName;
  if (latitude != null) body.latitude = latitude;
  if (longitude != null) body.longitude = longitude;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const callable = getCallable('getCourseHoles');
      const response = await callable(body);
      const payload = response?.data;
      console.log('getCourseHoles raw response:', JSON.stringify(payload));
      if (!payload || typeof payload !== 'object') throw new Error('Invalid course payload.');
      if (payload.error === 'not_found') throw new Error('Course not found');
      return payload;

    } catch (error) {
      lastError = error;
      console.log(`fetchCourseHolesFromBackend attempt ${attempt} failed:`, error.message);
      if (attempt < MAX_ATTEMPTS) await wait(400 * attempt);
    }
  }

  throw new Error(normalizeFunctionError(lastError));
}

export async function searchGolfCoursesFromBackend({
  mode = 'name',
  query,
  latitude,
  longitude,
  city,
  state,
  country,
  radiusMiles,
  searchAll,
}) {
  let lastError = null;
  const body = { mode, query, latitude, longitude, city, state, country, radiusMiles, searchAll };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const callable = getCallable('searchGolfCourses');
      const response = await callable(body);
      const payload = response?.data;
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid course search payload.');
      }
      return payload;
    } catch (error) {
      lastError = error;
      console.log(`searchGolfCoursesFromBackend attempt ${attempt} failed:`, error.message);
      if (attempt < MAX_ATTEMPTS) await wait(400 * attempt);
    }
  }

  throw new Error(normalizeFunctionError(lastError));
}

export async function fetchGolfApiUsageFromBackend() {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const callable = getCallable('getGolfApiUsage');
      const response = await callable({});
      const payload = response?.data;
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid golf API usage payload.');
      }
      return payload;
    } catch (error) {
      lastError = error;
      console.log(`fetchGolfApiUsageFromBackend attempt ${attempt} failed:`, error.message);
      if (attempt < MAX_ATTEMPTS) await wait(400 * attempt);
    }
  }

  throw new Error(normalizeFunctionError(lastError));
}
