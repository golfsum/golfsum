import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

interface BadgeProps {
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

export const Badge: React.FC<BadgeProps> = ({ label, tone = 'default' }) => {
  const backgroundColor =
    tone === 'success'
      ? colors.semantic.success + '20'
      : tone === 'warning'
      ? colors.semantic.warning + '20'
      : tone === 'error'
      ? colors.semantic.error + '20'
      : tone === 'info'
      ? colors.semantic.info + '20'
      : colors.bg.tertiary;

  const textColor =
    tone === 'success'
      ? colors.semantic.success
      : tone === 'warning'
      ? colors.semantic.warning
      : tone === 'error'
      ? colors.semantic.error
      : tone === 'info'
      ? colors.semantic.info
      : colors.text.secondary;

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  text: {
    ...typography.labelSm,
  },
});
