import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export function YardagePanel({ yardages, teeName, scorecardYardage = null, holePar = null }) {
  const front = yardages?.front ?? '--';
  const center = yardages?.center ?? '--';
  const back = yardages?.back ?? '--';

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Metric label="F" value={front} />
        <Metric label="C" value={center} highlight />
        <Metric label="B" value={back} />
      </View>
    </View>
  );
}

function Metric({ label, value, highlight = false }) {
  return (
    <View style={[styles.metric, highlight && styles.metricHighlight]}>
      <Text style={[styles.label, highlight && styles.labelHighlight]}>{label}</Text>
      <Text style={[styles.value, highlight && styles.valueHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  row: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    borderRadius: radius.md - 2,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  metricHighlight: {
    backgroundColor: colors.brand.primaryMuted,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.brand.primaryBorder,
  },
  label: {
    color: colors.text.secondary,
    fontSize: typography.labelSm.fontSize,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  labelHighlight: { color: colors.text.primary },
  value: {
    color: colors.text.secondary,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  valueHighlight: { color: colors.text.primary, fontSize: 22, fontWeight: '800' },
});
