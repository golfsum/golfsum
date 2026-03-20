import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../../theme/tokens';

interface LockedChartCardProps {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  roundsCompleted: number;
  roundsRequired?: number;
  emptyText?: string;
  unlockText?: string;
  previewContent?: React.ReactNode;
}

export const LockedChartCard: React.FC<LockedChartCardProps> = ({
  title,
  description,
  icon,
  roundsCompleted,
  roundsRequired = 3,
  emptyText,
  unlockText,
  previewContent,
}) => {
  const clamped = Math.min(roundsCompleted, roundsRequired);
  const progress = roundsRequired > 0 ? Math.round((clamped / roundsRequired) * 100) : 0;
  const remaining = Math.max(0, roundsRequired - roundsCompleted);

  const progressLabel = `${clamped} of ${roundsRequired} rounds`;
  const remainingText = remaining === 0
    ? ''
    : remaining === 1
    ? '1 more round here'
    : `${remaining} more rounds here`;

  const helperText = roundsCompleted === 0
    ? emptyText ?? `${roundsRequired} rounds here shows this chart`
    : unlockText ?? remainingText;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name={icon} size={18} color={colors.brand.primary} />
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={12} color="#6B7280" />
        </View>
      </View>
      <Text style={styles.description}>{description}</Text>

      {/* Blurred / dimmed preview */}
      {previewContent && (
        <View style={styles.previewContainer}>
          {previewContent}
          <View style={styles.previewOverlay} />
        </View>
      )}

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          {progress > 0 && (
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          )}
        </View>
        <Text style={[styles.progressLabel, remaining === 1 && styles.progressLabelAccent]}>
          {progressLabel}
        </Text>
      </View>
      {helperText ? (
        <Text style={[styles.helperText, remaining === 1 && styles.helperTextAccent]}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lockBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.headingSm,
    color: colors.text.primary,
  },
  description: {
    ...typography.bodySm,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  previewContainer: {
    position: 'relative',
    marginBottom: spacing.md,
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 20, 25, 0.6)',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#1F2937',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
    borderRadius: 999,
  },
  progressLabel: {
    ...typography.labelSm,
    color: colors.text.tertiary,
  },
  progressLabelAccent: {
    color: colors.brand.primary,
  },
  helperText: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  helperTextAccent: {
    color: colors.brand.primary,
    fontWeight: '600',
  },
});
