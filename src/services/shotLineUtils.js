/**
 * shotLineUtils.js
 * Pure geometry functions for the fairway shot line and lay-up marker system.
 * No React dependencies — safe to unit test in isolation.
 */

/** Haversine distance in meters between two [lng, lat] coordinates. */
function haversineMeters([lng1, lat1], [lng2, lat2]) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance in yards between two [lng, lat] coordinates. */
export function distanceYardsBetween(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
  return haversineMeters(coord1, coord2) / 0.9144;
}

/**
 * Walk the LineString from the tee end and return the point at targetYards.
 * @param {Array<[number,number]>} coordinates  [lng,lat] pairs, tee-first
 * @param {number} targetYards
 * @returns {[number,number]}
 */
export function pointAtDistanceAlongLine(coordinates, targetYards) {
  const targetMeters = targetYards * 0.9144;
  let accumulated = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const from = coordinates[i];
    const to = coordinates[i + 1];
    const segDist = haversineMeters(from, to);

    if (accumulated + segDist >= targetMeters) {
      const remaining = targetMeters - accumulated;
      const fraction = remaining / segDist;
      return [
        from[0] + (to[0] - from[0]) * fraction,
        from[1] + (to[1] - from[1]) * fraction,
      ];
    }
    accumulated += segDist;
  }
  // Target beyond green end — clamp to green
  return coordinates[coordinates.length - 1];
}

/**
 * Walk the LineString from the green end and return the point at targetYards
 * measured from the green (i.e. working backward from the flag).
 * @param {Array<[number,number]>} coordinates  [lng,lat] pairs, tee-first
 * @param {number} targetYards
 * @returns {[number,number]}
 */
export function pointAtDistanceFromEnd(coordinates, targetYards) {
  const targetMeters = targetYards * 0.9144;
  const reversed = [...coordinates].reverse();
  let accumulated = 0;

  for (let i = 0; i < reversed.length - 1; i++) {
    const from = reversed[i];
    const to = reversed[i + 1];
    const segDist = haversineMeters(from, to);

    if (accumulated + segDist >= targetMeters) {
      const remaining = targetMeters - accumulated;
      const fraction = remaining / segDist;
      return [
        from[0] + (to[0] - from[0]) * fraction,
        from[1] + (to[1] - from[1]) * fraction,
      ];
    }
    accumulated += segDist;
  }
  // Target beyond tee end — clamp to tee
  return reversed[reversed.length - 1];
}

/** Midpoint of the entire line (for par 3 distance badge). */
export function lineMidpoint(coordinates) {
  if (!coordinates || coordinates.length < 2) return coordinates?.[0] ?? null;
  const totalMeters = coordinates.reduce((acc, _, i) => {
    if (i === 0) return 0;
    return acc + haversineMeters(coordinates[i - 1], coordinates[i]);
  }, 0);
  return pointAtDistanceAlongLine(coordinates, (totalMeters / 0.9144) / 2);
}

/** Nearest point on a single line segment to a given point. */
function nearestPointOnSegment(point, segStart, segEnd) {
  const dx = segEnd[0] - segStart[0];
  const dy = segEnd[1] - segStart[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return segStart;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / len2,
    ),
  );
  return [segStart[0] + t * dx, segStart[1] + t * dy];
}

/** Snap a [lng,lat] drag position to the nearest point on the LineString. */
export function snapToLine(dragCoords, lineCoordinates) {
  let minDist = Infinity;
  let closest = lineCoordinates[0];

  for (let i = 0; i < lineCoordinates.length - 1; i++) {
    const p = nearestPointOnSegment(dragCoords, lineCoordinates[i], lineCoordinates[i + 1]);
    const d = haversineMeters(dragCoords, p);
    if (d < minDist) {
      minDist = d;
      closest = p;
    }
  }
  return closest;
}

// ---------------------------------------------------------------------------
// Club / distance helpers
// ---------------------------------------------------------------------------

/** Normalise club keys for consistent look-ups. */
function normaliseKey(key) {
  return String(key || '').trim().toLowerCase();
}

/**
 * Best approach distance from the green in Scoring mode.
 * Without GIR data we use the player's shortest-range clubs (wedges/short irons)
 * to find the distance they're most comfortable hitting into greens from.
 * @param {{ [club: string]: number }} userClubs  club → avg carry yards
 * @returns {{ distanceFromGreen: number, club: string|null }}
 */
export function getBestApproachDistance(userClubs) {
  if (!userClubs) return { distanceFromGreen: 100, club: null };

  // Priority order: wedges first, then short irons
  const priorityOrder = ['pw', 'gw', 'aw', 'sw', 'lw', '52°', '56°', '60°', '9i', '8i'];

  const normalised = Object.fromEntries(
    Object.entries(userClubs).map(([k, v]) => [normaliseKey(k), Number(v)]),
  );

  for (const club of priorityOrder) {
    const dist = normalised[club];
    if (Number.isFinite(dist) && dist > 0) {
      return { distanceFromGreen: Math.round(dist), club };
    }
  }

  // Fallback: 100 yards
  return { distanceFromGreen: 100, club: null };
}

/**
 * Safe mode lay-up distance from the tee.
 * Conservative: 80% of driver average to maximise fairway hits.
 * @param {{ [club: string]: number }} userClubs
 * @returns {number} yards from tee
 */
export function getSafeModeDistance(userClubs) {
  if (!userClubs) return 180;

  const normalised = Object.fromEntries(
    Object.entries(userClubs).map(([k, v]) => [normaliseKey(k), Number(v)]),
  );

  const driverAvg = normalised['dr'] ?? normalised['driver'] ?? 0;
  if (Number.isFinite(driverAvg) && driverAvg > 0) {
    return Math.round(driverAvg * 0.8);
  }
  return 180;
}

/**
 * Which club in the bag is closest to a target distance from the tee?
 * Used to update the tee club suggestion when mode toggles or marker is dragged.
 * @param {number} markerDistFromTee
 * @param {{ [club: string]: number }} userClubs
 * @returns {string|null}
 */
export function getSuggestedTeeClub(markerDistFromTee, userClubs) {
  if (!userClubs || !Number.isFinite(markerDistFromTee)) return null;

  let bestClub = null;
  let bestDiff = Infinity;

  for (const [club, yardsRaw] of Object.entries(userClubs)) {
    const avg = Number(yardsRaw);
    if (!Number.isFinite(avg) || avg <= 0) continue;
    const diff = Math.abs(avg - markerDistFromTee);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestClub = club;
    }
  }
  return bestClub;
}

/**
 * For par 5 — can the player reach the green in 2 from Marker 1?
 * Checks the longest available fairway wood / hybrid / long iron.
 * @param {[number,number]} marker1Coords  [lng,lat]
 * @param {[number,number]} greenCoords    [lng,lat]
 * @param {{ [club: string]: number }} userClubs
 * @returns {{ reachable: boolean, club: string|null, avgDist: number }}
 */
export function getPar5Marker2Info(marker1Coords, greenCoords, userClubs) {
  if (!marker1Coords || !greenCoords || !userClubs) {
    return { reachable: false, club: null, avgDist: 0 };
  }

  const distToGreen = distanceYardsBetween(marker1Coords, greenCoords);

  const longClubOrder = ['3w', '5w', '7w', '3h', '4h', '5h', '3i', '4i', '5i'];
  const normalised = Object.fromEntries(
    Object.entries(userClubs).map(([k, v]) => [normaliseKey(k), Number(v)]),
  );

  let bestClub = null;
  let bestAvg = 0;
  for (const club of longClubOrder) {
    const avg = normalised[club];
    if (Number.isFinite(avg) && avg > bestAvg) {
      bestAvg = avg;
      bestClub = club;
    }
  }

  // 20-yard buffer — close enough to be worthwhile trying to reach
  const reachable = bestAvg > 0 && bestAvg >= distToGreen - 20;
  return { reachable, club: bestClub, avgDist: bestAvg };
}

/**
 * Build the shot line coordinate array.
 * Currently uses direct tee-to-green line.
 * If the hole object gains a `fairwayCenterline` field in the future, this
 * function will automatically use it to produce a curved dogleg line.
 *
 * @param {{ Latitude: number, Longitude: number }} teePoi
 * @param {{ Latitude: number, Longitude: number }} greenPoi
 * @param {Array<{ lat: number, lng: number }>} [fairwayCenterline]
 * @returns {Array<[number,number]>}  [lng,lat] pairs, tee-first
 */
export function buildShotLineCoords(teePoi, greenPoi, fairwayCenterline) {
  if (!teePoi || !greenPoi) return null;

  const teeCoord = [teePoi.Longitude, teePoi.Latitude];
  const greenCoord = [greenPoi.Longitude, greenPoi.Latitude];

  if (Array.isArray(fairwayCenterline) && fairwayCenterline.length > 0) {
    return [
      teeCoord,
      ...fairwayCenterline.map((p) => [p.lng, p.lat]),
      greenCoord,
    ];
  }

  return [teeCoord, greenCoord];
}
