import React from 'react';
import { CourseDetails } from '../services/golfCourseApiService';
import type { SavedRound } from '../types';
import type { CourseSeed } from './scorecard-import/types';
import type { UpgradeTrigger } from './UpgradeSheet';
import { ImportScreenLayout } from './scorecard-import/ImportScreenLayout';
import { useScorecardImportController } from './scorecard-import/hooks/useScorecardImportController';

interface Props {
  onBack: () => void;
  onCourseReady: (course: CourseDetails) => void;
  courseSeed?: CourseSeed;
  mode?: 'course' | 'completed';
  onRoundSaved?: (round: SavedRound) => void;
  onNavigateToProfile?: (trigger: UpgradeTrigger) => void;
}

export const ScorecardImportScreen: React.FC<Props> = (props) => {
  const layoutProps = useScorecardImportController(props);
  return <ImportScreenLayout {...layoutProps} />;
};

