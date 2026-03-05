import type { SavedRound } from '../../../types';
import type { CourseDetails } from '../../../services/golfCourseApiService';
import type { CourseSeed, EditableTeeBox } from '../types';

export type PostEligibilityReason = 'score_missing' | 'course_missing' | 'tee_missing';

export type PostEligibility =
  | { eligible: true }
  | { eligible: false; reason: PostEligibilityReason };

export interface ImportScoreSummary {
  filledScores: number;
  isNineHoleRound: boolean;
  scoreConfirmed: boolean;
}

export interface UseImportSaveParams {
  onCourseReady: (course: CourseDetails) => void;
  onRoundSaved?: (round: SavedRound) => void;
  goToSection: (section: 'photo' | 'player' | 'course' | 'yardages') => void;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  courseSeed?: CourseSeed;
  courseName: string;
  city: string;
  state: string;
  country: string;
  teeBoxes: EditableTeeBox[];
  pars: string[];
  hcpMen: string[];
  hcpWomen: string[];
  roundHoleCount: 9 | 18;
  imageUri: string | null;
  scoreSummary: ImportScoreSummary;
  scoreValues: Array<number | null>;
  playerNineView: 'front' | 'back';
  isPremium: boolean;
  inTrial: boolean;
  fairways: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  greens: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  upDowns: Array<boolean | null>;
  putts: string[];
  penalties: string[];
  activeTeeIndex: number;
  postEligibility: PostEligibility;
  playerDate: string;
  playerName: string;
}
