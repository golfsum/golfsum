/**
 * Golf Course API Service
 * Free tier: 100 requests/day (plenty for personal use)
 * Provides professional course data: yardages, par, ratings, etc.
 * 
 * Get your FREE API key at: https://rapidapi.com/apihood-apihood-default/api/golf-course-api
 */

import Storage from './storage';
import { logger } from '../utils/logger';
import { normalizeCourseName } from '../utils/normalizeCourseName';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

// Lazy import to avoid circular dependency (courseCatalogService imports CourseDetails from us)
const saveToFirebase = async (courseDetails: CourseDetails, source: string) => {
  try {
    const { saveCommunityCourse } = await import('./courseCatalogService');
    await saveCommunityCourse(courseDetails, { source });
  } catch (err: any) {
    logger.debug(`ℹ️ Community catalog save skipped/failed for "${courseDetails.name}":`, err?.message || err);
  }
};

// Official Golf Course API (api.golfcourseapi.com)
const GOLF_COURSE_API_URL = 'https://api.golfcourseapi.com/v1';
const CACHE_KEY = '@GolfSum:CourseCache';
const RECENT_COURSES_KEY = '@GolfSum:RecentCourses';
const FAVORITE_COURSES_KEY = '@GolfSum:FavoriteCourses';
const COURSE_SOURCE = 'GOLF_COURSE_API';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let API_KEY = '';
let AUTH_SCHEME: 'Key' | 'Bearer' = 'Key';

const getAuthHeaderValue = () => `${AUTH_SCHEME} ${API_KEY}`;

export const setApiKey = (key: string, scheme: 'Key' | 'Bearer' = 'Key') => {
  API_KEY = key;
  AUTH_SCHEME = scheme;
  logger.debug(`🔑 Course API credential loaded (${scheme})`);
};

export const getApiKey = () => API_KEY;

// Test API key and check if it's valid
export const testApiKey = async (): Promise<{
  isValid: boolean;
  error?: string;
}> => {
  if (!API_KEY) {
    return { isValid: false, error: 'No API key set' };
  }

  try {
    // Test with a simple search query
    const response = await fetchWithTimeout(`${GOLF_COURSE_API_URL}/search?search_query=pebble`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeaderValue(),
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      logger.debug('✅ API key is valid');
      return { isValid: true };
    } else if (response.status === 401) {
      return { isValid: false, error: 'Invalid API key' };
    } else {
      return { isValid: false, error: `API error: ${response.status}` };
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export interface GolfCourse {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  holes: number;
  par: number;
  rating?: number;
  slope?: number;
  yardage?: number;
  latitude?: number;
  longitude?: number;
  distance?: number; // Distance in miles (calculated)
}

export interface TeeBox {
  name: string;
  color: string;
  rating: number;
  slope: number;
  ratingWomen?: number;
  slopeWomen?: number;
  yardage: number;
  holes: HoleDetail[];
}

export interface HoleDetail {
  hole: number;
  par: number;
  yardage: number;
  handicap: number;
  handicapWomen?: number;
  nineName?: string;
}

export interface CourseDetails extends GolfCourse {
  teeBoxes: TeeBox[];
  description?: string;
  website?: string;
  phone?: string;
  source?: string;
  version?: number;
  lastVerifiedAt?: number;
}

export interface CachedCourse {
  course: CourseDetails;
  cachedAt: number;
  source?: string;
  version?: number;
  lastVerifiedAt?: number;
}

// Common golf course name suffixes to strip for simplified searches
const GOLF_SUFFIXES = [
  'golf resort & spa',
  'golf resort and spa',
  'golf & country club',
  'golf and country club',
  'golf & racquet club',
  'golf and racquet club',
  'golf course',
  'golf club',
  'golf resort',
  'golf links',
  'golf center',
  'golf centre',
  'country club',
  'resort & spa',
  'resort and spa',
  'municipal golf',
  'public golf',
  'course',
  'club',
  'resort',
  'gc',
  'cc',
];

/**
 * Generate simplified search variants from a golf course name.
 * E.g. "Tubac Golf Resort & Spa" → ["Tubac Golf Resort & Spa", "Tubac", ...]
 * E.g. "Dell Urich Course" → ["Dell Urich Course", "Dell Urich", ...]
 */
export const generateSearchVariants = (name: string): string[] => {
  const variants: string[] = [name]; // Always try the full name first
  const lowerName = name.toLowerCase().trim();

  // Try stripping common suffixes
  for (const suffix of GOLF_SUFFIXES) {
    if (lowerName.endsWith(suffix)) {
      const stripped = name.slice(0, name.length - suffix.length).trim();
      // Remove trailing punctuation like " -", " &", ","
      const cleaned = stripped.replace(/[\s\-&,]+$/, '').trim();
      if (cleaned.length >= 3 && !variants.some(v => v.toLowerCase() === cleaned.toLowerCase())) {
        variants.push(cleaned);
      }
    }
  }

  // Also try removing "The " prefix
  if (lowerName.startsWith('the ')) {
    const withoutThe = name.slice(4).trim();
    if (withoutThe.length >= 3 && !variants.some(v => v.toLowerCase() === withoutThe.toLowerCase())) {
      variants.push(withoutThe);
    }
  }

  // Try first N words (useful for names like "Tubac Golf Resort & Spa" → "Tubac Golf")
  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 2) {
    // Try first 2 words
    const twoWords = words.slice(0, 2).join(' ');
    if (twoWords.length >= 3 && !variants.some(v => v.toLowerCase() === twoWords.toLowerCase())) {
      variants.push(twoWords);
    }
    // Try first word if it's a proper name (3+ chars, not a common word)
    const commonWords = new Set(['the', 'at', 'of', 'in', 'on', 'and', 'del', 'de', 'la', 'el', 'las', 'los']);
    if (words[0].length >= 3 && !commonWords.has(words[0].toLowerCase())) {
      const firstWord = words[0];
      if (!variants.some(v => v.toLowerCase() === firstWord.toLowerCase())) {
        variants.push(firstWord);
      }
    }
  }

  return variants;
};

// Search for courses by name (official Golf Course API)
export const searchCourses = async (query: string): Promise<GolfCourse[]> => {
  if (!query || query.trim().length < 3) {
    return [];
  }

  try {
    logger.debug(`🔍 Searching for courses: "${query}"`);

    const cachedMatches = await searchCachedCourses(query);
    if (!API_KEY) {
      return cachedMatches;
    }
    
    const response = await fetchWithTimeout(`${GOLF_COURSE_API_URL}/search?search_query=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeaderValue(),
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('❌ Golf Course API Error:', errorData);
      
      if (response.status === 401) {
        throw new Error('Invalid API key. Get your key at https://www.golfcourseapi.com/sign-in');
      }
      
      throw new Error(`Golf Course API request failed: ${response.status}`);
    }

    const data = await response.json();
    const courses = data.courses || [];
    logger.debug(`✅ Found ${courses.length} courses`);
    
    // Map API response to our GolfCourse interface
    const apiCourses = courses.map((course: any) => ({
      id: String(course.id),
      name: normalizeCourseName(course.course_name || course.club_name || ''),
      city: course.location?.city || '',
      state: course.location?.state || '',
      country: course.location?.country || 'United States',
      holes: 18, // Default, will be in course details
      par: 72, // Default, will be in course details
      latitude: course.location?.latitude,
      longitude: course.location?.longitude,
    }));

    const merged: Record<string, GolfCourse> = {};
    cachedMatches.forEach((course: GolfCourse) => {
      merged[course.id] = course;
    });
    apiCourses.forEach((course: GolfCourse) => {
      merged[course.id] = course;
    });

    return Object.values(merged);
  } catch (error) {
    logger.error('Error searching courses:', error);
    throw error;
  }
};

/**
 * Smart search: tries multiple name variants to find a course in the API.
 * Used when matching OSM-discovered courses to the Golf Course API.
 */
export const searchCoursesWithFallback = async (
  osmName: string,
  osmLat?: number,
  osmLon?: number
): Promise<GolfCourse[]> => {
  const variants = generateSearchVariants(osmName);
  logger.debug(`🔍 Smart search for "${osmName}" with ${variants.length} variants: ${variants.map(v => `"${v}"`).join(', ')}`);

  for (const variant of variants) {
    try {
      const results = await searchCourses(variant);
      if (results.length > 0) {
        logger.debug(`✅ Found ${results.length} results using variant: "${variant}"`);
        
        // If we have OSM coordinates, sort by proximity to the OSM location
        if (osmLat && osmLon) {
          const withDistance = results.map(course => ({
            ...course,
            distance: course.latitude && course.longitude
              ? calculateDistance(osmLat, osmLon, course.latitude, course.longitude)
              : undefined,
          }));
          withDistance.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
          return withDistance;
        }
        
        return results;
      }
      logger.debug(`  ⚠️ No results for variant: "${variant}"`);
    } catch (error) {
      logger.error(`  ❌ Error searching variant "${variant}":`, error);
      // If it's an auth error, don't try more variants
      if (error instanceof Error && error.message.includes('Invalid API key')) {
        throw error;
      }
    }
  }

  logger.debug(`📭 No results found for any variant of "${osmName}"`);
  return [];
};

// Search for courses by location using reverse geocoding
// The official API doesn't support lat/long search, so we search by city name
export const searchCoursesByLocation = async (
  latitude: number,
  longitude: number,
  city: string,
  state: string
): Promise<GolfCourse[]> => {
  if (!API_KEY) {
    throw new Error('Golf Course API key not set.');
  }

  try {
    logger.debug(`📍 Searching for courses near: ${city}, ${state}`);
    
    // Search by city name
    const searchQuery = `${city} ${state}`;
    const courses = await searchCourses(searchQuery);
    
    // Calculate distances for courses that have coordinates
    const coursesWithDistance = courses.map(course => {
      if (course.latitude && course.longitude) {
        return {
          ...course,
          distance: calculateDistance(latitude, longitude, course.latitude, course.longitude)
        };
      }
      return course;
    });
    
    // Sort by distance (courses without coords go to end)
    coursesWithDistance.sort((a, b) => {
      if (a.distance === undefined) return 1;
      if (b.distance === undefined) return -1;
      return a.distance - b.distance;
    });
    
    logger.debug(`✅ Found ${coursesWithDistance.length} courses near ${city}, ${state}`);
    return coursesWithDistance;
    
  } catch (error) {
    logger.error('Error searching courses by location:', error);
    throw error;
  }
};

// Calculate distance between two coordinates (Haversine formula)
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
};

const toRad = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

// Get detailed course information by ID
export const getCourseDetails = async (courseId: string): Promise<CourseDetails> => {
  // Check local cache first
  const cachedEntry = await getCachedCourseEntry(courseId);
  if (cachedEntry) {
    logger.debug(`✅ Loaded course from cache: ${cachedEntry.course.name}`);
    refreshCourseInBackground(courseId, cachedEntry).catch(() => undefined);
    return cachedEntry.course;
  }

  // Check Firebase community catalog (courses saved by other users)
  try {
    const { getCommunityCourse } = await import('./courseCatalogService');
    const communityCourse = await getCommunityCourse(courseId);
    if (communityCourse && communityCourse.teeBoxes && communityCourse.teeBoxes.length > 0) {
      logger.debug(`✅ Loaded course from Firebase community catalog: ${communityCourse.name}`);
      // Cache locally for future use
      await cacheCourse(communityCourse);
      return communityCourse;
    }
  } catch (err) {
    logger.debug('ℹ️ Community catalog lookup skipped:', (err as Error)?.message || err);
  }

  if (!API_KEY) {
    throw new Error('Golf Course API key not set.');
  }

  try {
    logger.debug(`📡 Fetching course details for ID: ${courseId}`);
    
    const response = await fetchWithTimeout(`${GOLF_COURSE_API_URL}/courses/${courseId}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeaderValue(),
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('❌ Error fetching course details:', errorData);
      
      if (response.status === 401) {
        throw new Error('Invalid API key');
      }
      
      throw new Error(`Failed to fetch course details: ${response.status}`);
    }

    const data = await response.json();
    
    // API response is wrapped in a "course" object
    const courseData = data.course || data;
    
    const courseName = normalizeCourseName(courseData.course_name || courseData.club_name || 'Unknown Course');
    logger.debug(`✅ Fetched course: ${courseName}`);
    logger.debug(`📊 Course data:`, JSON.stringify(courseData, null, 2).substring(0, 500)); // Log first 500 chars
    
    // Map API response to our CourseDetails interface
    const teeBoxes = parseTeeBoxes(courseData.tees);
    
    // Get par from first tee box or default
    const firstTee = teeBoxes[0];
    const par = firstTee?.holes?.reduce((sum, h) => sum + h.par, 0) || 
                courseData.tees?.male?.[0]?.par_total || 
                courseData.tees?.female?.[0]?.par_total || 
                72;
    
    // Pull top-level rating/slope from the first male tee as a fallback
    const primaryTee = teeBoxes.find(t => !t.name.includes('(Women)')) || teeBoxes[0];

    const resolvedHoleCount =
      teeBoxes[0]?.holes?.length ||
      Math.max(...teeBoxes.map((tee) => tee.holes?.length || 0), 0) ||
      18;

    const courseDetails: CourseDetails = {
      id: String(courseData.id),
      name: courseName,
      city: courseData.location?.city || '',
      state: courseData.location?.state || '',
      country: courseData.location?.country || 'United States',
      holes: resolvedHoleCount,
      par: par,
      rating: primaryTee?.rating || undefined,
      slope: primaryTee?.slope || undefined,
      latitude: courseData.location?.latitude,
      longitude: courseData.location?.longitude,
      teeBoxes: teeBoxes.length > 0 ? teeBoxes : generateDefaultTeeBoxes(par),
      source: COURSE_SOURCE,
      version: 1,
      lastVerifiedAt: Date.now(),
    };
    
    // Cache the course data locally
    await cacheCourse(courseDetails);
    
    // Add to recent courses
    await addToRecentCourses(courseDetails);

    // Save to Firebase community catalog (fire-and-forget)
    saveToFirebase(courseDetails, COURSE_SOURCE);
    
    return courseDetails;
  } catch (error) {
    logger.error('Error fetching course details:', error);
    throw error;
  }
};

// Helper to parse tee boxes from API response
const parseTeeBoxes = (tees: any): TeeBox[] => {
  const teeBoxes: TeeBox[] = [];
  
  if (!tees) {
    logger.debug('⚠️ No tee data available (tees is null/undefined)');
    return teeBoxes;
  }
  
  logger.debug(`📊 Parsing tees:`, {
    hasMale: !!tees.male,
    hasFemale: !!tees.female,
    maleCount: Array.isArray(tees.male) ? tees.male.length : 0,
    femaleCount: Array.isArray(tees.female) ? tees.female.length : 0,
    rawTees: JSON.stringify(tees).substring(0, 300), // Log first 300 chars of tees object
  });
  
  // Parse male tees
  if (tees?.male && Array.isArray(tees.male)) {
    logger.debug(`📊 Processing ${tees.male.length} male tees`);
    tees.male.forEach((tee: any, index: number) => {
      try {
        logger.debug(`  Processing male tee ${index}: ${tee.tee_name}`);
        const holes = parseHoles(tee.holes, tee.par_total);
        if (holes.length > 0) {
          logger.debug(`  ✅ Added male tee: ${tee.tee_name} with ${holes.length} holes`);
          teeBoxes.push({
            name: tee.tee_name || `Tee ${index + 1}`,
            color: tee.tee_name || 'Unknown',
            rating: tee.course_rating || 72.0,
            slope: tee.slope_rating || 113,
            yardage: tee.total_yards || 6500,
            holes: holes,
          });
        } else {
          logger.debug(`  ⚠️ Skipped male tee ${index} - no holes`);
        }
      } catch (err) {
        logger.error(`  ❌ Error parsing male tee ${index}:`, err);
      }
    });
  }
  
  // Parse female tees
  if (tees?.female && Array.isArray(tees.female)) {
    logger.debug(`📊 Processing ${tees.female.length} female tees`);
    tees.female.forEach((tee: any, index: number) => {
      try {
        logger.debug(`  Processing female tee ${index}: ${tee.tee_name}`);
        const holes = parseHoles(tee.holes, tee.par_total);
        if (holes.length > 0) {
          logger.debug(`  ✅ Added female tee: ${tee.tee_name} with ${holes.length} holes`);
          teeBoxes.push({
            name: `${tee.tee_name || `Tee ${index + 1}`} (Women)`,
            color: tee.tee_name || 'Unknown',
            rating: tee.course_rating || 72.0,
            slope: tee.slope_rating || 113,
            yardage: tee.total_yards || 5500,
            holes: holes,
          });
        } else {
          logger.debug(`  ⚠️ Skipped female tee ${index} - no holes`);
        }
      } catch (err) {
        logger.error(`  ❌ Error parsing female tee ${index}:`, err);
      }
    });
  }
  
  logger.debug(`✅ Parsed ${teeBoxes.length} tee boxes`);
  return teeBoxes;
};

// Helper to parse hole details
const parseHoles = (holes: any[], parTotal: number = 72): HoleDetail[] => {
  if (!holes || !Array.isArray(holes) || holes.length === 0) {
    logger.debug(`⚠️ No hole data, generating defaults for par ${parTotal}`);
    // Generate default 18 holes if not provided
    return generateDefaultHoles(parTotal);
  }
  
  logger.debug(`📊 Parsing ${holes.length} holes`);
  
  return holes.map((hole, index) => {
    const nineName =
      hole?.nine_name ||
      hole?.nineName ||
      hole?.course_name ||
      hole?.courseName ||
      hole?.loop_name ||
      hole?.loopName ||
      hole?.side_name ||
      hole?.sideName ||
      undefined;

    return {
      hole: index + 1,
      par: hole.par || 4,
      yardage: hole.yardage || 350,
      handicap: hole.handicap || index + 1,
      nineName: typeof nineName === 'string' && nineName.trim().length > 0 ? nineName.trim() : undefined,
    };
  });
};

// Generate default holes based on par total
const generateDefaultHoles = (parTotal: number = 72): HoleDetail[] => {
  const holes: HoleDetail[] = [];
  const count = 18;
  const basePar = 4;
  const target = Math.max(60, Math.min(76, parTotal));
  const parArray = Array(count).fill(basePar);
  const diff = target - basePar * count;

  if (diff < 0) {
    const par3Count = Math.min(Math.abs(diff), count);
    const spacing = Math.max(1, Math.floor(count / par3Count));
    for (let i = 0; i < par3Count; i++) {
      parArray[(i * spacing + 2) % count] = 3;
    }
  } else if (diff > 0) {
    const par5Count = Math.min(diff, 6);
    const spacing = Math.max(1, Math.floor(count / par5Count));
    for (let i = 0; i < par5Count; i++) {
      parArray[(i * spacing + 1) % count] = 5;
    }
  }

  for (let i = 0; i < count; i++) {
    const par = parArray[i];
    holes.push({
      hole: i + 1,
      par,
      yardage: par === 3 ? 165 : par === 5 ? 510 : 375,
      handicap: i + 1,
    });
  }
  
  return holes;
};

// Generate default tee boxes as fallback
const generateDefaultTeeBoxes = (parTotal: number = 72): TeeBox[] => {
  logger.debug('⚠️ Generating default tee boxes');
  
  return [
    {
      name: 'Championship',
      color: 'Black',
      rating: 74.0,
      slope: 135,
      yardage: 7000,
      holes: generateDefaultHoles(parTotal),
    },
    {
      name: 'Blue',
      color: 'Blue',
      rating: 72.0,
      slope: 128,
      yardage: 6500,
      holes: generateDefaultHoles(parTotal),
    },
    {
      name: 'White',
      color: 'White',
      rating: 70.0,
      slope: 120,
      yardage: 6000,
      holes: generateDefaultHoles(parTotal),
    },
    {
      name: 'Red',
      color: 'Red',
      rating: 68.0,
      slope: 115,
      yardage: 5500,
      holes: generateDefaultHoles(parTotal),
    },
  ];
};

// Cache course data locally
const cacheCourse = async (course: CourseDetails): Promise<void> => {
  try {
    const cacheData: Record<string, CachedCourse> = {};
    const existing = await Storage.getItem(CACHE_KEY);
    
    if (existing) {
      Object.assign(cacheData, JSON.parse(existing));
    }
    
    const cachedAt = Date.now();
    cacheData[course.id] = {
      course,
      cachedAt,
      source: course.source,
      version: course.version || 1,
      lastVerifiedAt: course.lastVerifiedAt || cachedAt,
    };
    
    await Storage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    logger.debug(`💾 Cached course: ${course.name}`);
  } catch (error) {
    logger.error('Error caching course:', error);
  }
};

// Get cached course (valid for 30 days)
const getCachedCourseEntry = async (courseId: string): Promise<CachedCourse | null> => {
  try {
    const cached = await Storage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const cacheData: Record<string, CachedCourse> = JSON.parse(cached);
    const courseCache = cacheData[courseId];
    
    if (!courseCache) return null;
    
    return courseCache;
  } catch (error) {
    logger.error('Error getting cached course:', error);
    return null;
  }
};

const isCacheStale = (cachedAt: number) => {
  return Date.now() - cachedAt > CACHE_MAX_AGE_MS;
};

const refreshCourseInBackground = async (courseId: string, cachedEntry: CachedCourse) => {
  if (!API_KEY) return;
  if (!isCacheStale(cachedEntry.cachedAt)) return;
  try {
    const fresh = await fetchWithTimeout(`${GOLF_COURSE_API_URL}/courses/${courseId}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeaderValue(),
        'Content-Type': 'application/json'
      }
    });

    if (!fresh.ok) return;
    const data = await fresh.json();
    const courseData = data.course || data;
    const teeBoxes = parseTeeBoxes(courseData.tees);
    const firstTee = teeBoxes[0];
    const par = firstTee?.holes?.reduce((sum, h) => sum + h.par, 0) ||
                courseData.tees?.male?.[0]?.par_total ||
                courseData.tees?.female?.[0]?.par_total ||
                72;
    // Pull top-level rating/slope from the first male tee as a fallback
    const primaryTee = teeBoxes.find(t => !t.name.includes('(Women)')) || teeBoxes[0];

    const resolvedHoleCount =
      teeBoxes[0]?.holes?.length ||
      Math.max(...teeBoxes.map((tee) => tee.holes?.length || 0), 0) ||
      cachedEntry.course.holes ||
      18;

    const courseDetails: CourseDetails = {
      id: String(courseData.id),
      name: normalizeCourseName(courseData.course_name || courseData.club_name || cachedEntry.course.name),
      city: courseData.location?.city || cachedEntry.course.city,
      state: courseData.location?.state || cachedEntry.course.state,
      country: courseData.location?.country || cachedEntry.course.country || 'United States',
      holes: resolvedHoleCount,
      par,
      rating: primaryTee?.rating || cachedEntry.course.rating,
      slope: primaryTee?.slope || cachedEntry.course.slope,
      latitude: courseData.location?.latitude,
      longitude: courseData.location?.longitude,
      teeBoxes: teeBoxes.length > 0 ? teeBoxes : cachedEntry.course.teeBoxes,
      source: COURSE_SOURCE,
      version: (cachedEntry.version || 1) + 1,
      lastVerifiedAt: Date.now(),
    };

    await cacheCourse(courseDetails);

    // Also update Firebase community catalog
    saveToFirebase(courseDetails, COURSE_SOURCE);
  } catch (error) {
    logger.warn('Course refresh failed (using cached data):', error);
  }
};

const searchCachedCourses = async (query: string): Promise<GolfCourse[]> => {
  try {
    const cached = await Storage.getItem(CACHE_KEY);
    if (!cached) return [];
    const cacheData: Record<string, CachedCourse> = JSON.parse(cached);
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normalizedQuery = normalize(query);
    const queryCompact = normalizedQuery.replace(/\s+/g, '');
    const levenshtein = (a: string, b: string) => {
      const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
      for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
      for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
      for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );
        }
      }
      return dp[a.length][b.length];
    };

    return Object.values(cacheData)
      .map(entry => entry.course)
      .map((course) => {
        const name = normalize(course.name || '');
        const city = normalize(course.city || '');
        const state = normalize(course.state || '');
        const nameCompact = name.replace(/\s+/g, '');
        const directMatch =
          name.includes(normalizedQuery) ||
          city.includes(normalizedQuery) ||
          state.includes(normalizedQuery);
        const fuzzyDistance = queryCompact.length >= 5 && nameCompact
          ? levenshtein(queryCompact, nameCompact.slice(0, Math.max(queryCompact.length + 2, 8)))
          : Number.POSITIVE_INFINITY;
        const tokenDistance = queryCompact.length >= 5
          ? Math.min(
              ...name.split(' ').filter(Boolean).map((token) => levenshtein(queryCompact, token)),
              Number.POSITIVE_INFINITY
            )
          : Number.POSITIVE_INFINITY;
        return {
          course,
          directMatch,
          fuzzyDistance: Math.min(fuzzyDistance, tokenDistance),
        };
      })
      .filter(({ directMatch, fuzzyDistance }) => directMatch || fuzzyDistance <= Math.max(2, Math.floor(queryCompact.length * 0.25)))
      .sort((a, b) => {
        if (a.directMatch !== b.directMatch) return a.directMatch ? -1 : 1;
        return a.fuzzyDistance - b.fuzzyDistance;
      })
      .slice(0, 10)
      .map(({ course }) => ({
        id: course.id,
        name: course.name,
        city: course.city,
        state: course.state,
        country: course.country,
        holes: course.holes,
        par: course.par,
        rating: course.rating,
        slope: course.slope,
        yardage: course.yardage,
        latitude: course.latitude,
        longitude: course.longitude,
      }));
  } catch (error) {
    return [];
  }
};

// Add course to recent courses list
const addToRecentCourses = async (course: CourseDetails): Promise<void> => {
  try {
    let recentCourses: GolfCourse[] = [];
    const existing = await Storage.getItem(RECENT_COURSES_KEY);
    
    if (existing) {
      recentCourses = JSON.parse(existing);
    }
    
    // Remove if already in list
    recentCourses = recentCourses.filter(c => c.id !== course.id);
    
    // Add to front
    recentCourses.unshift({
      id: course.id,
      name: course.name,
      city: course.city,
      state: course.state,
      country: course.country,
      holes: course.holes,
      par: course.par,
      rating: course.rating,
      slope: course.slope,
      yardage: course.yardage
    });
    
    // Keep only last 10
    recentCourses = recentCourses.slice(0, 10);
    
    await Storage.setItem(RECENT_COURSES_KEY, JSON.stringify(recentCourses));
    logger.debug(`📝 Added to recent courses: ${course.name}`);
  } catch (error) {
    logger.error('Error adding to recent courses:', error);
  }
};

// Get recent courses
export const getRecentCourses = async (): Promise<GolfCourse[]> => {
  try {
    const existing = await Storage.getItem(RECENT_COURSES_KEY);
    if (!existing) return [];
    
    return JSON.parse(existing);
  } catch (error) {
    logger.error('Error getting recent courses:', error);
    return [];
  }
};

// Add course to favorites
export const addToFavorites = async (course: GolfCourse): Promise<void> => {
  try {
    let favorites: GolfCourse[] = [];
    const existing = await Storage.getItem(FAVORITE_COURSES_KEY);
    
    if (existing) {
      favorites = JSON.parse(existing);
    }
    
    // Check if already favorited
    if (favorites.some(c => c.id === course.id)) {
      logger.debug(`⭐ Course already in favorites: ${course.name}`);
      return;
    }
    
    favorites.push(course);
    await Storage.setItem(FAVORITE_COURSES_KEY, JSON.stringify(favorites));
    logger.debug(`⭐ Added to favorites: ${course.name}`);
  } catch (error) {
    logger.error('Error adding to favorites:', error);
    throw error;
  }
};

// Remove course from favorites
export const removeFromFavorites = async (courseId: string): Promise<void> => {
  try {
    const existing = await Storage.getItem(FAVORITE_COURSES_KEY);
    if (!existing) return;
    
    let favorites: GolfCourse[] = JSON.parse(existing);
    favorites = favorites.filter(c => c.id !== courseId);
    
    await Storage.setItem(FAVORITE_COURSES_KEY, JSON.stringify(favorites));
    logger.debug(`💔 Removed from favorites: ${courseId}`);
  } catch (error) {
    logger.error('Error removing from favorites:', error);
    throw error;
  }
};

// Get favorite courses
export const getFavoriteCourses = async (): Promise<GolfCourse[]> => {
  try {
    const existing = await Storage.getItem(FAVORITE_COURSES_KEY);
    if (!existing) return [];
    
    return JSON.parse(existing);
  } catch (error) {
    logger.error('Error getting favorite courses:', error);
    return [];
  }
};

// Check if course is favorited
export const isFavorite = async (courseId: string): Promise<boolean> => {
  try {
    const favorites = await getFavoriteCourses();
    return favorites.some(c => c.id === courseId);
  } catch (error) {
    logger.error('Error checking favorite status:', error);
    return false;
  }
};

// Clear all cached courses (useful for troubleshooting)
export const clearCache = async (): Promise<void> => {
  try {
    await Storage.removeItem(CACHE_KEY);
    logger.debug('🗑️ Cleared course cache');
  } catch (error) {
    logger.error('Error clearing cache:', error);
  }
};
