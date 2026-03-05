/**
 * Analytics Calculations Service
 * 
 * CORE PRINCIPLE:
 * "GolfSum never contradicts the golfer unless the data is strong enough to earn it."
 * 
 * This service handles:
 * - Stat calculations with confidence states
 * - Personal bests tracking
 * - Insight generation with gating
 */

import { 
  SavedRound, 
  StatState, 
  StatWithConfidence, 
  AverageStats, 
  PersonalBests, 
  PersonalBest,
  Insight,
  InsightType,
  InsightConfidence,
  INSIGHT_THRESHOLDS,
  TypicalValue,
  RollingAverage
} from '../types';
import { calculateHandicapIndex as calculateWHSHandicapIndex } from './whsCalculations';
import { isRoundStatEnabled } from '../utils/statPreferences';
import { getExpectedFairways, getExpectedGIR, getExpectedPutts } from '../utils/averagesAnalytics';
import { generateCoachingInsights } from './coachingInsights';
import { isFairwayHit as _isFairwayHit, isGreenHit as _isGreenHit } from '../utils/statChecks';
import { resolveHandicap } from '../utils/handicap';

// ============================================================================
// ADVANCED STATISTICAL METHODS
// ============================================================================

/**
 * Calculate trimmed mean (excludes top and bottom 10%)
 * This gives a "typical" value that removes outliers
 */
function calculateTrimmedMean(values: number[]): number {
  if (values.length === 0) return 0;
  if (values.length < 8) return values.reduce((a, b) => a + b, 0) / values.length; // Too few for trimming
  
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * 0.10);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

/**
 * Calculate typical value with range
 * Returns trimmed mean, range, and simple mean
 */
function calculateTypicalValue(values: number[]): TypicalValue {
  if (values.length === 0) {
    return { typical: 0, range: { min: 0, max: 0 }, mean: 0 };
  }
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const typical = calculateTrimmedMean(values);
  const sorted = [...values].sort((a, b) => a - b);
  
  // Use 10th-90th percentile for range (more stable than min/max)
  const p10Index = Math.floor(sorted.length * 0.10);
  const p90Index = Math.floor(sorted.length * 0.90);
  
  return {
    typical,
    range: {
      min: sorted[p10Index] || sorted[0],
      max: sorted[p90Index] || sorted[sorted.length - 1]
    },
    mean
  };
}

/**
 * Calculate rolling averages (last 5, season, career)
 */
function calculateRollingAverage(rounds: SavedRound[], getValue: (r: SavedRound) => number): RollingAverage {
  const sortedRounds = [...rounds].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const allValues = sortedRounds.map(getValue);
  const recent = sortedRounds.slice(0, Math.min(5, sortedRounds.length)).map(getValue);
  
  // Season = trailing 12 months
  const seasonCutoffMs = Date.now() - (365 * 24 * 60 * 60 * 1000);
  const seasonRounds = sortedRounds.filter(r => new Date(r.date).getTime() >= seasonCutoffMs);
  const seasonValues = seasonRounds.map(getValue);
  
  return {
    recent: recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0,
    season: seasonValues.length > 0 ? seasonValues.reduce((a, b) => a + b, 0) / seasonValues.length : 0,
    career: allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : undefined
  };
}

type NormalizedHoleScore = { score: number | null; par: number | null; holeNumber?: number | null };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function getHoleNumber(hole: unknown): number | null {
  if (!isRecord(hole)) return null;
  const number = hole.number ?? hole.holeNumber ?? hole.hole;
  return typeof number === 'number' ? number : null;
}

function normalizeHoleScore(hole: unknown): NormalizedHoleScore {
  if (!isRecord(hole)) {
    return { score: null, par: null, holeNumber: null };
  }
  const score = typeof hole.score === 'number'
    ? hole.score
    : typeof hole.grossScore === 'number'
      ? hole.grossScore
      : typeof hole.strokes === 'number'
        ? hole.strokes
        : null;
  const par = typeof hole.par === 'number' ? hole.par : null;
  return { score, par, holeNumber: getHoleNumber(hole) };
}

function getRoundPar(round: SavedRound): number | null {
  // For incomplete rounds with holesPlayed, only sum par for played holes
  const playedSet = round.holesPlayed?.length ? new Set(round.holesPlayed) : null;

  if (round.courseSnapshot?.holes?.length) {
    const relevantHoles = playedSet
      ? round.courseSnapshot.holes.filter(h => playedSet.has(h.number))
      : round.courseSnapshot.holes;
    return relevantHoles.reduce((sum, hole) => sum + hole.par, 0);
  }
  if (round.holes?.length) {
    const relevantHoles = playedSet
      ? round.holes.filter(h => playedSet.has(h.number))
      : round.holes;
    const parSum = relevantHoles.reduce((sum, hole) => sum + (hole.par || 0), 0);
    return parSum > 0 ? parSum : null;
  }
  return null;
}

function getRoundHoleCount(round: SavedRound): number {
  return round.holeCount || round.holesPlayed?.length || round.holes?.length || 18;
}

function getAllNormalizedHoles(rounds: SavedRound[]): NormalizedHoleScore[] {
  return rounds.flatMap(round => {
    const holes = round.holes || [];
    // Only include holes that were explicitly saved or have a score
    const playedHoles = holes.filter(h => h.isSaved || h.score > 0);
    return playedHoles.map(normalizeHoleScore);
  });
}

function countBirdies(holes: NormalizedHoleScore[]): number {
  return holes.filter(h => h.par && h.score && h.score <= h.par - 1).length;
}

function countBogeyPlus(holes: NormalizedHoleScore[]): number {
  return holes.filter(h => h.par && h.score && h.score >= h.par + 1).length;
}

function formatExpectedRange(
  range: { min: number; max: number },
  unit: '%' | '' = '',
  decimals: number = 0
): string {
  const formatValue = (value: number) => value.toFixed(decimals);
  return `${formatValue(range.min)}-${formatValue(range.max)}${unit}`;
}

// ============================================================================
// CONFIDENCE DETERMINATION
// ============================================================================

/**
 * Determines the stat state based on rounds data
 */
export function determineStatState(
  roundsWithStat: number,
  totalRounds: number,
  minimumRequired: number = 5
): StatState {
  if (roundsWithStat === 0) {
    return StatState.NOT_TRACKED;
  }
  if (roundsWithStat < minimumRequired) {
    return StatState.INSUFFICIENT_DATA;
  }
  return StatState.TRACKED;
}

/**
 * Creates a stat with confidence
 */
export function createStatWithConfidence(
  value: number | string,
  roundsWithStat: number,
  minimumRequired: number = 5
): StatWithConfidence {
  return {
    value,
    state: determineStatState(roundsWithStat, roundsWithStat, minimumRequired),
    roundsUsed: roundsWithStat
  };
}

// ============================================================================
// AVERAGE STATS CALCULATION
// ============================================================================

export function calculateAverageStats(rounds: SavedRound[]): AverageStats {
  const totalRounds = rounds.length;
  
  if (totalRounds === 0) {
    return {
      typicalScore: { typical: 0, range: { min: 0, max: 0 }, mean: 0 },
      typicalScoreVsPar: { typical: 0, range: { min: 0, max: 0 }, mean: 0 },
      rollingScore: { recent: 0, season: 0 },
      avgPutts: createStatWithConfidence(0, 0),
      avgFairways: createStatWithConfidence(0, 0),
      avgGreens: createStatWithConfidence(0, 0),
      avgScrambling: createStatWithConfidence(0, 0),
      avgUpDown: createStatWithConfidence(0, 0),
      par3Avg: 0,
      par4Avg: 0,
      par5Avg: 0,
      birdieRate: 0,
      bogeyPlusRate: 0,
      roundsUsed: 0,
      totalRounds: 0
    };
  }

  // Typical Score calculations (trimmed mean + range)
  const scores = rounds.map(r => r.score);
  const typicalScore = calculateTypicalValue(scores);
  
  const scoresVsPar = rounds
    .map(r => {
      const par = getRoundPar(r);
      return typeof par === 'number' ? r.score - par : null;
    })
    .filter((value): value is number => typeof value === 'number');
  const typicalScoreVsPar = scoresVsPar.length > 0
    ? calculateTypicalValue(scoresVsPar)
    : { typical: 0, range: { min: 0, max: 0 }, mean: 0 };
  
  // Rolling averages
  const rollingScore = calculateRollingAverage(rounds, r => r.score);

  // Putts calculation
  const roundsWithPutts = rounds.filter(r =>
    isRoundStatEnabled(r, 'putts') && r.stats.putts && r.stats.putts > 0
  );
  const avgPuttsValue = roundsWithPutts.length > 0
    ? roundsWithPutts.reduce((sum, r) => sum + (r.stats.putts || 0), 0) / roundsWithPutts.length
    : 0;
  const avgPutts = createStatWithConfidence(avgPuttsValue.toFixed(1), roundsWithPutts.length);

  // Fairways calculation
  const roundsWithFairways = rounds.filter(r =>
    isRoundStatEnabled(r, 'fir') &&
    r.stats.fairways !== undefined &&
    r.stats.fairwaysPossible !== undefined &&
    r.stats.fairwaysPossible > 0
  );
  const totalFairways = roundsWithFairways.reduce((sum, r) => sum + (r.stats.fairways || 0), 0);
  const totalFairwaysPossible = roundsWithFairways.reduce(
    (sum, r) => sum + (r.stats.fairwaysPossible || 0),
    0
  );
  const avgFairwaysValue = totalFairwaysPossible > 0
    ? (totalFairways / totalFairwaysPossible) * 100
    : 0;
  const avgFairways = createStatWithConfidence(
    `${avgFairwaysValue.toFixed(0)}%`, 
    roundsWithFairways.length
  );

  // Greens calculation
  const roundsWithGreens = rounds.filter(r =>
    isRoundStatEnabled(r, 'gir') &&
    r.stats.greens !== undefined &&
    r.stats.greensPossible !== undefined &&
    r.stats.greensPossible > 0
  );
  const totalGreens = roundsWithGreens.reduce((sum, r) => sum + (r.stats.greens || 0), 0);
  const totalGreensPossible = roundsWithGreens.reduce(
    (sum, r) => sum + (r.stats.greensPossible || 0),
    0
  );
  const avgGreensValue = totalGreensPossible > 0
    ? (totalGreens / totalGreensPossible) * 100
    : 0;
  const avgGreens = createStatWithConfidence(
    `${avgGreensValue.toFixed(0)}%`, 
    roundsWithGreens.length
  );

  // Scrambling calculation (got up and down when missed green)
  const roundsWithScrambling = rounds.filter(r =>
    isRoundStatEnabled(r, 'scrambling') &&
    r.stats.upDownMade !== undefined &&
    r.stats.upDownAttempts !== undefined &&
    r.stats.upDownAttempts > 0
  );
  const totalScrambleMade = roundsWithScrambling.reduce((sum, r) => sum + (r.stats.upDownMade || 0), 0);
  const totalScrambleAttempts = roundsWithScrambling.reduce(
    (sum, r) => sum + (r.stats.upDownAttempts || 0),
    0
  );
  const avgScramblingValue = totalScrambleAttempts > 0
    ? (totalScrambleMade / totalScrambleAttempts) * 100
    : 0;
  const avgScrambling = createStatWithConfidence(
    `${avgScramblingValue.toFixed(0)}%`, 
    roundsWithScrambling.length
  );

  // Up & Down (legacy)
  const roundsWithUpDown = rounds.filter(r =>
    isRoundStatEnabled(r, 'scrambling') &&
    r.stats.upDownMade !== undefined &&
    r.stats.upDownAttempts !== undefined
  );
  const totalUpDownMade = roundsWithUpDown.reduce((sum, r) => sum + (r.stats.upDownMade || 0), 0);
  const totalUpDownAttempts = roundsWithUpDown.reduce(
    (sum, r) => sum + (r.stats.upDownAttempts || 0),
    0
  );
  const avgUpDownValue = totalUpDownAttempts > 0
    ? (totalUpDownMade / totalUpDownAttempts) * 100
    : 0;
  const avgUpDown = createStatWithConfidence(
    `${avgUpDownValue.toFixed(0)}%`, 
    roundsWithUpDown.length
  );

  // Scoring breakdown using hole-by-hole data when available
  const allHoles = getAllNormalizedHoles(rounds);
  const par3Holes = allHoles.filter(h => h.par === 3 && h.score && h.score > 0);
  const par4Holes = allHoles.filter(h => h.par === 4 && h.score && h.score > 0);
  const par5Holes = allHoles.filter(h => h.par === 5 && h.score && h.score > 0);
  const par3Avg = par3Holes.length > 0
    ? par3Holes.reduce((sum, h) => sum + (h.score || 0), 0) / par3Holes.length
    : 0;
  const par4Avg = par4Holes.length > 0
    ? par4Holes.reduce((sum, h) => sum + (h.score || 0), 0) / par4Holes.length
    : 0;
  const par5Avg = par5Holes.length > 0
    ? par5Holes.reduce((sum, h) => sum + (h.score || 0), 0) / par5Holes.length
    : 0;
  const totalHolesWithPar = allHoles.filter(h => h.par && h.score && h.score > 0).length;
  const birdieRate = totalHolesWithPar > 0
    ? countBirdies(allHoles) / totalHolesWithPar
    : 0;
  const bogeyPlusRate = totalHolesWithPar > 0
    ? countBogeyPlus(allHoles) / totalHolesWithPar
    : 0;

  // Player Rating calculation
  const handicapIndex = calculateWHSHandicapIndex(rounds);

  return {
    // New: Typical values (trimmed mean + range)
    typicalScore,
    typicalScoreVsPar,
    
    // New: Rolling averages
    rollingScore,
    
    // Existing stats
    avgPutts,
    avgFairways,
    avgGreens,
    avgScrambling,
    avgUpDown,
    par3Avg,
    par4Avg,
    par5Avg,
    birdieRate,
    bogeyPlusRate,
    roundsUsed: totalRounds,
    totalRounds,
    handicapIndex: handicapIndex !== null ? handicapIndex : undefined
  };
}

// ============================================================================
// PERSONAL BESTS CALCULATION
// ============================================================================

export function calculatePersonalBests(rounds: SavedRound[]): PersonalBests {
  if (rounds.length === 0) {
    return {
      lowestRoundAllTime: null,
      lowestRoundThisYear: null,
      bestFront9: null,
      bestBack9: null,
      fewestPuttsRound: null,
      lowestAvgPutts: null,
      mostBirdiesRound: null,
      fewestBogeys: null,
      bogeyFreeRound: null
    };
  }

  const currentYear = new Date().getFullYear();
  const thisYearRounds = rounds.filter(r => new Date(r.date).getFullYear() === currentYear);

  // Lowest Round (All-Time)
  const lowestRound = rounds.reduce((best, r) => 
    !best || r.score < best.score ? r : best
  );
  const lowestRoundAllTime: PersonalBest = {
    value: lowestRound.score,
    date: new Date(lowestRound.date),
    courseName: lowestRound.courseName,
    badge: 'Personal Best'
  };

  // Lowest Round (This Year)
  let lowestRoundThisYear: PersonalBest | null = null;
  if (thisYearRounds.length > 0) {
    const lowestThisYear = thisYearRounds.reduce((best, r) => 
      !best || r.score < best.score ? r : best
    );
    lowestRoundThisYear = {
      value: lowestThisYear.score,
      date: new Date(lowestThisYear.date),
      courseName: lowestThisYear.courseName,
      badge: 'Season Best'
    };
  }

  // Fewest Putts (Round)
  const roundsWithPutts = rounds.filter(r =>
    isRoundStatEnabled(r, 'putts') && r.stats.putts && r.stats.putts > 0
  );
  let fewestPuttsRound: PersonalBest | null = null;
  if (roundsWithPutts.length > 0) {
    const fewestPutts = roundsWithPutts.reduce((best, r) => 
      !best || (r.stats.putts || 999) < (best.stats.putts || 999) ? r : best
    );
    fewestPuttsRound = {
      value: fewestPutts.stats.putts || 0,
      date: new Date(fewestPutts.date),
      courseName: fewestPutts.courseName
    };
  }

  const bestFront9 = (() => {
    let best: PersonalBest | null = null;
    rounds.forEach((round) => {
      if (!round.holes || round.holes.length === 0) return;
      const holes = round.holes.map(normalizeHoleScore);
      const frontScores = holes
        .filter(h => (h.holeNumber ?? 0) >= 1 && (h.holeNumber ?? 0) <= 9)
        .sort((a, b) => (a.holeNumber ?? 0) - (b.holeNumber ?? 0))
        .map(h => h.score || 0);
      if (frontScores.length < 9) return;
      const total = frontScores.slice(0, 9).reduce((sum, value) => sum + value, 0);
      if (!best || total < best.value) {
        best = { value: total, date: new Date(round.date), courseName: round.courseName };
      }
    });
    return best;
  })();

  const bestBack9 = (() => {
    let best: PersonalBest | null = null;
    rounds.forEach((round) => {
      if (!round.holes || round.holes.length === 0) return;
      const holes = round.holes.map(normalizeHoleScore);
      const backScores = holes
        .filter(h => (h.holeNumber ?? 0) >= 10 && (h.holeNumber ?? 0) <= 18)
        .sort((a, b) => (a.holeNumber ?? 0) - (b.holeNumber ?? 0))
        .map(h => h.score || 0);
      if (backScores.length < 9) return;
      const total = backScores.slice(0, 9).reduce((sum, value) => sum + value, 0);
      if (!best || total < best.value) {
        best = { value: total, date: new Date(round.date), courseName: round.courseName };
      }
    });
    return best;
  })();

  const lowestAvgPutts = (() => {
    const roundsWithPuttsDetail = rounds.filter(r =>
      isRoundStatEnabled(r, 'putts') && r.stats.putts && r.stats.putts > 0
    );
    let best: PersonalBest | null = null;
    roundsWithPuttsDetail.forEach((round) => {
      const holeCount = getRoundHoleCount(round);
      if (!holeCount) return;
      const avg = (round.stats.putts || 0) / holeCount;
      if (!best || avg < best.value) {
        best = { value: parseFloat(avg.toFixed(2)), date: new Date(round.date), courseName: round.courseName };
      }
    });
    return best;
  })();

  const mostBirdiesRound = (() => {
    let best: PersonalBest | null = null;
    rounds.forEach((round) => {
      if (!round.holes || round.holes.length === 0) return;
      const holes = round.holes.map(normalizeHoleScore).filter(h => h.par && h.score);
      if (!holes.length) return;
      const birdies = holes.filter(h => (h.score || 0) <= (h.par || 0) - 1).length;
      if (!best || birdies > best.value) {
        best = { value: birdies, date: new Date(round.date), courseName: round.courseName };
      }
    });
    return best;
  })();

  const fewestBogeys = (() => {
    let best: PersonalBest | null = null;
    rounds.forEach((round) => {
      if (!round.holes || round.holes.length === 0) return;
      const holes = round.holes.map(normalizeHoleScore).filter(h => h.par && h.score);
      if (!holes.length) return;
      const bogeys = holes.filter(h => (h.score || 0) > (h.par || 0)).length;
      if (!best || bogeys < best.value) {
        best = { value: bogeys, date: new Date(round.date), courseName: round.courseName };
      }
    });
    return best;
  })();

  const bogeyFreeRound = (() => {
    let best: PersonalBest | null = null;
    rounds.forEach((round) => {
      if (!round.holes || round.holes.length === 0) return;
      const holes = round.holes.map(normalizeHoleScore).filter(h => h.par && h.score);
      if (holes.length < 9) return;
      const bogeys = holes.filter(h => (h.score || 0) > (h.par || 0)).length;
      if (bogeys === 0) {
        if (!best || round.score < best.value) {
          best = { value: round.score, date: new Date(round.date), courseName: round.courseName };
        }
      }
    });
    return best;
  })();

  return {
    lowestRoundAllTime,
    lowestRoundThisYear,
    bestFront9,
    bestBack9,
    fewestPuttsRound,
    lowestAvgPutts,
    mostBirdiesRound,
    fewestBogeys,
    bogeyFreeRound
  };
}


// Re-exported from extracted module
export { generateInsights } from './insightGeneration';
/**
 * Display formatting for stats with confidence
 */
export function formatStatForDisplay(stat: StatWithConfidence): string {
  switch (stat.state) {
    case StatState.TRACKED:
      return String(stat.value);
    case StatState.NOT_TRACKED:
      return '—';
    case StatState.INSUFFICIENT_DATA:
      return '—';
    default:
      return '—';
  }
}

/**
 * Get tooltip text for insufficient data
 */
export function getInsufficientDataTooltip(stat: StatWithConfidence, minRequired: number = 3): string | null {
  if (stat.state === StatState.INSUFFICIENT_DATA) {
    const remaining = minRequired - (stat.roundsUsed || 0);
    if (remaining > 0) {
      return `Track ${remaining} more round${remaining === 1 ? '' : 's'} to unlock`;
    }
    return 'Check back after 3 rounds';
  }
  if (stat.state === StatState.NOT_TRACKED) {
    return 'Track advanced stats to unlock';
  }
  return null;
}
