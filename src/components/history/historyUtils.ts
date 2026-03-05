import { SavedRound } from '../../types';

export const getRoundPar = (round: SavedRound): number | null => {
  // For incomplete rounds with holesPlayed, only sum par for played holes
  const playedSet = round.holesPlayed?.length ? new Set(round.holesPlayed) : null;

  if (round.courseSnapshot?.holes?.length) {
    const relevantHoles = playedSet
      ? round.courseSnapshot.holes.filter(h => playedSet.has(h.number))
      : round.courseSnapshot.holes;
    return relevantHoles.reduce((sum, hole) => sum + hole.par, 0);
  }
  if (round.holes?.length) {
    const relevantHoles = playedSet
      ? round.holes.filter(h => playedSet.has(h.number))
      : round.holes;
    const parSum = relevantHoles.reduce((sum, hole) => sum + (hole.par || 0), 0);
    return parSum > 0 ? parSum : null;
  }
  return null;
};

export const formatScoreToPar = (diff: number): string => {
  if (diff === 0) return 'E';
  if (diff > 0) return `+${diff}`;
  return `${diff}`;
};

export const getRoundScoreToPar = (round: SavedRound): string | null => {
  const parTotal = getRoundPar(round);
  if (parTotal === null) return null;
  return formatScoreToPar(round.score - parTotal);
};
