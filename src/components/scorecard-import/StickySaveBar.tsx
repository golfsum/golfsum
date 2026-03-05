import React from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../../theme/tokens';

interface StickySaveBarProps {
  isProcessing: boolean;
  buttonLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

export const StickySaveBar: React.FC<StickySaveBarProps> = ({
  isProcessing,
  buttonLabel,
  onPress,
  disabled = false,
}) => {
  const isDisabled = isProcessing || disabled;
  return (
    <View style={styles.stickyActionBar}>
      <TouchableOpacity
        style={[styles.saveButton, isDisabled && styles.buttonDisabled]}
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        accessibilityHint="Continues to the next step"
      >
        {isProcessing ? (
          <ActivityIndicator color={colors.text.inverse} />
        ) : (
          <>
            <Ionicons name="arrow-forward" size={20} color={colors.text.inverse} />
            <Text style={styles.saveButtonText}>{buttonLabel}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  stickyActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: colors.bg.secondary,
  },
  saveButton: {
    height: 52,
    backgroundColor: colors.brand.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  saveButtonText: {
    ...typography.labelLg,
    color: colors.text.inverse,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
