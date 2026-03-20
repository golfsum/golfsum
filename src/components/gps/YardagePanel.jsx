import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export function YardagePanel({ yardages, teeName, scorecardYardage = null, holePar = null, compact = false, bottomInset = 0, greenTarget = 'center', onTargetChange }) {
  const front = yardages?.front ?? '--';
  const center = yardages?.center ?? '--';
  const back = yardages?.back ?? '--';

  const cycleTarget = () => {
    if (!onTargetChange) return;
    const order = ['center', 'front', 'back'];
    const next = order[(order.indexOf(greenTarget) + 1) % order.length];
    onTargetChange(next);
  };

  return (
    <View style={[styles.panel, compact && styles.panelCompact, bottomInset ? { paddingBottom: 4 + bottomInset } : null]}>
      <View style={styles.row}>
        <Metric label="Front" value={front} highlight={greenTarget === 'front'} compact={compact} onPress={onTargetChange ? () => onTargetChange('front') : undefined} />
        <Metric label="Center" value={center} highlight={greenTarget === 'center'} compact={compact} onPress={onTargetChange ? () => onTargetChange('center') : undefined} />
        <Metric label="Back" value={back} highlight={greenTarget === 'back'} compact={compact} onPress={onTargetChange ? () => onTargetChange('back') : undefined} />
      </View>
    </View>
  );
}

function Metric({ label, value, highlight = false, compact = false, onPress }) {
  const content = (
    <>
      <Text style={[styles.label, compact && styles.labelCompact, highlight && styles.labelHighlight]}>{label}</Text>
      <Text style={[styles.value, compact && styles.valueCompact, highlight && styles.valueHighlight, compact && highlight && styles.valueHighlightCompact]}>{value}</Text>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={[styles.metric, compact && styles.metricCompact, highlight && styles.metricHighlight]} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.metric, compact && styles.metricCompact, highlight && styles.metricHighlight]}>
      {content}
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
  panelCompact: {
    paddingVertical: 4,
  },
  row: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    borderRadius: radius.md - 2,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  metricCompact: {
    paddingVertical: 4,
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
  labelCompact: {
    fontSize: 9,
  },
  labelHighlight: { color: colors.text.primary },
  value: {
    color: colors.text.secondary,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  valueCompact: {
    fontSize: 15,
  },
  valueHighlight: { color: colors.text.primary, fontSize: 22, fontWeight: '800' },
  valueHighlightCompact: { fontSize: 19 },
});
