import { SavedRound } from '../types';
import { isFairwayHit, isGreenHit, isGreenMiss } from './statChecks';

export interface StatTotals {
  hit: number;
  possible: number;
  percent: number;
}

export const computeFirStats = (round: SavedRound): StatTotals | null => {
  if (round.holes && round.holes.length > 0) {
    // Only count holes that were actually played (isSaved or has score > 0)
    const playedHoles = round.holes.filter(
      hole => hole.isSaved || (hole.score > 0)
    );
    const attempts = playedHoles.filter(
      hole => hole.par >= 4 && hole.fairwayHit !== undefined && hole.fairwayHit !== null
    );
    if (attempts.length === 0) return null;
    const hit = attempts.filter(hole => isFairwayHit(hole.fairwayHit)).length;
    return {
      hit,
      possible: attempts.length,
      percent: Math.round((hit / attempts.length) * 100),
    };
  }

  if (round.stats.fairwaysPossible && round.stats.fairways !== undefined) {
    const possible = round.stats.fairwaysPossible;
    if (possible <= 0) return null;
    const hit = round.stats.fairways;
    return {
      hit,
      possible,
      percent: Math.round((hit / possible) * 100),
    };
  }

  return null;
};

export const computeGirStats = (round: SavedRound): StatTotals | null => {
  if (round.holes && round.holes.length > 0) {
    // Only count holes that were actually played (isSaved or has score > 0)
    const playedHoles = round.holes.filter(
      hole => hole.isSaved || (hole.score > 0)
    );
    const attempts = playedHoles.filter(
      hole => hole.greenHit !== undefined && hole.greenHit !== null
    );
    if (attempts.length === 0) return null;
    const hit = attempts.filter(hole => isGreenHit(hole.greenHit)).length;
    return {
      hit,
      possible: attempts.length,
      percent: Math.round((hit / attempts.length) * 100),
    };
  }

  if (round.stats.greensPossible && round.stats.greens !== undefined) {
    const possible = round.stats.greensPossible;
    if (possible <= 0) return null;
    const hit = round.stats.greens;
    return {
      hit,
      possible,
      percent: Math.round((hit / possible) * 100),
    };
  }

  return null;
};

export const computeScramblingStats = (round: SavedRound): StatTotals | null => {
  if (round.holes && round.holes.length > 0) {
    // Only count holes that were actually played (isSaved or has score > 0)
    const playedHoles = round.holes.filter(
      hole => hole.isSaved || (hole.score > 0)
    );
    const attempts = playedHoles.filter(
      hole => isGreenMiss(hole.greenHit) && hole.upDown !== undefined && hole.upDown !== null
    );
    if (attempts.length === 0) return null;
    const hit = attempts.filter(hole => hole.upDown === true).length;
    return {
      hit,
      possible: attempts.length,
      percent: Math.round((hit / attempts.length) * 100),
    };
  }

  if (round.stats.upDownAttempts && round.stats.upDownMade !== undefined) {
    const possible = round.stats.upDownAttempts;
    if (possible <= 0) return null;
    const hit = round.stats.upDownMade;
    return {
      hit,
      possible,
      percent: Math.round((hit / possible) * 100),
    };
  }

  return null;
};
