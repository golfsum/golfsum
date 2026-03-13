import { getAuthToken, getCurrentUser } from './firebaseAuthService';
import { convertFromFirestoreFields, convertToFirestoreFields } from './userService';
import { CourseDetails } from './golfCourseApiService';
import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { FIRESTORE_BASE_URL } from './firebaseConfig';
const COURSES_COLLECTION = 'courses';

const normalizeValue = (value: string | undefined): string => {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const getHeaders = async (): Promise<HeadersInit> => {
  const token = await getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

const isAuthenticated = (): boolean => {
  return getCurrentUser() !== null;
};

export interface CommunityCourse extends CourseDetails {
  nameNormalized?: string;
  cityNormalized?: string;
  stateNormalized?: string;
  scorecardImageUrl?: string;
  createdByUid?: string;
  updatedByUid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const saveCommunityCourse = async (
  course: CourseDetails,
  options?: { scorecardImageUrl?: string; source?: string }
): Promise<CommunityCourse | null> => {
  const currentUser = getCurrentUser();
  const courseId = String(course.id);
  const now = new Date().toISOString();
  const payload: CommunityCourse = {
    ...course,
    id: courseId,
    source: options?.source ?? course.source ?? 'USER_OCR',
    nameNormalized: normalizeValue(course.name),
    cityNormalized: normalizeValue(course.city),
    stateNormalized: normalizeValue(course.state),
    scorecardImageUrl: options?.scorecardImageUrl,
    createdByUid: (course as CommunityCourse).createdByUid ?? currentUser?.uid,
    updatedByUid: currentUser?.uid,
    updatedAt: now,
    createdAt: (course as CommunityCourse).createdAt ?? now,
  };

  if (!isAuthenticated()) {
    logger.debug(`ℹ️ Skipping Firebase save for course "${course.name}" (not authenticated)`);
    return null;
  }

  const docPath = `${FIRESTORE_BASE_URL}/${COURSES_COLLECTION}/${courseId}`;
  logger.debug(`💾 Saving course to Firebase: "${course.name}" (id: ${courseId})`);
  logger.debug(`   Tee boxes: ${course.teeBoxes?.length || 0}, Source: ${payload.source}`);

  try {
    const response = await fetchWithTimeout(docPath, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify({
        fields: convertToFirestoreFields(payload),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logger.error(`❌ Firebase save failed for course "${course.name}" (${response.status}):`, error);
      throw new Error(`Failed to save course (${response.status})`);
    }

    logger.debug(`✅ Course saved to Firebase: "${course.name}" (id: ${courseId})`);
    return payload;
  } catch (error) {
    logger.error(`❌ Error saving course "${course.name}" to Firebase:`, error);
    throw error;
  }
};

export const getCommunityCourse = async (courseId: string): Promise<CommunityCourse | null> => {
  try {
    const docPath = `${FIRESTORE_BASE_URL}/${COURSES_COLLECTION}/${courseId}`;
    const response = await fetchWithTimeout(docPath, { headers: await getHeaders() });
    if (!response.ok) {
      if (response.status === 404) {
        logger.debug(`ℹ️ Course ${courseId} not found in Firebase community catalog`);
      }
      return null;
    }
    const data = await response.json();
    if (!data.fields) return null;
    const course = convertFromFirestoreFields(data.fields) as CommunityCourse;
    logger.debug(`✅ Found course "${course.name}" in Firebase community catalog`);
    return course;
  } catch (error) {
    logger.debug('ℹ️ Community catalog read failed:', (error as Error)?.message || error);
    return null;
  }
};

export const findCommunityCoursesByName = async (
  name: string,
  city?: string,
  state?: string
): Promise<CommunityCourse[]> => {
  if (!isAuthenticated()) {
    return [];
  }

  const normalizedName = normalizeValue(name);
  if (!normalizedName) return [];

  const filters: any[] = [
    {
      fieldFilter: {
        field: { fieldPath: 'nameNormalized' },
        op: 'EQUAL',
        value: { stringValue: normalizedName },
      },
    },
  ];

  const normalizedCity = normalizeValue(city);
  const normalizedState = normalizeValue(state);

  if (normalizedCity) {
    filters.push({
      fieldFilter: {
        field: { fieldPath: 'cityNormalized' },
        op: 'EQUAL',
        value: { stringValue: normalizedCity },
      },
    });
  }

  if (normalizedState) {
    filters.push({
      fieldFilter: {
        field: { fieldPath: 'stateNormalized' },
        op: 'EQUAL',
        value: { stringValue: normalizedState },
      },
    });
  }

  const where = filters.length === 1
    ? filters[0]
    : { compositeFilter: { op: 'AND', filters } };

  const response = await fetchWithTimeout(`${FIRESTORE_BASE_URL}/${COURSES_COLLECTION}:runQuery`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: COURSES_COLLECTION }],
        where,
        limit: 5,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    logger.error('Course query error:', error);
    return [];
  }

  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((entry: any) => entry.document?.fields)
    .filter(Boolean)
    .map((fields: any) => convertFromFirestoreFields(fields) as CommunityCourse);
};

/**
 * Fetch all courses from Firestore that have coordinates and filter by distance.
 * Firestore has no native geo query, so we fetch the most recently updated
 * courses (up to 100) and filter client-side.
 */
export const getNearbyCommunityCourses = async (
  lat: number,
  lng: number,
  radiusMiles: number = 25
): Promise<CommunityCourse[]> => {
  if (!isAuthenticated()) return [];

  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  try {
    const response = await fetchWithTimeout(`${FIRESTORE_BASE_URL}/${COURSES_COLLECTION}:runQuery`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: COURSES_COLLECTION }],
          orderBy: [{ field: { fieldPath: 'updatedAt' }, direction: 'DESCENDING' }],
          limit: 100,
        },
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data
      .map((entry: any) => entry.document?.fields)
      .filter(Boolean)
      .map((fields: any) => convertFromFirestoreFields(fields) as CommunityCourse)
      .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
      .map((c) => ({
        ...c,
        distance: haversine(lat, lng, c.latitude!, c.longitude!),
      }))
      .filter((c) => c.distance <= radiusMiles)
      .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
  } catch {
    return [];
  }
};
