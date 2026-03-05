/**
 * ClubYardageModal — Minimal bottom-sheet for entering a club's stock yardage.
 *
 * Opens when user long-presses an active (green) club in the bag builder.
 * Single numeric input, auto-focused with numeric keyboard.
 * Stores a single integer — the player's stock carry distance.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ClubYardageModalProps {
  visible: boolean;
  clubName: string;
  currentYardage: number | undefined;
  onSave: (clubName: string, yardage: number | undefined) => void;
  onClose: () => void;
}

const CLUB_DISPLAY_NAMES: Record<string, string> = {
  Driver: 'Driver',
  '3W': '3 Wood', '4W': '4 Wood', '5W': '5 Wood', '7W': '7 Wood', '9W': '9 Wood',
  '2H': '2 Hybrid', '3H': '3 Hybrid', '4H': '4 Hybrid', '5H': '5 Hybrid', '6H': '6 Hybrid',
  '3i': '3 Iron', '4i': '4 Iron', '5i': '5 Iron', '6i': '6 Iron',
  '7i': '7 Iron', '8i': '8 Iron', '9i': '9 Iron',
  PW: 'Pitching Wedge', AW: 'Approach Wedge', GW: 'Gap Wedge', SW: 'Sand Wedge', LW: 'Lob Wedge',
};

const MIN_YARDAGE = 30;
const MAX_YARDAGE = 400;

export const ClubYardageModal: React.FC<ClubYardageModalProps> = ({
  visible,
  clubName,
  currentYardage,
  onSave,
  onClose,
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setValue(currentYardage ? String(currentYardage) : '');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, currentYardage]);

  const displayName = CLUB_DISPLAY_NAMES[clubName] || clubName;
  const numericValue = parseInt(value, 10);
  const isValid = value === '' || (!isNaN(numericValue) && numericValue >= MIN_YARDAGE && numericValue <= MAX_YARDAGE);
  const baselineValue = !isNaN(numericValue) ? numericValue : (currentYardage ?? 150);
  const canStepDown = baselineValue > MIN_YARDAGE;
  const canStepUp = baselineValue < MAX_YARDAGE;

  const stepValue = (delta: number) => {
    const next = Math.max(MIN_YARDAGE, Math.min(MAX_YARDAGE, baselineValue + delta));
    setValue(String(next));
  };

  const handleSave = () => {
    if (value === '' || isNaN(numericValue)) {
      onSave(clubName, undefined);
    } else if (isValid) {
      onSave(clubName, numericValue);
    }
    onClose();
  };

  const handleClear = () => {
    onSave(clubName, undefined);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={handleSave}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.sheetContainer}
            >
              <View style={styles.sheet}>
                <View style={styles.handle} />

                <Text style={styles.title}>{displayName}</Text>
                <Text style={styles.subtitle}>Stock carry distance (yards)</Text>

                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    style={[styles.stepButton, !canStepDown && styles.stepButtonDisabled]}
                    onPress={() => stepValue(-5)}
                    disabled={!canStepDown}
                  >
                    <Text style={styles.stepButtonText}>-5</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.stepButton, !canStepUp && styles.stepButtonDisabled]}
                    onPress={() => stepValue(5)}
                    disabled={!canStepUp}
                  >
                    <Text style={styles.stepButtonText}>+5</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.inputRow}>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    value={value}
                    onChangeText={text => setValue(text.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="e.g. 168"
                    placeholderTextColor="#4B5563"
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    selectTextOnFocus
                  />
                  <Text style={styles.unit}>yds</Text>
                </View>

                {value !== '' && !isValid && (
                  <Text style={styles.error}>Enter {MIN_YARDAGE}-{MAX_YARDAGE} yards</Text>
                )}

                <Text style={styles.helperText}>
                  This helps GolfSum understand your game. We never tell you what club to hit.
                </Text>

                <View style={styles.actions}>
                  {currentYardage !== undefined && (
                    <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      <Text style={styles.clearText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    disabled={!isValid}
                  >
                    <Text style={styles.saveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  sheetContainer: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A2332',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#374151', alignSelf: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#E5E7EB' },
  subtitle: { fontSize: 14, color: '#9CA3AF', marginTop: 4, marginBottom: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  stepperRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  stepButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    opacity: 0.45,
  },
  stepButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D1D5DB',
  },
  input: {
    flex: 1, fontSize: 32, fontWeight: '700', color: '#FFFFFF',
    backgroundColor: '#252D38', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    borderWidth: 1, borderColor: '#10B981', textAlign: 'center',
  },
  unit: { fontSize: 18, fontWeight: '600', color: '#6B7280' },
  error: { fontSize: 12, color: '#EF4444', marginBottom: 8 },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16 },
  clearButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  clearText: { fontSize: 15, fontWeight: '500', color: '#EF4444' },
  saveButton: { backgroundColor: '#10B981', borderRadius: 10, paddingHorizontal: 32, paddingVertical: 12 },
  saveButtonDisabled: { opacity: 0.4 },
  saveText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
