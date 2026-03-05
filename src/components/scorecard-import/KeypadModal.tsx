import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { InputType } from './types';
import type { ScorecardImportStyles } from '../ScorecardImportScreen.styles';

interface Props {
  visible: boolean;
  styles: ScorecardImportStyles;
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

export const KeypadModal: React.FC<Props> = ({
  visible,
  styles,
  keypadField,
  keypadMode,
  keypadValue,
  scoreChipOptions,
  puttChipOptions,
  penaltyChipOptions,
  inputConfig,
  getKeypadTitle,
  getFlagChipOptions,
  handleChipSelect,
  cancelKeypad,
  handleKeypadDigit,
  handleKeypadBackspace,
  handleKeypadDecimal,
  handleKeypadNext,
  handleKeypadPrev,
  commitKeypadValue,
  closeKeypad,
  uiCopy,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.keypadOverlay}>
        <TouchableOpacity style={styles.keypadBackdrop} activeOpacity={1} onPress={cancelKeypad} />
        <View style={styles.keypadContainer}>
          <View style={styles.keypadHeader}>
            <Text style={styles.keypadTitle}>{getKeypadTitle(keypadField?.field)}</Text>
            <TouchableOpacity onPress={cancelKeypad}>
              <Ionicons name="close" size={20} color="#E5E7EB" />
            </TouchableOpacity>
          </View>
          {keypadField && keypadMode === 'chips' ? (
            <>
              <Text style={styles.chipSubtitle}>
                {typeof keypadField.index === 'number'
                  ? `${uiCopy.holeLabelPrefix} ${keypadField.index + 1}`
                  : uiCopy.keypadChooseValue}
              </Text>
              <View style={styles.chipRow}>
                {(keypadField.field === 'fairway' || keypadField.field === 'green')
                  ? getFlagChipOptions(keypadField.field).map(option => {
                    const isSelected = keypadValue === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => handleChipSelect(option.value)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                  : (keypadField.field === 'score'
                    ? scoreChipOptions
                    : keypadField.field === 'putts'
                      ? puttChipOptions
                      : keypadField.field === 'penalties'
                        ? penaltyChipOptions
                        : inputConfig[keypadField.field].options || []
                  ).map(option => {
                    const numericValue = typeof option === 'number' ? option : null;
                    const overflowThreshold =
                      keypadField.field === 'score'
                        ? 8
                        : keypadField.field === 'putts'
                          ? 5
                          : keypadField.field === 'penalties'
                            ? 3
                            : 6;
                    const isSelected =
                      numericValue !== null
                        ? parseInt(keypadValue || '0', 10) === numericValue
                        : keypadValue && parseInt(keypadValue, 10) >= overflowThreshold;
                    return (
                      <TouchableOpacity
                        key={option.toString()}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => handleChipSelect(option)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {option}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
              {(keypadField.field !== 'fairway' && keypadField.field !== 'green')
                && ((inputConfig[keypadField.field].options || []).some(opt => typeof opt === 'string')) && (
                  <Text style={styles.chipHint}>Tap the + option for keypad</Text>
                )}
            </>
          ) : (
            <>
              <View style={styles.keypadValueRow}>
                <Text style={styles.keypadValue}>{keypadValue || '—'}</Text>
              </View>
              <View style={styles.keypadGrid}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                  <TouchableOpacity
                    key={digit}
                    style={styles.keypadKey}
                    onPress={() => handleKeypadDigit(digit)}
                  >
                    <Text style={styles.keypadKeyText}>{digit}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.keypadKeySecondary} onPress={handleKeypadBackspace}>
                  <Ionicons name="backspace-outline" size={20} color="#E5E7EB" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.keypadKey} onPress={() => handleKeypadDigit('0')}>
                  <Text style={styles.keypadKeyText}>0</Text>
                </TouchableOpacity>
                {keypadField && inputConfig[keypadField.field].allowDecimal ? (
                  <TouchableOpacity style={styles.keypadKeySecondary} onPress={handleKeypadDecimal}>
                    <Text style={styles.keypadKeyText}>.</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.keypadKeySecondary}
                    onPress={() => {
                      commitKeypadValue(keypadValue);
                      handleKeypadNext();
                    }}
                  >
                    <Ionicons name="arrow-forward-circle" size={22} color="#10B981" />
                  </TouchableOpacity>
                )}
              </View>
              {typeof keypadField?.index === 'number' && (
                <View style={styles.keypadFooterNav}>
                  <TouchableOpacity style={styles.keypadNav} onPress={handleKeypadPrev}>
                    <Ionicons name="chevron-back" size={18} color="#9CA3AF" />
                    <Text style={styles.keypadNavText}>
                      Hole {Math.max(1, keypadField.index)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.keypadNav} onPress={handleKeypadNext}>
                    <Text style={styles.keypadNavText}>
                      Hole {Math.min(18, keypadField.index + 2)}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
          {keypadMode === 'keypad' && (
            <TouchableOpacity
              style={styles.keypadDone}
              onPress={() => {
                commitKeypadValue(keypadValue);
                closeKeypad();
              }}
            >
              <Text style={styles.keypadDoneText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};
