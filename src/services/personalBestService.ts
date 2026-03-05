import Storage from './storage';
import type { SavedRound } from '../types';
import { logger } from '../utils/logger';

export interface PersonalBest {
  id: string;
  title: string;
  valueText: string;
  previousText?: string;
  roundId: string;
  createdAt: string;
}

const PERSONAL_BESTS_KEY = '@GolfSum:personalBests';

export function detectPersonalBests(latestRound: SavedRound, priorRounds: SavedRound[]): PersonalBest[] {
  const createdAt = new Date().toISOString();
  const personalBests: PersonalBest[] = [];

  const getRoundParTotal = (round: SavedRound): number | null => {
    const statsAny = round.stats as { totalPar?: number; coursePar?: number };
    if (typeof statsAny.totalPar === 'number' && statsAny.totalPar > 0) {
      return statsAny.totalPar;
    }
    if (typeof statsAny.coursePar === 'number' && statsAny.coursePar > 0) {
      return statsAny.coursePar;
    }
    // For incomplete rounds with holesPlayed, only sum par for played holes
    const playedSet = round.holesPlayed?.length ? new Set(round.holesPlayed) : null;
    if (round.holes && round.holes.length > 0) {
      const relevantHoles = playedSet ? round.holes.filter(h => playedSet.has(h.number)) : round.holes;
      const total = relevantHoles.reduce((sum, hole) => sum + (hole.par || 0), 0);
      if (total > 0) return total;
    }
    if (round.courseSnapshot?.holes && round.courseSnapshot.holes.length > 0) {
      const relevantHoles = playedSet
        ? round.courseSnapshot.holes.filter(h => playedSet.has(h.number))
        : round.courseSnapshot.holes;
      const total = relevantHoles.reduce((sum, hole) => sum + (hole.par || 0), 0);
      if (total > 0) return total;
    }
    return null;
  };

  const getScoreToPar = (round: SavedRound): number | null => {
    const parTotal = getRoundParTotal(round);
    if (parTotal === null) return null;
    return round.score - parTotal;
  };

  const formatScoreToPar = (diff: number): string => {
    if (diff === 0) return 'E';
    if (diff > 0) return `+${diff}`;
    return `${diff}`;
  };

  const priorScores = priorRounds.map(round => {
    const scoreToPar = getScoreToPar(round);
    return scoreToPar ?? round.score;
  });
  const bestScore = priorScores.length ? Math.min(...priorScores) : null;
  const latestScoreToPar = getScoreToPar(latestRound);
  const latestScoreValue = latestScoreToPar ?? latestRound.score;
  const latestScoreLabel = latestScoreToPar !== null
    ? `${formatScoreToPar(latestScoreValue)} (${latestRound.score})`
    : `${latestRound.score}`;
  const bestScoreLabel = bestScore !== null && latestScoreToPar !== null
    ? `${formatScoreToPar(bestScore)}`
    : `${bestScore ?? ''}`;

  if (bestScore !== null && latestScoreValue < bestScore) {
    personalBests.push({
      id: 'best-score',
      title: 'Best Score',
      valueText: latestScoreLabel,
      previousText: bestScoreLabel || undefined,
      roundId: latestRound.id,
      createdAt,
    });
  }

  const latestFir = latestRound.stats.fairwaysPossible
    ? (latestRound.stats.fairways || 0) / latestRound.stats.fairwaysPossible * 100
    : null;
  const priorFir = priorRounds
    .filter(round => round.stats.fairwaysPossible)
    .map(round => (round.stats.fairways || 0) / (round.stats.fairwaysPossible || 1) * 100);
  if (latestFir !== null && priorFir.length > 0 && latestFir > Math.max(...priorFir)) {
    const previous = Math.max(...priorFir);
    personalBests.push({
      id: 'best-fir',
      title: 'Best Fairways Hit',
      valueText: `${Math.round(latestFir)}%`,
      previousText: `${Math.round(previous)}%`,
      roundId: latestRound.id,
      createdAt,
    });
  }

  const latestGir = latestRound.stats.greensPossible
    ? (latestRound.stats.greens || 0) / latestRound.stats.greensPossible * 100
    : null;
  const priorGir = priorRounds
    .filter(round => round.stats.greensPossible)
    .map(round => (round.stats.greens || 0) / (round.stats.greensPossible || 1) * 100);
  if (latestGir !== null && priorGir.length > 0 && latestGir > Math.max(...priorGir)) {
    const previous = Math.max(...priorGir);
    personalBests.push({
      id: 'best-gir',
      title: 'Best GIR',
      valueText: `${Math.round(latestGir)}%`,
      previousText: `${Math.round(previous)}%`,
      roundId: latestRound.id,
      createdAt,
    });
  }

  if (latestRound.stats.putts) {
    const priorPutts = priorRounds
      .filter(round => round.stats.putts)
      .map(round => round.stats.putts || 0);
    if (priorPutts.length > 0 && latestRound.stats.putts < Math.min(...priorPutts)) {
      const previous = Math.min(...priorPutts);
      personalBests.push({
        id: 'best-putts',
        title: 'Fewest Putts',
        valueText: `${latestRound.stats.putts}`,
        previousText: `${previous}`,
        roundId: latestRound.id,
        createdAt,
      });
    }
  }

  if (latestRound.stats.upDownAttempts && latestRound.stats.upDownAttempts > 0) {
    const latestRate = (latestRound.stats.upDownMade || 0) / latestRound.stats.upDownAttempts * 100;
    const priorRates = priorRounds
      .filter(round => round.stats.upDownAttempts)
      .map(round => (round.stats.upDownMade || 0) / (round.stats.upDownAttempts || 1) * 100);
    if (priorRates.length > 0 && latestRate > Math.max(...priorRates)) {
      const previous = Math.max(...priorRates);
      personalBests.push({
        id: 'best-updown',
        title: 'Best Up & Down',
        valueText: `${Math.round(latestRate)}%`,
        previousText: `${Math.round(previous)}%`,
        roundId: latestRound.id,
        createdAt,
      });
    }
  }

  return personalBests;
}

export async function appendPersonalBests(records: PersonalBest[]): Promise<void> {
  if (!records.length) return;
  try {
    const raw = await Storage.getItem(PERSONAL_BESTS_KEY);
    const existing = raw ? (JSON.parse(raw) as PersonalBest[]) : [];
    const merged = [...records, ...existing].slice(0, 50);
    await Storage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(merged));
  } catch (error) {
    logger.warn('Failed to persist personal bests:', error);
  }
}

export async function getPersonalBests(): Promise<PersonalBest[]> {
  try {
    const raw = await Storage.getItem(PERSONAL_BESTS_KEY);
    return raw ? (JSON.parse(raw) as PersonalBest[]) : [];
  } catch (error) {
    logger.warn('Failed to load personal bests:', error);
    return [];
  }
}
