import type { UpgradeTrigger } from '../../UpgradeSheet';
import type { SavedRound } from '../../../types';
import type { CourseDetails } from '../../../services/golfCourseApiService';
import type { CourseSeed } from '../types';

export interface ScorecardImportControllerParams {
  onBack: () => void;
  onCourseReady: (course: CourseDetails) => void;
  courseSeed?: CourseSeed;
  mode?: 'course' | 'completed';
  onRoundSaved?: (round: SavedRound) => void;
  onNavigateToProfile?: (trigger: UpgradeTrigger) => void;
}

