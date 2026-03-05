import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface RoundSummaryStats {
  totalScore: number;
  scoreToPar: number;
  completedHoles: number;
  firHit: number;
  firTotal: number;
  firPossible?: number;
  firPercent: number;
  firNotRecorded?: number;
  girHit: number;
  girTotal: number;
  girPercent: number;
  girNotRecorded?: number;
  puttsTracked: boolean;
  puttsTrackedHoles?: number;
  totalPutts: number;
  avgPutts: string;
  totalHoles?: number;
}

interface RoundSummaryCardProps {
  stats: RoundSummaryStats;
  styles: Record<string, any>;
}

export const RoundSummaryCard: React.FC<RoundSummaryCardProps> = ({ stats, styles }) => {
  const totalHoles = stats.totalHoles || 18;
  const firDisplay = stats.firTotal > 0
    ? `${stats.firHit}/${stats.firTotal}`
    : '—';
  const girDisplay = stats.girTotal > 0
    ? `${stats.girHit}/${stats.girTotal}`
    : '—';

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Round Summary</Text>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Score</Text>
          <Text style={styles.summaryValue}>
            {stats.totalScore || '-'}
            {stats.totalScore > 0 && (
              <Text style={styles.summarySubvalue}>
                {' '}
                ({stats.scoreToPar > 0 ? '+' : ''}
                {stats.scoreToPar})
              </Text>
            )}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Holes</Text>
          <Text style={styles.summaryValue}>{stats.completedHoles}/{totalHoles}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Fairways</Text>
          <Text style={styles.summaryValue}>
            {firDisplay}
            {stats.firTotal > 0 && (
              <Text style={styles.summarySubvalue}> ({stats.firPercent}%)</Text>
            )}
          </Text>
          {typeof stats.firNotRecorded === 'number' && stats.firNotRecorded > 0 && (
            <Text style={localStyles.notRecordedText}>
              {stats.firNotRecorded} hole{stats.firNotRecorded !== 1 ? 's' : ''} not recorded
            </Text>
          )}
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Greens</Text>
          <Text style={styles.summaryValue}>
            {girDisplay}
            {stats.girTotal > 0 && (
              <Text style={styles.summarySubvalue}> ({stats.girPercent}%)</Text>
            )}
          </Text>
          {typeof stats.girNotRecorded === 'number' && stats.girNotRecorded > 0 && (
            <Text style={localStyles.notRecordedText}>
              {stats.girNotRecorded} hole{stats.girNotRecorded !== 1 ? 's' : ''} not recorded
            </Text>
          )}
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Putts</Text>
          <Text style={styles.summaryValue}>
            {stats.puttsTracked ? stats.totalPutts : '—'}
            {stats.puttsTracked && (
              <Text style={styles.summarySubvalue}> ({stats.avgPutts} avg)</Text>
            )}
          </Text>
        </View>
      </View>
    </View>
  );
};

const localStyles = StyleSheet.create({
  notRecordedText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
});
