import { useTopSummaryProps } from './useTopSummaryProps';
import { useImportModalsProps } from './useImportModalsProps';
import { UI_COPY } from '../../../constants/uiCopy';
import type { InputType, ReviewState, RoundSummary, ScanState } from '../types';
import type { ScorecardImportStyles } from '../../ScorecardImportScreen.styles';

interface Params {
  courseName: string;
  reviewState: ReviewState;
  activeTeeName?: string;
  roundHoleCount: 9 | 18;
  playerDate: string;
  isCompletedMode: boolean;
  scanState: ScanState;
  isPremium: boolean;
  inTrial: boolean;
  trialRoundsUsed: number;
  trialLimit: number;
  roundSummary: RoundSummary | null;
  onPressTee: () => void;
  onPressHoles: () => void;
  onPressDate: () => void;
  onUpgradeTrial: () => void;
  showDatePicker: boolean;
  setShowDatePicker: (visible: boolean) => void;
  tempDate: Date;
  handleDatePicked: (event: { type: string; nativeEvent?: { timestamp?: number } }, date?: Date) => void;
  commitSelectedDate: (selected: Date) => void;
  showPlayerNamePicker: boolean;
  setShowPlayerNamePicker: (visible: boolean) => void;
  styles: ScorecardImportStyles;
  profilePlayerName: string;
  playerNameCandidates: string[];
  lockPlayerName: (name: string) => void;
  keypadVisible: boolean;
  keypadField: { index?: number; field: InputType } | null;
  keypadMode: 'chips' | 'keypad';
  keypadValue: string;
  scoreChipOptions: Array<number | string>;
  puttChipOptions: Array<number | string>;
  penaltyChipOptions: Array<number | string>;
  inputConfig: Record<InputType, {
    type: 'chips' | 'numberPad';
    options?: Array<number | string>;
    allowDecimal?: boolean;
    maxLength?: number;
  }>;
  getKeypadTitle: (field?: InputType) => string;
  getFlagChipOptions: (field: 'fairway' | 'green') => Array<{ label: string; value: string }>;
  handleChipSelect: (option: number | string) => void;
  cancelKeypad: () => void;
  handleKeypadDigit: (digit: string) => void;
  handleKeypadBackspace: () => void;
  handleKeypadDecimal: () => void;
  handleKeypadNext: () => void;
  handleKeypadPrev: () => void;
  commitKeypadValue: (value: string) => void;
  closeKeypad: () => void;
}

export function useImportOverlayProps(params: Params) {
  const topSummaryProps = useTopSummaryProps({
    courseName: params.courseName,
    reviewState: params.reviewState,
    activeTeeName: params.activeTeeName,
    roundHoleCount: params.roundHoleCount,
    playerDate: params.playerDate,
    isCompletedMode: params.isCompletedMode,
    scanState: params.scanState,
    isPremium: params.isPremium,
    inTrial: params.inTrial,
    trialRoundsUsed: params.trialRoundsUsed,
    trialLimit: params.trialLimit,
    roundSummary: params.roundSummary,
    onPressTee: params.onPressTee,
    onPressHoles: params.onPressHoles,
    onPressDate: params.onPressDate,
    onUpgradeTrial: params.onUpgradeTrial,
  });

  const importModalsProps = useImportModalsProps({
    showDatePicker: params.showDatePicker,
    setShowDatePicker: params.setShowDatePicker,
    tempDate: params.tempDate,
    handleDatePicked: params.handleDatePicked,
    commitSelectedDate: params.commitSelectedDate,
    showPlayerNamePicker: params.showPlayerNamePicker,
    setShowPlayerNamePicker: params.setShowPlayerNamePicker,
    styles: params.styles,
    profilePlayerName: params.profilePlayerName,
    playerNameCandidates: params.playerNameCandidates,
    lockPlayerName: params.lockPlayerName,
    keypadVisible: params.keypadVisible,
    keypadField: params.keypadField,
    keypadMode: params.keypadMode,
    keypadValue: params.keypadValue,
    scoreChipOptions: params.scoreChipOptions,
    puttChipOptions: params.puttChipOptions,
    penaltyChipOptions: params.penaltyChipOptions,
    inputConfig: params.inputConfig,
    getKeypadTitle: params.getKeypadTitle,
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
    uiCopy: {
      holeLabelPrefix: UI_COPY.scorecardImport.holeLabelPrefix,
      keypadChooseValue: UI_COPY.scorecardImport.keypadChooseValue,
    },
  });

  return { topSummaryProps, importModalsProps };
}
