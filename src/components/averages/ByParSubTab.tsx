import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ParPerformanceCard } from './ParPerformanceCard';
import { FrontBackComparisonCard } from './FrontBackComparisonCard';

interface ParStatsBundle {
  par3: any;
  par4: any;
  par5: any;
}

interface FrontBackSplit {
  front: {
    scoreAvg: number;
    firPercent: number | null;
    girPercent: number | null;
    puttsAvg: number | null;
  };
  back: {
    scoreAvg: number;
    firPercent: number | null;
    girPercent: number | null;
    puttsAvg: number | null;
  };
  highlight: 'front' | 'back' | null;
  message: string;
  roundCount: number;
}

interface ByParSubTabProps {
  active: boolean;
  hasParStats: boolean;
  parStats: ParStatsBundle;
  frontBackSplit: FrontBackSplit | null;
  showTooltip: (title: string, content: string) => void;
  styles: any;
}

export const ByParSubTab: React.FC<ByParSubTabProps> = ({
  active,
  hasParStats,
  parStats,
  frontBackSplit,
  showTooltip,
  styles,
}) => {
  if (!active) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Performance by Par</Text>
        <TouchableOpacity
          onPress={() =>
            showTooltip(
              'Performance by Par',
              'Shows how you score by par type so you can see which holes cost or save the most strokes.'
            )
          }
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionSubtitle}>How you score on different hole types</Text>

      {frontBackSplit ? (
        <FrontBackComparisonCard
          front={{
            label: 'Front 9',
            scoreAvg: frontBackSplit.front.scoreAvg,
            firPercent: frontBackSplit.front.firPercent,
            girPercent: frontBackSplit.front.girPercent,
            puttsAvg: frontBackSplit.front.puttsAvg,
          }}
          back={{
            label: 'Back 9',
            scoreAvg: frontBackSplit.back.scoreAvg,
            firPercent: frontBackSplit.back.firPercent,
            girPercent: frontBackSplit.back.girPercent,
            puttsAvg: frontBackSplit.back.puttsAvg,
          }}
          highlight={frontBackSplit.highlight}
          message={frontBackSplit.message}
        />
      ) : (
        <View style={styles.lockedCard}>
          <View style={styles.lockIconContainer}>
            <Ionicons name="swap-horizontal-outline" size={24} color="#9CA3AF" />
          </View>
          <Text style={styles.lockedTitle}>Front/Back split needs 3 rounds</Text>
          <Text style={styles.lockedDescription}>
            Add 3 full 18-hole rounds with hole-by-hole scores to see this card.
          </Text>
        </View>
      )}

      {hasParStats ? (
        <>
          <ParPerformanceCard par={3} stats={parStats.par3} />
          <ParPerformanceCard par={4} stats={parStats.par4} />
          <ParPerformanceCard par={5} stats={parStats.par5} />
        </>
      ) : (
        <View style={styles.advancedModePrompt}>
          <Ionicons name="bar-chart-outline" size={48} color="#6B7280" />
          <Text style={styles.advancedModeTitle}>No Par Data Yet</Text>
          <Text style={styles.advancedModeText}>
            Play a few rounds with hole-by-hole scores and par splits will show here.
          </Text>
        </View>
      )}
    </View>
  );
};
