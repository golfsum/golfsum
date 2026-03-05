import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
// OpenStreetMap Service - Golf Course Discovery
// Uses Overpass API to find golf courses, then queries GolfCourseAPI for details

interface OSMGolfCourse {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance?: number; // Distance in miles from user
  city?: string;
  state?: string;
  country?: string;
  sport?: string;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    sport?: string;
    leisure?: string;
    'addr:city'?: string;
    'addr:state'?: string;
    'addr:country'?: string;
  };
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// List of public Overpass API servers (fallback if one fails)
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

const buildOverpassHeaders = () => ({
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Accept': 'application/json',
  'User-Agent': 'GolfSum/1.0 (golf course lookup)',
});

const shuffledServers = () => {
  const copy = [...OVERPASS_SERVERS];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Search for golf courses near a location using OpenStreetMap
 * @param latitude User's latitude
 * @param longitude User's longitude
 * @param radiusMiles Search radius in miles (default 50)
 * @returns Array of golf courses sorted by distance
 */
export async function searchGolfCoursesNearby(
  latitude: number,
  longitude: number,
  radiusMiles: number = 50
): Promise<OSMGolfCourse[]> {
  // Convert miles to meters for Overpass API
  const radiusMeters = Math.round(radiusMiles * 1609.34);

  logger.debug(`🗺️ Searching OSM for golf courses within ${radiusMiles} miles (${radiusMeters}m)`);
  logger.debug(`📍 Search center: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);

  // Use bounding box instead of around for better performance
  // Calculate bounding box (rough approximation: 1 degree ≈ 69 miles)
  const latDelta = radiusMiles / 69.0;
  const lonDelta = radiusMiles / (69.0 * Math.cos(latitude * Math.PI / 180));
  
  const south = latitude - latDelta;
  const north = latitude + latDelta;
  const west = longitude - lonDelta;
  const east = longitude + lonDelta;

  logger.debug(`📐 Bounding box: S=${south.toFixed(4)} W=${west.toFixed(4)} N=${north.toFixed(4)} E=${east.toFixed(4)}`);

  // Include node, way, and relation types for maximum coverage
  // Some courses are only tagged as nodes on certain mirrors
  const query = `
    [out:json][timeout:25][bbox:${south},${west},${north},${east}];
    (
      node["leisure"="golf_course"];
      way["leisure"="golf_course"];
      relation["leisure"="golf_course"];
    );
    out center tags 100;
  `;

  // Also prepare a fallback query using "around" syntax in case bbox fails
  const aroundQuery = `
    [out:json][timeout:25];
    (
      node["leisure"="golf_course"](around:${radiusMeters},${latitude},${longitude});
      way["leisure"="golf_course"](around:${radiusMeters},${latitude},${longitude});
      relation["leisure"="golf_course"](around:${radiusMeters},${latitude},${longitude});
    );
    out center tags 100;
  `;

  // Try each server until one returns results
  let lastError: Error | null = null;
  let bestResult: OSMGolfCourse[] = [];
  let serversReturningZero = 0;
  
  const servers = shuffledServers();
  
  for (const server of servers) {
    try {
      const hostname = new URL(server).hostname;
      logger.debug(`🌐 Trying OSM server: ${hostname}`);
      
      // Create timeout promise (compatible with React Native)
      const fetchPromise = fetchWithTimeout(server, {
        method: 'POST',
        headers: buildOverpassHeaders(),
        body: `data=${encodeURIComponent(query)}`,
      });

      const timeoutPromise = new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout after 20s')), 20000)
      );

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OverpassResponse = await response.json();
      logger.debug(`📍 OSM returned ${data.elements.length} raw elements from ${hostname}`);

      // If this server returned 0 elements, try the next one
      // (some mirrors can be stale or have incomplete regional data)
      if (data.elements.length === 0) {
        logger.debug(`⚠️ ${hostname} returned 0 elements, trying next server...`);
        serversReturningZero++;
        continue;
      }

      // Parse and filter results
      const courses: OSMGolfCourse[] = data.elements
        .filter(element => {
          // Must have a name
          if (!element.tags?.name) return false;
          
          // Must be golf-related
          const isGolfCourse = element.tags.leisure === 'golf_course' || element.tags.sport === 'golf';
          if (!isGolfCourse) return false;

          // Must have coordinates
          const hasCoords = element.lat !== undefined || element.center !== undefined;
          return hasCoords;
        })
        .map(element => {
          const lat = element.lat ?? element.center?.lat ?? 0;
          const lon = element.lon ?? element.center?.lon ?? 0;
          
          return {
            id: `osm_${element.id}`,
            name: element.tags!.name!,
            latitude: lat,
            longitude: lon,
            distance: calculateDistance(latitude, longitude, lat, lon),
            city: element.tags?.['addr:city'],
            state: element.tags?.['addr:state'],
            country: element.tags?.['addr:country'],
            sport: element.tags?.sport,
          };
        })
        .filter(course => course.latitude !== 0 && course.longitude !== 0);

      // Filter to courses within the specified radius
      const coursesInRadius = courses.filter(c => c.distance && c.distance <= radiusMiles);

      // Sort by distance (closest first)
      coursesInRadius.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

      logger.debug(`✅ Found ${coursesInRadius.length} golf courses within ${radiusMiles} miles`);
      if (coursesInRadius.length > 0) {
        logger.debug(`   Closest: ${coursesInRadius[0].name} at ${coursesInRadius[0].distance?.toFixed(1)} miles`);
        return coursesInRadius;
      }

      // Server returned elements but none matched our filters/radius
      // Keep the best result and try next server
      if (coursesInRadius.length > bestResult.length) {
        bestResult = coursesInRadius;
      }
      logger.debug(`⚠️ ${hostname} returned ${data.elements.length} elements but 0 matched filters, trying next server...`);
    } catch (error) {
      logger.warn(`⚠️ Error with ${new URL(server).hostname}:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      // Continue to next server
    }
  }

  // If all servers returned 0, try the "around" query as a last resort
  if (serversReturningZero > 0 && bestResult.length === 0) {
    logger.debug(`🔄 All servers returned 0 with bbox query. Retrying with "around" query...`);
    
    for (const server of servers) {
      try {
        const hostname = new URL(server).hostname;
        logger.debug(`🌐 Trying "around" query on: ${hostname}`);
        
        const fetchPromise = fetchWithTimeout(server, {
          method: 'POST',
          headers: buildOverpassHeaders(),
          body: `data=${encodeURIComponent(aroundQuery)}`,
        });

        const timeoutPromise = new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout after 20s')), 20000)
        );

        const response = await Promise.race([fetchPromise, timeoutPromise]);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: OverpassResponse = await response.json();
        logger.debug(`📍 "around" query returned ${data.elements.length} elements from ${hostname}`);

        if (data.elements.length === 0) {
          continue;
        }

        const courses: OSMGolfCourse[] = data.elements
          .filter(element => element.tags?.name && (element.tags.leisure === 'golf_course' || element.tags.sport === 'golf') && (element.lat !== undefined || element.center !== undefined))
          .map(element => {
            const lat = element.lat ?? element.center?.lat ?? 0;
            const lon = element.lon ?? element.center?.lon ?? 0;
            return {
              id: `osm_${element.id}`,
              name: element.tags!.name!,
              latitude: lat,
              longitude: lon,
              distance: calculateDistance(latitude, longitude, lat, lon),
              city: element.tags?.['addr:city'],
              state: element.tags?.['addr:state'],
              country: element.tags?.['addr:country'],
              sport: element.tags?.sport,
            };
          })
          .filter(course => course.latitude !== 0 && course.longitude !== 0);

        const coursesInRadius = courses.filter(c => c.distance && c.distance <= radiusMiles);
        coursesInRadius.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

        if (coursesInRadius.length > 0) {
          logger.debug(`✅ "around" fallback found ${coursesInRadius.length} courses`);
          return coursesInRadius;
        }
      } catch (error) {
        logger.warn(`⚠️ "around" query failed on ${new URL(server).hostname}:`, error);
      }
    }
  }

  // Return best result (may be empty if truly no courses nearby)
  if (bestResult.length > 0) {
    return bestResult;
  }

  // If we had server errors and no results, throw
  if (lastError && serversReturningZero === 0) {
    logger.error('❌ All OSM servers failed with errors');
    throw new Error(`OpenStreetMap is temporarily unavailable. ${lastError.message || 'Please try again later.'}`);
  }

  // All servers responded but none had results
  logger.debug(`📭 All ${servers.length} servers checked. No golf courses found within ${radiusMiles} miles.`);
  return [];
}

/**
 * Search for golf courses by name using OpenStreetMap
 * @param searchTerm Course name or location to search
 * @param userLat Optional user latitude for distance sorting
 * @param userLon Optional user longitude for distance sorting
 * @returns Array of matching golf courses
 */
export async function searchGolfCoursesByName(
  searchTerm: string,
  userLat?: number,
  userLon?: number
): Promise<OSMGolfCourse[]> {
  logger.debug(`🔍 Searching OSM for: "${searchTerm}"`);

  try {
    // Nominatim search query (name-based search)
    // First, try to geocode the search term to get a location
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTerm + ' golf course')}&format=json&limit=1`;
    
    // Create timeout promise (compatible with React Native)
    const geocodeFetch = fetchWithTimeout(geocodeUrl, {
      headers: {
        'User-Agent': 'GolfSum/1.0', // Required by Nominatim
      },
    });

    const geocodeTimeout = new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Geocoding timeout after 10s')), 10000)
    );

    const geocodeResponse = await Promise.race([geocodeFetch, geocodeTimeout]);

    if (!geocodeResponse.ok) {
      throw new Error(`Nominatim error: ${geocodeResponse.status}`);
    }

    const geocodeData = await geocodeResponse.json();
    
    if (geocodeData.length === 0) {
      logger.debug('⚠️ No location found via geocoding, trying direct name search');
      // Fall back to direct name search in Overpass
      return await searchByNameOverpass(searchTerm, userLat, userLon);
    }

    const { lat, lon } = geocodeData[0];
    logger.debug(`📍 Geocoded "${searchTerm}" to ${lat}, ${lon}`);

    // Now search for golf courses around that location.
    // Distance should only represent user distance. If user location is not known,
    // return results without a distance value instead of showing misleading "nearby" values.
    const courses = await searchGolfCoursesNearby(parseFloat(lat), parseFloat(lon), 25);
    if (userLat == null || userLon == null) {
      return courses.map((course) => ({ ...course, distance: undefined }));
    }
    return courses;
  } catch (error) {
    logger.error('Geocoding failed:', error);
    // Fall back to direct name search
    return await searchByNameOverpass(searchTerm, userLat, userLon);
  }
}

/**
 * Direct Overpass search by course name (fallback)
 */
async function searchByNameOverpass(
  searchTerm: string,
  userLat?: number,
  userLon?: number
): Promise<OSMGolfCourse[]> {
  logger.debug(`🔍 Direct name search for: "${searchTerm}"`);
  
  // Escape special regex characters in search term
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Include node, way, and relation types for maximum coverage
  const query = `
    [out:json][timeout:25];
    (
      node["leisure"="golf_course"]["name"~"${escapedTerm}",i];
      way["leisure"="golf_course"]["name"~"${escapedTerm}",i];
      relation["leisure"="golf_course"]["name"~"${escapedTerm}",i];
    );
    out center tags 50;
  `;

  let lastError: Error | null = null;
  let bestResult: OSMGolfCourse[] = [];

  // Try each server
  for (const server of shuffledServers()) {
    try {
      const hostname = new URL(server).hostname;
      logger.debug(`🌐 Trying name search on ${hostname}`);
      
      // Create timeout promise (compatible with React Native)
      const fetchPromise = fetchWithTimeout(server, {
        method: 'POST',
        headers: buildOverpassHeaders(),
        body: `data=${encodeURIComponent(query)}`,
      });

      const timeoutPromise = new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout after 20s')), 20000)
      );

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OverpassResponse = await response.json();
      logger.debug(`📍 Name search returned ${data.elements.length} results from ${hostname}`);

      // If server returned 0 elements, try next server
      if (data.elements.length === 0) {
        logger.debug(`⚠️ ${hostname} returned 0 elements for name search, trying next...`);
        continue;
      }

      const courses: OSMGolfCourse[] = data.elements
        .filter(element => element.tags?.name)
        .map(element => {
          const lat = element.lat ?? element.center?.lat ?? 0;
          const lon = element.lon ?? element.center?.lon ?? 0;
          
          return {
            id: `osm_${element.id}`,
            name: element.tags!.name!,
            latitude: lat,
            longitude: lon,
            distance: userLat && userLon ? calculateDistance(userLat, userLon, lat, lon) : undefined,
            city: element.tags?.['addr:city'],
            state: element.tags?.['addr:state'],
            country: element.tags?.['addr:country'],
            sport: element.tags?.sport,
          };
        })
        .filter(course => course.latitude !== 0 && course.longitude !== 0);

      // Sort by distance if user location provided
      if (userLat && userLon) {
        courses.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      }

      if (courses.length > 0) {
        return courses;
      }

      // Keep best result in case all servers return filtered-out results
      if (courses.length > bestResult.length) {
        bestResult = courses;
      }
    } catch (error) {
      logger.warn(`⚠️ Name search failed on ${new URL(server).hostname}:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      // Continue to next server
    }
  }

  if (bestResult.length > 0) {
    return bestResult;
  }

  if (lastError) {
    logger.error('❌ All name search attempts failed with errors');
  } else {
    logger.debug('📭 All servers checked for name search. No matching courses found.');
  }
  // Return empty array instead of throwing - name search is best effort
  return [];
}

/**
 * Calculate distance between two points using Haversine formula
 * @returns Distance in miles
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export type { OSMGolfCourse };
