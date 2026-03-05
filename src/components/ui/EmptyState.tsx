import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { colors, spacing, typography } from '../../theme/tokens';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
}) => (
  <View style={styles.container}>
    <View style={styles.iconContainer}>
      <Ionicons name={icon as any} size={56} color={colors.text.tertiary} />
    </View>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
    {action && (
      <Button variant="primary" onPress={action.onPress} style={styles.actionButton}>
        {action.label}
      </Button>
    )}
    {secondaryAction && (
      <Button variant="ghost" onPress={secondaryAction.onPress} style={styles.secondaryButton}>
        {secondaryAction.label}
      </Button>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.headingLg,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.bodyMd,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  actionButton: {
    minWidth: 200,
  },
  secondaryButton: {
    marginTop: spacing.md,
  },
});
