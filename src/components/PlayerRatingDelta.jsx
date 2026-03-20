import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

/**
 * PlayerRatingDelta — shows how this round affected the GolfSum Player Rating.
 * Hidden when delta < 0.2. Animates in on new round arrival.
 *
 * Props:
 *   newRating      – number (e.g. 12.4)
 *   oldRating      – number (e.g. 13.0)
 *   isPersonalBest – boolean
 *   isNewRound     – boolean (triggers fade-up animation)
 *   recentCount    – number (how many recent rounds to compare)
 *   isBestRecent   – boolean (best in last N rounds)
 */
export default function PlayerRatingDelta({
  newRating,
  oldRating,
  isPersonalBest = false,
  isNewRound = false,
  recentCount = 5,
  isBestRecent = false,
}) {
  const delta = Math.abs(newRating - oldRating);
  const improved = newRating < oldRating;

  const fadeAnim = useRef(new Animated.Value(isNewRound ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(isNewRound ? 20 : 0)).current;

  useEffect(() => {
    if (!isNewRound) return;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }, 500);
    return () => clearTimeout(timer);
  }, [isNewRound, fadeAnim, slideAnim]);

  // Don't show for changes < 0.2
  if (delta < 0.2) return null;

  const bgStyle = improved ? styles.bgImproved : styles.bgNeutral;
  const arrowColor = improved ? '#4CAF7D' : colors.score.bogey;
  const arrow = improved ? '↓' : '↑';
  const directionText = improved
    ? `Down ${delta.toFixed(1)} from your last round`
    : `Up ${delta.toFixed(1)} from last round`;

  let subLabel = null;
  if (isPersonalBest) {
    subLabel = 'New personal best';
  } else if (improved && isBestRecent) {
    subLabel = `Best in your last ${recentCount} rounds`;
  }

  return (
    <Animated.View style={[styles.container, bgStyle, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.label}>Player Rating</Text>
      <View style={styles.mainRow}>
        <Text style={styles.rating}>{newRating.toFixed(1)}</Text>
        <Text style={[styles.arrow, { color: arrowColor }]}>{arrow} {delta.toFixed(1)}</Text>
      </View>
      <Text style={styles.direction}>{directionText}</Text>
      {subLabel && (
        <Text style={[styles.subLabel, improved && styles.subLabelGreen]}>{subLabel}</Text>
      )}
      <Text style={styles.systemLabel}>GolfSum Player Rating</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  bgImproved: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  bgNeutral: {
    backgroundColor: colors.bg.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  label: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  rating: {
    ...typography.statLg,
    color: colors.text.primary,
  },
  arrow: {
    ...typography.headingMd,
    fontVariant: ['tabular-nums'],
  },
  direction: {
    ...typography.bodyMd,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  subLabel: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  subLabelGreen: {
    color: '#4CAF7D',
  },
  systemLabel: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
});
