import React from 'react';
import { DatePickerModal } from './DatePickerModal';
import { PlayerNamePickerModal } from './PlayerNamePickerModal';
import { KeypadModal } from './KeypadModal';
import type { InputType } from './types';
import type { ScorecardImportStyles } from '../ScorecardImportScreen.styles';

interface Props {
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

export const ImportModals: React.FC<Props> = (props) => {
  return (
    <>
      <DatePickerModal
        visible={props.showDatePicker}
        date={props.tempDate}
        onChange={props.handleDatePicked}
        onClose={() => props.setShowDatePicker(false)}
        onDone={(selected) => {
          props.commitSelectedDate(selected);
          props.setShowDatePicker(false);
        }}
      />

      <PlayerNamePickerModal
        visible={props.showPlayerNamePicker}
        styles={props.styles}
        profilePlayerName={props.profilePlayerName}
        playerNameCandidates={props.playerNameCandidates}
        lockPlayerName={props.lockPlayerName}
        onClose={() => props.setShowPlayerNamePicker(false)}
      />

      <KeypadModal
        visible={props.keypadVisible}
        styles={props.styles}
        keypadField={props.keypadField}
        keypadMode={props.keypadMode}
        keypadValue={props.keypadValue}
        scoreChipOptions={props.scoreChipOptions}
        puttChipOptions={props.puttChipOptions}
        penaltyChipOptions={props.penaltyChipOptions}
        inputConfig={props.inputConfig}
        getKeypadTitle={props.getKeypadTitle}
        getFlagChipOptions={props.getFlagChipOptions}
        handleChipSelect={props.handleChipSelect}
        cancelKeypad={props.cancelKeypad}
        handleKeypadDigit={props.handleKeypadDigit}
        handleKeypadBackspace={props.handleKeypadBackspace}
        handleKeypadDecimal={props.handleKeypadDecimal}
        handleKeypadNext={props.handleKeypadNext}
        handleKeypadPrev={props.handleKeypadPrev}
        commitKeypadValue={props.commitKeypadValue}
        closeKeypad={props.closeKeypad}
        uiCopy={props.uiCopy}
      />
    </>
  );
};
