import { haversineYards } from './haversine';

type ShotLike = {
  num?: number | null;
  club?: string | null;
  abbr?: string | null;
  lie?: string | null;
  /** When set, this stroke is counted as a putt regardless of club label. */
  shotKind?: 'full' | 'putt' | null;
  actualYards?: number | null;
  playingYards?: number | null;
  from?: { lat: number; lng: number } | null;
  to?: { lat: number; lng: number } | null;
};

type HoleSummaryLike = {
  firstPuttDistance?: number | null;
  putts?: number | null;
};

function isPuttShot(shot: ShotLike): boolean {
  if (shot.shotKind === 'putt') return true;
  const club = String(shot.club || shot.abbr || '').trim().toLowerCase();
  if (club.includes('putt') || club === 'pt') return true;
  return shot.lie === 'Green';
}

function shotDistanceYards(shot: ShotLike): number | null {
  const actualYards = shot.actualYards;
  if (typeof actualYards === 'number' && Number.isFinite(actualYards) && actualYards > 0) {
    return Math.round(actualYards);
  }
  const playingYards = shot.playingYards;
  if (typeof playingYards === 'number' && Number.isFinite(playingYards) && playingYards > 0) {
    return Math.round(playingYards);
  }
  const from = shot.from;
  const to = shot.to;
  if (
    from &&
    to &&
    typeof from.lat === 'number' &&
    typeof from.lng === 'number' &&
    typeof to.lat === 'number' &&
    typeof to.lng === 'number'
  ) {
    const yards = haversineYards(from.lat, from.lng, to.lat, to.lng);
    return typeof yards === 'number' && Number.isFinite(yards) && yards > 0 ? Math.round(yards) : null;
  }
  return null;
}

function shotSegmentFeet(from: ShotLike['from'] | null | undefined, to: ShotLike['to'] | null | undefined): number | null {
  if (
    !from ||
    !to ||
    typeof from.lat !== 'number' ||
    typeof from.lng !== 'number' ||
    typeof to.lat !== 'number' ||
    typeof to.lng !== 'number'
  ) {
    return null;
  }

  const yards = haversineYards(from.lat, from.lng, to.lat, to.lng);
  if (typeof yards !== 'number' || !Number.isFinite(yards) || yards <= 0) return null;
  return Math.round(yards * 3);
}

export function deriveGreenSummary(shots: ShotLike[] = [], summary: HoleSummaryLike = {}) {
  const sortedShots = [...shots]
    .map((shot, index) => ({ shot, index }))
    .sort((left, right) => {
      const leftNum = Number(left.shot.num);
      const rightNum = Number(right.shot.num);
      const leftSort = Number.isFinite(leftNum) ? leftNum : left.index + 1;
      const rightSort = Number.isFinite(rightNum) ? rightNum : right.index + 1;
      return leftSort - rightSort;
    })
    .map((entry) => entry.shot);

  const firstPuttIndex = sortedShots.findIndex((shot) => isPuttShot(shot));
  const puttShots = firstPuttIndex >= 0 ? sortedShots.slice(firstPuttIndex) : [];
  const puttDistances = puttShots.map((shot, index) => {
    const directDistance = shotSegmentFeet(shot.from, shot.to);
    if (directDistance != null) return directDistance;

    const previousShot = index === 0
      ? sortedShots[firstPuttIndex - 1]
      : puttShots[index - 1];

    const previousPoint = previousShot?.to || previousShot?.from || null;
    const currentPoint = shot.from || shot.to || null;
    const fallbackDistance = shotSegmentFeet(previousPoint, currentPoint);
    if (fallbackDistance != null) return fallbackDistance;

    const shotDistance = shotDistanceYards(shot);
    return shotDistance != null ? Math.round(shotDistance * 3) : null;
  }).filter((value): value is number => Number.isFinite(value));

  return {
    putts: typeof summary.putts === 'number'
      ? summary.putts
      : (puttShots.length > 0 ? puttShots.length : null),
    firstPuttDistance: typeof summary.firstPuttDistance === 'number'
      ? summary.firstPuttDistance
      : (puttDistances.length > 0 ? puttDistances[0] : null),
    puttDistances,
    firstPuttIndex,
  };
}

export function formatPuttDistances(puttDistances: number[]): string | null {
  if (!Array.isArray(puttDistances) || puttDistances.length === 0) return null;
  const suffixFor = (value: number) => {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return 'th';
    switch (value % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  return puttDistances
    .map((distance, index) => `${index + 1}${suffixFor(index + 1)} ${distance} ft`)
    .join(' • ');
}
