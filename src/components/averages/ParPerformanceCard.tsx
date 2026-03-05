import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShotPatternHeatmap } from '../ShotPatternHeatmap';
import { formatAverage, formatPercent } from '../../utils/formatStat';
import { displayStat } from '../../utils/statChecks';

interface MissPattern {
  left: number;
  right: number;
  long?: number;
  short?: number;
  totalMisses: number;
}

interface ParStats {
  averageScore: number;
  scoreToPar: number;
  girPercent?: number;
  firPercent?: number;
  upDownPercent?: number;
  averagePutts: number | null;
  holesPlayed: number;
  fairwayMissPattern?: MissPattern;
  greenMissPattern?: MissPattern;
}

interface ParPerformanceCardProps {
  par: 3 | 4 | 5;
  stats: ParStats;
}

export const ParPerformanceCard: React.FC<ParPerformanceCardProps> = ({ par, stats }) => {
  const getParColor = () => {
    if (stats.scoreToPar < 0) return '#10B981';
    if (stats.scoreToPar === 0) return '#6B7280';
    return '#F59E0B';
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Par {par} Performance</Text>
        <Text style={styles.holesPlayed}>{stats.holesPlayed} holes</Text>
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.scoreLabel}>Average Score</Text>
        <View style={styles.scoreValue}>
          <Text style={[styles.score, { color: getParColor() }]}>
            {formatAverage(stats.averageScore)}
          </Text>
          <Text style={[styles.scoreToPar, { color: getParColor() }]}>
            ({stats.scoreToPar >= 0 ? '+' : ''}{formatAverage(stats.scoreToPar)})
          </Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        {par !== 3 && stats.firPercent !== undefined && (
          <StatItem label="FIR" value={displayStat(stats.firPercent, true, formatPercent)} />
        )}
        {stats.girPercent !== undefined && (
          <StatItem label="GIR" value={displayStat(stats.girPercent, true, formatPercent)} />
        )}
        {stats.upDownPercent !== undefined && (
          <StatItem label="Up & Down" value={displayStat(stats.upDownPercent, true, formatPercent)} />
        )}
        <StatItem
          label="Avg Putts"
          value={displayStat(stats.averagePutts, stats.averagePutts !== null, formatAverage)}
        />
      </View>

      {(stats.fairwayMissPattern || stats.greenMissPattern) && (
        <View style={styles.heatmapSection}>
          <Text style={styles.heatmapTitle}>Shot Pattern</Text>
          <ShotPatternHeatmap
            par={par}
            fairwayPattern={stats.fairwayMissPattern}
            greenPattern={stats.greenMissPattern}
          />
        </View>
      )}
    </View>
  );
};

const StatItem = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.statItem}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  holesPlayed: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  scoreLabel: {
    fontSize: 15,
    color: '#E5E7EB',
  },
  scoreValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  score: {
    fontSize: 28,
    fontWeight: '700',
  },
  scoreToPar: {
    fontSize: 16,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    borderRadius: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  heatmapSection: {
    marginTop: 8,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
  },
  heatmapTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 12,
  },
});
