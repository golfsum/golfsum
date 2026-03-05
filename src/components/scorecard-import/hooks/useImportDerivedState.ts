import { useMemo } from 'react';
import type { EditableTeeBox, ReviewState } from '../types';

interface Params {
  teeBoxes: EditableTeeBox[];
  activeTeeIndex: number;
  scores: string[];
  roundHoleCount: 9 | 18;
  playerNineView: 'front' | 'back';
  isCompletedMode: boolean;
  courseName: string;
  lastOcrFlags: string[];
  yardageColumnWidth: number | null;
  yardageCellGap: number;
}

export function useImportDerivedState(params: Params) {
  const yardageWidths = useMemo(() => {
    const fallback = { hole: 14, par: 22, hcp: 20, yds: 50 };
    if (!params.yardageColumnWidth || params.yardageColumnWidth <= 0) return fallback;
    const available = Math.max(0, params.yardageColumnWidth - (params.yardageCellGap * 3));
    const hole = Math.round(available * 0.1);
    const par = Math.round(available * 0.18);
    const hcp = Math.round(available * 0.16);
    const yds = Math.max(44, available - hole - par - hcp);
    return { hole, par, hcp, yds };
  }, [params.yardageCellGap, params.yardageColumnWidth]);

  const activeTee = params.teeBoxes[params.activeTeeIndex] || params.teeBoxes[0];
  const hasValidRating = true;

  const scoreValues = useMemo(() => params.scores.map(value => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }), [params.scores]);

  const scoreSummary = useMemo(() => {
    const filledScores = scoreValues.filter(value => value !== null).length;
    const isNineHoleRound = params.roundHoleCount === 9 || (filledScores === 9 && scoreValues.slice(9).every(value => value === null));
    const scoreConfirmed = filledScores >= params.roundHoleCount || (params.roundHoleCount === 18 && isNineHoleRound);
    return { filledScores, isNineHoleRound, scoreConfirmed };
  }, [params.roundHoleCount, scoreValues]);

  const playerNineRange = useMemo(() => {
    return params.playerNineView === 'front'
      ? { start: 0, end: 9 }
      : { start: 9, end: 18 };
  }, [params.playerNineView]);

  const reviewState = useMemo<ReviewState>(() => {
    if (params.isCompletedMode && !scoreSummary.scoreConfirmed) {
      return { kind: 'score_missing', reason: 'undetected' };
    }
    if (!params.courseName.trim()) {
      return { kind: 'course_missing' };
    }
    if (!activeTee) {
      return { kind: 'tee_missing' };
    }
    if (params.lastOcrFlags.length > 0) {
      return { kind: 'low_confidence', fields: params.lastOcrFlags };
    }
    return { kind: 'ok' };
  }, [activeTee, params.courseName, params.isCompletedMode, params.lastOcrFlags, scoreSummary.scoreConfirmed]);

  return {
    yardageWidths,
    activeTee,
    hasValidRating,
    scoreValues,
    scoreSummary,
    playerNineRange,
    reviewState,
  };
}
