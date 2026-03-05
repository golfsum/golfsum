import { styles } from '../../ScorecardImportScreen.styles';
import { INPUT_CONFIG, PENALTY_CHIP_OPTIONS, PUTT_CHIP_OPTIONS, SCORE_CHIP_OPTIONS } from '../inputConfig';
import { getKeypadTitle } from '../helpers';
import type { useImportCallbacks } from './useImportCallbacks';
import type { useImportOverlayProps } from './useImportOverlayProps';
import type { ScorecardImportLayoutModelParams } from './useScorecardImportLayoutModel.types';

type OverlayArgs = Parameters<typeof useImportOverlayProps>[0];

export function useImportOverlayArgs(
  params: ScorecardImportLayoutModelParams,
  importCallbacks: ReturnType<typeof useImportCallbacks>
): OverlayArgs {
  return {
    courseName: params.courseName,
    reviewState: params.reviewState,
    activeTeeName: params.activeTee?.name,
    roundHoleCount: params.roundHoleCount,
    playerDate: params.playerDate,
    isCompletedMode: params.isCompletedMode,
    scanState: params.scanState,
    isPremium: params.isPremium,
    inTrial: params.inTrial,
    trialRoundsUsed: params.trialRoundsUsed,
    trialLimit: params.trialLimit,
    roundSummary: params.roundSummary,
    onPressTee: importCallbacks.onPressTee,
    onPressHoles: importCallbacks.onPressHoles,
    onPressDate: importCallbacks.onPressDate,
    onUpgradeTrial: importCallbacks.onUpgradeTrial,
    showDatePicker: params.showDatePicker,
    setShowDatePicker: params.setShowDatePicker,
    tempDate: params.tempDate,
    handleDatePicked: params.handleDatePicked,
    commitSelectedDate: params.commitSelectedDate,
    showPlayerNamePicker: params.showPlayerNamePicker,
    setShowPlayerNamePicker: params.setShowPlayerNamePicker,
    styles,
    profilePlayerName: params.profilePlayerName,
    playerNameCandidates: params.playerNameCandidates,
    lockPlayerName: importCallbacks.lockPlayerName,
    keypadVisible: params.keypadVisible,
    keypadField: params.keypadField,
    keypadMode: params.keypadMode,
    keypadValue: params.keypadValue,
    scoreChipOptions: SCORE_CHIP_OPTIONS,
    puttChipOptions: PUTT_CHIP_OPTIONS,
    penaltyChipOptions: PENALTY_CHIP_OPTIONS,
    inputConfig: INPUT_CONFIG,
    getKeypadTitle,
    getFlagChipOptions: params.getFlagChipOptions,
    handleChipSelect: params.handleChipSelect,
    cancelKeypad: params.cancelKeypad,
    handleKeypadDigit: params.handleKeypadDigit,
    handleKeypadBackspace: params.handleKeypadBackspace,
    handleKeypadDecimal: params.handleKeypadDecimal,
    handleKeypadNext: params.handleKeypadNext,
    handleKeypadPrev: params.handleKeypadPrev,
    commitKeypadValue: params.commitKeypadValue,
    closeKeypad: params.closeKeypad,
  };
}
