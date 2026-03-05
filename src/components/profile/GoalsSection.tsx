import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface GoalsSectionProps {
  expanded: boolean;
  averageScoreNumber: number | null;
  handicapIndex: number | null;
  firPercent: number | null;
  girPercent: number | null;
  averagePuttsNumber: number | null;
  upDownPercent: number | null;
  showFir: boolean;
  showGir: boolean;
  showPutts: boolean;
  showUpDown: boolean;
  goals: {
    handicapIndex?: number | null;
    averageScore?: number | null;
    firPercent?: number | null;
    girPercent?: number | null;
    puttsPerRound?: number | null;
    upDownPercent?: number | null;
  };
  renderGoalRow: (
    label: string,
    current: number | null,
    target: number | null,
    isLowerBetter: boolean,
    key: string,
    unit: string,
    format: 'average' | 'percent' | 'integer' | 'handicap'
  ) => React.ReactNode;
  onToggle: () => void;
  styles: any;
}

export const GoalsSection: React.FC<GoalsSectionProps> = ({
  expanded,
  averageScoreNumber,
  handicapIndex,
  firPercent,
  girPercent,
  averagePuttsNumber,
  upDownPercent,
  showFir,
  showGir,
  showPutts,
  showUpDown,
  goals,
  renderGoalRow,
  onToggle,
  styles,
}) => (
  <View style={styles.section}>
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
      <View style={styles.headerLeft}>
        <Ionicons name="flag-outline" size={20} color="#10B981" />
        <Text style={styles.sectionTitle}>GOALS</Text>
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#9CA3AF" />
    </TouchableOpacity>
    <Text style={styles.sectionHint}>Set targets and track your progress</Text>

    {expanded && (
      <View style={styles.sectionContent}>
        {renderGoalRow('Player Rating', handicapIndex, goals.handicapIndex ?? null, true, 'handicapIndex', '', 'handicap')}
        {renderGoalRow('Average Score', averageScoreNumber, goals.averageScore ?? null, true, 'averageScore', '', 'average')}
        {showFir && renderGoalRow('FIR %', firPercent, goals.firPercent ?? null, false, 'firPercent', '%', 'percent')}
        {showGir && renderGoalRow('GIR %', girPercent, goals.girPercent ?? null, false, 'girPercent', '%', 'percent')}
        {showPutts && renderGoalRow('Putts per Round', averagePuttsNumber, goals.puttsPerRound ?? null, true, 'puttsPerRound', '', 'average')}
        {showUpDown && renderGoalRow('Up & Down %', upDownPercent, goals.upDownPercent ?? null, false, 'upDownPercent', '%', 'percent')}
      </View>
    )}
  </View>
);
