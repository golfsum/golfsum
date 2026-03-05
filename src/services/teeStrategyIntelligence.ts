import { SavedRound, RoundHole } from '../types';
import { isFairwayHit } from '../utils/statChecks';

export interface TeeStrategyAnalysis {
  byClub: ClubScoringProfile[];
  byFairwayResult: FairwayScoringProfile;
  primaryFinding: TeeStrategyFinding | null;
  hasSufficientData: boolean;
}

export interface ClubScoringProfile {
  club: string;
  useCount: number;
  fairwayRate: number;
  avgScoreToPar: number;
  avgScoreInFW: number;
  avgScoreOutFW: number;
  scoringEdge: number | null;
}

export interface FairwayScoringProfile {
  inFairwayAvgToPar: number;
  outFairwayAvgToPar: number;
  fairwayMissCost: number;
  inFairwayCount: number;
  outFairwayCount: number;
}

export type TeeStrategyFindingType =
  | 'DRIVER_SCORING_BETTER'
  | 'ALTERNATIVE_SCORING_BETTER'
  | 'FAIRWAY_MISS_CHEAP'
  | 'FAIRWAY_MISS_EXPENSIVE'
  | 'CLUBS_EQUIVALENT';

export interface TeeStrategyFinding {
  type: TeeStrategyFindingType;
  driverProfile: ClubScoringProfile | null;
  altProfile: ClubScoringProfile | null;
  scoringDiff: number | null;
  message: string;
  actionable: string;
  preRoundMessage: string;
}

const avgToPar = (holes: RoundHole[]): number =>
  holes.length > 0 ? holes.reduce((s, h) => s + (h.score - h.par), 0) / holes.length : 0;

const emptyFairwayProfile = (): FairwayScoringProfile => ({
  inFairwayAvgToPar: 0,
  outFairwayAvgToPar: 0,
  fairwayMissCost: 0,
  inFairwayCount: 0,
  outFairwayCount: 0,
});

const buildTeeStrategyFinding = (
  clubs: ClubScoringProfile[],
  fairway: FairwayScoringProfile
): TeeStrategyFinding | null => {
  const driver = clubs.find(c => c.club.toLowerCase().includes('driver') || c.club.toLowerCase() === 'd') || null;
  const alt = clubs.find(c => c !== driver && c.useCount >= 8) || null;

  if (fairway.inFairwayCount >= 15 && fairway.outFairwayCount >= 15) {
    if (fairway.fairwayMissCost < 0.4) {
      return {
        type: 'FAIRWAY_MISS_CHEAP',
        driverProfile: driver,
        altProfile: alt,
        scoringDiff: driver && alt ? driver.avgScoreToPar - alt.avgScoreToPar : null,
        message: `Missing fairway costs only ${fairway.fairwayMissCost.toFixed(2)} strokes per hole in your data.`,
        actionable: 'Use distance where controllable; fairway misses are not heavily penalized for your scoring.',
        preRoundMessage: 'Fairway misses have been relatively cheap. Use driver on suitable holes.',
      };
    }
    if (fairway.fairwayMissCost > 0.8) {
      return {
        type: 'FAIRWAY_MISS_EXPENSIVE',
        driverProfile: driver,
        altProfile: alt,
        scoringDiff: driver && alt ? driver.avgScoreToPar - alt.avgScoreToPar : null,
        message: `Missing fairway costs ${fairway.fairwayMissCost.toFixed(2)} strokes per hole in your data.`,
        actionable: 'On tight holes, prioritize the club/line that maximizes fairway probability.',
        preRoundMessage: `Fairway misses are expensive (${fairway.fairwayMissCost.toFixed(2)} strokes). Position first today.`,
      };
    }
  }

  if (!driver || !alt) return null;
  const scoringDiff = driver.avgScoreToPar - alt.avgScoreToPar;
  if (Math.abs(scoringDiff) < 0.12) {
    return {
      type: 'CLUBS_EQUIVALENT',
      driverProfile: driver,
      altProfile: alt,
      scoringDiff,
      message: `${driver.club} and ${alt.club} have near-identical scoring outcomes in your rounds.`,
      actionable: `Use ${driver.club} on wide holes and ${alt.club} on tighter layouts; outcome difference is tactical, not strategic.`,
      preRoundMessage: `${driver.club} and ${alt.club} score similarly for you. Choose by hole shape.`,
    };
  }

  if (scoringDiff < -0.12) {
    return {
      type: 'DRIVER_SCORING_BETTER',
      driverProfile: driver,
      altProfile: alt,
      scoringDiff,
      message: `You score ${Math.abs(scoringDiff).toFixed(2)} strokes per hole better with ${driver.club} than ${alt.club}.`,
      actionable: `Default to ${driver.club} where practical; distance gain is outweighing fairway tradeoff.`,
      preRoundMessage: `You score better with ${driver.club}. Use it as default on par 4/5 unless layout blocks it.`,
    };
  }

  return {
    type: 'ALTERNATIVE_SCORING_BETTER',
    driverProfile: driver,
    altProfile: alt,
    scoringDiff,
    message: `${alt.club} scores ${Math.abs(scoringDiff).toFixed(2)} strokes per hole better than ${driver.club} in your tracked rounds.`,
    actionable: `Use ${alt.club} more often on tighter holes and scoring rounds.`,
    preRoundMessage: `${alt.club} has been the better scoring club than ${driver.club} for you. Use it on tight holes today.`,
  };
};

export function analyzeTeeStrategy(rounds: SavedRound[]): TeeStrategyAnalysis {
  const holes = rounds
    .flatMap(r => r.holes || [])
    .filter(
      h =>
        h.par >= 4 &&
        h.teeClub != null &&
        h.fairwayHit !== null &&
        h.fairwayHit !== undefined &&
        typeof h.score === 'number' &&
        h.score > 0
    );

  if (holes.length < 30) {
    return { byClub: [], byFairwayResult: emptyFairwayProfile(), primaryFinding: null, hasSufficientData: false };
  }

  const grouped = holes.reduce<Record<string, RoundHole[]>>((acc, h) => {
    const key = String(h.teeClub || '').trim();
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {});

  const byClub: ClubScoringProfile[] = [];
  Object.entries(grouped).forEach(([club, hs]) => {
    if (hs.length < 8) return;
    const fw = hs.filter(h => isFairwayHit(h.fairwayHit));
    const miss = hs.filter(h => !isFairwayHit(h.fairwayHit));
    byClub.push({
      club,
      useCount: hs.length,
      fairwayRate: fw.length / hs.length,
      avgScoreToPar: avgToPar(hs),
      avgScoreInFW: fw.length >= 4 ? avgToPar(fw) : avgToPar(hs),
      avgScoreOutFW: miss.length >= 4 ? avgToPar(miss) : avgToPar(hs),
      scoringEdge: null,
    });
  });
  byClub.sort((a, b) => b.useCount - a.useCount);

  if (byClub.length >= 2) {
    byClub[0].scoringEdge = byClub[0].avgScoreToPar - byClub[1].avgScoreToPar;
    byClub[1].scoringEdge = byClub[1].avgScoreToPar - byClub[0].avgScoreToPar;
  }

  const fwHoles = holes.filter(h => isFairwayHit(h.fairwayHit));
  const oofHoles = holes.filter(h => !isFairwayHit(h.fairwayHit));
  const byFairwayResult: FairwayScoringProfile = {
    inFairwayAvgToPar: avgToPar(fwHoles),
    outFairwayAvgToPar: avgToPar(oofHoles),
    fairwayMissCost: avgToPar(oofHoles) - avgToPar(fwHoles),
    inFairwayCount: fwHoles.length,
    outFairwayCount: oofHoles.length,
  };

  return {
    byClub,
    byFairwayResult,
    primaryFinding: buildTeeStrategyFinding(byClub, byFairwayResult),
    hasSufficientData: true,
  };
}
