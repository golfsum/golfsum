import { SavedRound } from '../types';
import { isFairwayHit, isGreenHit } from '../utils/statChecks';

export interface StatsEfficiencyAnalysis {
  predictedHandicap: number | null;
  actualHandicap: number | null;
  gap: number | null;
  category: EfficiencyCategory;
  weakestStat: 'GIR' | 'FIR' | 'PUTTING' | 'SCRAMBLING' | null;
  strongestStat: 'GIR' | 'FIR' | 'PUTTING' | 'SCRAMBLING' | null;
  statComparison: StatComparison | null;
  primaryFinding: EfficiencyFinding | null;
}

export type EfficiencyCategory = 'OVERPERFORMING' | 'UNDERPERFORMING' | 'ALIGNED' | 'INSUFFICIENT_DATA';

export interface StatComparison {
  gir: { actual: number; benchmark: number; deltaStrokes: number };
  fir: { actual: number; benchmark: number; deltaStrokes: number };
  putting: { actual: number; benchmark: number; deltaStrokes: number };
  scrambling: { actual: number; benchmark: number; deltaStrokes: number };
}

export interface EfficiencyFinding {
  category: EfficiencyCategory;
  message: string;
  actionable: string;
}

const STAT_BENCHMARKS: Record<number, { gir: number; fir: number; scrambling: number; putts: number }> = {
  0: { gir: 0.67, fir: 0.65, scrambling: 0.58, putts: 29 },
  5: { gir: 0.50, fir: 0.55, scrambling: 0.45, putts: 31 },
  10: { gir: 0.35, fir: 0.45, scrambling: 0.35, putts: 33 },
  15: { gir: 0.29, fir: 0.35, scrambling: 0.25, putts: 33.5 },
  20: { gir: 0.18, fir: 0.25, scrambling: 0.18, putts: 35 },
};

const empty = (): StatsEfficiencyAnalysis => ({
  predictedHandicap: null,
  actualHandicap: null,
  gap: null,
  category: 'INSUFFICIENT_DATA',
  weakestStat: null,
  strongestStat: null,
  statComparison: null,
  primaryFinding: null,
});

const interpolateBenchmark = (handicap: number) => {
  const keys = Object.keys(STAT_BENCHMARKS).map(Number).sort((a, b) => a - b);
  if (handicap <= keys[0]) return STAT_BENCHMARKS[keys[0]];
  if (handicap >= keys[keys.length - 1]) return STAT_BENCHMARKS[keys[keys.length - 1]];
  let lower = keys[0];
  let upper = keys[1];
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (handicap >= keys[i] && handicap <= keys[i + 1]) {
      lower = keys[i];
      upper = keys[i + 1];
      break;
    }
  }
  const t = (handicap - lower) / (upper - lower);
  const l = STAT_BENCHMARKS[lower];
  const u = STAT_BENCHMARKS[upper];
  return {
    gir: l.gir + (u.gir - l.gir) * t,
    fir: l.fir + (u.fir - l.fir) * t,
    scrambling: l.scrambling + (u.scrambling - l.scrambling) * t,
    putts: l.putts + (u.putts - l.putts) * t,
  };
};

const buildEfficiencyFinding = (
  category: EfficiencyCategory,
  gap: number,
  weakestStat: StatsEfficiencyAnalysis['weakestStat'],
  strongestStat: StatsEfficiencyAnalysis['strongestStat'],
  handicap: number
): EfficiencyFinding => {
  const label: Record<string, string> = {
    GIR: 'greens in regulation',
    FIR: 'fairways hit',
    PUTTING: 'putting',
    SCRAMBLING: 'scrambling',
  };
  if (category === 'OVERPERFORMING') {
    return {
      category,
      message: `Stats project around ${(handicap + Math.abs(gap)).toFixed(1)} handicap, but scoring is at ${handicap.toFixed(1)}. ${strongestStat ? label[strongestStat] : 'Short game'} is carrying outcomes.`,
      actionable: `Keep strengths, but address ${weakestStat ? label[weakestStat] : 'the weakest metric'} to make scoring more durable.`,
    };
  }
  if (category === 'UNDERPERFORMING') {
    return {
      category,
      message: `Underlying stats project around ${(handicap - Math.abs(gap)).toFixed(1)} handicap, but scoring is ${handicap.toFixed(1)}.`,
      actionable: `Focus on conversion leaks: ${weakestStat ? label[weakestStat] : 'score conversion routines'} and reduce compounding holes.`,
    };
  }
  return {
    category: 'ALIGNED',
    message: 'Stats and scoring are broadly aligned with current handicap.',
    actionable: `For next gain, prioritize ${weakestStat ? label[weakestStat] : 'one weak area'} over broad changes.`,
  };
};

export function analyzeStatsEfficiency(rounds: SavedRound[], handicap: number | null): StatsEfficiencyAnalysis {
  if (handicap == null) return empty();
  const completed = rounds
    .filter(r => (r.holes?.length ?? 0) >= 9 && r.score > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20);
  if (completed.length < 5) return empty();

  const holes = completed.flatMap(r => r.holes || []).filter(h => h.score > 0);
  const girHoles = holes.filter(h => h.greenHit != null);
  if (girHoles.length < 18) return empty();
  const firHoles = holes.filter(h => h.par >= 4 && h.fairwayHit != null);
  const scrambleHoles = holes.filter(h => h.greenHit !== true && h.greenHit != null && h.upDown != null);

  const benchmark = interpolateBenchmark(handicap);
  const actualGir = girHoles.filter(h => isGreenHit(h.greenHit)).length / girHoles.length;
  const actualFir = firHoles.length >= 9 ? firHoles.filter(h => isFairwayHit(h.fairwayHit)).length / firHoles.length : benchmark.fir;
  const actualPuttsPerRound = completed
    .map(r => (typeof r.stats?.putts === 'number' ? r.stats.putts : null))
    .filter((v): v is number => v != null);
  const actualPutts = actualPuttsPerRound.length >= 3
    ? actualPuttsPerRound.reduce((a, b) => a + b, 0) / actualPuttsPerRound.length
    : benchmark.putts;
  const actualScramble = scrambleHoles.length >= 8
    ? scrambleHoles.filter(h => h.upDown === true).length / scrambleHoles.length
    : benchmark.scrambling;

  const girDelta = (actualGir - benchmark.gir) * 18 * 0.08;
  const firDelta = (actualFir - benchmark.fir) * 18 * 0.04;
  const puttDelta = benchmark.putts - actualPutts;
  const scrambleDelta = (actualScramble - benchmark.scrambling) * 18 * 0.06;

  const statComparison: StatComparison = {
    gir: { actual: actualGir, benchmark: benchmark.gir, deltaStrokes: girDelta },
    fir: { actual: actualFir, benchmark: benchmark.fir, deltaStrokes: firDelta },
    putting: { actual: actualPutts, benchmark: benchmark.putts, deltaStrokes: puttDelta },
    scrambling: { actual: actualScramble, benchmark: benchmark.scrambling, deltaStrokes: scrambleDelta },
  };

  const entries: Array<[StatsEfficiencyAnalysis['weakestStat'], number]> = [
    ['GIR', girDelta],
    ['FIR', firDelta],
    ['PUTTING', puttDelta],
    ['SCRAMBLING', scrambleDelta],
  ];
  const weakestStat = [...entries].sort((a, b) => a[1] - b[1])[0][0];
  const strongestStat = [...entries].sort((a, b) => b[1] - a[1])[0][0];

  const totalStatDelta = girDelta + firDelta + puttDelta + scrambleDelta;
  const predictedHandicap = Math.round((handicap - totalStatDelta) * 10) / 10;
  const gap = predictedHandicap - handicap;
  const category: EfficiencyCategory = gap >= 2 ? 'OVERPERFORMING' : gap <= -2 ? 'UNDERPERFORMING' : 'ALIGNED';

  return {
    predictedHandicap,
    actualHandicap: handicap,
    gap,
    category,
    weakestStat,
    strongestStat,
    statComparison,
    primaryFinding: buildEfficiencyFinding(category, gap, weakestStat, strongestStat, handicap),
  };
}
