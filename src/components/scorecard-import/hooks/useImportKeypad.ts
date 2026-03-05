import { useCallback } from 'react';
import type { InputType } from '../types';
import {
  asTeeScalarField,
  encodeDirectionalValue,
  getHoleNumericValue,
  isFlagField,
  isHoleNumericField,
  isPlayerNumericField,
  shouldAutoAdvanceNumericField,
  type TeeScalarField,
  updateActiveTeeScalarField,
} from './useImportKeypad.helpers';
import type { KeypadField, UseImportKeypadParams } from './useImportKeypad.types';

export function useImportKeypad(params: UseImportKeypadParams) {
  const openKeypadSession = useCallback((field: KeypadField, value: string, mode: 'chips' | 'keypad') => {
    params.setFocusedHoleIndex(typeof field?.index === 'number' ? field.index : null);
    params.setKeypadField(field);
    params.setKeypadValue(value);
    params.setKeypadInitialValue(value);
    params.setKeypadIsFirstDigit(true);
    params.setKeypadMode(mode);
    params.setKeypadVisible(true);
  }, [params]);

  const closeKeypad = useCallback(() => {
    params.setKeypadVisible(false);
    params.setKeypadField(null);
    params.setKeypadValue('');
    params.setKeypadInitialValue('');
    params.setKeypadIsFirstDigit(true);
    params.setKeypadMode('chips');
  }, [params]);

  const openKeypad = useCallback((index: number, field: 'score' | 'putts' | 'penalties') => {
    const currentValue =
      field === 'score' ? params.scores[index] : field === 'putts' ? params.putts[index] : params.penalties[index];
    const config = params.inputConfig[field];
    openKeypadSession({ index, field }, currentValue || '', config.type === 'chips' ? 'chips' : 'keypad');
  }, [openKeypadSession, params.inputConfig, params.penalties, params.putts, params.scores]);

  const openFlagPicker = useCallback((index: number, field: 'fairway' | 'green') => {
    const currentValue = field === 'fairway' ? params.fairways[index] : params.greens[index];
    const encoded = encodeDirectionalValue(currentValue);
    openKeypadSession({ index, field }, encoded, 'chips');
  }, [openKeypadSession, params.fairways, params.greens]);

  const openNumericEditor = useCallback((field: InputType, value: string, index?: number) => {
    const config = params.inputConfig[field];
    openKeypadSession({ index, field }, value || '', config.type === 'chips' ? 'chips' : 'keypad');
  }, [openKeypadSession, params.inputConfig]);

  const openFieldAtIndex = useCallback((index: number, field: InputType) => {
    if (isPlayerNumericField(field)) {
      openKeypad(index, field);
      return;
    }
    if (isFlagField(field)) {
      openFlagPicker(index, field);
      return;
    }
    if (isHoleNumericField(field)) {
      const currentValue = getHoleNumericValue(
        field,
        index,
        params.pars,
        params.hcpMen,
        params.hcpWomen,
        params.teeBoxes,
        params.activeTeeIndex
      );
      openNumericEditor(field, currentValue || '', index);
      return;
    }
    closeKeypad();
  }, [closeKeypad, openFlagPicker, openKeypad, openNumericEditor, params.activeTeeIndex, params.hcpMen, params.hcpWomen, params.pars, params.teeBoxes]);

  const commitTeeScalarValue = useCallback((teeId: string, field: TeeScalarField, value: string) => {
    params.lockTeeField(teeId, field);
    params.setTeeBoxes(prev => updateActiveTeeScalarField(field, value, prev, params.activeTeeIndex));
    params.setKeypadValue(value);
  }, [params]);

  const commitKeypadValue = useCallback((nextValue: string) => {
    if (!params.keypadField) return;
    if (isFlagField(params.keypadField.field) && typeof params.keypadField.index === 'number') {
      const decoded = params.decodeFlagValue(nextValue);
      params.setPlayerFlag(params.keypadField.index, params.keypadField.field, decoded);
      params.setKeypadValue(nextValue);
      return;
    }
    if (isPlayerNumericField(params.keypadField.field)) {
      if (typeof params.keypadField.index === 'number') {
        params.updatePlayerValue(params.keypadField.index, params.keypadField.field)(nextValue);
      }
      params.setKeypadValue(nextValue);
      return;
    }
    if (isHoleNumericField(params.keypadField.field) && typeof params.keypadField.index === 'number') {
      params.updateHoleValue(params.keypadField.index, params.keypadField.field, nextValue);
      params.setKeypadValue(nextValue);
      return;
    }
    const teeId = params.teeBoxes[params.activeTeeIndex]?.id;
    if (!teeId) return;
    const teeScalarField = asTeeScalarField(params.keypadField.field);
    if (teeScalarField) {
      commitTeeScalarValue(teeId, teeScalarField, nextValue);
      return;
    }
    params.setKeypadValue(nextValue);
  }, [commitTeeScalarValue, params]);

  const cancelKeypad = useCallback(() => {
    if (params.keypadMode === 'keypad' && params.keypadField) {
      commitKeypadValue(params.keypadInitialValue);
    }
    closeKeypad();
  }, [closeKeypad, commitKeypadValue, params.keypadField, params.keypadInitialValue, params.keypadMode]);

  const handleKeypadNext = useCallback(() => {
    if (!params.keypadField) return;
    if (typeof params.keypadField.index !== 'number') {
      closeKeypad();
      return;
    }
    const nextIndex = params.keypadField.index + 1;
    if (nextIndex >= 18) {
      closeKeypad();
      return;
    }
    if (params.keypadMode === 'keypad') {
      commitKeypadValue(params.keypadValue);
    }
    openFieldAtIndex(nextIndex, params.keypadField.field);
  }, [closeKeypad, commitKeypadValue, openFieldAtIndex, params]);

  const handleKeypadPrev = useCallback(() => {
    if (!params.keypadField) return;
    if (typeof params.keypadField.index !== 'number') {
      return;
    }
    const prevIndex = params.keypadField.index - 1;
    if (prevIndex < 0) {
      return;
    }
    if (params.keypadMode === 'keypad') {
      commitKeypadValue(params.keypadValue);
    }
    openFieldAtIndex(prevIndex, params.keypadField.field);
  }, [commitKeypadValue, openFieldAtIndex, params]);

  const handleKeypadDigit = useCallback((digit: string) => {
    if (!params.keypadField) return;
    const current = params.keypadIsFirstDigit ? '' : params.keypadValue;
    const config = params.inputConfig[params.keypadField.field];
    const maxLength = config.maxLength ?? (params.keypadField.field === 'penalties' ? 1 : 2);
    const nextValue = `${current}${digit}`.slice(0, maxLength);
    commitKeypadValue(nextValue);
    params.setKeypadIsFirstDigit(false);
    if (shouldAutoAdvanceNumericField(params.keypadField.field, nextValue)) {
      handleKeypadNext();
    }
  }, [commitKeypadValue, handleKeypadNext, params]);

  const handleKeypadDecimal = useCallback(() => {
    if (!params.keypadField) return;
    const config = params.inputConfig[params.keypadField.field];
    if (!config.allowDecimal) return;
    if (params.keypadValue.includes('.')) return;
    const current = params.keypadIsFirstDigit ? '' : params.keypadValue;
    const nextValue = current ? `${current}.` : '0.';
    commitKeypadValue(nextValue);
    params.setKeypadIsFirstDigit(false);
  }, [commitKeypadValue, params]);

  const handleKeypadBackspace = useCallback(() => {
    commitKeypadValue('');
    params.setKeypadIsFirstDigit(true);
  }, [commitKeypadValue, params]);

  const handleChipSelect = useCallback((option: number | string) => {
    if (!params.keypadField) return;
    if (isFlagField(params.keypadField.field)) {
      commitKeypadValue(option.toString());
      closeKeypad();
      return;
    }
    if (typeof option === 'number') {
      commitKeypadValue(option.toString());
      closeKeypad();
      return;
    }
    if (typeof option === 'string' && option.endsWith('+')) {
      params.setKeypadMode('keypad');
      params.setKeypadIsFirstDigit(true);
    }
  }, [closeKeypad, commitKeypadValue, params]);

  return {
    openKeypad,
    openFlagPicker,
    openNumericEditor,
    closeKeypad,
    cancelKeypad,
    commitKeypadValue,
    handleKeypadDigit,
    handleKeypadDecimal,
    handleKeypadBackspace,
    handleKeypadNext,
    handleKeypadPrev,
    handleChipSelect,
  };
}
