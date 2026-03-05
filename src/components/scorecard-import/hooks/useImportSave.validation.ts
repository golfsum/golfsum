interface ScoreSummary {
  filledScores: number;
  isNineHoleRound: boolean;
  scoreConfirmed: boolean;
}

export type ImportScoreValidationError = 'missing_scores' | 'incomplete_18' | 'incomplete_9';

export function validateImportScoreSummary(
  scoreSummary: ScoreSummary,
  roundHoleCount: 9 | 18
): ImportScoreValidationError | null {
  if (scoreSummary.filledScores < Math.min(9, roundHoleCount)) {
    return 'missing_scores';
  }

  if (roundHoleCount === 18 && !scoreSummary.isNineHoleRound && scoreSummary.filledScores < 18) {
    return 'incomplete_18';
  }

  if (roundHoleCount === 9 && scoreSummary.filledScores < 9) {
    return 'incomplete_9';
  }

  return null;
}

