import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface ScoringModeSectionProps {
  scoringMode: 'basic' | 'advanced';
  onSelect: (mode: 'basic' | 'advanced') => void;
  styles: any;
}

export const ScoringModeSection: React.FC<ScoringModeSectionProps> = ({
  scoringMode,
  onSelect,
  styles,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeaderNoPress}>
      <Text style={styles.sectionTitle}>SCORING MODE</Text>
      <Text style={styles.sectionHint}>Choose your scoring detail level</Text>
    </View>

    <View style={styles.modeToggleContainer}>
      <TouchableOpacity
        style={[styles.modeToggleButton, scoringMode === 'basic' && styles.modeToggleButtonActive]}
        onPress={() => onSelect('basic')}
      >
        <Text style={[styles.modeToggleText, scoringMode === 'basic' && styles.modeToggleTextActive]}>
          Basic
        </Text>
        <Text style={styles.modeToggleSubtext}>
          Score, Putts, FIR, GIR
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeToggleButton, scoringMode === 'advanced' && styles.modeToggleButtonActive]}
        onPress={() => onSelect('advanced')}
      >
        <Text style={[styles.modeToggleText, scoringMode === 'advanced' && styles.modeToggleTextActive]}>
          Advanced
        </Text>
        <Text style={styles.modeToggleSubtext}>
          All stats + clubs + penalties
        </Text>
      </TouchableOpacity>
    </View>
  </View>
);
