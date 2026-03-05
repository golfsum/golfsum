import { SavedRound } from '../types';
import { isFairwayHit, isGreenHit } from '../utils/statChecks';

export interface HandicapTrajectoryAnalysis {
  recentScoreAvg: number | null;
  priorScoreAvg: number | null;
  scoreTrend: number | null;
  trendDirection: 'IMPROVING' | 'DECLINING' | 'PLATEAU' | 'STABLE' | 'INSUFFICIENT_DATA';
  attribution: TrendAttribution | null;
  isPlateaued: boolean;
  plateauRounds: number;
  plateauMessage: string | null;
  primaryFinding: TrajectoryFinding | null;
}

export interface TrendAttribution {
  girDelta: number | null;
  firDelta: number | null;
  puttDelta: number | null;
  scrambleDelta: number | null;
  primaryDriver: 'GIR' | 'FIR' | 'PUTTING' | 'SCRAMBLING' | null;
  primaryDecliner: 'GIR' | 'FIR' | 'PUTTING' | 'SCRAMBLING' | null;
}

export interface TrajectoryFinding {
  type: 'IMPROVING_ATTRIBUTED' | 'DECLINING_ATTRIBUTED' | 'PLATEAU_DETECTED' | 'STABLE';
  message: string;
  actionable: string;
}

const label: Record<string, string> = {
  GIR: 'greens in regulation',
  FIR: 'fairways hit',
  PUTTING: 'putting',
  SCRAMBLING: 'scrambling',
};

const roundStats = (round: SavedRound) => {
  const holes = round.holes || [];
  const girTracked = holes.filter(h => h.greenHit != null);
  const gir = girTracked.length
    ? girTracked.filter(h => isGreenHit(h.greenHit)).length / girTracked.length
    : (typeof round.stats?.greens === 'number' && typeof round.stats?.greensPossible === 'number' && round.stats.greensPossible > 0
      ? round.stats.greens / round.stats.greensPossible
      : null);

  const firTracked = holes.filter(h => h.par >= 4 && h.fairwayHit != null);
  const fir = firTracked.length
    ? firTracked.filter(h => isFairwayHit(h.fairwayHit)).length / firTracked.length
    : (typeof round.stats?.fairways === 'number' && typeof round.stats?.fairwaysPossible === 'number' && round.stats.fairwaysPossible > 0
      ? round.stats.fairways / round.stats.fairwaysPossible
      : null);

  const putts = typeof round.stats?.putts === 'number' ? round.stats.putts : null;
  const scramble = typeof round.stats?.upDownMade === 'number' && typeof round.stats?.upDownAttempts === 'number' && round.stats.upDownAttempts > 0
    ? round.stats.upDownMade / round.stats.upDownAttempts
    : null;
  return { gir, fir, putts, scramble };
};

const avg = (vals: Array<number | null>): number | null => {
  const f = vals.filter((v): v is number => v != null && Number.isFinite(v));
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
};

const buildTrajectoryFinding = (
  direction: HandicapTrajectoryAnalysis['trendDirection'],
  isPlateaued: boolean,
  plateauRounds: number,
  attr: TrendAttribution | null,
  scoreTrend: number | null
): TrajectoryFinding | null => {
  if (isPlateaued && plateauRounds >= 30) {
    return {
      type: 'PLATEAU_DETECTED',
      message: `${plateauRounds} rounds with no clear score trend. Performance is plateaued.`,
      actionable: `Run a focused 4-week block on ${attr?.primaryDecliner ? label[attr.primaryDecliner] : 'one weakest area'} to break the plateau.`,
    };
  }
  if (direction === 'IMPROVING' && scoreTrend != null && attr?.primaryDriver) {
    return {
      type: 'IMPROVING_ATTRIBUTED',
      message: `Scores improved ${Math.abs(scoreTrend).toFixed(1)} strokes recently. Biggest positive mover: ${label[attr.primaryDriver]}.`,
      actionable: `Hold current process and avoid adding new changes while ${label[attr.primaryDriver]} momentum is positive.`,
    };
  }
  if (direction === 'DECLINING' && scoreTrend != null && attr?.primaryDecliner) {
    return {
      type: 'DECLINING_ATTRIBUTED',
      message: `Scores worsened ${Math.abs(scoreTrend).toFixed(1)} strokes recently. Largest decline: ${label[attr.primaryDecliner]}.`,
      actionable: `Target ${label[attr.primaryDecliner]} directly for the next 3-5 rounds.`,
    };
  }
  if (direction === 'STABLE') {
    return {
      type: 'STABLE',
      message: 'Scoring is stable with no significant directional trend.',
      actionable: 'Choose one category to push deliberately; broad changes are unlikely to move scores quickly.',
    };
  }
  return null;
};

export function analyzeHandicapTrajectory(rounds: SavedRound[]): HandicapTrajectoryAnalysis {
  const completed = rounds
    .filter(r => r.score > 0 && (r.holes?.length ?? 0) >= 9)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (completed.length < 8) {
    return {
      recentScoreAvg: null,
      priorScoreAvg: null,
      scoreTrend: null,
      trendDirection: 'INSUFFICIENT_DATA',
      attribution: null,
      isPlateaued: false,
      plateauRounds: 0,
      plateauMessage: null,
      primaryFinding: null,
    };
  }

  const recent = completed.slice(0, 5);
  const prior = completed.slice(5, 15);
  const recentScoreAvg = avg(recent.map(r => r.score));
  const priorScoreAvg = avg(prior.map(r => r.score));
  const scoreTrend = recentScoreAvg != null && priorScoreAvg != null ? recentScoreAvg - priorScoreAvg : null;
  const trendDirection: HandicapTrajectoryAnalysis['trendDirection'] =
    scoreTrend == null ? 'INSUFFICIENT_DATA' : scoreTrend <= -1.5 ? 'IMPROVING' : scoreTrend >= 1.5 ? 'DECLINING' : 'STABLE';

  const isPlateaued = completed.length >= 30 && Math.abs(scoreTrend ?? 0) < 1.5;
  const plateauMessage = isPlateaued ? `${completed.length} rounds with minimal movement.` : null;

  const recentStats = recent.map(roundStats);
  const priorStats = prior.map(roundStats);
  const girDelta = (() => {
    const r = avg(recentStats.map(s => s.gir));
    const p = avg(priorStats.map(s => s.gir));
    return r != null && p != null ? p - r : null;
  })();
  const firDelta = (() => {
    const r = avg(recentStats.map(s => s.fir));
    const p = avg(priorStats.map(s => s.fir));
    return r != null && p != null ? p - r : null;
  })();
  const puttDelta = (() => {
    const r = avg(recentStats.map(s => s.putts));
    const p = avg(priorStats.map(s => s.putts));
    return r != null && p != null ? r - p : null;
  })();
  const scrambleDelta = (() => {
    const r = avg(recentStats.map(s => s.scramble));
    const p = avg(priorStats.map(s => s.scramble));
    return r != null && p != null ? p - r : null;
  })();

  const deltas: Array<[TrendAttribution['primaryDriver'], number]> = [
    ['GIR', girDelta ?? 0],
    ['FIR', firDelta ?? 0],
    ['PUTTING', puttDelta ?? 0],
    ['SCRAMBLING', scrambleDelta ?? 0],
  ];

  const attribution: TrendAttribution = {
    girDelta,
    firDelta,
    puttDelta,
    scrambleDelta,
    primaryDriver: [...deltas].sort((a, b) => a[1] - b[1])[0][0],
    primaryDecliner: [...deltas].sort((a, b) => b[1] - a[1])[0][0],
  };

  return {
    recentScoreAvg,
    priorScoreAvg,
    scoreTrend,
    trendDirection,
    attribution,
    isPlateaued,
    plateauRounds: completed.length,
    plateauMessage,
    primaryFinding: buildTrajectoryFinding(trendDirection, isPlateaued, completed.length, attribution, scoreTrend),
  };
}
