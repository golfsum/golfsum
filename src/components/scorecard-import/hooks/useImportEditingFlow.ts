import { useImportFieldUpdates } from './useImportFieldUpdates';
import { useFlagInput } from './useFlagInput';
import { useImportKeypad } from './useImportKeypad';
import type { Dispatch, SetStateAction } from 'react';
import type { EditableTeeBox, InputType, LockedFields } from '../types';
import type { UserProfile } from '../../../types';

interface Params {
  inputConfig: Record<InputType, {
    type: 'chips' | 'numberPad';
    options?: Array<number | string>;
    allowDecimal?: boolean;
    maxLength?: number;
  }>;
  userProfile: UserProfile | null;
  activeTeeIndex: number;
  activeTeeId?: string;
  teeBoxes: EditableTeeBox[];
  fairways: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  greens: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  upDowns: Array<boolean | null>;
  penalties: string[];
  scores: string[];
  putts: string[];
  pars: string[];
  hcpMen: string[];
  hcpWomen: string[];
  keypadField: { index?: number; field: InputType } | null;
  keypadMode: 'chips' | 'keypad';
  keypadValue: string;
  keypadInitialValue: string;
  keypadIsFirstDigit: boolean;
  lockArrayIndex: (field: keyof LockedFields, index: number) => void;
  lockTeeYardageIndex: (teeId: string, index: number) => void;
  lockTeeField: (teeId: string, field: 'name' | 'ratingMen' | 'slopeMen' | 'ratingWomen' | 'slopeWomen') => void;
  setFocusedHoleIndex: Dispatch<SetStateAction<number | null>>;
  setPars: Dispatch<SetStateAction<string[]>>;
  setHcpMen: Dispatch<SetStateAction<string[]>>;
  setHcpWomen: Dispatch<SetStateAction<string[]>>;
  setTeeBoxes: Dispatch<SetStateAction<EditableTeeBox[]>>;
  setScores: Dispatch<SetStateAction<string[]>>;
  setPutts: Dispatch<SetStateAction<string[]>>;
  setPenalties: Dispatch<SetStateAction<string[]>>;
  setUpDowns: Dispatch<SetStateAction<Array<boolean | null>>>;
  setFairways: Dispatch<SetStateAction<Array<boolean | 'left' | 'right' | 'short' | 'long' | null>>>;
  setGreens: Dispatch<SetStateAction<Array<boolean | 'left' | 'right' | 'short' | 'long' | null>>>;
  setKeypadField: Dispatch<SetStateAction<{ index?: number; field: InputType } | null>>;
  setKeypadValue: Dispatch<SetStateAction<string>>;
  setKeypadInitialValue: Dispatch<SetStateAction<string>>;
  setKeypadIsFirstDigit: Dispatch<SetStateAction<boolean>>;
  setKeypadMode: Dispatch<SetStateAction<'chips' | 'keypad'>>;
  setKeypadVisible: Dispatch<SetStateAction<boolean>>;
}

export function useImportEditingFlow(params: Params) {
  const { updateHoleValue, updatePlayerValue } = useImportFieldUpdates({
    activeTeeIndex: params.activeTeeIndex,
    activeTeeId: params.activeTeeId,
    setPars: params.setPars,
    setHcpMen: params.setHcpMen,
    setHcpWomen: params.setHcpWomen,
    setTeeBoxes: params.setTeeBoxes,
    setScores: params.setScores,
    setPutts: params.setPutts,
    setPenalties: params.setPenalties,
    lockArrayIndex: params.lockArrayIndex,
    lockTeeYardageIndex: params.lockTeeYardageIndex,
  });

  const {
    fairwayEditMode,
    greenEditMode,
    decodeFlagValue,
    getFlagChipOptions,
    toggleUpDown,
    toggleFlag,
    setPlayerFlag,
    renderArrowValue,
  } = useFlagInput({
    userProfile: params.userProfile,
    fairways: params.fairways,
    greens: params.greens,
    lockArrayIndex: params.lockArrayIndex,
    setFocusedHoleIndex: params.setFocusedHoleIndex,
    setUpDowns: params.setUpDowns,
    setFairways: params.setFairways,
    setGreens: params.setGreens,
  });

  const keypad = useImportKeypad({
    inputConfig: params.inputConfig,
    keypadField: params.keypadField,
    keypadMode: params.keypadMode,
    keypadValue: params.keypadValue,
    keypadInitialValue: params.keypadInitialValue,
    keypadIsFirstDigit: params.keypadIsFirstDigit,
    setFocusedHoleIndex: params.setFocusedHoleIndex,
    setKeypadField: params.setKeypadField,
    setKeypadValue: params.setKeypadValue,
    setKeypadInitialValue: params.setKeypadInitialValue,
    setKeypadIsFirstDigit: params.setKeypadIsFirstDigit,
    setKeypadMode: params.setKeypadMode,
    setKeypadVisible: params.setKeypadVisible,
    updatePlayerValue,
    updateHoleValue,
    setPlayerFlag,
    decodeFlagValue,
    activeTeeIndex: params.activeTeeIndex,
    teeBoxes: params.teeBoxes,
    setTeeBoxes: params.setTeeBoxes,
    lockTeeField: params.lockTeeField,
    fairways: params.fairways,
    greens: params.greens,
    scores: params.scores,
    putts: params.putts,
    penalties: params.penalties,
    pars: params.pars,
    hcpMen: params.hcpMen,
    hcpWomen: params.hcpWomen,
  });

  return {
    fairwayEditMode,
    greenEditMode,
    getFlagChipOptions,
    toggleUpDown,
    toggleFlag,
    renderArrowValue,
    ...keypad,
  };
}
