import { useMemo } from 'react';
import type { InputType } from '../types';
import type { ScorecardImportStyles } from '../../ScorecardImportScreen.styles';

interface Params {
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
  uiCopy: {
    holeLabelPrefix: string;
    keypadChooseValue: string;
  };
}

export function useImportModalsProps(params: Params) {
  return useMemo(() => ({
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
    uiCopy: params.uiCopy,
  }), [params]);
}
