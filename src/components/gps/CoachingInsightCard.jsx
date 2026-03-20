import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { buildInsightCopy } from '../../services/courseStatsService';
import { colors, radius } from '../../theme/tokens';

function getToneColor(state) {
  if (state === 'tied') return '#FBBF24';
  if (state === 'data_backed') return colors.brand.primary;
  return 'rgba(148,163,184,0.45)';
}

export function CoachingInsightCard({ suggestion, holeNumber, compact = false, onDismiss = null }) {
  if (!suggestion || suggestion.state === 'no_history') return null;

  if (suggestion.state === 'building') {
    return (
      <View style={[styles.buildingChip, compact && styles.buildingChipCompact]}>
        <Text style={styles.buildingText}>{buildInsightCopy(suggestion)}</Text>
      </View>
    );
  }

  const body = buildInsightCopy(suggestion);
  if (!body) return null;

  const accent = getToneColor(suggestion.state);
  const title = suggestion.title || `Hole ${holeNumber}`;
  const support = suggestion.support || `${suggestion.rounds} rounds here`;
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.copy}>
        {onDismiss ? (
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <Text style={styles.support}>{support}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
    maxHeight: 120,
  },
  cardCompact: {
    minHeight: 0,
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
  },
  copy: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 36,
  },
  title: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  body: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  support: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 6,
  },
  dismissButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dismissText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  buildingChip: {
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  buildingChipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  buildingText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
});

export default CoachingInsightCard;
