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
  fairwayHit?: boolean | 'right' | 'left' | 'short' | 'long' | null;
  girAchieved?: boolean | null;
};

/**
 * Infer tee-shot result from the second shot's lie (i.e., where the tee shot
 * landed). Par-3 holes return null — FIR is not tracked on par-3.
 * Returns true/'left'/'right'/false for other pars, or null if undetermined.
 */
function deriveFairwayHit(sortedShots: ShotLike[], par?: number | null): boolean | 'left' | 'right' | null {
  if (par === 3) return null;
  if (!sortedShots.length) return null;
  // Tee shot = shot #1. Second shot's lie reveals where the ball landed.
  const secondShot = sortedShots[1];
  const lie = String(secondShot?.lie || '').toLowerCase();
  if (!lie) return null;
  if (lie.includes('fairway') || lie === 'green') return true;
  if (lie.includes('left rough') || lie === 'left') return 'left';
  if (lie.includes('right rough') || lie === 'right') return 'right';
  if (lie.includes('tee box') || lie === 'tee') return null; // still on tee, can't infer
  // Trees / Sand / Water / Off Course / etc. — counts as a miss with no direction inferred.
  return false;
}

/**
 * GIR = reached the green in (par − 2) strokes or fewer. We determine this
 * by finding the first putt-shot (shotKind='putt' or lie='Green') and counting
 * the non-putt strokes before it. Returns null when undetermined (not enough
 * shots logged).
 */
function deriveGirAchieved(sortedShots: ShotLike[], firstPuttIndex: number, par?: number | null): boolean | null {
  if (!par || par < 3) return null;
  const regulationStrokes = Math.max(1, par - 2);
  if (firstPuttIndex >= 0) {
    // firstPuttIndex === N means N non-putt shots preceded the first putt.
    return firstPuttIndex <= regulationStrokes;
  }
  // No putt logged yet — only conclude false if we've already played past regulation.
  if (sortedShots.length > regulationStrokes) return false;
  return null;
}

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

export function deriveGreenSummary(shots: ShotLike[] = [], summary: HoleSummaryLike = {}, par?: number | null) {
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

  const derivedFairway = deriveFairwayHit(sortedShots, par);
  const derivedGir = deriveGirAchieved(sortedShots, firstPuttIndex, par);

  return {
    putts: typeof summary.putts === 'number'
      ? summary.putts
      : (puttShots.length > 0 ? puttShots.length : null),
    firstPuttDistance: typeof summary.firstPuttDistance === 'number'
      ? summary.firstPuttDistance
      : (puttDistances.length > 0 ? puttDistances[0] : null),
    puttDistances,
    firstPuttIndex,
    // Auto-derived stats from the shot log. Summaries take precedence when set
    // (user overrides), otherwise these become the effective values for
    // scorecard display and for persistence when saving the round.
    fairwayHit: summary.fairwayHit ?? derivedFairway ?? null,
    girAchieved: summary.girAchieved ?? derivedGir,
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
