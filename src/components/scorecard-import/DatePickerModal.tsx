import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../../theme/tokens';
import { UI_COPY } from '../../constants/uiCopy';

interface DatePickerModalProps {
  visible: boolean;
  date: Date;
  onChange: (event: { type: string; nativeEvent?: { timestamp?: number } }, date?: Date) => void;
  onClose: () => void;
  onDone: (selected: Date) => void;
}

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  date,
  onChange,
  onClose,
  onDone,
}) => {
  if (!visible) return null;

  if (Platform.OS !== 'ios') {
    return (
      <DateTimePicker
        value={date}
        mode="date"
        onChange={onChange}
      />
    );
  }

  const handleChange = (event: { type: string; nativeEvent?: { timestamp?: number } }, nextDate?: Date) => {
    onChange(event, nextDate);
  };

  return (
    <Modal transparent animationType="slide">
      <View style={styles.keypadOverlay}>
        <View style={styles.datePickerContainer}>
          <View style={styles.datePickerHeader}>
            <Text style={styles.datePickerTitle}>{UI_COPY.scorecardImport.datePickerTitle}</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close date picker"
            >
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={date}
            mode="date"
            display="spinner"
            themeVariant="dark"
            textColor={colors.text.primary}
            onChange={handleChange}
          />
          <TouchableOpacity
            style={styles.datePickerDone}
            onPress={() => onDone(date)}
            accessibilityRole="button"
            accessibilityLabel="Confirm date"
          >
            <Text style={styles.datePickerDoneText}>{UI_COPY.scorecardImport.datePickerDone}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keypadOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: colors.bg.secondary,
    padding: spacing.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  datePickerTitle: {
    ...typography.headingSm,
    color: colors.text.primary,
  },
  datePickerDone: {
    marginTop: spacing.md,
    backgroundColor: colors.brand.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  datePickerDoneText: {
    ...typography.labelLg,
    color: colors.text.inverse,
  },
});
