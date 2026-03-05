import { RoundHole, SavedRound } from '../types';

export type ScoreCategory = 'BIRDIE_OR_BETTER' | 'PAR' | 'BOGEY' | 'DOUBLE_PLUS';

export interface ConditionalProbs {
  birdieOrBetterRate: number;
  parRate: number;
  bogeyRate: number;
  doublePlusRate: number;
  baseline: {
    birdieOrBetterRate: number;
    parRate: number;
    bogeyRate: number;
    doublePlusRate: number;
  };
}

export interface TransitionStats {
  matrix: Record<ScoreCategory, Record<ScoreCategory, number>>;
  afterBirdie: ConditionalProbs;
  afterPar: ConditionalProbs;
  afterBogey: ConditionalProbs;
  afterDouble: ConditionalProbs;
}

export type MomentumPatternType =
  | 'BIRDIE_KILLS_NEXT'
  | 'BIRDIE_BREEDS_BIRDIE'
  | 'DOUBLE_COMPOUNDS'
  | 'DOUBLE_RESETS_WELL'
  | 'BOGEY_CHAINS'
  | 'BOGEY_IMMUNE'
  | 'PAR_SAFE';

export interface MomentumPattern {
  type: MomentumPatternType;
  strength: number;
  sampleSize: number;
  description: string;
  actionable: string;
}

export interface MomentumMatrix {
  transitions: TransitionStats;
  patterns: MomentumPattern[];
  primaryPattern: MomentumPattern | null;
  hasSufficientData: boolean;
}

const EMPTY_ROW: Record<ScoreCategory, number> = {
  BIRDIE_OR_BETTER: 0,
  PAR: 0,
  BOGEY: 0,
  DOUBLE_PLUS: 0,
};

function emptyTransitions(): TransitionStats {
  const matrix: Record<ScoreCategory, Record<ScoreCategory, number>> = {
    BIRDIE_OR_BETTER: { ...EMPTY_ROW },
    PAR: { ...EMPTY_ROW },
    BOGEY: { ...EMPTY_ROW },
    DOUBLE_PLUS: { ...EMPTY_ROW },
  };
  const baseline = {
    birdieOrBetterRate: 0,
    parRate: 0,
    bogeyRate: 0,
    doublePlusRate: 0,
  };
  return {
    matrix,
    afterBirdie: { ...baseline, baseline },
    afterPar: { ...baseline, baseline },
    afterBogey: { ...baseline, baseline },
    afterDouble: { ...baseline, baseline },
  };
}

function categorize(hole: RoundHole): ScoreCategory {
  const diff = hole.score - hole.par;
  if (diff <= -1) return 'BIRDIE_OR_BETTER';
  if (diff === 0) return 'PAR';
  if (diff === 1) return 'BOGEY';
  return 'DOUBLE_PLUS';
}

function rowTotal(row: Record<ScoreCategory, number>): number {
  return Object.values(row).reduce((a, b) => a + b, 0);
}

function detectPatterns(
  transitions: TransitionStats,
  matrix: Record<ScoreCategory, Record<ScoreCategory, number>>
): MomentumPattern[] {
  const patterns: MomentumPattern[] = [];
  const birdieTotal = rowTotal(matrix.BIRDIE_OR_BETTER);
  const bogeyTotal = rowTotal(matrix.BOGEY);
  const doubleTotal = rowTotal(matrix.DOUBLE_PLUS);
  const parTotal = rowTotal(matrix.PAR);

  if (birdieTotal >= 15) {
    const killerEffect =
      transitions.afterBirdie.doublePlusRate - transitions.afterBirdie.baseline.doublePlusRate;
    if (killerEffect >= 0.2) {
      patterns.push({
        type: 'BIRDIE_KILLS_NEXT',
        strength: Math.min(1, killerEffect / 0.35),
        sampleSize: birdieTotal,
        description: `After birdie, double+ jumps to ${(transitions.afterBirdie.doublePlusRate * 100).toFixed(0)}% (baseline ${(transitions.afterBirdie.baseline.doublePlusRate * 100).toFixed(0)}%).`,
        actionable: 'After a birdie, protect the next hole with fairway-first and center-green decisions.',
      });
    }

    const runEffect =
      transitions.afterBirdie.birdieOrBetterRate -
      transitions.afterBirdie.baseline.birdieOrBetterRate;
    if (runEffect >= 0.15 && killerEffect < 0.2) {
      patterns.push({
        type: 'BIRDIE_BREEDS_BIRDIE',
        strength: Math.min(1, runEffect / 0.3),
        sampleSize: birdieTotal,
        description: `Birdie-or-better rises to ${(transitions.afterBirdie.birdieOrBetterRate * 100).toFixed(0)}% after birdies.`,
        actionable: 'When momentum is positive and setup is favorable, stay in scoring mode.',
      });
    }
  }

  if (bogeyTotal >= 20) {
    const chainEffect = transitions.afterBogey.bogeyRate - transitions.afterBogey.baseline.bogeyRate;
    const compoundEffect =
      transitions.afterBogey.doublePlusRate - transitions.afterBogey.baseline.doublePlusRate;
    if (chainEffect >= 0.15 || compoundEffect >= 0.12) {
      patterns.push({
        type: 'BOGEY_CHAINS',
        strength: Math.min(1, Math.max(chainEffect / 0.3, compoundEffect / 0.25)),
        sampleSize: bogeyTotal,
        description: `After bogey, bogey-or-worse is ${((transitions.afterBogey.bogeyRate + transitions.afterBogey.doublePlusRate) * 100).toFixed(0)}% (baseline ${((transitions.afterBogey.baseline.bogeyRate + transitions.afterBogey.baseline.doublePlusRate) * 100).toFixed(0)}%).`,
        actionable: 'Use a deliberate reset cue after every bogey before next tee shot.',
      });
    } else if (Math.abs(chainEffect) < 0.08 && Math.abs(compoundEffect) < 0.08) {
      patterns.push({
        type: 'BOGEY_IMMUNE',
        strength: 0.6,
        sampleSize: bogeyTotal,
        description: 'Bogeys have minimal impact on your next-hole outcomes.',
        actionable: 'Keep your current reset behavior; it is preventing compounding.',
      });
    }
  }

  if (doubleTotal >= 10) {
    const compoundEffect =
      transitions.afterDouble.bogeyRate +
      transitions.afterDouble.doublePlusRate -
      (transitions.afterDouble.baseline.bogeyRate + transitions.afterDouble.baseline.doublePlusRate);
    if (compoundEffect >= 0.18) {
      patterns.push({
        type: 'DOUBLE_COMPOUNDS',
        strength: Math.min(1, compoundEffect / 0.35),
        sampleSize: doubleTotal,
        description: `After double, bogey-or-worse remains elevated at ${((transitions.afterDouble.bogeyRate + transitions.afterDouble.doublePlusRate) * 100).toFixed(0)}%.`,
        actionable: 'After double, play next hole to a bogey-max plan and remove hero decisions.',
      });
    } else if (compoundEffect < 0.08) {
      patterns.push({
        type: 'DOUBLE_RESETS_WELL',
        strength: 0.7,
        sampleSize: doubleTotal,
        description: 'Double bogeys are being contained on the next hole.',
        actionable: 'Keep the same post-double routine; containment is a strength.',
      });
    }
  }

  if (parTotal >= 30) {
    const parSafety = transitions.afterPar.parRate - transitions.afterPar.baseline.parRate;
    if (parSafety >= 0.1) {
      patterns.push({
        type: 'PAR_SAFE',
        strength: Math.min(1, parSafety / 0.2),
        sampleSize: parTotal,
        description: 'Par is a stabilizing event in your sequence pattern.',
        actionable: 'Treat par holes as anchors; use them to reset tempo and decision quality.',
      });
    }
  }

  return patterns;
}

export function analyzeMomentumTransitions(rounds: SavedRound[]): MomentumMatrix {
  const completed = rounds.filter(round => (round.holes?.length ?? 0) >= 9);
  const totalHoles = completed
    .flatMap(round => round.holes || [])
    .filter(hole => hole.score > 0 && hole.par > 0).length;
  if (totalHoles < 90) {
    return {
      transitions: emptyTransitions(),
      patterns: [],
      primaryPattern: null,
      hasSufficientData: false,
    };
  }

  const matrix: Record<ScoreCategory, Record<ScoreCategory, number>> = {
    BIRDIE_OR_BETTER: { ...EMPTY_ROW },
    PAR: { ...EMPTY_ROW },
    BOGEY: { ...EMPTY_ROW },
    DOUBLE_PLUS: { ...EMPTY_ROW },
  };

  completed.forEach(round => {
    const holes = (round.holes || [])
      .filter(hole => hole.score > 0 && hole.par > 0)
      .sort((a, b) => a.number - b.number);
    for (let i = 0; i < holes.length - 1; i += 1) {
      const from = categorize(holes[i]);
      const to = categorize(holes[i + 1]);
      matrix[from][to] += 1;
    }
  });

  const allRows = Object.values(matrix);
  const grandTotal = allRows
    .flatMap(row => Object.values(row))
    .reduce((a, b) => a + b, 0);
  const baseline = {
    birdieOrBetterRate: allRows.reduce((s, row) => s + row.BIRDIE_OR_BETTER, 0) / grandTotal,
    parRate: allRows.reduce((s, row) => s + row.PAR, 0) / grandTotal,
    bogeyRate: allRows.reduce((s, row) => s + row.BOGEY, 0) / grandTotal,
    doublePlusRate: allRows.reduce((s, row) => s + row.DOUBLE_PLUS, 0) / grandTotal,
  };
  const toProbs = (row: Record<ScoreCategory, number>): Omit<ConditionalProbs, 'baseline'> => {
    const total = rowTotal(row);
    if (total === 0) {
      return {
        birdieOrBetterRate: 0,
        parRate: 0,
        bogeyRate: 0,
        doublePlusRate: 0,
      };
    }
    return {
      birdieOrBetterRate: row.BIRDIE_OR_BETTER / total,
      parRate: row.PAR / total,
      bogeyRate: row.BOGEY / total,
      doublePlusRate: row.DOUBLE_PLUS / total,
    };
  };
  const attachBaseline = (row: Record<ScoreCategory, number>): ConditionalProbs => ({
    ...toProbs(row),
    baseline,
  });

  const transitions: TransitionStats = {
    matrix,
    afterBirdie: attachBaseline(matrix.BIRDIE_OR_BETTER),
    afterPar: attachBaseline(matrix.PAR),
    afterBogey: attachBaseline(matrix.BOGEY),
    afterDouble: attachBaseline(matrix.DOUBLE_PLUS),
  };

  const patterns = detectPatterns(transitions, matrix);
  const primaryPattern = patterns.slice().sort((a, b) => b.strength - a.strength)[0] || null;

  return {
    transitions,
    patterns,
    primaryPattern,
    hasSufficientData: true,
  };
}
