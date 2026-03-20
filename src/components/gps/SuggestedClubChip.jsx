import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, radius } from '../../theme/tokens';

function getBorderStyle(state) {
  if (state === 'data_backed') {
    return {
      borderColor: colors.brand.primary,
      backgroundColor: colors.brand.primaryMuted,
    };
  }
  if (state === 'tied') {
    return {
      borderColor: '#FBBF24',
      backgroundColor: 'rgba(251,191,36,0.10)',
    };
  }
  return null;
}

function getMatchBorder(matchQuality) {
  if (matchQuality === 'strong') {
    return {
      borderColor: '#10B981',
      backgroundColor: 'rgba(16,185,129,0.12)',
    };
  }
  if (matchQuality === 'gap') {
    return {
      borderColor: '#F59E0B',
      backgroundColor: 'rgba(245,158,11,0.10)',
    };
  }
  return null;
}

export function SuggestedClubChip({ suggestion, onPress, compact = false }) {
  const chipState = suggestion?.state || 'no_history';
  const borderStyle = getMatchBorder(suggestion?.clubMatchQuality) || getBorderStyle(chipState);
  const clubText = chipState === 'tied' && suggestion?.tiedWithLabel
    ? `${suggestion.label} or ${suggestion.tiedWithLabel}`
    : suggestion?.label || 'Driver';
  const metaText = suggestion?.clubDistanceSource && typeof suggestion?.fallbackYards === 'number'
    ? suggestion.clubDistanceSource === 'gps'
      ? suggestion.clubDistanceSampleCount >= 10
        ? `${Math.round(suggestion.fallbackYards)}y avg`
        : `${Math.round(suggestion.fallbackYards)}y avg · ${suggestion.clubDistanceSampleCount || 0} shots`
      : `${Math.round(suggestion.fallbackYards)}y entered`
    : chipState === 'building'
    ? suggestion?.rounds === 1
      ? '1 round here'
      : `${suggestion?.rounds || 0} rounds here`
    : typeof suggestion?.fallbackYards === 'number'
      ? `${Math.round(suggestion.fallbackYards)}y`
      : null;

  return (
    <TouchableOpacity style={[styles.chip, compact && styles.chipCompact, !compact && borderStyle]} onPress={onPress} activeOpacity={0.88}>
      <Text style={[styles.label, compact && styles.labelCompact]}>SUGGESTED</Text>
      <Text style={[styles.club, compact && styles.clubCompact]} numberOfLines={1}>{clubText}</Text>
      {!compact && metaText ? <Text style={styles.meta}>{metaText}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingTop: 5,
    paddingBottom: 5,
    paddingHorizontal: 10,
    minWidth: 96,
    alignItems: 'center',
  },
  chipCompact: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 0,
    paddingHorizontal: 8,
    minWidth: 80,
    height: 40,
    justifyContent: 'center',
  },
  label: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 1,
  },
  labelCompact: {
    fontSize: 7,
    letterSpacing: 0.5,
    marginBottom: 0,
  },
  club: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  clubCompact: {
    fontSize: 12,
    fontWeight: '700',
  },
  meta: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 10,
    marginTop: 1,
  },
});

export default SuggestedClubChip;
