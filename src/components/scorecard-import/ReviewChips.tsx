import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme/tokens';
import { UI_COPY } from '../../constants/uiCopy';

interface ReviewChipsProps {
  teeLabel: string;
  holeCount: number;
  dateLabel: string;
  onPressTee: () => void;
  onPressHoles: () => void;
  onPressDate: () => void;
}

export const ReviewChips: React.FC<ReviewChipsProps> = ({
  teeLabel,
  holeCount,
  dateLabel,
  onPressTee,
  onPressHoles,
  onPressDate,
}) => {
  return (
    <View style={styles.reviewChips}>
      <TouchableOpacity
        style={styles.reviewChip}
        onPress={onPressTee}
        accessibilityRole="button"
        accessibilityLabel={`Tee selection: ${teeLabel}`}
        accessibilityHint="Opens tee selection"
      >
        <Text style={styles.reviewChipText}>{teeLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.reviewChip}
        onPress={onPressHoles}
        accessibilityRole="button"
        accessibilityLabel={`${holeCount} holes selected`}
        accessibilityHint="Opens hole count selection"
      >
        <Text style={styles.reviewChipText}>{holeCount} holes</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.reviewChip}
        onPress={onPressDate}
        accessibilityRole="button"
        accessibilityLabel={`Round date ${dateLabel || UI_COPY.scorecardImport.reviewChipDateNotSet}`}
        accessibilityHint="Opens date picker"
      >
        <Text style={styles.reviewChipText}>{dateLabel || UI_COPY.scorecardImport.reviewChipDateFallback}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  reviewChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  reviewChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.bg.secondary,
    backgroundColor: colors.bg.primary,
  },
  reviewChipText: {
    ...typography.labelSm,
    color: colors.text.secondary,
  },
});
