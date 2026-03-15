import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * ModeToggle
 * Small absolute-positioned pill toggle that switches between Scoring and Safe
 * shot-line lay-up modes.
 *
 * Props:
 *   mode      'scoring' | 'safe'
 *   onToggle  (newMode: string) => void
 */
export function ModeToggle({ mode, onToggle }) {
  const isScoring = mode === 'scoring';

  return (
    <TouchableOpacity
      style={[styles.pill, isScoring ? styles.pillScoring : styles.pillSafe]}
      onPress={() => onToggle(isScoring ? 'safe' : 'scoring')}
      activeOpacity={0.8}
    >
      <Ionicons
        name={isScoring ? 'flag-outline' : 'shield-outline'}
        size={13}
        color={isScoring ? '#042F21' : '#78350F'}
      />
      <Text style={[styles.label, isScoring ? styles.labelScoring : styles.labelSafe]}>
        {isScoring ? 'Scoring' : 'Safe'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillScoring: {
    backgroundColor: '#10B981',
  },
  pillSafe: {
    backgroundColor: '#FBBF24',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  labelScoring: {
    color: '#042F21',
  },
  labelSafe: {
    color: '#78350F',
  },
});

export default ModeToggle;
