import { SavedRound } from '../types';
import { HandicapTier, getHandicapTier } from '../utils/handicap';

export interface BunkerAnalysis {
  greenside: BunkerProfile | null;
  fairway: FairwayBunkerProfile | null;
  bunkerVsGrass: BunkerGrassComparison | null;
  primaryFinding: BunkerFinding | null;
  hasSufficientData: boolean;
}

export interface BunkerProfile {
  attempts: number;
  saves: number;
  saveRate: number;
  avgPuttsAfterSave: number | null;
}

export interface FairwayBunkerProfile {
  occurrences: number;
  totalPar4Plus: number;
  ratePerRound: number;
  avgScoreToPar: number;
  avgScoreNoFB: number;
  scoringCost: number;
}

export interface BunkerGrassComparison {
  bunkerSaveRate: number;
  grassScrambleRate: number;
  gapRate: number;
  message: string;
}

export type BunkerFindingType =
  | 'POOR_BUNKER_TECHNIQUE'
  | 'FAIRWAY_BUNKER_FREQUENCY'
  | 'BUNKER_BETTER_THAN_GRASS'
  | 'FAIRWAY_BUNKER_COSTLY';

export interface BunkerFinding {
  type: BunkerFindingType;
  message: string;
  actionable: string;
  preRoundMessage: string;
}

const BUNKER_SAVE_BENCHMARKS: Record<HandicapTier, number> = {
  SCRATCH: 0.55,
  LOW: 0.4,
  MID: 0.25,
  HIGH: 0.15,
  BEGINNER: 0.08,
};

const buildBunkerFinding = (
  gs: BunkerProfile | null,
  fb: FairwayBunkerProfile | null,
  comparison: BunkerGrassComparison | null,
  tier: HandicapTier
): BunkerFinding | null => {
  const expected = BUNKER_SAVE_BENCHMARKS[tier];

  if (comparison && comparison.gapRate < -0.12 && gs && gs.attempts >= 10) {
    return {
      type: 'BUNKER_BETTER_THAN_GRASS',
      message: `Greenside bunker saves (${(gs.saveRate * 100).toFixed(0)}%) are better than grass scrambling (${(comparison.grassScrambleRate * 100).toFixed(0)}%).`,
      actionable: 'Around greens, bunker is not automatically a miss-to-avoid for your current profile.',
      preRoundMessage: 'You are currently stronger from sand than grass around greens. Use that confidence.',
    };
  }

  if (gs && gs.saveRate < expected - 0.1 && gs.attempts >= 6) {
    return {
      type: 'POOR_BUNKER_TECHNIQUE',
      message: `Greenside bunker save rate is ${(gs.saveRate * 100).toFixed(0)}%, below ${(expected * 100).toFixed(0)}% benchmark for your tier.`,
      actionable: 'Focus on entering sand behind the ball and finishing through; bunker misses are usually strike-point issues.',
      preRoundMessage: 'Bunkers have been costly. Commit to sand-first contact and full follow-through today.',
    };
  }

  if (fb && fb.scoringCost >= 0.6 && fb.occurrences >= 5) {
    return {
      type: 'FAIRWAY_BUNKER_COSTLY',
      message: `Fairway bunker holes cost ${fb.scoringCost.toFixed(2)} extra strokes vs non-bunker par 4/5 holes.`,
      actionable: 'On holes with bunker in landing zone, choose line/club to avoid sand even at modest distance cost.',
      preRoundMessage: `Fairway bunkers cost ${fb.scoringCost.toFixed(1)} strokes per hole for you. Plan tee shots to stay out.`,
    };
  }

  if (fb && fb.ratePerRound >= 2.0 && fb.occurrences >= 8) {
    return {
      type: 'FAIRWAY_BUNKER_FREQUENCY',
      message: `You average ${fb.ratePerRound.toFixed(1)} fairway bunker lies per round.`,
      actionable: 'Add a pre-tee routine to identify bunker location and pick a line that removes it.',
      preRoundMessage: `Fairway bunker frequency is high (${fb.ratePerRound.toFixed(1)}/round). Aim away from bunker side today.`,
    };
  }

  return null;
};

export function analyzeBunkers(rounds: SavedRound[], handicap?: number | null): BunkerAnalysis {
  const tier = getHandicapTier(handicap);
  const completed = rounds.filter(r => (r.holes?.length ?? 0) > 0);
  const allHoles = completed.flatMap(r => r.holes || []).filter(h => h.score > 0);

  const gsHoles = allHoles.filter(h => h.greenSideBunker === true);
  let greenside: BunkerProfile | null = null;
  if (gsHoles.length >= 6) {
    const saves = gsHoles.filter(h => h.upDown === true);
    const savesWithPutts = saves.filter(h => h.putts != null);
    greenside = {
      attempts: gsHoles.length,
      saves: saves.length,
      saveRate: saves.length / gsHoles.length,
      avgPuttsAfterSave: savesWithPutts.length >= 3
        ? savesWithPutts.reduce((s, h) => s + (h.putts ?? 0), 0) / savesWithPutts.length
        : null,
    };
  }

  const par4Plus = allHoles.filter(h => h.par >= 4);
  const fbHoles = par4Plus.filter(h => h.fairwayBunker === true);
  let fairway: FairwayBunkerProfile | null = null;
  if (fbHoles.length >= 5 && par4Plus.length >= 20) {
    const noFb = par4Plus.filter(h => !h.fairwayBunker);
    const avg = (hs: typeof par4Plus) => hs.length ? hs.reduce((s, h) => s + (h.score - h.par), 0) / hs.length : 0;
    fairway = {
      occurrences: fbHoles.length,
      totalPar4Plus: par4Plus.length,
      ratePerRound: completed.length > 0 ? fbHoles.length / completed.length : 0,
      avgScoreToPar: avg(fbHoles),
      avgScoreNoFB: avg(noFb),
      scoringCost: avg(fbHoles) - avg(noFb),
    };
  }

  let bunkerVsGrass: BunkerGrassComparison | null = null;
  const grassScramble = allHoles.filter(h => h.greenHit !== true && h.greenHit != null && !h.greenSideBunker && h.upDown != null);
  if (greenside && grassScramble.length >= 10) {
    const grassSaves = grassScramble.filter(h => h.upDown === true).length;
    const grassRate = grassSaves / grassScramble.length;
    const gap = grassRate - greenside.saveRate;
    const message = gap > 0.2
      ? `Grass scrambling (${(grassRate * 100).toFixed(0)}%) exceeds bunker saves (${(greenside.saveRate * 100).toFixed(0)}%) significantly.`
      : gap < -0.1
        ? 'Bunker saves currently outperform grass scrambling.'
        : 'Bunker and grass scramble outcomes are similar.';
    bunkerVsGrass = {
      bunkerSaveRate: greenside.saveRate,
      grassScrambleRate: grassRate,
      gapRate: gap,
      message,
    };
  }

  return {
    greenside,
    fairway,
    bunkerVsGrass,
    primaryFinding: buildBunkerFinding(greenside, fairway, bunkerVsGrass, tier),
    hasSufficientData: !!(greenside || fairway),
  };
}
