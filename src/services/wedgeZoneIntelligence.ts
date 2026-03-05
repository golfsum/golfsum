import { SavedRound } from '../types';
import { getHandicapTier, HandicapTier } from '../utils/handicap';

export interface WedgeZoneAnalysis {
  wedgeApproaches: WedgeBandAnalysis[];
  scramblePuttingAvg: number | null;
  girPuttAvg: number | null;
  missGirPuttAvg: number | null;
  primaryFinding: WedgeFinding | null;
}

export interface WedgeBandAnalysis {
  band: '<50' | '50-100';
  shotCount: number;
  girRate: number;
  shortRate: number;
  longRate: number;
  avgPuttsAfterGir: number | null;
  avgPuttsAfterMiss: number | null;
  scoringAvg: number;
}

export type WedgeFindingType =
  | 'STRONG_WEDGE'
  | 'POOR_WEDGE_DISTANCE'
  | 'POOR_WEDGE_PUTTING'
  | 'SCRAMBLING_EFFECTIVE'
  | 'SCRAMBLING_COSTLY'
  | 'PROXIMITY_ISSUE';

export interface WedgeFinding {
  type: WedgeFindingType;
  message: string;
  actionable: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function scramblingCount(bands: WedgeBandAnalysis[]): number {
  return bands.reduce((sum, band) => sum + band.shotCount * (1 - band.girRate), 0);
}

function buildWedgeFinding(
  bands: WedgeBandAnalysis[],
  scramblePuttingAvg: number | null,
  girPuttAvg: number | null,
  missGirPuttAvg: number | null,
  tier: HandicapTier
): WedgeFinding | null {
  const expectedWedgeGir: Record<HandicapTier, number> = {
    SCRATCH: 0.75,
    LOW: 0.6,
    MID: 0.45,
    HIGH: 0.3,
    BEGINNER: 0.2,
  };
  const expectedPuttsPerGir: Record<HandicapTier, number> = {
    SCRATCH: 1.75,
    LOW: 1.85,
    MID: 1.95,
    HIGH: 2.1,
    BEGINNER: 2.25,
  };

  const primaryBand = bands.slice().sort((a, b) => b.shotCount - a.shotCount)[0];
  if (!primaryBand) return null;
  const expectedGir = expectedWedgeGir[tier];
  const expectedPutts = expectedPuttsPerGir[tier];

  if (
    primaryBand.girRate >= expectedGir - 0.05 &&
    primaryBand.avgPuttsAfterGir != null &&
    primaryBand.avgPuttsAfterGir > expectedPutts + 0.2
  ) {
    return {
      type: 'POOR_WEDGE_PUTTING',
      message: `From inside 100 yards GIR is ${(primaryBand.girRate * 100).toFixed(0)}% but putts after GIR are ${primaryBand.avgPuttsAfterGir.toFixed(2)}. Proximity, not green-hit rate, is leaking strokes.`,
      actionable: 'Favor fat-side wedge targets and prioritize first-putt makeable distance over pin-chasing.',
      confidence: primaryBand.shotCount >= 15 ? 'HIGH' : 'MEDIUM',
    };
  }

  if (primaryBand.girRate < expectedGir - 0.1 && primaryBand.shortRate >= 0.55) {
    return {
      type: 'POOR_WEDGE_DISTANCE',
      message: `Inside 100 yards, ${(primaryBand.shortRate * 100).toFixed(0)}% of depth misses are short and GIR is ${(primaryBand.girRate * 100).toFixed(0)}%.`,
      actionable: 'Commit to full finish on wedge swings; deceleration is the common short-miss driver.',
      confidence: primaryBand.shotCount >= 12 ? 'HIGH' : 'MEDIUM',
    };
  }

  if (scramblePuttingAvg != null && girPuttAvg != null && scramblePuttingAvg - girPuttAvg >= 0.5) {
    return {
      type: 'SCRAMBLING_COSTLY',
      message: `When greens are missed you need ${scramblePuttingAvg.toFixed(2)} putts vs ${girPuttAvg.toFixed(2)} on GIR holes.`,
      actionable: 'Use simpler chip-and-run options to reduce leave distance and avoid extra putts.',
      confidence: scramblingCount(bands) >= 15 ? 'HIGH' : 'MEDIUM',
    };
  }

  if (scramblePuttingAvg != null && girPuttAvg != null && scramblePuttingAvg - girPuttAvg <= 0.25) {
    return {
      type: 'SCRAMBLING_EFFECTIVE',
      message: `Short-game conversion is holding up: missed-green putts are only ${(scramblePuttingAvg - girPuttAvg).toFixed(2)} above GIR putts.`,
      actionable: 'Keep your current short-game shot selection; this is supporting your scoring floor.',
      confidence: 'MEDIUM',
    };
  }

  if (missGirPuttAvg != null && girPuttAvg != null && missGirPuttAvg + 0.1 < girPuttAvg) {
    return {
      type: 'STRONG_WEDGE',
      message: 'You are converting missed-green situations efficiently and protecting scores around the wedge zone.',
      actionable: 'Continue using high-percentage wedge targets and simple chips.',
      confidence: 'MEDIUM',
    };
  }

  return null;
}

export function analyzeWedgeZone(
  rounds: SavedRound[],
  handicap?: number | null
): WedgeZoneAnalysis {
  const completed = rounds.filter(round => (round.holes?.length ?? 0) > 0);
  const allHoles = completed.flatMap(round => round.holes || []).filter(hole => hole.score > 0);
  const tier = getHandicapTier(handicap);
  const wedgeBands: Array<'<50' | '50-100'> = ['<50', '50-100'];
  const wedgeApproaches: WedgeBandAnalysis[] = [];

  wedgeBands.forEach(band => {
    const bandHoles = allHoles.filter(hole => hole.approachDistance === band);
    if (bandHoles.length < 5) return;
    const hits = bandHoles.filter(hole => hole.greenHit === true).length;
    const misses = bandHoles.filter(hole => hole.greenHit !== true && hole.greenHit != null);
    const depthMisses = misses.filter(hole => hole.greenHit === 'short' || hole.greenHit === 'long');
    const shortRate =
      depthMisses.length > 0
        ? misses.filter(hole => hole.greenHit === 'short').length / depthMisses.length
        : 0;
    const longRate =
      depthMisses.length > 0
        ? misses.filter(hole => hole.greenHit === 'long').length / depthMisses.length
        : 0;
    const girHolesWithPutts = bandHoles.filter(hole => hole.greenHit === true && hole.putts != null);
    const missHolesWithPutts = bandHoles.filter(
      hole => hole.greenHit !== true && hole.greenHit != null && hole.putts != null
    );

    wedgeApproaches.push({
      band,
      shotCount: bandHoles.length,
      girRate: hits / bandHoles.length,
      shortRate,
      longRate,
      avgPuttsAfterGir:
        girHolesWithPutts.length >= 3 ? average(girHolesWithPutts.map(hole => hole.putts || 0)) : null,
      avgPuttsAfterMiss:
        missHolesWithPutts.length >= 3 ? average(missHolesWithPutts.map(hole => hole.putts || 0)) : null,
      scoringAvg: average(bandHoles.map(hole => hole.score - hole.par)),
    });
  });

  const scrambleHoles = allHoles.filter(
    hole => hole.greenHit !== true && hole.greenHit != null && hole.putts != null
  );
  const scramblePuttingAvg =
    scrambleHoles.length >= 10 ? average(scrambleHoles.map(hole => hole.putts || 0)) : null;
  const girHolesWithPutts = allHoles.filter(hole => hole.greenHit === true && hole.putts != null);
  const girPuttAvg =
    girHolesWithPutts.length >= 10 ? average(girHolesWithPutts.map(hole => hole.putts || 0)) : null;
  const missGirHolesWithPutts = allHoles.filter(
    hole => hole.greenHit !== true && hole.greenHit != null && hole.putts != null
  );
  const missGirPuttAvg =
    missGirHolesWithPutts.length >= 10
      ? average(missGirHolesWithPutts.map(hole => hole.putts || 0))
      : null;

  return {
    wedgeApproaches,
    scramblePuttingAvg,
    girPuttAvg,
    missGirPuttAvg,
    primaryFinding: buildWedgeFinding(
      wedgeApproaches,
      scramblePuttingAvg,
      girPuttAvg,
      missGirPuttAvg,
      tier
    ),
  };
}
