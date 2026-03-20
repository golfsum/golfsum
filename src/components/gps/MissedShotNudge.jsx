import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';

// ─── Nudge copy logic ────────────────────────────────────────────────
function getNudgeCopy(holeNumber, par, shotCount, distanceJump) {
  if (distanceJump) {
    return `Big gap between shots on hole ${holeNumber}. Want to check if one is missing?`;
  }
  if (par === 5 && shotCount <= 2) {
    return `Hole ${holeNumber} only has ${shotCount} shot${shotCount === 1 ? '' : 's'} logged. Did you forget one?`;
  }
  return `Hole ${holeNumber} looks short on shots. Worth a check?`;
}

/**
 * MissedShotNudge — gentle amber chip shown below hole selector bar
 *
 * Props:
 *   nudgeHole       – hole data object for the flagged hole (or null to hide)
 *   onReview        – called when player taps 'Review'
 *   onDismiss       – called when player taps X
 */
export default function MissedShotNudge({ nudgeHole, onReview, onDismiss }) {
  if (!nudgeHole) return null;

  const copy = getNudgeCopy(
    nudgeHole.hole,
    nudgeHole.par,
    nudgeHole.shotCount,
    nudgeHole.distanceJump,
  );

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="help-circle" size={16} color={colors.semantic.warning} />
      </View>

      <Text style={styles.copy} numberOfLines={2}>{copy}</Text>

      <TouchableOpacity style={styles.reviewBtn} onPress={onReview}>
        <Text style={styles.reviewText}>Review</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} hitSlop={8}>
        <Ionicons name="close" size={14} color={colors.text.tertiary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    backgroundColor: '#1C2B1C',
    borderLeftWidth: 3,
    borderLeftColor: colors.semantic.warning,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  iconWrap: {
    marginRight: spacing.sm,
  },
  copy: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 16,
  },
  reviewBtn: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  reviewText: {
    ...typography.labelMd,
    color: colors.semantic.warning,
  },
  dismissBtn: {
    marginLeft: spacing.xs,
    padding: spacing.xs,
  },
});
