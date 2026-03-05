import { SavedRound } from '../types';
import { HandicapTier, getHandicapTier } from '../utils/handicap';

export interface StrokeAllocationAnalysis {
  handicap: number;
  strokeHoles: StrokeHoleAnalysis[];
  nonStrokeHoles: NonStrokeHoleAnalysis;
  strokeHoleNetAvg: number | null;
  nonStrokeNetAvg: number | null;
  allocationEfficiency: number | null;
  strokeHoleGrossAvg: number | null;
  nonStrokeHoleGrossAvg: number | null;
  primaryFinding: StrokeAllocationFinding | null;
  hasSufficientData: boolean;
}

export interface StrokeHoleAnalysis {
  strokeIndex: number;
  par: number;
  attempts: number;
  avgScoreToPar: number;
  netAvgToPar: number;
  birdieNetRate: number;
  netParRate: number;
  netBogeyRate: number;
}

export interface NonStrokeHoleAnalysis {
  attempts: number;
  avgScoreToPar: number;
  birdieRate: number;
  parRate: number;
  bogeyPlusRate: number;
}

export type StrokeAllocationFindingType =
  | 'EFFICIENT_ALLOCATION'
  | 'INEFFICIENT_ALLOCATION'
  | 'BIRDIE_OPPORTUNITY'
  | 'PROTECTION_MINDSET';

export interface StrokeAllocationFinding {
  type: StrokeAllocationFindingType;
  message: string;
  actionable: string;
}

const empty = (): StrokeAllocationAnalysis => ({
  handicap: 0,
  strokeHoles: [],
  nonStrokeHoles: { attempts: 0, avgScoreToPar: 0, birdieRate: 0, parRate: 0, bogeyPlusRate: 0 },
  strokeHoleNetAvg: null,
  nonStrokeNetAvg: null,
  allocationEfficiency: null,
  strokeHoleGrossAvg: null,
  nonStrokeHoleGrossAvg: null,
  primaryFinding: null,
  hasSufficientData: false,
});

const buildFinding = (
  strokeNetAvg: number | null,
  nonStrokeAvg: number | null,
  efficiency: number | null,
  strokeHoles: StrokeHoleAnalysis[],
  hdcpInt: number
): StrokeAllocationFinding | null => {
  if (efficiency == null || strokeNetAvg == null || nonStrokeAvg == null) return null;
  const avgNetBirdie = strokeHoles.length
    ? strokeHoles.reduce((s, h) => s + h.birdieNetRate, 0) / strokeHoles.length
    : 0;
  const avgNetPar = strokeHoles.length
    ? strokeHoles.reduce((s, h) => s + h.netParRate, 0) / strokeHoles.length
    : 0;

  if (efficiency <= -0.15 && avgNetBirdie >= 0.15) {
    return {
      type: 'EFFICIENT_ALLOCATION',
      message: `Stroke-hole net scoring is ${Math.abs(efficiency).toFixed(2)} strokes better than non-stroke holes; allocation is working.`,
      actionable: 'Keep treating stroke holes as scoring opportunities and non-stroke holes as protection holes.',
    };
  }
  if (efficiency >= 0.15 || (avgNetBirdie < 0.10 && avgNetPar >= 0.40)) {
    return {
      type: 'PROTECTION_MINDSET',
      message: `On your ${hdcpInt} stroke holes, net birdie conversion is only ${(avgNetBirdie * 100).toFixed(0)}%.`,
      actionable: 'Reframe stroke holes as birdie opportunities in net terms, not just protection holes.',
    };
  }
  if (avgNetBirdie < 0.12 && strokeHoles.length >= 5) {
    return {
      type: 'BIRDIE_OPPORTUNITY',
      message: `Stroke-hole net birdie rate is ${(avgNetBirdie * 100).toFixed(0)}%, below opportunity level.`,
      actionable: 'Before stroke holes, set an attack target and play to net birdie standard.',
    };
  }
  return null;
};

export function analyzeStrokeAllocation(rounds: SavedRound[], handicap: number | null): StrokeAllocationAnalysis {
  if (handicap == null || handicap < 1 || handicap > 36) return empty();
  const hdcpInt = Math.round(handicap);
  const tier = getHandicapTier(handicap);
  if (tier === 'HIGH' || tier === 'BEGINNER') return empty();

  const holes = rounds
    .flatMap(r => r.holes || [])
    .filter(h => h.score > 0 && h.par > 0 && h.handicapIndex != null && h.handicapIndex > 0);
  if (holes.length < 54) return empty();

  const strokeHolesList = holes.filter(h => (h.handicapIndex ?? 99) <= hdcpInt);
  const nonStrokeList = holes.filter(h => (h.handicapIndex ?? 0) > hdcpInt);
  if (strokeHolesList.length < 18 || nonStrokeList.length < 18) return empty();

  const grouped = strokeHolesList.reduce<Record<string, typeof strokeHolesList>>((acc, h) => {
    const key = String(h.handicapIndex);
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {});

  const strokeHoles: StrokeHoleAnalysis[] = Object.entries(grouped)
    .map(([idx, hs]) => {
      if (hs.length < 4) return null;
      const par = Math.round(hs.reduce((s, h) => s + h.par, 0) / hs.length);
      const avgToPar = hs.reduce((s, h) => s + (h.score - h.par), 0) / hs.length;
      return {
        strokeIndex: Number(idx),
        par,
        attempts: hs.length,
        avgScoreToPar: avgToPar,
        netAvgToPar: avgToPar - 1,
        birdieNetRate: hs.filter(h => h.score - h.par - 1 <= -1).length / hs.length,
        netParRate: hs.filter(h => h.score - h.par - 1 === 0).length / hs.length,
        netBogeyRate: hs.filter(h => h.score - h.par - 1 >= 1).length / hs.length,
      };
    })
    .filter((v): v is StrokeHoleAnalysis => !!v);

  const strokeHoleNetAvg = strokeHolesList.reduce((s, h) => s + (h.score - h.par - 1), 0) / strokeHolesList.length;
  const strokeHoleGrossAvg = strokeHolesList.reduce((s, h) => s + (h.score - h.par), 0) / strokeHolesList.length;
  const nonStrokeNetAvg = nonStrokeList.reduce((s, h) => s + (h.score - h.par), 0) / nonStrokeList.length;
  const nonStrokeHoleGrossAvg = nonStrokeNetAvg;
  const allocationEfficiency = strokeHoleNetAvg - nonStrokeNetAvg;

  return {
    handicap,
    strokeHoles,
    nonStrokeHoles: {
      attempts: nonStrokeList.length,
      avgScoreToPar: nonStrokeNetAvg,
      birdieRate: nonStrokeList.filter(h => h.score < h.par).length / nonStrokeList.length,
      parRate: nonStrokeList.filter(h => h.score === h.par).length / nonStrokeList.length,
      bogeyPlusRate: nonStrokeList.filter(h => h.score > h.par).length / nonStrokeList.length,
    },
    strokeHoleNetAvg,
    nonStrokeNetAvg,
    allocationEfficiency,
    strokeHoleGrossAvg,
    nonStrokeHoleGrossAvg,
    primaryFinding: buildFinding(strokeHoleNetAvg, nonStrokeNetAvg, allocationEfficiency, strokeHoles, hdcpInt),
    hasSufficientData: true,
  };
}
