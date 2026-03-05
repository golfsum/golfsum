import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PerformanceSectionProps {
  expanded: boolean;
  averageScore: string;
  roundsCount: number;
  bestRoundScore: number | string;
  bestRoundCourse: string;
  averagePutts: string;
  firPercent: string;
  firFraction: string;
  girPercent: string;
  girFraction: string;
  upDownPercent: string;
  upDownFraction: string;
  onToggle: () => void;
  onViewStats?: () => void;
  styles: any;
}

export const PerformanceSection: React.FC<PerformanceSectionProps> = ({
  expanded,
  averageScore,
  roundsCount,
  bestRoundScore,
  bestRoundCourse,
  averagePutts,
  firPercent,
  firFraction,
  girPercent,
  girFraction,
  upDownPercent,
  upDownFraction,
  onToggle,
  onViewStats,
  styles,
}) => (
  <View style={styles.section}>
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
      <View style={styles.headerLeft}>
        <Ionicons name="trending-up" size={20} color="#10B981" />
        <Text style={styles.sectionTitle}>MY PERFORMANCE</Text>
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#9CA3AF" />
    </TouchableOpacity>
    {expanded && (
      <View style={styles.sectionContent}>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Average Score</Text>
            <Text style={styles.statValue}>{averageScore}</Text>
            <Text style={styles.statDetail}>{roundsCount} rounds</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Best Round</Text>
            <Text style={styles.statValue}>{bestRoundScore}</Text>
            <Text style={styles.statDetail}>{bestRoundCourse}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Avg Putts</Text>
            <Text style={styles.statValue}>{averagePutts}</Text>
            <Text style={styles.statDetail}>per round</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>FIR</Text>
            <Text style={styles.statValue}>{firPercent}</Text>
            <Text style={styles.statDetail}>{firFraction}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>GIR</Text>
            <Text style={styles.statValue}>{girPercent}</Text>
            <Text style={styles.statDetail}>{girFraction}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Up and Down</Text>
            <Text style={styles.statValue}>{upDownPercent}</Text>
            <Text style={styles.statDetail}>{upDownFraction}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.viewStatsButton}
          onPress={onViewStats}
          disabled={!onViewStats}
        >
          <Text style={styles.viewStatsText}>View Full Statistics</Text>
          <Ionicons name="arrow-forward" size={16} color="#10B981" />
        </TouchableOpacity>
      </View>
    )}
  </View>
);
