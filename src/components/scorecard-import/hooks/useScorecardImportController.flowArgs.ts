import type { useImportCourseState } from './useImportCourseState';
import type { useImportDerivedState } from './useImportDerivedState';
import type { useImportParsedData } from './useImportParsedData';
import type { useImportPlayerState } from './useImportPlayerState';
import type { useImportScanState } from './useImportScanState';
import type { useImportUiFlow } from './useImportUiFlow';
import type { usePostEligibility } from './usePostEligibility';
import type { useImportOcrFlow } from './useImportOcrFlow';
import type { useImportSaveFlow } from './useImportSaveFlow';
import type { useImportImageFlow } from './useImportImageFlow';
import type { useImportCourseFlow } from './useImportCourseFlow';
import type { useImportEditingFlow } from './useImportEditingFlow';
import type { useLockedFields } from './useLockedFields';
import type { ScorecardImportControllerParams } from './useScorecardImportController.types';

type OcrFlowArgs = Parameters<typeof useImportOcrFlow>[0];
type SaveFlowArgs = Parameters<typeof useImportSaveFlow>[0];
type ImageFlowArgs = Parameters<typeof useImportImageFlow>[0];
type CourseFlowArgs = Parameters<typeof useImportCourseFlow>[0];
type EditingFlowArgs = Parameters<typeof useImportEditingFlow>[0];

interface BuildOcrFlowArgsInput {
  params: ScorecardImportControllerParams;
  isOffline: boolean;
  mode: 'course' | 'completed';
  scan: ReturnType<typeof useImportScanState>;
  course: ReturnType<typeof useImportCourseState>;
  player: ReturnType<typeof useImportPlayerState>;
  parsedData: ReturnType<typeof useImportParsedData>;
  buildPendingScanSteps: OcrFlowArgs['buildPendingScanSteps'];
  mergeBackendResults: OcrFlowArgs['mergeBackendResults'];
}

interface BuildSaveFlowArgsInput {
  params: ScorecardImportControllerParams;
  isCompletedMode: boolean;
  isPremium: boolean;
  inTrial: boolean;
  course: ReturnType<typeof useImportCourseState>;
  scan: ReturnType<typeof useImportScanState>;
  player: ReturnType<typeof useImportPlayerState>;
  derived: ReturnType<typeof useImportDerivedState>;
  uiFlow: ReturnType<typeof useImportUiFlow>;
  postEligibility: ReturnType<typeof usePostEligibility>;
}

interface BuildImageFlowArgsInput {
  scan: ReturnType<typeof useImportScanState>;
  player: ReturnType<typeof useImportPlayerState>;
  buildPendingScanSteps: ImageFlowArgs['buildPendingScanSteps'];
}

interface BuildCourseFlowArgsInput {
  params: ScorecardImportControllerParams;
  course: ReturnType<typeof useImportCourseState>;
  player: ReturnType<typeof useImportPlayerState>;
  lockScalarField: ReturnType<typeof useLockedFields>['lockScalarField'];
}

interface BuildEditingFlowArgsInput {
  inputConfig: EditingFlowArgs['inputConfig'];
  player: ReturnType<typeof useImportPlayerState>;
  course: ReturnType<typeof useImportCourseState>;
  derived: ReturnType<typeof useImportDerivedState>;
  lockArrayIndex: ReturnType<typeof useLockedFields>['lockArrayIndex'];
  lockTeeYardageIndex: ReturnType<typeof useLockedFields>['lockTeeYardageIndex'];
  lockTeeField: ReturnType<typeof useLockedFields>['lockTeeField'];
}

export function buildOcrFlowArgs(input: BuildOcrFlowArgsInput): OcrFlowArgs {
  const {
    params,
    isOffline,
    mode,
    scan,
    course,
    player,
    parsedData,
    buildPendingScanSteps,
    mergeBackendResults,
  } = input;
  return {
    imageUri: scan.imageUri,
    backImageUri: scan.backImageUri,
    scanSide: scan.scanSide,
    cardConfig: scan.cardConfig,
    isOffline,
    mode,
    frontResult: scan.frontResult,
    lastOcrFlags: scan.lastOcrFlags,
    courseName: course.courseName,
    scanSteps: scan.scanSteps,
    buildPendingScanSteps,
    mergeBackendResults,
    applyParsedData: parsedData.applyParsedData,
    buildRoundSummary: parsedData.buildRoundSummary,
    setScanSteps: scan.setScanSteps,
    setScanState: scan.setScanState,
    setScanProgress: scan.setScanProgress,
    setIsProcessing: player.setIsProcessing,
    setRoundHoleCount: scan.setRoundHoleCount,
    setNineHoleConfirmed: scan.setNineHoleConfirmed,
    setFrontResult: scan.setFrontResult,
    setFrontHoleCount: scan.setFrontHoleCount,
    setLastOcrFlags: scan.setLastOcrFlags,
    setRoundSummary: scan.setRoundSummary,
    setScanSide: scan.setScanSide,
  };
}

export function buildSaveFlowArgs(input: BuildSaveFlowArgsInput): SaveFlowArgs {
  const { params, isCompletedMode, isPremium, inTrial, course, scan, player, derived, uiFlow, postEligibility } = input;
  return {
    isCompletedMode,
    onCourseReady: params.onCourseReady,
    onRoundSaved: params.onRoundSaved,
    goToSection: uiFlow.goToSection,
    setIsProcessing: player.setIsProcessing,
    courseSeed: params.courseSeed,
    courseName: course.courseName,
    city: course.city,
    state: course.state,
    country: course.country,
    teeBoxes: course.teeBoxes,
    pars: course.pars,
    hcpMen: course.hcpMen,
    hcpWomen: course.hcpWomen,
    roundHoleCount: scan.roundHoleCount,
    activeSection: player.activeSection,
    cardConfig: scan.cardConfig,
    imageUri: scan.imageUri,
    scoreSummary: derived.scoreSummary,
    scoreValues: derived.scoreValues,
    playerNineView: player.playerNineView,
    isPremium,
    inTrial,
    fairways: player.fairways,
    greens: player.greens,
    upDowns: player.upDowns,
    putts: player.putts,
    penalties: player.penalties,
    activeTeeIndex: course.activeTeeIndex,
    postEligibility,
    playerDate: player.playerDate,
    playerName: player.playerName,
    isProcessing: player.isProcessing,
  };
}

export function buildImageFlowArgs(input: BuildImageFlowArgsInput): ImageFlowArgs {
  const { scan, player, buildPendingScanSteps } = input;
  return {
    imageUri: scan.imageUri,
    cardConfig: scan.cardConfig,
    scanState: scan.scanState,
    buildPendingScanSteps,
    setCardConfig: scan.setCardConfig,
    setScanState: scan.setScanState,
    setScanSide: scan.setScanSide,
    setImageUri: scan.setImageUri,
    setBackImageUri: scan.setBackImageUri,
    setFrontResult: scan.setFrontResult,
    setFrontHoleCount: scan.setFrontHoleCount,
    setNineHoleConfirmed: scan.setNineHoleConfirmed,
    setScanProgress: scan.setScanProgress,
    setScanSteps: scan.setScanSteps,
    setRoundHoleCount: scan.setRoundHoleCount,
    setPlayerNineView: player.setPlayerNineView,
    setActiveSection: player.setActiveSection,
  };
}

export function buildCourseFlowArgs(input: BuildCourseFlowArgsInput): CourseFlowArgs {
  const { params, course, player, lockScalarField } = input;
  return {
    courseSeed: params.courseSeed,
    courseName: course.courseName,
    courseSearchQuery: course.courseSearchQuery,
    showCourseSuggestions: course.showCourseSuggestions,
    city: course.city,
    state: course.state,
    country: course.country,
    lockedFields: player.lockedFields,
    lockScalarField,
    setCourseName: course.setCourseName,
    setCity: course.setCity,
    setState: course.setState,
    setCountry: course.setCountry,
    setCourseSearchQuery: course.setCourseSearchQuery,
    setCourseSearchResults: course.setCourseSearchResults,
    setCourseSearchLoading: course.setCourseSearchLoading,
    setShowCourseSuggestions: course.setShowCourseSuggestions,
    setTeeBoxes: course.setTeeBoxes,
  };
}

export function buildEditingFlowArgs(input: BuildEditingFlowArgsInput): EditingFlowArgs {
  const { inputConfig, player, course, derived, lockArrayIndex, lockTeeYardageIndex, lockTeeField } = input;
  return {
    inputConfig,
    userProfile: player.userProfile,
    activeTeeId: derived.activeTee?.id,
    fairways: player.fairways,
    greens: player.greens,
    upDowns: player.upDowns,
    penalties: player.penalties,
    scores: player.scores,
    putts: player.putts,
    pars: course.pars,
    hcpMen: course.hcpMen,
    hcpWomen: course.hcpWomen,
    keypadField: player.keypadField,
    keypadMode: player.keypadMode,
    keypadValue: player.keypadValue,
    keypadInitialValue: player.keypadInitialValue,
    keypadIsFirstDigit: player.keypadIsFirstDigit,
    lockArrayIndex,
    lockTeeYardageIndex,
    lockTeeField,
    setPars: course.setPars,
    setHcpMen: course.setHcpMen,
    setHcpWomen: course.setHcpWomen,
    setTeeBoxes: course.setTeeBoxes,
    setScores: player.setScores,
    setPutts: player.setPutts,
    setPenalties: player.setPenalties,
    setUpDowns: player.setUpDowns,
    setFairways: player.setFairways,
    setGreens: player.setGreens,
    setKeypadField: player.setKeypadField,
    setKeypadValue: player.setKeypadValue,
    setKeypadInitialValue: player.setKeypadInitialValue,
    setKeypadIsFirstDigit: player.setKeypadIsFirstDigit,
    setKeypadMode: player.setKeypadMode,
    setKeypadVisible: player.setKeypadVisible,
    setFocusedHoleIndex: player.setFocusedHoleIndex,
    activeTeeIndex: course.activeTeeIndex,
    teeBoxes: course.teeBoxes,
  };
}
