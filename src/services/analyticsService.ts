/**
 * Golf Analytics Service
 * Calculates Strokes Gained, proximity analysis, scoring patterns, and more
 */

import { SavedRound, RoundStats } from '../types';
import { isFairwayHit, isGreenHit } from '../utils/statChecks';

// Strokes Gained benchmarks (based on scratch golfer averages)
const SCRATCH_BENCHMARKS = {
  gir: 0.67, // 67% GIR
  fir: 0.65, // 65% FIR
  scrambling: 0.58, // 58% up & down
  puttsPerGir: 1.78, // Putts when hitting GIR
  puttsPerRound: 29, // Average putts per round
  approachProximity: { // Feet from hole by distance
    '100-125': 18,
    '126-150': 24,
    '151-175': 30,
    '176-200': 38,
    '200+': 45,
  },
};

// Handicap-based benchmarks
const HANDICAP_BENCHMARKS: Record<number, { gir: number; fir: number; scrambling: number; putts: number }> = {
  0: { gir: 0.67, fir: 0.65, scrambling: 0.58, putts: 29 },
  5: { gir: 0.50, fir: 0.55, scrambling: 0.45, putts: 31 },
  10: { gir: 0.35, fir: 0.45, scrambling: 0.35, putts: 33 },
  15: { gir: 0.29, fir: 0.35, scrambling: 0.25, putts: 33.5 },
  20: { gir: 0.18, fir: 0.25, scrambling: 0.18, putts: 35 },
  25: { gir: 0.12, fir: 0.18, scrambling: 0.12, putts: 36 },
  30: { gir: 0.07, fir: 0.12, scrambling: 0.08, putts: 37 },
  36: { gir: 0.05, fir: 0.14, scrambling: 0.08, putts: 38 },
};

/**
 * Benchmark delta versus handicap expectations.
 * This is not true shot-level strokes gained.
 */
export interface BenchmarkDelta {
  offTheTee: number;
  approach: number;
  aroundGreen: number;
  putting: number;
  total: number;
}

export interface ScoringBreakdown {
  par3: { avg: number; count: number; vsPar: number };
  par4: { avg: number; count: number; vsPar: number };
  par5: { avg: number; count: number; vsPar: number };
}

export interface ProximityData {
  range: string;
  avgFeet: number;
  shotCount: number;
  benchmark: number;
  differential: number;
}

export interface ClubStats {
  club: string;
  usageCount: number;
  avgDistance?: number;
  successRate?: number;
}

export interface ClubUsageSummary {
  /** Whether the user has tracked any club data at all. */
  hasData: boolean;
  /** Number of rounds that contain at least one teeClub or approachClub entry. */
  roundsWithClubData: number;
  /** The club used most on tee shots (par 4+), or null if no data. */
  topTeeClub: string | null;
  /** The club used most on approach shots, or null if no data. */
  topApproachClub: string | null;
  /** Full breakdown, sorted by usage count descending. */
  clubs: ClubStats[];
}

export interface InsightRecommendation {
  category: 'strength' | 'weakness' | 'opportunity';
  title: string;
  description: string;
  actionItem?: string;
  impact?: string;
}

export interface AnalyticsData {
  benchmarkDelta: BenchmarkDelta;
  /** @deprecated Use benchmarkDelta instead. */
  strokesGained?: BenchmarkDelta;
  scoringBreakdown: ScoringBreakdown;
  proximity: ProximityData[];
  clubStats: ClubStats[];
  clubUsageSummary: ClubUsageSummary;
  insights: InsightRecommendation[];
  trends: {
    handicapTrend: number; // positive = improving
    scoreTrend: number;
    consistencyScore: number; // 0-100
  };
  benchmarks: {
    category: string;
    yours: number;
    benchmark: number;
    differential: number;
  }[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate Strokes Gained from round stats
 * Simplified model based on available data
 */
export function calculateBenchmarkDelta(rounds: SavedRound[], handicap: number = 10): BenchmarkDelta {
  if (rounds.length === 0) {
    return { offTheTee: 0, approach: 0, aroundGreen: 0, putting: 0, total: 0 };
  }

  const benchmark = getHandicapBenchmark(handicap);
  
  // Aggregate stats
  let totalFir = 0, totalFirPossible = 0;
  let totalGir = 0, totalGirPossible = 0;
  let totalScramble = 0, totalScrambleAttempts = 0;
  let totalPuttsNormalized = 0, roundsWithPuttsNormalized = 0;

  rounds.forEach(round => {
    if (round.stats.fairways !== undefined) {
      const firPossibleFallback = round.holes?.filter(h => h.par > 3).length ?? 14;
      totalFir += round.stats.fairways;
      totalFirPossible += round.stats.fairwaysPossible || firPossibleFallback;
    }
    if (round.stats.greens !== undefined) {
      const girPossibleFallback = round.holes?.length ?? 18;
      totalGir += round.stats.greens;
      totalGirPossible += round.stats.greensPossible || girPossibleFallback;
    }
    if (round.stats.upDownMade !== undefined && round.stats.upDownAttempts) {
      totalScramble += round.stats.upDownMade;
      totalScrambleAttempts += round.stats.upDownAttempts;
    }
    if (round.stats.putts !== undefined && round.stats.putts > 0) {
      const holeCount = round.holeCount || round.holes?.length || 18;
      const normalizedPutts = round.stats.putts * (18 / holeCount);
      totalPuttsNormalized += normalizedPutts;
      roundsWithPuttsNormalized++;
    }
  });

  // Calculate rates
  const firRate = totalFirPossible > 0 ? totalFir / totalFirPossible : 0;
  const girRate = totalGirPossible > 0 ? totalGir / totalGirPossible : 0;
  const scrambleRate = totalScrambleAttempts > 0 ? totalScramble / totalScrambleAttempts : 0;
  const avgPutts = roundsWithPuttsNormalized > 0 ? totalPuttsNormalized / roundsWithPuttsNormalized : 30;

  // Relative SG-style estimate versus handicap benchmarks (not PGA Tour SG).
  const offTheTeeRaw = (firRate - benchmark.fir) * 14 * 0.20;
  const approachRaw = (girRate - benchmark.gir) * 18 * 0.40;
  const aroundGreenRaw = (scrambleRate - benchmark.scrambling) *
    (totalScrambleAttempts > 0 ? totalScrambleAttempts / rounds.length : 6) * 0.35;
  const puttingRaw = (benchmark.putts - avgPutts) * 0.90;

  const offTheTee = Math.round(clamp(offTheTeeRaw, -2.5, 2.5) * 10) / 10;
  const approach = Math.round(clamp(approachRaw, -3.0, 3.0) * 10) / 10;
  const aroundGreen = Math.round(clamp(aroundGreenRaw, -2.0, 2.0) * 10) / 10;
  const putting = Math.round(clamp(puttingRaw, -4.0, 4.0) * 10) / 10;
  const total = Math.round(clamp(offTheTee + approach + aroundGreen + putting, -8.0, 8.0) * 10) / 10;

  return {
    offTheTee,
    approach,
    aroundGreen,
    putting,
    total,
  };
}

/**
 * Calculate scoring breakdown by par type
 */
export function calculateScoringBreakdown(rounds: SavedRound[]): ScoringBreakdown {
  const holes = rounds.flatMap(round => round.holes ?? []).filter(h => typeof h.par === 'number' && typeof h.score === 'number');
  if (holes.length > 0) {
    const build = (par: number) => {
      const parHoles = holes.filter(h => h.par === par);
      const count = parHoles.length;
      if (!count) return { avg: par, count: 0, vsPar: 0 };
      const avg = parHoles.reduce((sum, h) => sum + h.score, 0) / count;
      return {
        avg,
        count,
        vsPar: avg - par,
      };
    };
    return {
      par3: build(3),
      par4: build(4),
      par5: build(5),
    };
  }

  // Fallback when hole data is unavailable.
  const avgScore = rounds.length > 0 
    ? rounds.reduce((sum, r) => sum + r.score, 0) / rounds.length 
    : 72;
  const coursePars = rounds
    .map(r => {
      if (r.holes?.length) return r.holes.reduce((sum, h) => sum + (h.par || 0), 0);
      return undefined;
    })
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const avgCoursePar = coursePars.length
    ? coursePars.reduce((sum, v) => sum + v, 0) / coursePars.length
    : 72;
  const overPar = avgScore - avgCoursePar;
  
  // Distribute over/under par across hole types (typical distribution)
  return {
    par3: {
      avg: 3.0 + (overPar * 0.15),
      count: rounds.length * 4, // 4 par 3s per round
      vsPar: overPar * 0.15,
    },
    par4: {
      avg: 4.0 + (overPar * 0.55),
      count: rounds.length * 10, // 10 par 4s per round
      vsPar: overPar * 0.55,
    },
    par5: {
      avg: 5.0 + (overPar * 0.30),
      count: rounds.length * 4, // 4 par 5s per round
      vsPar: overPar * 0.30,
    },
  };
}

/**
 * Calculate proximity data from approach distances
 */
export function calculateProximity(rounds: SavedRound[]): ProximityData[] {
  const hasApproachTracking = rounds.some(round =>
    (round.holes ?? []).some(hole => hole.approachDistance !== undefined && hole.approachDistance !== null)
  );
  if (!hasApproachTracking) return [];
  // We do not currently persist shot-level "distance to pin" values,
  // so we cannot produce valid proximity analytics yet.
  return [];
}

/**
 * Analyze club usage patterns
 */
export function analyzeClubUsage(rounds: SavedRound[]): ClubStats[] {
  const stats = new Map<string, { usage: number; success: number; tracked: number }>();

  const track = (club: string | null | undefined, success: boolean | null) => {
    if (!club || !club.trim()) return;
    const key = club.trim();
    const entry = stats.get(key) ?? { usage: 0, success: 0, tracked: 0 };
    entry.usage += 1;
    if (success !== null) {
      entry.tracked += 1;
      if (success) entry.success += 1;
    }
    stats.set(key, entry);
  };

  rounds.forEach(round => {
    (round.holes ?? []).forEach(hole => {
      if (hole.par >= 4) {
        const firTracked = hole.fairwayHit !== undefined && hole.fairwayHit !== null;
        track(hole.teeClub, firTracked ? isFairwayHit(hole.fairwayHit) : null);
      } else {
        track(hole.teeClub, null);
      }
      const girTracked = hole.greenHit !== undefined && hole.greenHit !== null;
      track(hole.approachClub, girTracked ? isGreenHit(hole.greenHit) : null);
    });
  });

  const clubStats = [...stats.entries()]
    .map(([club, value]) => ({
      club,
      usageCount: value.usage,
      successRate: value.tracked > 0 ? value.success / value.tracked : undefined,
    }))
    .sort((a, b) => b.usageCount - a.usageCount);

  return clubStats;
}

/**
 * Derives a summary object from analyzeClubUsage() results plus the raw rounds.
 * Safe to call with any number of rounds — returns hasData: false when empty.
 */
export function getClubUsageSummary(rounds: SavedRound[]): ClubUsageSummary {
  const roundsWithClubData = rounds.filter(r =>
    (r.holes ?? []).some(h => h.teeClub || h.approachClub)
  ).length;

  if (roundsWithClubData === 0) {
    return {
      hasData: false,
      roundsWithClubData: 0,
      topTeeClub: null,
      topApproachClub: null,
      clubs: [],
    };
  }

  const teeTally = new Map<string, number>();
  const approachTally = new Map<string, number>();

  rounds.forEach(r =>
    (r.holes ?? []).forEach(h => {
      const tee = h.teeClub?.trim();
      if (tee) teeTally.set(tee, (teeTally.get(tee) ?? 0) + 1);
      const approach = h.approachClub?.trim();
      if (approach) approachTally.set(approach, (approachTally.get(approach) ?? 0) + 1);
    })
  );

  const topTeeClub = teeTally.size > 0
    ? [...teeTally.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : null;
  const topApproachClub = approachTally.size > 0
    ? [...approachTally.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : null;

  return {
    hasData: true,
    roundsWithClubData,
    topTeeClub,
    topApproachClub,
    clubs: analyzeClubUsage(rounds),
  };
}

/**
 * Generate AI insights and recommendations
 */
export function generateInsights(
  benchmarkDelta: BenchmarkDelta,
  scoringBreakdown: ScoringBreakdown,
  rounds: SavedRound[]
): InsightRecommendation[] {
  const insights: InsightRecommendation[] = [];
  
  // Find biggest weakness
  const sgCategories = [
    { name: 'Off the Tee', value: benchmarkDelta.offTheTee, fix: 'Focus on fairway accuracy drills' },
    { name: 'Approach', value: benchmarkDelta.approach, fix: 'Practice 125-150 yard shots' },
    { name: 'Around Green', value: benchmarkDelta.aroundGreen, fix: 'Work on bump-and-run chips' },
    { name: 'Putting', value: benchmarkDelta.putting, fix: 'Practice 6-10 foot putts' },
  ];
  
  const weakest = sgCategories.reduce((min, cat) => cat.value < min.value ? cat : min);
  const strongest = sgCategories.reduce((max, cat) => cat.value > max.value ? cat : max);
  
  if (weakest.value < -0.3) {
    insights.push({
      category: 'weakness',
      title: `${weakest.name} Needs Work`,
      description: `You're about ${Math.abs(weakest.value).toFixed(1)} strokes/round behind handicap benchmark in ${weakest.name.toLowerCase()}.`,
      actionItem: weakest.fix,
      impact: `Fixing this could save ${Math.abs(weakest.value * 0.5).toFixed(1)} strokes per round`,
    });
  }
  
  if (strongest.value > 0.3) {
    insights.push({
      category: 'strength',
      title: `${strongest.name} is Your Strength`,
      description: `You're about ${strongest.value.toFixed(1)} strokes/round better than handicap benchmark here.`,
      actionItem: 'Keep doing what you\'re doing!',
    });
  }

  // Scoring pattern insights
  if (scoringBreakdown.par4.vsPar > 0.5) {
    insights.push({
      category: 'opportunity',
      title: 'Par 4 Improvement Opportunity',
      description: `You're ${scoringBreakdown.par4.vsPar.toFixed(1)} over par on par 4s.`,
      actionItem: 'Consider more conservative tee shots on short par 4s',
      impact: 'Could save 1-2 strokes per round',
    });
  }

  // Up & Down insight
  if (rounds.length > 0) {
    const avgScramble = rounds.reduce((sum, r) => {
      if (r.stats.upDownMade && r.stats.upDownAttempts) {
        return sum + (r.stats.upDownMade / r.stats.upDownAttempts);
      }
      return sum;
    }, 0) / rounds.length;
    
    if (avgScramble < 0.4) {
      insights.push({
        category: 'weakness',
        title: 'Up & Down Below Average',
        description: `Your up & down rate of ${(avgScramble * 100).toFixed(0)}% is below the 40% benchmark.`,
        actionItem: 'Practice chip-and-one-putt sequences',
        impact: 'Improving to 50% could save 1+ stroke per round',
      });
    }
  }

  return insights;
}

/**
 * Calculate trends and consistency
 */
export function calculateTrends(rounds: SavedRound[], handicap: number = 10): { handicapTrend: number; scoreTrend: number; consistencyScore: number } {
  if (rounds.length < 2) {
    return { handicapTrend: 0, scoreTrend: 0, consistencyScore: 50 };
  }

  // Sort by date
  const sorted = [...rounds].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Recent vs older scores
  const midpoint = Math.floor(sorted.length / 2);
  const older = sorted.slice(0, midpoint);
  const recent = sorted.slice(midpoint);
  
  const toComparableScore = (round: SavedRound): number => {
    if (round.holes?.length) {
      const roundPar = round.holes.reduce((sum, hole) => sum + (hole.par || 0), 0);
      if (roundPar > 0) return round.score - roundPar;
    }
    return round.score;
  };

  const olderAvg = older.reduce((sum, r) => sum + toComparableScore(r), 0) / older.length;
  const recentAvg = recent.reduce((sum, r) => sum + toComparableScore(r), 0) / recent.length;
  
  const scoreTrend = olderAvg - recentAvg; // Positive = improving
  const handicapTrend = scoreTrend * 0.2; // Rough conversion
  
  // Consistency = inverse of standard deviation
  const allScores = rounds.map(r => toComparableScore(r));
  const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const variance = allScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allScores.length;
  const stdDev = Math.sqrt(variance);
  
  // Normalize volatility by expected spread for handicap band.
  const expectedStdDev = 3 + (Math.max(0, handicap) * 0.15);
  const normalizedStd = expectedStdDev > 0 ? stdDev / expectedStdDev : stdDev;
  const consistencyScore = Math.max(0, Math.min(100, 100 - (normalizedStd * 40)));

  return {
    handicapTrend: Math.round(handicapTrend * 10) / 10,
    scoreTrend: Math.round(scoreTrend * 10) / 10,
    consistencyScore: Math.round(consistencyScore),
  };
}

/**
 * Get benchmark for a given handicap
 */
function getHandicapBenchmark(handicap: number): { gir: number; fir: number; scrambling: number; putts: number } {
  const keys = Object.keys(HANDICAP_BENCHMARKS).map(Number).sort((a, b) => a - b);

  if (handicap <= keys[0]) return HANDICAP_BENCHMARKS[keys[0]];
  if (handicap >= keys[keys.length - 1]) return HANDICAP_BENCHMARKS[keys[keys.length - 1]];

  for (let i = 1; i < keys.length; i++) {
    const upper = keys[i];
    const lower = keys[i - 1];
    if (handicap <= upper) {
      const ratio = (handicap - lower) / (upper - lower);
      const a = HANDICAP_BENCHMARKS[lower];
      const b = HANDICAP_BENCHMARKS[upper];
      return {
        gir: a.gir + (b.gir - a.gir) * ratio,
        fir: a.fir + (b.fir - a.fir) * ratio,
        scrambling: a.scrambling + (b.scrambling - a.scrambling) * ratio,
        putts: a.putts + (b.putts - a.putts) * ratio,
      };
    }
  }

  return HANDICAP_BENCHMARKS[keys[0]];
}

/**
 * Get full analytics data
 */
export function getFullAnalytics(rounds: SavedRound[], handicap: number = 10): AnalyticsData {
  const benchmarkDelta = calculateBenchmarkDelta(rounds, handicap);
  const scoringBreakdown = calculateScoringBreakdown(rounds);
  const proximity = calculateProximity(rounds);
  const clubStats = analyzeClubUsage(rounds);
  const clubUsageSummary = getClubUsageSummary(rounds);
  const insights = generateInsights(benchmarkDelta, scoringBreakdown, rounds);
  const trends = calculateTrends(rounds, handicap);
  const benchmark = getHandicapBenchmark(handicap);

  // Calculate benchmarks comparison
  const totalGreensHit = rounds.reduce((sum, r) => sum + (r.stats.greens || 0), 0);
  const totalGreensPossible = rounds.reduce((sum, r) => sum + (r.stats.greensPossible || 0), 0);
  const avgGir = totalGreensPossible > 0 ? totalGreensHit / totalGreensPossible : 0;

  const totalFairwaysHit = rounds.reduce((sum, r) => sum + (r.stats.fairways || 0), 0);
  const totalFairwaysPossible = rounds.reduce((sum, r) => sum + (r.stats.fairwaysPossible || 0), 0);
  const avgFir = totalFairwaysPossible > 0 ? totalFairwaysHit / totalFairwaysPossible : 0;

  const totalScrambleMade = rounds.reduce((sum, r) => sum + (r.stats.upDownMade || 0), 0);
  const totalScrambleAttempts = rounds.reduce((sum, r) => sum + (r.stats.upDownAttempts || 0), 0);
  const avgScramble = totalScrambleAttempts > 0 ? totalScrambleMade / totalScrambleAttempts : 0;
  const roundsWithPutts = rounds.filter(r => r.stats.putts !== undefined && r.stats.putts > 0);
  const avgPutts = roundsWithPutts.length > 0
    ? roundsWithPutts.reduce((sum, r) => sum + (r.stats.putts || 0), 0) / roundsWithPutts.length
    : 30;

  const benchmarks = [
    {
      category: 'GIR %',
      yours: Math.round(avgGir * 100),
      benchmark: Math.round(benchmark.gir * 100),
      differential: Math.round((avgGir - benchmark.gir) * 100),
    },
    {
      category: 'FIR %',
      yours: Math.round(avgFir * 100),
      benchmark: Math.round(benchmark.fir * 100),
      differential: Math.round((avgFir - benchmark.fir) * 100),
    },
    {
      category: 'Up & Down %',
      yours: Math.round(avgScramble * 100),
      benchmark: Math.round(benchmark.scrambling * 100),
      differential: Math.round((avgScramble - benchmark.scrambling) * 100),
    },
    {
      category: 'Putts/Round',
      yours: Math.round(avgPutts),
      benchmark: benchmark.putts,
      differential: Math.round(benchmark.putts - avgPutts), // Flip for putts (lower is better)
    },
  ];

  return {
    benchmarkDelta,
    // compatibility during migration
    strokesGained: benchmarkDelta,
    scoringBreakdown,
    proximity,
    clubStats,
    clubUsageSummary,
    insights,
    trends,
    benchmarks,
  };
}

/** @deprecated Use calculateBenchmarkDelta. */
export const calculateStrokesGained = calculateBenchmarkDelta;
