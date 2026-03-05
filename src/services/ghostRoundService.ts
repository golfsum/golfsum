import { SavedRound } from '../types';

export interface GhostRound {
  roundId: string;
  courseName: string;
  score: number;
  date: string;
  holeScores: Record<number, number>;
  holePars: Record<number, number>;
}

export interface GhostComparison {
  ghost: GhostRound;
  playerCumulative: number;
  ghostCumulative: number;
  delta: number;
  holesCompared: number;
  currentHoleGhostScore: number | null;
  currentHoleGhostToPar: number | null;
  projectedPlayerTotal: number | null;
  projectedGhostTotal: number;
  message: string;
  tone: 'ahead' | 'behind' | 'tied' | 'insufficient_data';
}

export function findGhostRound(
  rounds: SavedRound[],
  courseId: string,
  excludeRoundId?: string
): GhostRound | null {
  const candidates = rounds.filter((r) =>
    r.courseId === courseId &&
    r.id !== excludeRoundId &&
    r.score > 0 &&
    Array.isArray(r.holes) &&
    r.holes.length >= 9 &&
    (r.holes ?? []).every((h) => h.score > 0 && h.par > 0)
  );

  if (candidates.length === 0) return null;

  const best = [...candidates].sort((a, b) => a.score - b.score)[0];
  const holeScores: Record<number, number> = {};
  const holePars: Record<number, number> = {};

  for (const h of best.holes ?? []) {
    holeScores[h.number] = h.score;
    holePars[h.number] = h.par;
  }

  const date = new Date(best.date);
  const dateLabel = Number.isNaN(date.getTime())
    ? 'Previous round'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    roundId: best.id,
    courseName: best.courseName,
    score: best.score,
    date: dateLabel,
    holeScores,
    holePars,
  };
}

export function buildGhostComparison(
  ghost: GhostRound,
  playedHoles: Array<{ number: number; par: number; score: number }>,
  currentHoleNum: number,
  totalHoles = 18
): GhostComparison {
  const resolvedTotalHoles = Math.max(
    Object.keys(ghost.holeScores).length,
    totalHoles
  );

  if (playedHoles.length === 0) {
    return {
      ghost,
      playerCumulative: 0,
      ghostCumulative: 0,
      delta: 0,
      holesCompared: 0,
      currentHoleGhostScore: ghost.holeScores[currentHoleNum] ?? null,
      currentHoleGhostToPar:
        ghost.holeScores[currentHoleNum] != null && ghost.holePars[currentHoleNum] != null
          ? ghost.holeScores[currentHoleNum] - ghost.holePars[currentHoleNum]
          : null,
      projectedPlayerTotal: null,
      projectedGhostTotal: ghost.score,
      message: `Your best round here was ${ghost.score} (${ghost.date})`,
      tone: 'insufficient_data',
    };
  }

  const sharedHoles = playedHoles.filter((h) => ghost.holeScores[h.number] != null);
  const playerCumulative = sharedHoles.reduce((s, h) => s + h.score, 0);
  const ghostCumulative = sharedHoles.reduce((s, h) => s + ghost.holeScores[h.number], 0);
  const delta = playerCumulative - ghostCumulative;

  const playedHoleNums = new Set(playedHoles.map((h) => h.number));
  const ghostOnRemainingHoles = Object.entries(ghost.holeScores)
    .filter(([num]) => !playedHoleNums.has(Number(num)))
    .reduce((s, [, score]) => s + score, 0);

  let projectedPlayerTotal: number | null = null;
  if (sharedHoles.length >= 3 && ghostCumulative > 0) {
    const relativeToGhost = playerCumulative / ghostCumulative;
    const projectedRemaining = Math.round(ghostOnRemainingHoles * relativeToGhost);
    projectedPlayerTotal = playerCumulative + projectedRemaining;

    const MAX_DEVIATION = 20;
    projectedPlayerTotal = Math.max(
      ghost.score - MAX_DEVIATION,
      Math.min(ghost.score + MAX_DEVIATION, projectedPlayerTotal)
    );
  } else if (playedHoles.length >= 1) {
    const playedTotal = playedHoles.reduce((s, h) => s + h.score, 0);
    const pace = playedTotal / playedHoles.length;
    const holesRemaining = resolvedTotalHoles - playedHoles.length;
    projectedPlayerTotal = Math.round(playedTotal + pace * holesRemaining);
  }

  const currentHoleGhostScore = ghost.holeScores[currentHoleNum] ?? null;
  const currentHoleGhostPar = ghost.holePars[currentHoleNum] ?? null;
  const currentHoleGhostToPar = currentHoleGhostScore !== null && currentHoleGhostPar !== null
    ? currentHoleGhostScore - currentHoleGhostPar
    : null;

  const holesLabel = `through ${sharedHoles.length}`;
  let message: string;
  let tone: GhostComparison['tone'];

  if (delta < -2) {
    message = `${Math.abs(delta)} ahead of your best round ${holesLabel}`;
    tone = 'ahead';
  } else if (delta < 0) {
    message = `${Math.abs(delta)} ahead of your best ${holesLabel}`;
    tone = 'ahead';
  } else if (delta === 0) {
    message = `Matching your best round ${holesLabel}`;
    tone = 'tied';
  } else if (delta <= 2) {
    message = `${delta} back of your best round ${holesLabel}`;
    tone = 'behind';
  } else {
    message = `${delta} behind your best round ${holesLabel}`;
    tone = 'behind';
  }

  return {
    ghost,
    playerCumulative,
    ghostCumulative,
    delta,
    holesCompared: sharedHoles.length,
    currentHoleGhostScore,
    currentHoleGhostToPar,
    projectedPlayerTotal,
    projectedGhostTotal: ghost.score,
    message,
    tone,
  };
}
