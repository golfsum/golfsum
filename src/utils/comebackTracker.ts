import { SavedRound } from '../types';

export type ComebackGoal = 'BEAT_AVERAGE' | 'BEAT_LAST' | 'BEAT_PERSONAL_BEST';

export interface ComebackTarget {
  targetBack: number;
  goal: ComebackGoal;
  message: string;
  isAchievable: boolean;
  realisticFloor: number;
}

export interface ComebackAnalysis {
  frontNineScore: number;
  frontNinePar: number;
  frontNineVsPar: number;
  backNinePar: number;
  primaryTarget: ComebackTarget | null;
  secondaryTarget: ComebackTarget | null;
  message: string;
  shouldShow: boolean;
}

export function buildComebackAnalysis(
  frontNineScore: number,
  frontNinePar: number,
  backNinePar: number,
  courseRounds: SavedRound[],
  _allRounds: SavedRound[]
): ComebackAnalysis {
  const frontVsPar = frontNineScore - frontNinePar;

  const courseFronts = courseRounds
    .filter((r) => r.holes && r.holes.length >= 9)
    .map((r) => (r.holes ?? []).filter((h) => h.number <= 9).reduce((s, h) => s + (h.score ?? 0), 0))
    .filter((s) => s > 0);

  const avgFront = courseFronts.length >= 2
    ? courseFronts.reduce((a, b) => a + b, 0) / courseFronts.length
    : null;

  const shouldShow = frontVsPar >= 3 || (avgFront !== null && frontNineScore >= avgFront + 2);

  if (!shouldShow) {
    return {
      frontNineScore,
      frontNinePar,
      frontNineVsPar: frontVsPar,
      backNinePar,
      primaryTarget: null,
      secondaryTarget: null,
      message: '',
      shouldShow: false,
    };
  }

  const courseTotals = courseRounds.filter((r) => r.score > 0).map((r) => r.score);
  const avgTotal = courseTotals.length >= 2
    ? courseTotals.reduce((a, b) => a + b, 0) / courseTotals.length
    : null;
  const lastTotal = courseRounds[0]?.score ?? null;

  const courseBackNines = courseRounds
    .filter((r) => r.holes && r.holes.length >= 18)
    .map((r) => (r.holes ?? []).filter((h) => h.number >= 10).reduce((s, h) => s + (h.score ?? 0), 0))
    .filter((s) => s > 0);

  const bestBack = courseBackNines.length > 0 ? Math.min(...courseBackNines) : backNinePar + 3;

  const targets: ComebackTarget[] = [];
  if (avgTotal !== null) {
    const needed = Math.round(avgTotal - frontNineScore);
    const isAchievable = needed >= bestBack - 2;
    targets.push({
      targetBack: needed,
      goal: 'BEAT_AVERAGE',
      isAchievable,
      realisticFloor: bestBack,
      message: isAchievable
        ? `A ${needed} on the back beats your average here (${Math.round(avgTotal)}).`
        : `You need a ${needed} to beat your average. That's a challenge but it has been done.`,
    });
  }

  if (lastTotal !== null && (avgTotal === null || lastTotal !== Math.round(avgTotal))) {
    const needed = Math.round(lastTotal - frontNineScore);
    const isAchievable = needed >= bestBack - 2;
    targets.push({
      targetBack: needed,
      goal: 'BEAT_LAST',
      isAchievable,
      realisticFloor: bestBack,
      message: isAchievable
        ? `A ${needed} on the back beats your ${lastTotal} last time out.`
        : `Need a ${needed} to beat last time's ${lastTotal}.`,
    });
  }

  if (targets.length === 0) {
    targets.push({
      targetBack: backNinePar + 2,
      goal: 'BEAT_AVERAGE',
      isAchievable: true,
      realisticFloor: backNinePar,
      message: `A ${backNinePar + 2} on the back nine is a solid finish from here.`,
    });
  }

  const headline = frontVsPar >= 6
    ? 'Tough front nine. The back is a fresh start.'
    : frontVsPar >= 3
      ? 'The round is still alive.'
      : 'The back nine is where this round gets made.';

  return {
    frontNineScore,
    frontNinePar,
    frontNineVsPar: frontVsPar,
    backNinePar,
    primaryTarget: targets[0] ?? null,
    secondaryTarget: targets[1] ?? null,
    message: `${headline} ${targets[0].message}`,
    shouldShow: true,
  };
}
