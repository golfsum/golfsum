const EARTH_RADIUS_M = 6371000;
const METERS_TO_YARDS = 1.0936132983377078;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function haversineYards(lat1, lon1, lat2, lon2) {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return null;
  }

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_M * c * METERS_TO_YARDS);
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return 0;
  }
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);

  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x =
    Math.cos(rLat1) * Math.sin(rLat2) -
    Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Project a coordinate by a bearing and distance (yards).
 * Small-distance approximation: accurate enough for green-edge offsets.
 */
export function projectPointYards(lat, lon, bearing, distanceYards) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(bearing) ||
    !Number.isFinite(distanceYards)
  ) {
    return null;
  }
  const yardsPerDegreeLat = 121440;
  const r = toRad(bearing);
  const dLat = Math.cos(r) * distanceYards;
  const dLon = Math.sin(r) * distanceYards;
  const nextLat = lat + (dLat / yardsPerDegreeLat);
  const nextLon = lon + (dLon / (yardsPerDegreeLat * Math.cos(toRad(lat))));
  return { lat: nextLat, lng: nextLon };
}

