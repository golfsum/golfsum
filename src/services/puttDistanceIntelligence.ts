import { SavedRound } from '../types';
import { getHandicapTier, type HandicapTier } from '../utils/handicap';

const TOUR_PROXIMITY_BENCHMARKS: Record<string, number> = {
  '<50': 8,
  '50-100': 14,
  '100-125': 20,
  '125-150': 23,
  '150-175': 28,
  '175-200': 33,
  '200-225': 38,
  '225-250': 43,
  '250+': 52,
};

const EXPECTED_PROXIMITY: Record<HandicapTier, Record<string, number>> = {
  SCRATCH: { '<50': 10, '50-100': 16, '100-125': 22, '125-150': 26, '150-175': 31, '175-200': 38 },
  LOW: { '<50': 13, '50-100': 20, '100-125': 27, '125-150': 32, '150-175': 37, '175-200': 44 },
  MID: { '<50': 17, '50-100': 25, '100-125': 33, '125-150': 38, '150-175': 44, '175-200': 52 },
  HIGH: { '<50': 22, '50-100': 31, '100-125': 40, '125-150': 46, '150-175': 54, '175-200': 62 },
  BEGINNER: { '<50': 28, '50-100': 38, '100-125': 48, '125-150': 55, '150-175': 64, '175-200': 72 },
};

export interface PuttDistanceAnalysis {
  byContext: PuttDistanceContext[];
  par5GreenInTwoContext: Par5PuttContext | null;
  primaryFinding: PuttDistanceFinding | null;
  hasSufficientData: boolean;
}

export interface PuttDistanceContext {
  arrivalType: 'GIR' | 'CHIP_ON' | 'PAR5_TWO';
  parType: 3 | 4 | 5 | 'ALL';
  approachBand: string | null;
  shotCount: number;
  avgFirstPutt: number;
  expectedPutt: number;
  delta: number;
  threePuttRate: number;
  onePuttRate: number;
}

export interface Par5PuttContext {
  holeCount: number;
  avgFirstPutt: number;
  threePuttRate: number;
  proximityGrade: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR';
}

export interface PuttDistanceFinding {
  type: 'STRONG_PROXIMITY' | 'WEAK_PROXIMITY' | 'PAR3_PROXIMITY_ISSUE' | 'THREE_PUTT_DISTANCE' | 'CHIP_ON_PROXIMITY';
  message: string;
  actionable: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

const average = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

function getFirstPuttDistance(hole: Record<string, unknown>): number | null {
  const value = hole.firstPuttDistance;
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function buildPuttDistanceFinding(
  contexts: PuttDistanceContext[],
  par5Context: Par5PuttContext | null
): PuttDistanceFinding | null {
  const comparable = contexts.filter(
    context => context.arrivalType !== 'CHIP_ON' && context.parType !== 5 && context.shotCount >= 5
  );
  const worst = comparable.slice().sort((a, b) => b.delta - a.delta)[0];
  const best = comparable.slice().sort((a, b) => a.delta - b.delta)[0];

  if (worst && worst.delta >= 10 && worst.threePuttRate >= 0.2) {
    const tour = worst.approachBand ? TOUR_PROXIMITY_BENCHMARKS[worst.approachBand] : undefined;
    return {
      type: 'THREE_PUTT_DISTANCE',
      message: `From ${worst.approachBand ?? 'this range'} on par ${worst.parType} holes, first putt averages ${worst.avgFirstPutt.toFixed(0)} ft vs ${worst.expectedPutt.toFixed(0)} ft expected${tour ? ` (Tour ref ${tour} ft)` : ''}.`,
      actionable: 'Bias approach targets to center-green and prioritize reducing first-putt distance before attacking pins.',
      confidence: worst.shotCount >= 12 ? 'HIGH' : 'MEDIUM',
    };
  }

  const par3Issue = comparable.find(context => context.parType === 3 && context.delta >= 12);
  if (par3Issue) {
    return {
      type: 'PAR3_PROXIMITY_ISSUE',
      message: `Par-3 proximity from ${par3Issue.approachBand ?? 'tee'} is averaging ${par3Issue.avgFirstPutt.toFixed(0)} ft.`,
      actionable: 'On par 3s, pick the club for a committed full swing to center-green.',
      confidence: par3Issue.shotCount >= 10 ? 'HIGH' : 'MEDIUM',
    };
  }

  if (best && best.delta <= -8 && best.shotCount >= 10) {
    return {
      type: 'STRONG_PROXIMITY',
      message: `From ${best.approachBand ?? 'this range'}, first putts are ${Math.abs(best.delta).toFixed(0)} ft better than expected.`,
      actionable: `Lean on ${best.approachBand ?? 'this'} approach window when strategy allows.`,
      confidence: 'MEDIUM',
    };
  }

  if (par5Context && par5Context.proximityGrade === 'POOR' && par5Context.threePuttRate > 0.3) {
    return {
      type: 'THREE_PUTT_DISTANCE',
      message: `On par-5 green-in-two attempts, first putt averages ${par5Context.avgFirstPutt.toFixed(0)} ft with ${(par5Context.threePuttRate * 100).toFixed(0)}% three-putts.`,
      actionable: 'If pin or surface is high-risk, favor a layup to preferred wedge distance over forcing green-in-two.',
      confidence: par5Context.holeCount >= 8 ? 'HIGH' : 'MEDIUM',
    };
  }

  return null;
}

export function analyzePuttDistances(
  rounds: SavedRound[],
  handicap?: number | null
): PuttDistanceAnalysis {
  const tier = getHandicapTier(handicap);
  const allHoles = rounds
    .flatMap(round => round.holes || [])
    .filter(hole => {
      const holeAny = hole as unknown as Record<string, unknown>;
      return (
        hole.score > 0 &&
        hole.par > 0 &&
        getFirstPuttDistance(holeAny) != null
      );
    });

  if (allHoles.length < 20) {
    return { byContext: [], par5GreenInTwoContext: null, primaryFinding: null, hasSufficientData: false };
  }

  const longApproachBands = new Set(['200+', '200-225', '225-250', '250+', '175-200', '150-200']);
  const par5GreenInTwo = allHoles.filter(hole =>
    hole.par === 5 &&
    hole.greenHit === true &&
    typeof hole.approachDistance === 'string' &&
    longApproachBands.has(hole.approachDistance)
  );
  const standardGir = allHoles.filter(hole => !par5GreenInTwo.includes(hole) && hole.greenHit === true);
  const chipOn = allHoles.filter(hole => hole.greenHit !== true && hole.greenHit != null);

  const contexts: PuttDistanceContext[] = [];
  const approachBands = [...new Set(standardGir.map(hole => hole.approachDistance).filter(Boolean))] as string[];

  approachBands.forEach(band => {
    const bandHoles = standardGir.filter(hole => hole.approachDistance === band);
    if (bandHoles.length < 5) return;
    const expected = EXPECTED_PROXIMITY[tier][band];
    if (expected == null) return;

    const avgFirstPutt = average(
      bandHoles
        .map(hole => getFirstPuttDistance(hole as unknown as Record<string, unknown>))
        .filter((value): value is number => value != null)
    );
    const pushContext = (parType: 3 | 4 | 5 | 'ALL', subset: typeof bandHoles) => {
      if (subset.length < (parType === 'ALL' ? 5 : 4)) return;
      const distances = subset
        .map(hole => getFirstPuttDistance(hole as unknown as Record<string, unknown>))
        .filter((value): value is number => value != null);
      if (!distances.length) return;
      contexts.push({
        arrivalType: 'GIR',
        parType,
        approachBand: band,
        shotCount: subset.length,
        avgFirstPutt: average(distances),
        expectedPutt: expected,
        delta: average(distances) - expected,
        threePuttRate: subset.filter(hole => (hole.putts ?? 0) >= 3).length / subset.length,
        onePuttRate: subset.filter(hole => (hole.putts ?? 0) === 1).length / subset.length,
      });
    };

    pushContext('ALL', bandHoles);
    ([3, 4, 5] as const).forEach(par => pushContext(par, bandHoles.filter(hole => hole.par === par)));

  });

  if (chipOn.length >= 8) {
    const distances = chipOn
      .map(hole => getFirstPuttDistance(hole as unknown as Record<string, unknown>))
      .filter((value): value is number => value != null);
    contexts.push({
      arrivalType: 'CHIP_ON',
      parType: 'ALL',
      approachBand: null,
      shotCount: chipOn.length,
      avgFirstPutt: average(distances),
      expectedPutt: 12,
      delta: average(distances) - 12,
      threePuttRate: chipOn.filter(hole => (hole.putts ?? 0) >= 3).length / chipOn.length,
      onePuttRate: chipOn.filter(hole => (hole.putts ?? 0) === 1).length / chipOn.length,
    });
  }

  let par5GreenInTwoContext: Par5PuttContext | null = null;
  if (par5GreenInTwo.length >= 5) {
    const distances = par5GreenInTwo
      .map(hole => getFirstPuttDistance(hole as unknown as Record<string, unknown>))
      .filter((value): value is number => value != null);
    const avgFirstPutt = average(distances);
    par5GreenInTwoContext = {
      holeCount: par5GreenInTwo.length,
      avgFirstPutt,
      threePuttRate: par5GreenInTwo.filter(hole => (hole.putts ?? 0) >= 3).length / par5GreenInTwo.length,
      proximityGrade: avgFirstPutt <= 20 ? 'EXCELLENT' : avgFirstPutt <= 32 ? 'GOOD' : avgFirstPutt <= 45 ? 'AVERAGE' : 'POOR',
    };
  }

  return {
    byContext: contexts,
    par5GreenInTwoContext,
    primaryFinding: buildPuttDistanceFinding(contexts, par5GreenInTwoContext),
    hasSufficientData: true,
  };
}
