import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export function HoleHeader({ hole, hazardTags = [], liveLie = null }) {
  if (!hole) return null;

  const showLieDot = !!liveLie?.showDot;

  return (
    <View style={styles.wrap}>
      <View style={styles.leftRow}>
        <Text style={styles.holePlain}>Hole {hole.hole}</Text>
        <Text style={styles.holeDot}>·</Text>
        <Text style={styles.holePlain}>Par {hole.par}</Text>
        <Text style={styles.holeDot}>·</Text>
        <Text style={styles.holePlain}>HCP {hole.handicap ?? '-'}</Text>
      </View>

      <View style={styles.spacer} />

      <View style={styles.rightRow}>
        {hazardTags.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
        {hazardTags.length > 0 && <View style={styles.divider} />}
        <View
          style={[
            styles.lieChip,
            liveLie?.color
              ? {
                  borderColor: liveLie.color,
                  backgroundColor: `${liveLie.color}18`,
                }
              : styles.lieChipMuted,
          ]}
        >
          {showLieDot && (
            <View style={[styles.lieDot, { backgroundColor: liveLie.color }]} />
          )}
          <Text
            style={[
              styles.lieLabel,
              liveLie?.color ? { color: liveLie.color } : styles.lieLabelMuted,
            ]}
          >
            {liveLie?.lie || 'Locating...'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
    paddingBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    flexShrink: 0,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  holePlain: {
    color: colors.text.primary,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '600',
    opacity: 0.8,
  },
  holeDot: {
    color: colors.text.tertiary,
    fontSize: typography.labelMd.fontSize,
    marginHorizontal: 1,
    opacity: 0.45,
  },
  spacer: {
    flex: 1,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: spacing.lg,
  },
  tag: {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  tagText: {
    color: colors.text.secondary,
    fontSize: 10,
    fontWeight: '500',
  },
  divider: {
    width: 1,
    height: 12,
    marginHorizontal: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  lieChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 7,
    paddingVertical: 2,
    paddingHorizontal: 7,
    flexShrink: 0,
  },
  lieChipMuted: {
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.elevated,
  },
  lieDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  lieLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  lieLabelMuted: {
    color: colors.text.secondary,
  },
});
