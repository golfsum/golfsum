import { UI_COPY } from '../../constants/uiCopy';
import type { InputType, ScanStep } from './types';

export const buildPendingScanSteps = (side: 'front' | 'back' = 'front'): ScanStep[] => [
  {
    id: 'scores',
    label: side === 'back' ? UI_COPY.scorecardImport.scanBackSideScores : UI_COPY.scorecardImport.scanScoresAndStats,
    status: 'pending',
  },
  { id: 'course', label: UI_COPY.scorecardImport.scanCourseAndTees, status: 'pending' },
  { id: 'yardages', label: UI_COPY.scorecardImport.scanYardagesAndPars, status: 'pending' },
];

export const getKeypadTitle = (field?: InputType): string => {
  if (!field) return UI_COPY.scorecardImport.keypadTitleFallback;
  if (field === 'score') return UI_COPY.scorecardImport.keypadTitleScore;
  if (field === 'putts') return UI_COPY.scorecardImport.keypadTitlePutts;
  if (field === 'penalties') return UI_COPY.scorecardImport.keypadTitlePenalties;
  if (field === 'fairway') return UI_COPY.scorecardImport.keypadTitleFairway;
  if (field === 'green') return UI_COPY.scorecardImport.keypadTitleGreen;
  if (field === 'par') return UI_COPY.scorecardImport.keypadTitlePar;
  if (field === 'hcpMen') return UI_COPY.scorecardImport.keypadTitleHcpMen;
  if (field === 'hcpWomen') return UI_COPY.scorecardImport.keypadTitleHcpWomen;
  if (field === 'yardage') return UI_COPY.scorecardImport.keypadTitleYardage;
  if (field === 'ratingMen') return UI_COPY.scorecardImport.keypadTitleRatingMen;
  if (field === 'slopeMen') return UI_COPY.scorecardImport.keypadTitleSlopeMen;
  if (field === 'ratingWomen') return UI_COPY.scorecardImport.keypadTitleRatingWomen;
  if (field === 'slopeWomen') return UI_COPY.scorecardImport.keypadTitleSlopeWomen;
  return UI_COPY.scorecardImport.keypadTitleFallback;
};
