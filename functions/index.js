const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const GOLFAPI_BASE = 'https://golfapi.io/api/v2.3';
const CACHE_COLLECTION = 'courseGpsCache';
const SEARCH_CACHE_COLLECTION = 'courseSearchCache';
const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SEARCH_CACHE_VERSION = 'v3';
const GOLF_API_USAGE_DOC = 'adminMetrics/golfApiUsage';
const GOLF_API_MONTHLY_LIMIT = 2000;

const POI_NAMES = {
  1: 'Green',
  2: 'Green Bunker',
  3: 'Fairway Bunker',
  4: 'Water',
  5: 'Trees',
  6: '100 Marker',
  7: '150 Marker',
  8: '200 Marker',
  9: 'Dogleg',
  10: 'Road',
  11: 'Tee Front',
  12: 'Tee Back',
};

const LOCATION_CODES = {
  1: 'F',
  2: 'C',
  3: 'B',
};

const FAIRWAY_SIDE_CODES = {
  1: 'L',
  2: 'C',
  3: 'R',
};

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function roundCoord(value, places = 2) {
  if (value == null || Number.isNaN(Number(value))) return '';
  const factor = 10 ** places;
  return String(Math.round(Number(value) * factor) / factor);
}

function normalizeCountryParam(value) {
  const input = String(value || '').trim().toLowerCase();
  if (!input) return '';
  if (['us', 'usa', 'united states', 'united states of america'].includes(input)) return 'USA';
  return String(value || '').trim();
}

function normalisePois(rawCoordinates) {
  if (!Array.isArray(rawCoordinates)) return [];
  return rawCoordinates
    .map((poi) => ({
      POI: POI_NAMES[Number(poi?.poi)] || String(poi?.poi || ''),
      Location: LOCATION_CODES[Number(poi?.location)] || 'C',
      SideOfFairway: FAIRWAY_SIDE_CODES[Number(poi?.sideFW)] || 'C',
      Latitude: Number(poi?.latitude),
      Longitude: Number(poi?.longitude),
    }))
    .filter((poi) => Number.isFinite(poi.Latitude) && Number.isFinite(poi.Longitude));
}

function normaliseHoles(courseRaw, coordinatesRaw) {
  const holeCount = Math.max(
    toNumber(courseRaw?.numHoles),
    Array.isArray(courseRaw?.parsMen) ? courseRaw.parsMen.length : 0,
    Array.isArray(courseRaw?.parsWomen) ? courseRaw.parsWomen.length : 0,
    18
  );
  const pars = Array.isArray(courseRaw?.parsMen) && courseRaw.parsMen.length ? courseRaw.parsMen : courseRaw?.parsWomen;
  const handicaps = Array.isArray(courseRaw?.indexesMen) && courseRaw.indexesMen.length
    ? courseRaw.indexesMen
    : courseRaw?.indexesWomen;
  const teesRaw = Array.isArray(courseRaw?.tees) ? courseRaw.tees : [];
  const coordinates = Array.isArray(coordinatesRaw?.coordinates) ? coordinatesRaw.coordinates : [];

  return Array.from({ length: holeCount }, (_, index) => {
    const holeNumber = index + 1;
    const holePois = normalisePois(coordinates.filter((poi) => Number(poi?.hole) === holeNumber));
    const tees = teesRaw.map((tee) => ({
      name: tee?.teeName ?? tee?.name ?? '',
      color: tee?.teeColor ?? tee?.color ?? '#10B981',
      yards: toNumber(tee?.[`length${holeNumber}`]),
      rating: tee?.courseRatingMen != null ? Number(tee.courseRatingMen) : undefined,
      slope: tee?.slopeMen != null ? Number(tee.slopeMen) : undefined,
    }));

    return {
      hole: holeNumber,
      number: holeNumber,
      par: toNumber(pars?.[index]) || 4,
      handicap: handicaps?.[index] != null ? toNumber(handicaps[index]) : undefined,
      tees,
      pois: holePois,
    };
  });
}

function extractApiRequestsLeft(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.apiRequestsLeft;
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getUsageMonthKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function persistGolfApiUsageSnapshot(payload, meta = {}) {
  const requestsLeft = extractApiRequestsLeft(payload);
  if (!Number.isFinite(requestsLeft)) {
    return Promise.resolve();
  }

  const leftRounded = Math.max(0, Math.floor(requestsLeft));
  const usedRounded = Math.max(0, GOLF_API_MONTHLY_LIMIT - leftRounded);
  const now = new Date();
  const monthKey = getUsageMonthKey(now);

  return db.doc(GOLF_API_USAGE_DOC).set({
    provider: 'golfapi.io',
    monthlyLimit: GOLF_API_MONTHLY_LIMIT,
    requestsLeft: leftRounded,
    requestsUsed: usedRounded,
    monthKey,
    updatedAt: now.toISOString(),
    lastSource: meta.source || null,
    lastPath: meta.path || null,
    lastMode: meta.mode || null,
    lastMeta: meta.extra || null,
  }, { merge: true }).catch((err) => console.warn('Golf API usage write failed:', err.message));
}

async function fetchJson(path, apiKey) {
  const response = await fetch(`${GOLFAPI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpsError('unavailable', `Golf API error: ${response.status}`);
  const json = await response.json();
  await persistGolfApiUsageSnapshot(json, { path, source: 'fetchJson' });
  return json;
}

function normaliseCourseSummary(raw) {
  return {
    id: String(raw?.courseID ?? raw?.CourseID ?? raw?.id ?? ''),
    name: raw?.courseName ?? raw?.CourseName ?? raw?.clubName ?? raw?.ClubName ?? raw?.name ?? '',
    clubName: raw?.clubName ?? raw?.ClubName ?? raw?.name ?? '',
    city: raw?.city ?? raw?.City ?? '',
    state: raw?.state ?? raw?.State ?? '',
    country: raw?.country ?? raw?.Country ?? '',
    latitude: Number(raw?.latitude ?? raw?.Latitude ?? 0),
    longitude: Number(raw?.longitude ?? raw?.Longitude ?? 0),
    holes: Number(raw?.numHoles ?? raw?.NumberOfHoles ?? raw?.holes ?? 18),
    distance: raw?.distance != null ? Number(raw.distance) : undefined,
  };
}

async function getSearchCache(docId) {
  try {
    const snap = await db.collection(SEARCH_CACHE_COLLECTION).doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    const cachedAt = Date.parse(data?.cachedAt || '');
    if (!Number.isFinite(cachedAt) || (Date.now() - cachedAt) > SEARCH_CACHE_TTL_MS) {
      return null;
    }
    return Array.isArray(data?.results) ? data.results : null;
  } catch (err) {
    console.warn('Search cache read failed:', err.message);
    return null;
  }
}

function saveSearchCache(docId, mode, params, results) {
  if (!Array.isArray(results) || results.length === 0) {
    return Promise.resolve();
  }
  return db.collection(SEARCH_CACHE_COLLECTION).doc(docId).set({
    mode,
    params,
    results,
    cachedAt: new Date().toISOString(),
  }, { merge: true }).catch((err) => console.warn('Search cache write failed:', err.message));
}

async function fetchCourseBundleById(apiId, apiKey) {
  const [courseRaw, coordinatesRaw] = await Promise.all([
    fetchJson(`/courses/${apiId}`, apiKey),
    fetchJson(`/coordinates/${apiId}`, apiKey),
  ]);
  if (!courseRaw || !coordinatesRaw) return null;

  const holes = normaliseHoles(courseRaw, coordinatesRaw);
  return {
    id: String(courseRaw.courseID ?? apiId),
    courseId: String(courseRaw.courseID ?? apiId),
    name: courseRaw.courseName ?? '',
    courseName: courseRaw.courseName ?? '',
    clubName: courseRaw.clubName ?? '',
    city: courseRaw.city ?? '',
    state: courseRaw.state ?? '',
    country: courseRaw.country ?? '',
    latitude: Number(courseRaw.latitude),
    longitude: Number(courseRaw.longitude),
    holes,
  };
}

async function searchByName(courseName, lat, lng, apiKey) {
  // Build a list of name candidates to try: full name, then progressively stripped
  const suffixes = [' golf course', ' golf club', ' country club', ' golf', ' club', ' course'];
  const base = courseName.trim().toLowerCase();
  const candidates = [courseName.trim()];
  for (const suffix of suffixes) {
    if (base.endsWith(suffix)) {
      candidates.push(courseName.trim().slice(0, -suffix.length).trim());
      break;
    }
  }

  for (const name of candidates) {
    const params = new URLSearchParams({ name });
    if (lat != null && lng != null) {
      params.set('lat', String(lat));
      params.set('lng', String(lng));
      params.set('measureUnit', 'mi');
    }
    console.log(`Name search attempt: "${name}" lat=${lat} lng=${lng}`);
    const response = await fetch(`${GOLFAPI_BASE}/courses?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      console.warn(`Name search HTTP ${response.status} for "${name}"`);
      continue;
    }
    const json = await response.json();
    await persistGolfApiUsageSnapshot(json, {
      path: '/courses',
      source: 'searchByName',
      mode: 'name',
      extra: { query: name },
    });
    const courses = Array.isArray(json?.courses) ? json.courses : [];
    console.log(`Name search "${name}" returned ${courses.length} courses`);
    if (courses.length > 0) {
      return courses[0];
    }
  }
  return null;
}

async function searchCoursesByQuery(query, lat, lng, apiKey) {
  const suffixes = [' golf course', ' golf club', ' public golf club', ' public golf', ' country club', ' golf', ' club', ' course'];
  const trimmed = String(query || '').trim();
  const lower = trimmed.toLowerCase();
  const variants = [trimmed];

  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) {
      const stripped = trimmed.slice(0, -suffix.length).trim();
      if (stripped) variants.push(stripped);
      break;
    }
  }

  const deduped = new Map();
  for (const variant of [...new Set(variants)]) {
    const params = new URLSearchParams({ name: variant });
    if (lat != null && lng != null) {
      params.set('lat', String(lat));
      params.set('lng', String(lng));
      params.set('measureUnit', 'mi');
    }
    const json = await fetchJson(`/clubs?${params.toString()}`, apiKey);
    const clubs = Array.isArray(json?.clubs) ? json.clubs : [];
    const results = clubs.flatMap((club) => {
      const clubCourses = Array.isArray(club?.courses) ? club.courses : [];
      return clubCourses
        .filter((course) => Number(course?.hasGPS ?? 1) !== 0)
        .map((course) =>
          normaliseCourseSummary({
            ...course,
            clubName: club?.clubName ?? '',
            city: club?.city ?? '',
            state: club?.state ?? '',
            country: club?.country ?? '',
            distance: club?.distance,
            latitude: lat,
            longitude: lng,
            name: course?.courseName ?? club?.clubName ?? '',
          })
        );
    });
    for (const result of results) {
      if (result?.id && !deduped.has(result.id)) {
        deduped.set(result.id, result);
      }
    }
  }

  const baseTokens = trimmed
    .toLowerCase()
    .replace(/\b(golf|course|club|public|country)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const scoreCourse = (course) => {
    const haystack = `${course.name} ${course.clubName || ''} ${course.city || ''} ${course.state || ''}`.toLowerCase();
    let score = 0;
    for (const token of baseTokens) {
      if (haystack.includes(token)) score += 50;
    }
    if (baseTokens.length && haystack.includes(baseTokens.join(' '))) score += 120;
    if (Number.isFinite(course.distance)) score += Math.max(0, 500 - Math.round(course.distance * 4));
    return score;
  };

  return [...deduped.values()].sort((a, b) => scoreCourse(b) - scoreCourse(a));
}

async function searchNearbyCourses(lat, lng, city, state, country, apiKey) {
  const normalizedCountry = normalizeCountryParam(country);
  const normalizedCity = String(city || '').trim();
  const attempts = [
    { city: normalizedCity, country: normalizedCountry },
    { city: '', country: normalizedCountry },
    { city: '', country: '' },
  ];

  for (const attempt of attempts) {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      measureUnit: 'mi',
    });
    if (attempt.city) params.set('city', attempt.city);
    if (attempt.country) params.set('country', attempt.country);

    const json = await fetchJson(`/clubs?${params.toString()}`, apiKey);
    const clubs = Array.isArray(json?.clubs) ? json.clubs : [];
    const results = clubs.flatMap((club) => {
      const clubCourses = Array.isArray(club?.courses) ? club.courses : [];
      return clubCourses
        .filter((course) => Number(course?.hasGPS ?? 1) !== 0)
        .map((course) =>
          normaliseCourseSummary({
            ...course,
            clubName: club?.clubName ?? '',
            city: club?.city ?? '',
            state: club?.state ?? '',
            country: club?.country ?? '',
            distance: club?.distance,
            latitude: lat,
            longitude: lng,
            name: course?.courseName ?? club?.clubName ?? '',
          })
        );
    });

    if (results.length > 0) {
      return results.filter((course, index, array) => array.findIndex((item) => item.id === course.id) === index);
    }
  }

  return [];
}

exports.getCourseHoles = onCall(
  { cors: true, secrets: ['GOLFAPI_IO_TOKEN'] },
  async (request) => {
    const { courseId, courseName, latitude, longitude } = request.data ?? {};

    if (!courseId) {
      throw new HttpsError('invalid-argument', 'courseId required');
    }

    const apiId = String(courseId).startsWith('golfapiio_')
      ? courseId.slice('golfapiio_'.length)
      : courseId;

    // 1. Firestore cache
    try {
      const cached = await db.collection(CACHE_COLLECTION).doc(apiId).get();
      if (cached.exists) {
        const data = cached.data();
        console.log(`Cache hit for ${apiId}`);
        const cachedCourse = data?.data ?? {
          id: String(apiId),
          courseId: String(apiId),
          name: data?.courseName ?? '',
          courseName: data?.courseName ?? '',
          holes: data?.holes ?? [],
        };
        return { ...cachedCourse, courseId, cached: true };
      }
    } catch (err) {
      console.warn('Firestore cache read failed:', err.message);
    }

    const apiKey = process.env.GOLFAPI_IO_TOKEN;
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'API key not configured');
    }

    let raw = null;
    let resolvedApiId = apiId;

    // 1b. Check courseMappings for a previously resolved golfapi.io courseID
    if (courseName) {
      try {
        const mappingDocId = (courseName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (mappingDocId) {
          const mappingSnap = await db.collection('courseMappings').doc(mappingDocId).get();
          if (mappingSnap.exists) {
            const mapping = mappingSnap.data();
            if (mapping?.golfApiIoCourseId) {
              console.log(`Mapping cache hit: "${courseName}" -> "${mapping.golfApiIoCourseId}"`);
              resolvedApiId = mapping.golfApiIoCourseId;
              // Check GPS cache with the resolved ID
              const cachedMapped = await db.collection(CACHE_COLLECTION).doc(resolvedApiId).get();
              if (cachedMapped.exists) {
                const data = cachedMapped.data();
                const cachedCourse = data?.data ?? {
                  id: String(resolvedApiId),
                  courseId: String(resolvedApiId),
                  name: data?.courseName ?? '',
                  courseName: data?.courseName ?? '',
                  holes: data?.holes ?? [],
                };
                return { ...cachedCourse, courseId, cached: true };
              }
            }
          }
        }
      } catch (_) {}
    }

    // 2. Try direct ID lookup (uses resolvedApiId which may come from mapping cache)
    try {
      raw = await fetchCourseBundleById(resolvedApiId, apiKey);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.warn('Direct ID lookup error:', err.message);
    }

    // 3. If ID lookup failed and we have a course name, search by name
    if (!raw && courseName) {
      console.log(`ID lookup failed for "${apiId}", trying name search: "${courseName}"`);
      try {
        const found = await searchByName(courseName, latitude, longitude, apiKey);
        if (found) {
          resolvedApiId = String(found.courseID ?? found.CourseID ?? found.id ?? apiId);
          console.log(`Name search resolved "${courseName}" -> courseID "${resolvedApiId}"`);
          // Save the mapping so future lookups skip the search API
          const mappingDocId = (courseName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (mappingDocId) {
            db.collection('courseMappings').doc(mappingDocId).set({
              osmName: courseName,
              golfApiIoCourseId: resolvedApiId,
              golfApiIoClubName: found.clubName ?? found.ClubName ?? found.name ?? '',
              resolvedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});
          }
          // Check cache again with resolved ID
          try {
            const cachedResolved = await db.collection(CACHE_COLLECTION).doc(resolvedApiId).get();
            if (cachedResolved.exists) {
              const data = cachedResolved.data();
              const cachedCourse = data?.data ?? {
                id: String(resolvedApiId),
                courseId: String(resolvedApiId),
                name: data?.courseName ?? '',
                courseName: data?.courseName ?? '',
                holes: data?.holes ?? [],
              };
              return { ...cachedCourse, courseId, cached: true };
            }
          } catch (_) {}
          raw = await fetchCourseBundleById(resolvedApiId, apiKey);
        }
      } catch (err) {
        console.warn('Name search error:', err.message);
      }
    }

    if (!raw) {
      throw new HttpsError('not-found', 'not_found');
    }

    const resolvedName = raw.name ?? raw.courseName ?? courseName ?? '';

    db.collection(CACHE_COLLECTION).doc(resolvedApiId).set({
      courseId: resolvedApiId,
      courseName: resolvedName,
      data: raw,
      cachedAt: new Date().toISOString(),
    }).catch((err) => console.warn('Firestore cache write failed:', err.message));

    return { ...raw, courseId, courseName: resolvedName, cached: false };
  }
);

exports.searchGolfCourses = onCall(
  { cors: true, secrets: ['GOLFAPI_IO_TOKEN'] },
  async (request) => {
    const {
      mode = 'name',
      query,
      latitude,
      longitude,
      city,
      state,
      country,
      radiusMiles,
      searchAll,
    } = request.data ?? {};

    const apiKey = process.env.GOLFAPI_IO_TOKEN;
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'API key not configured');
    }

    let cacheId = '';
    if (mode === 'nearby') {
      if (latitude == null || longitude == null) {
        throw new HttpsError('invalid-argument', 'latitude and longitude required');
      }
      cacheId = `${SEARCH_CACHE_VERSION}_nearby_${slugify(city)}_${slugify(state)}_${slugify(country || 'usa')}_${roundCoord(latitude)}_${roundCoord(longitude)}_${toNumber(radiusMiles) || 50}`;
    } else {
      if (!String(query || '').trim()) {
        throw new HttpsError('invalid-argument', 'query required');
      }
      cacheId = `${SEARCH_CACHE_VERSION}_name_${slugify(query)}_${roundCoord(latitude)}_${roundCoord(longitude)}_${searchAll ? 'all' : `r${toNumber(radiusMiles) || 0}`}`;
    }

    const cached = await getSearchCache(cacheId);
    if (cached) {
      return { results: cached, cached: true };
    }

    let results = [];
    let fallbackAvailable = false;
    if (mode === 'nearby') {
      results = await searchNearbyCourses(latitude, longitude, city, state, country || 'USA', apiKey);
      const maxDistance = toNumber(radiusMiles) || 50;
      results = results.filter((course) => !Number.isFinite(course.distance) || course.distance <= maxDistance);
    } else {
      results = await searchCoursesByQuery(query, latitude, longitude, apiKey);
      const maxDistance = toNumber(radiusMiles);
      if (!searchAll && maxDistance > 0) {
        const withDistance = results.filter((course) => Number.isFinite(course.distance));
        if (withDistance.length > 0) {
          const narrowed = results.filter((course) => !Number.isFinite(course.distance) || course.distance <= maxDistance);
          fallbackAvailable = narrowed.length === 0 && results.length > 0;
          results = narrowed;
        }
      }
    }

    saveSearchCache(cacheId, mode, { query, latitude, longitude, city, state, country, radiusMiles, searchAll }, results);
    return { results, cached: false, fallbackAvailable, totalResults: results.length };
  }
);

exports.getGolfApiUsage = onCall(
  { cors: true },
  async () => {
    const snap = await db.doc(GOLF_API_USAGE_DOC).get();
    if (!snap.exists) {
      return {
        provider: 'golfapi.io',
        monthlyLimit: GOLF_API_MONTHLY_LIMIT,
        requestsLeft: null,
        requestsUsed: null,
        monthKey: getUsageMonthKey(),
        updatedAt: null,
      };
    }
    return snap.data();
  }
);
