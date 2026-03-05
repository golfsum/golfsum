import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SavedRound } from '../../../types';
import type { CourseDetails } from '../../../services/golfCourseApiService';
import type { CourseSeed, EditableTeeBox } from '../types';
import { UI_COPY } from '../../../constants/uiCopy';
import { useImportSave } from './useImportSave';
import type { CardConfigState } from './useImportScanState';

interface Params {
  isCompletedMode: boolean;
  onCourseReady: (course: CourseDetails) => void;
  onRoundSaved?: (round: SavedRound) => void;
  goToSection: (section: 'photo' | 'player' | 'course' | 'yardages') => void;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  courseSeed?: CourseSeed;
  courseName: string;
  city: string;
  state: string;
  country: string;
  teeBoxes: EditableTeeBox[];
  pars: string[];
  hcpMen: string[];
  hcpWomen: string[];
  activeSection: 'photo' | 'player' | 'course' | 'yardages';
  cardConfig: CardConfigState;
  roundHoleCount: 9 | 18;
  imageUri: string | null;
  scoreSummary: { filledScores: number; isNineHoleRound: boolean; scoreConfirmed: boolean };
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
  postEligibility:
    | { eligible: true }
    | { eligible: false; reason: 'score_missing' | 'course_missing' | 'tee_missing' };
  playerDate: string;
  playerName: string;
  isProcessing: boolean;
}

export function useImportSaveFlow(params: Params) {
  const { handleSaveCourse, handleSaveRound } = useImportSave({
    onCourseReady: params.onCourseReady,
    onRoundSaved: params.onRoundSaved,
    goToSection: params.goToSection,
    setIsProcessing: params.setIsProcessing,
    courseSeed: params.courseSeed,
    courseName: params.courseName,
    city: params.city,
    state: params.state,
    country: params.country,
    teeBoxes: params.teeBoxes,
    pars: params.pars,
    hcpMen: params.hcpMen,
    hcpWomen: params.hcpWomen,
    roundHoleCount: params.roundHoleCount,
    imageUri: params.imageUri,
    scoreSummary: params.scoreSummary,
    scoreValues: params.scoreValues,
    playerNineView: params.playerNineView,
    isPremium: params.isPremium,
    inTrial: params.inTrial,
    fairways: params.fairways,
    greens: params.greens,
    upDowns: params.upDowns,
    putts: params.putts,
    penalties: params.penalties,
    activeTeeIndex: params.activeTeeIndex,
    postEligibility: params.postEligibility,
    playerDate: params.playerDate,
    playerName: params.playerName,
  });

  const isCompletedPhotoSection = params.isCompletedMode && params.activeSection === 'photo';
  const isScoreExtractionComplete = params.scoreSummary.scoreConfirmed;

  const saveButtonLabel = params.isCompletedMode
    ? (isScoreExtractionComplete ? UI_COPY.scorecardImport.stickySaveRound : 'Scan scorecard to continue')
    : UI_COPY.scorecardImport.stickySaveCourseAndStart;

  const isPhotoNextDisabled = isCompletedPhotoSection || (params.isCompletedMode && !isScoreExtractionComplete);

  const onSave = params.isCompletedMode
    ? isCompletedPhotoSection
      ? () => {}
      : handleSaveRound
    : handleSaveCourse;

  const stickySaveBarProps = useMemo(
    () => ({
      isProcessing: params.isProcessing,
      buttonLabel: saveButtonLabel,
      onPress: onSave,
      disabled: isPhotoNextDisabled,
    }),
    [isPhotoNextDisabled, onSave, params.isProcessing, saveButtonLabel]
  );

  return {
    handleSaveCourse,
    handleSaveRound,
    stickySaveBarProps,
  };
}
