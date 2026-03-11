import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export function HoleDots({ holes = [], currentHole, onSelect, loggedHoles = [] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.wrap}
    >
      {holes.map((hole, idx) => {
        const active = idx === currentHole;
        const hasShotsLogged = loggedHoles.includes(idx);
        return (
          <TouchableOpacity
            key={`${hole.hole}-${idx}`}
            style={[
              styles.dot,
              active && styles.dotActive,
              hasShotsLogged && styles.dotLogged,
            ]}
            onPress={() => onSelect(idx)}
          >
            <Text style={[styles.text, active && styles.textActive]}>{hole.hole}</Text>
            {hasShotsLogged && <View style={styles.loggedPip} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 5,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: radius.sm + 1,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: colors.brand.primaryMuted,
    borderColor: colors.brand.primary,
  },
  dotLogged: {
    borderColor: colors.border.default,
  },
  text: { color: colors.text.tertiary, fontSize: typography.labelMd.fontSize, fontWeight: '600' },
  textActive: { color: colors.brand.primary, fontWeight: '700' },
  loggedPip: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.brand.primary,
  },
});
