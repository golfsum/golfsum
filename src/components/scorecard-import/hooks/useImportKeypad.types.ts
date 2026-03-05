import type { Dispatch, SetStateAction } from 'react';
import type { EditableTeeBox, InputType } from '../types';

export type DirectionalValue = boolean | 'left' | 'right' | 'short' | 'long' | null;

export type KeypadField = { index?: number; field: InputType } | null;

export interface ImportInputConfigField {
  type: 'chips' | 'numberPad';
  options?: Array<number | string>;
  allowDecimal?: boolean;
  maxLength?: number;
}

export interface UseImportKeypadParams {
  inputConfig: Record<InputType, ImportInputConfigField>;
  keypadField: KeypadField;
  keypadMode: 'chips' | 'keypad';
  keypadValue: string;
  keypadInitialValue: string;
  keypadIsFirstDigit: boolean;
  setFocusedHoleIndex: Dispatch<SetStateAction<number | null>>;
  setKeypadField: Dispatch<SetStateAction<KeypadField>>;
  setKeypadValue: Dispatch<SetStateAction<string>>;
  setKeypadInitialValue: Dispatch<SetStateAction<string>>;
  setKeypadIsFirstDigit: Dispatch<SetStateAction<boolean>>;
  setKeypadMode: Dispatch<SetStateAction<'chips' | 'keypad'>>;
  setKeypadVisible: Dispatch<SetStateAction<boolean>>;
  updatePlayerValue: (index: number, field: 'score' | 'putts' | 'penalties') => (value: string) => void;
  updateHoleValue: (index: number, field: 'par' | 'hcpMen' | 'hcpWomen' | 'yardage', value: string) => void;
  setPlayerFlag: (index: number, field: 'fairway' | 'green', value: DirectionalValue) => void;
  decodeFlagValue: (value: string) => DirectionalValue;
  activeTeeIndex: number;
  teeBoxes: EditableTeeBox[];
  setTeeBoxes: Dispatch<SetStateAction<EditableTeeBox[]>>;
  lockTeeField: (teeId: string, field: 'name' | 'ratingMen' | 'slopeMen' | 'ratingWomen' | 'slopeWomen') => void;
  fairways: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  greens: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  scores: string[];
  putts: string[];
  penalties: string[];
  pars: string[];
  hcpMen: string[];
  hcpWomen: string[];
}

