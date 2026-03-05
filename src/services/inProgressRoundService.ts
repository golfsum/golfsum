import Storage from './storage';
import type { CourseDetails } from './golfCourseApiService';
import { logger } from '../utils/logger';

export type InProgressStartType = 'standard' | 'shotgun';

export interface InProgressHole {
  hole: number;
  par: number;
  yardage: number;
  handicap: number;
  manualStrokes: number | null;
  penaltyStrokes: number;
  score: number | null;
  putts: number | null;
  fir: 'hit' | 'left' | 'right' | 'short' | 'long' | 'double-left' | 'double-right' | null;
  gir: 'hit' | 'left' | 'right' | 'short' | 'long' | null;
  approachDistance:
    | '<50'
    | '50-100'
    | '100-150'
    | '150-200'
    | '200+'
    | '<75'
    | '75-100'
    | '100-125'
    | '125-150'
    | '150-175'
    | '175-200'
    | '200-225'
    | '225-250'
    | '250+'
    | null;
  teeClub: string | null;
  approachClub: string | null;
  upDown: boolean | null;
  firstPuttDistance: number | null;
  misHit: boolean;
  missedGreen: boolean;
  fairwayBunker: boolean;
  greenSideBunker: boolean;
  hazardOrDrop: boolean;
  dropShot: boolean;
  outOfBounds: boolean;
  drinks: number;
  /** True when the golfer explicitly tapped "Save Hole". */
  isSaved?: boolean;
}

export interface InProgressRoundDraft {
  courseId: string;
  courseName: string;
  teeName?: string;
  startingHole?: number;
  startType?: InProgressStartType;
  currentHole?: number;
  holes: InProgressHole[];
  createdAt: string;
  updatedAt: string;
  courseOverride?: CourseDetails;
}

const IN_PROGRESS_KEY = '@GolfSum:inProgressRound';

export async function getInProgressRound(): Promise<InProgressRoundDraft | null> {
  try {
    const raw = await Storage.getItem(IN_PROGRESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as InProgressRoundDraft;
  } catch (error) {
    logger.warn('Failed to load in-progress round:', error);
    return null;
  }
}

export async function saveInProgressRound(draft: InProgressRoundDraft): Promise<void> {
  try {
    await Storage.setItem(IN_PROGRESS_KEY, JSON.stringify(draft));
  } catch (error) {
    logger.warn('Failed to save in-progress round:', error);
  }
}

export async function clearInProgressRound(): Promise<void> {
  try {
    await Storage.removeItem(IN_PROGRESS_KEY);
  } catch (error) {
    logger.warn('Failed to clear in-progress round:', error);
  }
}
