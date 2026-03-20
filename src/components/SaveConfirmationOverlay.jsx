import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * Full-screen save confirmation overlay.
 * Shows for 2.5s with animated checkmark then auto-advances.
 *
 * Props:
 *   visible       – boolean
 *   courseName    – string
 *   score         – number (gross score)
 *   scoreToPar    – number (e.g. +5 or -2)
 *   teeName       – string
 *   ratingDelta   – { newRating: number, oldRating: number } | null
 *   onComplete    – called after 2.5s to trigger navigation
 */
export default function SaveConfirmationOverlay({
  visible,
  courseName,
  score,
  scoreToPar,
  teeName,
  ratingDelta,
  onComplete,
}) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0.6);
      opacityAnim.setValue(0);
      return;
    }

    // Animate in
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-advance after 2.5s
    const timer = setTimeout(() => {
      onComplete?.();
    }, 2500);

    return () => clearTimeout(timer);
  }, [visible, onComplete, scaleAnim, opacityAnim]);

  if (!visible) return null;

  const scoreLabel = scoreToPar === 0 ? 'E'
    : scoreToPar > 0 ? `+${scoreToPar}`
    : `${scoreToPar}`;

  const scoreColor = scoreToPar < 0 ? '#4CAF7D'
    : scoreToPar > 0 ? colors.score.bogey
    : colors.text.primary;

  // Player Rating delta
  const showRating = ratingDelta
    && Math.abs(ratingDelta.newRating - ratingDelta.oldRating) >= 0.2;
  const ratingImproved = showRating && ratingDelta.newRating < ratingDelta.oldRating;
  const ratingChange = showRating
    ? Math.abs(ratingDelta.newRating - ratingDelta.oldRating).toFixed(1)
    : null;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
        {/* Checkmark circle */}
        <View style={styles.checkCircle}>
          <Text style={styles.checkMark}>✓</Text>
        </View>

        {/* Primary text */}
        <Text style={styles.title}>Round saved</Text>

        {/* Course + score */}
        <Text style={styles.courseName}>{courseName}</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreNumber}>{score}</Text>
          <Text style={[styles.scoreDelta, { color: scoreColor }]}>{scoreLabel}</Text>
        </View>
        <Text style={styles.teeName}>{teeName} tees</Text>

        {/* Player Rating delta */}
        {showRating && (
          <View style={[styles.ratingSection, ratingImproved && styles.ratingSectionImproved]}>
            <Text style={styles.ratingLabel}>Player Rating</Text>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingValue}>{ratingDelta.newRating.toFixed(1)}</Text>
              <Text style={[styles.ratingDelta, { color: ratingImproved ? '#4CAF7D' : colors.score.bogey }]}>
                {ratingImproved ? '↓' : '↑'} {ratingChange}
              </Text>
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  checkMark: {
    fontSize: 36,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  title: {
    ...typography.displayMd,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  courseName: {
    ...typography.bodyLg,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  scoreNumber: {
    ...typography.statLg,
    color: colors.text.primary,
  },
  scoreDelta: {
    ...typography.headingLg,
    fontVariant: ['tabular-nums'],
  },
  teeName: {
    ...typography.bodyMd,
    color: colors.text.tertiary,
    marginBottom: spacing.xl,
  },
  ratingSection: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: 10,
    padding: spacing.lg,
    alignItems: 'center',
    minWidth: 200,
  },
  ratingSectionImproved: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  ratingLabel: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  ratingValue: {
    ...typography.statMd,
    color: colors.text.primary,
  },
  ratingDelta: {
    ...typography.headingSm,
    fontVariant: ['tabular-nums'],
  },
});
