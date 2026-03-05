import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  actionLabel,
  onActionPress,
}) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    {actionLabel && onActionPress && (
      <TouchableOpacity onPress={onActionPress}>
        <Text style={styles.action}>{actionLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.headingMd,
    color: colors.text.primary,
  },
  action: {
    ...typography.labelMd,
    color: colors.brand.primary,
  },
});
