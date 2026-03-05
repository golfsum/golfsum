import { RoundHole, SavedRound } from '../types';

const FALLBACK_TABLE: Record<number, { ratingsUsed: number; adjustment: number }> = {
  3: { ratingsUsed: 1, adjustment: -2.0 },
  4: { ratingsUsed: 1, adjustment: -1.0 },
  5: { ratingsUsed: 1, adjustment: 0.0 },
  6: { ratingsUsed: 2, adjustment: -1.0 },
  7: { ratingsUsed: 2, adjustment: 0.0 },
  8: { ratingsUsed: 2, adjustment: 0.0 },
  9: { ratingsUsed: 3, adjustment: 0.0 },
  10: { ratingsUsed: 3, adjustment: 0.0 },
  11: { ratingsUsed: 3, adjustment: 0.0 },
  12: { ratingsUsed: 4, adjustment: 0.0 },
  13: { ratingsUsed: 4, adjustment: 0.0 },
  14: { ratingsUsed: 4, adjustment: 0.0 },
  15: { ratingsUsed: 5, adjustment: 0.0 },
  16: { ratingsUsed: 5, adjustment: 0.0 },
  17: { ratingsUsed: 6, adjustment: 0.0 },
  18: { ratingsUsed: 6, adjustment: 0.0 },
  19: { ratingsUsed: 7, adjustment: 0.0 },
};

export interface CourseHistory {
  courseId: string;
  rounds: {
    adjustedGrossScore: number;
    coursePar: number;
  }[];
}

export function truncateToOneDecimal(value: number): number {
  return Math.trunc(value * 10) / 10;
}

export function calculateRoundRating(adjustedGrossScore: number, coursePar: number): number {
  return truncateToOneDecimal(adjustedGrossScore - coursePar);
}

export function applyMaxHoleScore(rawScore: number, holePar: number): number {
  return Math.min(rawScore, holePar + 2);
}

export function calculateAdjustedGrossScore(holeScores: number[], holePars: number[]): number {
  return holeScores.reduce((total, score, index) => total + applyMaxHoleScore(score, holePars[index] ?? 4), 0);
}

export function getRoundCoursePar(round: SavedRound): number | null {
  if (typeof round.stats?.coursePar === 'number' && round.stats.coursePar > 0) return round.stats.coursePar;
  if (round.holes && round.holes.length > 0) {
    const totalPar = round.holes.reduce((sum, hole) => sum + (hole.par || 0), 0);
    if (totalPar > 0) return totalPar;
  }
  if (round.courseSnapshot?.holes?.length) {
    const totalPar = round.courseSnapshot.holes.reduce((sum, hole) => sum + (hole.par || 0), 0);
    if (totalPar > 0) return totalPar;
  }
  return null;
}

export function isRoundRatingEligible(round: SavedRound): boolean {
  const planned = round.plannedHoles || (round.isNineHoleRound ? 9 : 18);
  const holesPlayed = round.holeCount
    || round.holesPlayed?.length
    || round.holes?.filter((h) => h.isSaved || h.score > 0).length
    || 0;
  const hasValidHoles = planned <= 9 ? holesPlayed >= 9 : holesPlayed >= 18;
  return hasValidHoles && getRoundCoursePar(round) !== null && (round.adjustedGrossScore ?? round.score) > 0;
}

export function getPersonalCourseAdjustment(courseHistory: CourseHistory): number | null {
  if (courseHistory.rounds.length < 3) return null;
  const averageScore =
    courseHistory.rounds.reduce((sum, round) => sum + round.adjustedGrossScore, 0) / courseHistory.rounds.length;
  const coursePar = courseHistory.rounds[0]?.coursePar;
  if (!coursePar) return null;
  return averageScore - coursePar;
}

export function calculateCourseAdjustedRoundRating(
  adjustedGrossScore: number,
  coursePar: number,
  courseHistory: CourseHistory | null
): { roundRating: number; isAdjusted: boolean; roundsAtCourse: number } {
  const baseRating = calculateRoundRating(adjustedGrossScore, coursePar);
  if (!courseHistory) return { roundRating: baseRating, isAdjusted: false, roundsAtCourse: 0 };

  const adjustment = getPersonalCourseAdjustment(courseHistory);
  if (adjustment === null) {
    return {
      roundRating: baseRating,
      isAdjusted: false,
      roundsAtCourse: courseHistory.rounds.length,
    };
  }

  return {
    roundRating: truncateToOneDecimal(baseRating - adjustment),
    isAdjusted: true,
    roundsAtCourse: courseHistory.rounds.length,
  };
}

export function calculatePlayerRating(roundRatings: number[]): number | null {
  const count = roundRatings.length;
  if (count < 3) return null;

  const sorted = [...roundRatings].sort((a, b) => a - b);
  if (count >= 20) {
    const recent20 = roundRatings.slice(-20);
    const selectedRatings = [...recent20].sort((a, b) => a - b).slice(0, 8);
    const average = selectedRatings.reduce((sum, value) => sum + value, 0) / selectedRatings.length;
    return truncateToOneDecimal(average);
  }

  const fallback = FALLBACK_TABLE[count];
  if (!fallback) return null;
  const selectedRatings = sorted.slice(0, fallback.ratingsUsed);
  const average = selectedRatings.reduce((sum, value) => sum + value, 0) / selectedRatings.length;
  return truncateToOneDecimal(average + fallback.adjustment);
}

export function applyRatingCaps(calculatedRating: number, bestRating: number): number {
  const softCapThreshold = bestRating + 3.0;
  let next = calculatedRating;
  if (next > softCapThreshold) {
    const excess = next - softCapThreshold;
    next = softCapThreshold + excess * 0.5;
  }
  const hardCap = bestRating + 5.0;
  return truncateToOneDecimal(Math.min(next, hardCap));
}

export function getBestRatingInLast12Months(rounds: SavedRound[], referenceDate: Date = new Date()): number | null {
  const cutoff = new Date(referenceDate);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const ratings = rounds
    .filter((round) => {
      const date = new Date(round.date as unknown as string);
      return !Number.isNaN(date.getTime()) && date >= cutoff;
    })
    .map((round) => round.differential)
    .filter((value): value is number => typeof value === 'number');
  return ratings.length ? Math.min(...ratings) : null;
}

export function applyParPlusTwoAdjustment(holes: RoundHole[]): { adjustedHoles: RoundHole[]; adjustedGrossScore: number } {
  let adjustedGrossScore = 0;
  const adjustedHoles = holes.map((hole) => {
    const cappedScore = applyMaxHoleScore(hole.score, hole.par);
    adjustedGrossScore += cappedScore;
    return {
      ...hole,
      adjustedScore: cappedScore !== hole.score ? cappedScore : undefined,
    };
  });
  return { adjustedHoles, adjustedGrossScore };
}

export function getRatingMethodLabel(isAdjusted: boolean, roundsAtCourse: number): string {
  if (isAdjusted) return `Course-adjusted · ${roundsAtCourse} rounds here`;
  if (roundsAtCourse > 0 && roundsAtCourse < 3) {
    const remaining = 3 - roundsAtCourse;
    return `Baseline · ${remaining} more round${remaining === 1 ? '' : 's'} here for course adjustment`;
  }
  return 'Baseline rating';
}

