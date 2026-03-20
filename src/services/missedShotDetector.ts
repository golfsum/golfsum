export interface MissedShotCoords {
  lat: number;
  lng: number;
  altitudeFeet?: number | null;
}

export interface MissedShotEntry {
  hole: number;
  club: string;
  startCoords?: MissedShotCoords | null;
}

export interface ClubAverageLookup {
  gpsAvgTotal?: number | null;
  manualYards?: number | null;
}

export interface DistanceJumpResult {
  type: 'distance_jump' | 'club_mismatch';
  gpsDistance: number;
  reason: 'hard_limit' | 'personal_limit' | 'club_mismatch';
  driverAvg?: number;
  club?: string;
  clubAvg?: number;
}

export interface ShotCountResult {
  type: 'missing_tee_shot' | 'low_shot_count';
  hole: number;
  par: number;
  fullSwingsLogged?: number;
  score: number;
}

const SHORT_PAR4_THRESHOLD = 280;

function distanceBetweenYards(a: MissedShotCoords, b: MissedShotCoords): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const calc =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  const meters = R * (2 * Math.atan2(Math.sqrt(calc), Math.sqrt(1 - calc)));
  return meters * 1.09361;
}

function normalizeClubKey(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

export function checkDistanceJump(
  newShot: MissedShotEntry,
  prevShot: MissedShotEntry | null | undefined,
  clubAverages: Record<string, ClubAverageLookup>,
  driverAvg?: number | null
): DistanceJumpResult | null {
  if (!prevShot || !newShot.startCoords || !prevShot.startCoords) return null;
  if (prevShot.hole !== newShot.hole) return null;

  const gpsDistance = Math.round(distanceBetweenYards(prevShot.startCoords, newShot.startCoords));

  if (gpsDistance > 350) {
    return { type: 'distance_jump', gpsDistance, reason: 'hard_limit' };
  }

  if (driverAvg && gpsDistance > driverAvg + 70) {
    return { type: 'distance_jump', gpsDistance, reason: 'personal_limit', driverAvg };
  }

  const prevClub = normalizeClubKey(prevShot.club);
  const prevClubAvg = clubAverages[prevClub]?.gpsAvgTotal || clubAverages[prevClub]?.manualYards || null;
  if (prevClubAvg && gpsDistance > prevClubAvg + 80) {
    return {
      type: 'club_mismatch',
      gpsDistance,
      club: prevShot.club,
      clubAvg: prevClubAvg,
      reason: 'club_mismatch',
    };
  }

  return null;
}

export function isShortPar4(hole: { par: number; teeYardage?: number | null }): boolean {
  return hole.par === 4 && Number(hole.teeYardage) > 0 && Number(hole.teeYardage) <= SHORT_PAR4_THRESHOLD;
}

export function checkShotCount(
  hole: { number: number; par: number; teeYardage?: number | null },
  shots: Array<{ club?: string | null; hole?: number | null }>,
  score: number
): ShotCountResult | null {
  const holeShots = shots.filter((shot) => Number(shot.hole) === hole.number);
  const fullSwings = holeShots.filter((shot) => normalizeClubKey(shot.club) !== 'putter');
  const fullCount = fullSwings.length;

  if (hole.par === 3) {
    if (fullCount === 0 && score > 0) {
      return { type: 'missing_tee_shot', hole: hole.number, par: 3, score };
    }
    return null;
  }

  if (isShortPar4(hole)) return null;

  if (hole.par === 4 && score >= 3 && fullCount < 2) {
    return { type: 'low_shot_count', hole: hole.number, par: 4, fullSwingsLogged: fullCount, score };
  }

  if (hole.par === 5 && score >= 4 && fullCount < 3) {
    return { type: 'low_shot_count', hole: hole.number, par: 5, fullSwingsLogged: fullCount, score };
  }

  return null;
}

export function getMidpoint(coordsA: MissedShotCoords, coordsB: MissedShotCoords): MissedShotCoords {
  return {
    lat: (coordsA.lat + coordsB.lat) / 2,
    lng: (coordsA.lng + coordsB.lng) / 2,
    altitudeFeet:
      typeof coordsA.altitudeFeet === 'number' && typeof coordsB.altitudeFeet === 'number'
        ? (coordsA.altitudeFeet + coordsB.altitudeFeet) / 2
        : null,
  };
}
