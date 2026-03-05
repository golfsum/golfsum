import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface HalfStats {
  label: 'Front 9' | 'Back 9';
  scoreAvg: number;
  firPercent?: number | null;
  girPercent?: number | null;
  puttsAvg?: number | null;
}

interface FrontBackComparisonCardProps {
  front: HalfStats;
  back: HalfStats;
  highlight: 'front' | 'back' | null;
  message: string;
}

export const FrontBackComparisonCard: React.FC<FrontBackComparisonCardProps> = ({
  front,
  back,
  highlight,
  message,
}) => (
  <View style={styles.card}>
    <Text style={styles.title}>Front 9 vs Back 9</Text>
    <Text style={styles.subtitle}>{message}</Text>
    <View style={styles.row}>
      <View style={[styles.halfCard, highlight === 'front' && styles.halfHighlight]}>
        <Text style={styles.halfLabel}>{front.label}</Text>
        <Text style={styles.scoreValue}>{front.scoreAvg.toFixed(1)}</Text>
        <Text style={styles.detail}>FIR {formatPercent(front.firPercent)}</Text>
        <Text style={styles.detail}>GIR {formatPercent(front.girPercent)}</Text>
        <Text style={styles.detail}>Putts {formatAverage(front.puttsAvg)}</Text>
      </View>
      <View style={[styles.halfCard, highlight === 'back' && styles.halfHighlight]}>
        <Text style={styles.halfLabel}>{back.label}</Text>
        <Text style={styles.scoreValue}>{back.scoreAvg.toFixed(1)}</Text>
        <Text style={styles.detail}>FIR {formatPercent(back.firPercent)}</Text>
        <Text style={styles.detail}>GIR {formatPercent(back.girPercent)}</Text>
        <Text style={styles.detail}>Putts {formatAverage(back.puttsAvg)}</Text>
      </View>
    </View>
  </View>
);

const formatPercent = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
};

const formatAverage = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value.toFixed(1);
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  halfHighlight: {
    borderColor: 'rgba(16,185,129,0.6)',
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  halfLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  detail: {
    fontSize: 12,
    color: '#CBD5F5',
    marginBottom: 4,
  },
});
