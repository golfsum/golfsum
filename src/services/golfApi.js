const COURSE_HOLES_URL = 'https://getcourseholes-nj35q5clfa-uc.a.run.app';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_ATTEMPTS = 2;

const normalizeFunctionError = (error) => {
  const code = error?.code ? String(error.code) : '';
  const message = error?.message ? String(error.message) : '';
  if (code.includes('deadline-exceeded') || code.includes('unavailable')) return 'Course download timed out. Please try again.';
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return 'Permission denied while downloading course.';
  if (code.includes('resource-exhausted')) return 'Course service is busy. Please try again in a moment.';
  return message || 'Course download failed.';
};

export async function fetchCourseHolesFromBackend(courseId) {
  if (!courseId) throw new Error('Missing courseId');

  console.log('fetchCourseHolesFromBackend called with courseId:', courseId);

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(COURSE_HOLES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { courseId: String(courseId) } }),
      });

      const json = await response.json();
      console.log('getCourseHoles raw response:', JSON.stringify(json));

      if (!response.ok) {
        throw new Error(`Course API error: ${response.status} ${json?.error?.message}`);
      }

      const payload = json?.result ?? json;
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
