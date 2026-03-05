import type { useImportCourseState } from './useImportCourseState';
import type { useImportDerivedState } from './useImportDerivedState';
import type { useImportParsedData } from './useImportParsedData';
import type { useImportPlayerState } from './useImportPlayerState';
import type { useImportScanState } from './useImportScanState';
import type { useImportUiFlow } from './useImportUiFlow';
import type { useImportSectionTabs } from './useImportSectionTabs';
import type { useImportDatePicker } from './useImportDatePicker';
import type { useImportProfile } from './useImportProfile';
import type { useImportImageFlow } from './useImportImageFlow';
import type { useImportCourseFlow } from './useImportCourseFlow';
import type { useImportEditingFlow } from './useImportEditingFlow';
import type { useImportOcrFlow } from './useImportOcrFlow';
import type { useImportSaveFlow } from './useImportSaveFlow';
import type { useScorecardImportLayoutModel } from './useScorecardImportLayoutModel';
import type { useLockedFields } from './useLockedFields';
import type { ScorecardImportControllerParams } from './useScorecardImportController.types';
import type { ScorecardImportLayoutModelParams } from './useScorecardImportLayoutModel.types';

type DerivedStateArgs = Parameters<typeof useImportDerivedState>[0];
type UiFlowArgs = Parameters<typeof useImportUiFlow>[0];
type ParsedDataArgs = Parameters<typeof useImportParsedData>[0];
type LockedFieldsArgs = Parameters<typeof useLockedFields>[0];
type ProfileArgs = Parameters<typeof useImportProfile>[0];
type DatePickerArgs = Parameters<typeof useImportDatePicker>[0];
type LayoutModelArgs = Parameters<typeof useScorecardImportLayoutModel>[0];

interface BuildDerivedStateArgsInput {
  course: ReturnType<typeof useImportCourseState>;
  player: ReturnType<typeof useImportPlayerState>;
  scan: ReturnType<typeof useImportScanState>;
  isCompletedMode: boolean;
  yardageCellGap: number;
}

interface BuildUiFlowArgsInput {
  player: ReturnType<typeof useImportPlayerState>;
  scan: ReturnType<typeof useImportScanState>;
  sectionTabs: ReturnType<typeof useImportSectionTabs>;
  reviewKind: ReturnType<typeof useImportDerivedState>['reviewState']['kind'];
  isCompletedMode: boolean;
}

interface BuildParsedDataArgsInput {
  player: ReturnType<typeof useImportPlayerState>;
  course: ReturnType<typeof useImportCourseState>;
}

interface BuildLockedFieldsArgsInput {
  course: ReturnType<typeof useImportCourseState>;
  player: ReturnType<typeof useImportPlayerState>;
}

interface BuildProfileArgsInput {
  player: ReturnType<typeof useImportPlayerState>;
}

interface BuildDatePickerArgsInput {
  player: ReturnType<typeof useImportPlayerState>;
  lockScalarField: ReturnType<typeof useLockedFields>['lockScalarField'];
}

interface BuildLayoutModelArgsInput {
  params: ScorecardImportControllerParams;
  player: ReturnType<typeof useImportPlayerState>;
  scan: ReturnType<typeof useImportScanState>;
  course: ReturnType<typeof useImportCourseState>;
  datePicker: ReturnType<typeof useImportDatePicker>;
  uiFlow: ReturnType<typeof useImportUiFlow>;
  editing: ReturnType<typeof useImportEditingFlow>;
  imageFlow: ReturnType<typeof useImportImageFlow>;
  courseFlow: ReturnType<typeof useImportCourseFlow>;
  isCompletedMode: boolean;
  isPremium: boolean;
  inTrial: boolean;
  trialRoundsUsed: number;
  trialLimit: number;
  sectionTabs: ReturnType<typeof useImportSectionTabs>;
  lockScalarField: ReturnType<typeof useLockedFields>['lockScalarField'];
  lockTeeField: ReturnType<typeof useLockedFields>['lockTeeField'];
  derived: ReturnType<typeof useImportDerivedState>;
  ocrFlow: ReturnType<typeof useImportOcrFlow>;
  saveFlow: ReturnType<typeof useImportSaveFlow>;
}

export function buildDerivedStateArgs(input: BuildDerivedStateArgsInput): DerivedStateArgs {
  const { course, player, scan, isCompletedMode, yardageCellGap } = input;
  return {
    teeBoxes: course.teeBoxes,
    activeTeeIndex: course.activeTeeIndex,
    scores: player.scores,
    roundHoleCount: scan.roundHoleCount,
    playerNineView: player.playerNineView,
    isCompletedMode,
    courseName: course.courseName,
    lastOcrFlags: scan.lastOcrFlags,
    yardageColumnWidth: course.yardageColumnWidth,
    yardageCellGap,
  };
}

export function buildUiFlowArgs(input: BuildUiFlowArgsInput): UiFlowArgs {
  const { player, scan, sectionTabs, reviewKind, isCompletedMode } = input;
  return {
    activeSection: player.activeSection,
    setActiveSection: player.setActiveSection,
    setShowDeferredSections: player.setShowDeferredSections,
    sectionTabs,
    scanState: scan.scanState,
    reviewKind,
    isCompletedMode,
    roundHoleCount: scan.roundHoleCount,
    playerNineView: player.playerNineView,
    scanSide: scan.scanSide,
    setPlayerNineView: player.setPlayerNineView,
  };
}

export function buildParsedDataArgs(input: BuildParsedDataArgsInput): ParsedDataArgs {
  const { player, course } = input;
  return {
    lockedFields: player.lockedFields,
    teeBoxes: course.teeBoxes,
    pars: course.pars,
    fairways: player.fairways,
    greens: player.greens,
    scores: player.scores,
    putts: player.putts,
    penalties: player.penalties,
    playerName: player.playerName,
    profilePlayerName: player.profilePlayerName,
    setPars: course.setPars,
    setHcpMen: course.setHcpMen,
    setHcpWomen: course.setHcpWomen,
    setPlayerNameCandidates: player.setPlayerNameCandidates,
    setShowPlayerNamePicker: player.setShowPlayerNamePicker,
    setPlayerName: player.setPlayerName,
    setPlayerDate: player.setPlayerDate,
    setScores: player.setScores,
    setPutts: player.setPutts,
    setFairways: player.setFairways,
    setGreens: player.setGreens,
    setUpDowns: player.setUpDowns,
    setPenalties: player.setPenalties,
    setTeeBoxes: course.setTeeBoxes,
    setActiveTeeIndex: course.setActiveTeeIndex,
    setLockedFields: player.setLockedFields,
  };
}

export function buildLockedFieldsArgs(input: BuildLockedFieldsArgsInput): LockedFieldsArgs {
  const { course, player } = input;
  return {
    teeBoxes: course.teeBoxes,
    lockedFields: player.lockedFields,
    setLockedFields: player.setLockedFields,
  };
}

export function buildProfileArgs(input: BuildProfileArgsInput): ProfileArgs {
  const { player } = input;
  return {
    lockedPlayerName: player.lockedFields.playerName,
    playerName: player.playerName,
    setUserProfile: player.setUserProfile,
    setProfilePlayerName: player.setProfilePlayerName,
    setPlayerName: player.setPlayerName,
  };
}

export function buildDatePickerArgs(input: BuildDatePickerArgsInput): DatePickerArgs {
  const { player, lockScalarField } = input;
  return {
    playerDate: player.playerDate,
    setPlayerDate: player.setPlayerDate,
    lockPlayerDate: () => lockScalarField('playerDate'),
  };
}

export function buildLayoutModelArgs(input: BuildLayoutModelArgsInput): ScorecardImportLayoutModelParams & LayoutModelArgs {
  const {
    params,
    player,
    scan,
    course,
    datePicker,
    uiFlow,
    editing,
    imageFlow,
    courseFlow,
    isCompletedMode,
    isPremium,
    inTrial,
    trialRoundsUsed,
    trialLimit,
    sectionTabs,
    lockScalarField,
    lockTeeField,
    derived,
    ocrFlow,
    saveFlow,
  } = input;
  return {
    ...player,
    ...scan,
    ...course,
    ...datePicker,
    ...uiFlow,
    ...editing,
    ...imageFlow,
    ...courseFlow,
    isCompletedMode,
    isPremium,
    inTrial,
    trialRoundsUsed,
    trialLimit,
    onBack: params.onBack,
    onNavigateToProfile: params.onNavigateToProfile,
    sectionTabs,
    lockScalarField,
    lockTeeField,
    activeTee: derived.activeTee,
    hasValidRating: derived.hasValidRating,
    yardageWidths: derived.yardageWidths,
    scoreValues: derived.scoreValues,
    scoreSummary: derived.scoreSummary,
    playerNineRange: derived.playerNineRange,
    reviewState: derived.reviewState,
    hasScanWarnings: ocrFlow.hasScanWarnings,
    handleRunOCR: ocrFlow.handleRunOCR,
    stickySaveBarProps: saveFlow.stickySaveBarProps,
  };
}

