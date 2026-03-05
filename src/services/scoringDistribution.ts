import { SavedRound } from '../types';

export interface ScoringProfile {
  distribution: HoleScoreDistribution;
  volatility: VolatilityProfile;
  archetype: PlayerArchetype;
  coachingFocus: 'FLOOR' | 'CEILING' | 'CONSISTENCY' | 'MOMENTUM';
}

export interface HoleScoreDistribution {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double: number;
  triple: number;
  worse: number;
  cleanRate: number;
  blowupRate: number;
  scoringRate: number;
  blowupCost: number;
}

export interface VolatilityProfile {
  stdDev: number;
  recentStdDev: number | null;
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  ceiling: number | null;
  floor: number | null;
  range: number | null;
}

export type PlayerArchetype =
  | 'CONSISTENT_GRINDER'
  | 'STREAKY_SCORER'
  | 'FLOOR_RAISER'
  | 'CEILING_CHASER'
  | 'DEVELOPING'
  | 'EXPLOSIVE';

function std(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, score) => sum + (score - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function classifyArchetype(params: {
  scoringRate: number;
  blowupRate: number;
  volatilityLevel: VolatilityProfile['level'];
  cleanRate: number;
}): PlayerArchetype {
  if (params.scoringRate >= 0.12 && params.blowupRate >= 0.2) return 'EXPLOSIVE';
  if (
    params.blowupRate >= 0.18 &&
    (params.volatilityLevel === 'HIGH' || params.volatilityLevel === 'EXTREME')
  ) {
    return 'CEILING_CHASER';
  }
  if (
    params.scoringRate >= 0.08 &&
    params.blowupRate >= 0.12 &&
    params.volatilityLevel === 'MODERATE'
  ) {
    return 'STREAKY_SCORER';
  }
  if (params.blowupRate <= 0.1 && params.cleanRate >= 0.88 && params.scoringRate <= 0.06) {
    return 'FLOOR_RAISER';
  }
  if (params.volatilityLevel === 'LOW' && params.blowupRate <= 0.14) return 'CONSISTENT_GRINDER';
  return 'DEVELOPING';
}

function deriveCoachingFocus(
  archetype: PlayerArchetype,
  volatilityLevel: VolatilityProfile['level'],
  blowupRate: number,
  scoringRate: number
): ScoringProfile['coachingFocus'] {
  if (archetype === 'CEILING_CHASER' || archetype === 'EXPLOSIVE') return 'FLOOR';
  if (archetype === 'FLOOR_RAISER') return 'CEILING';
  if (archetype === 'STREAKY_SCORER') return 'MOMENTUM';
  if (volatilityLevel === 'HIGH' || blowupRate >= 0.16) return 'FLOOR';
  if (scoringRate >= 0.1) return 'CEILING';
  return 'CONSISTENCY';
}

export function analyzeScoringDistribution(
  rounds: SavedRound[],
  handicap?: number | null
): ScoringProfile | null {
  const completed = rounds
    .filter(round => (round.holes?.length ?? 0) >= 9 && round.score > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (completed.length < 5) return null;

  const allHoles = completed
    .flatMap(round => round.holes || [])
    .filter(hole => hole.score > 0 && hole.par > 0);
  if (allHoles.length < 45) return null;

  const totalHoles = allHoles.length;
  const countRate = (predicate: (hole: (typeof allHoles)[number]) => boolean) =>
    allHoles.filter(predicate).length / totalHoles;

  const eagle = countRate(hole => hole.score <= hole.par - 2);
  const birdie = countRate(hole => hole.score === hole.par - 1);
  const par = countRate(hole => hole.score === hole.par);
  const bogey = countRate(hole => hole.score === hole.par + 1);
  const double = countRate(hole => hole.score === hole.par + 2);
  const triple = countRate(hole => hole.score === hole.par + 3);
  const worse = countRate(hole => hole.score >= hole.par + 4);
  const cleanRate = eagle + birdie + par + bogey;
  const blowupRate = double + triple + worse;
  const scoringRate = eagle + birdie;

  const blowupHoles = allHoles.filter(hole => hole.score >= hole.par + 2);
  const totalBlowupOverBogey = blowupHoles.reduce(
    (sum, hole) => sum + (hole.score - hole.par - 1),
    0
  );
  const blowupCost = completed.length > 0 ? totalBlowupOverBogey / completed.length : 0;

  const scores = completed.map(round => round.score).filter(Number.isFinite);
  const stdDev = std(scores);
  const recentScores = scores.slice(0, 5);
  const recentStdDev = recentScores.length >= 5 ? std(recentScores) : null;
  const last10 = scores.slice(0, 10);
  const ceiling = last10.length ? Math.min(...last10) : null;
  const floor = last10.length ? Math.max(...last10) : null;
  const range = ceiling != null && floor != null ? floor - ceiling : null;

  const volatilityLevel: VolatilityProfile['level'] =
    stdDev <= 3.5 ? 'LOW' : stdDev <= 5.5 ? 'MODERATE' : stdDev <= 8.0 ? 'HIGH' : 'EXTREME';

  const archetype = classifyArchetype({
    scoringRate,
    blowupRate,
    volatilityLevel,
    cleanRate,
  });
  const coachingFocus = deriveCoachingFocus(archetype, volatilityLevel, blowupRate, scoringRate);

  return {
    distribution: {
      eagle,
      birdie,
      par,
      bogey,
      double,
      triple,
      worse,
      cleanRate,
      blowupRate,
      scoringRate,
      blowupCost,
    },
    volatility: {
      stdDev,
      recentStdDev,
      level: volatilityLevel,
      ceiling,
      floor,
      range,
    },
    archetype,
    coachingFocus,
  };
}
