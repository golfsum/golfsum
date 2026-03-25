import Storage from './storage';
import type { CourseDetails } from './golfCourseApiService';
import { logger } from '../utils/logger';
import type { InProgressTimingState } from './roundTimingService';
import { GPS_RESUME_WINDOW_MS } from './roundTimingService';

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
  endingHole?: number;
  roundLength?: '18' | 'front9' | 'back9';
  routeHoleNumbers?: number[];
  routeLabel?: string;
  startType?: InProgressStartType;
  currentHole?: number;
  holes: InProgressHole[];
  createdAt: string;
  updatedAt: string;
  courseOverride?: CourseDetails;
}

const IN_PROGRESS_KEY = '@GolfSum:inProgressRound';
const GPS_IN_PROGRESS_KEY = '@GolfSum:gpsInProgressRound';

/** GPS round paused from GpsRoundScreen — AsyncStorage (same device). */
export interface GpsInProgressRound {
  id: string;
  status: 'in_progress' | 'paused' | 'abandoned';
  courseId: string;
  courseName: string;
  teeColor: string;
  selectedTee?: { name?: string; color?: string; yards?: number } | null;
  selectedTeeYardage?: number | null;
  startingHole?: number;
  endingHole?: number;
  roundLength?: '18' | 'front9' | 'back9';
  routeHoleNumbers?: number[];
  routeLabel?: string;
  tournamentMode?: boolean;
  currentHoleIndex: number;
  pausedOnHole?: number;
  holesCompleted?: number;
  loggedShotsByHole: Record<string, unknown>;
  holeSummariesByHole: Record<string, unknown>;
  holeScoresByHole: Record<string, unknown>;
  holeFlagsByHole: Record<string, unknown>;
  puttsByHole?: Record<number, number>;
  timing: InProgressTimingState;
  createdAt: string;
  updatedAt: string;
}

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
    const payload = {
      ...draft,
      updatedAt: new Date().toISOString(),
    };
    await Storage.setItem(IN_PROGRESS_KEY, JSON.stringify(payload));
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

export async function getGpsInProgressRound(): Promise<GpsInProgressRound | null> {
  try {
    const raw = await Storage.getItem(GPS_IN_PROGRESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GpsInProgressRound;
  } catch (error) {
    logger.warn('Failed to load GPS in-progress round:', error);
    return null;
  }
}

export async function saveGpsInProgressRound(round: GpsInProgressRound): Promise<void> {
  try {
    const now = Date.now();
    const payload: GpsInProgressRound = {
      ...round,
      timing: {
        ...round.timing,
        lastActiveAt: now,
      },
      updatedAt: new Date().toISOString(),
    };
    await Storage.setItem(GPS_IN_PROGRESS_KEY, JSON.stringify(payload));
  } catch (error) {
    logger.warn('Failed to save GPS in-progress round:', error);
  }
}

export async function clearGpsInProgressRound(): Promise<void> {
  try {
    await Storage.removeItem(GPS_IN_PROGRESS_KEY);
  } catch (error) {
    logger.warn('Failed to clear GPS in-progress round:', error);
  }
}

/** Returns paused GPS round if still within resume window; drops stale data. */
export async function checkForResumableGpsRound(): Promise<GpsInProgressRound | null> {
  try {
    const round = await getGpsInProgressRound();
    if (!round || round.status !== 'paused') return null;
    const msSince = Date.now() - (round.timing?.lastActiveAt ?? 0);
    if (msSince > GPS_RESUME_WINDOW_MS) {
      await clearGpsInProgressRound();
      return null;
    }
    return round;
  } catch {
    return null;
  }
}
