import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { SavedRound } from '../types';

interface Props {
  rounds: SavedRound[];
  handicap: number | null;
}

export const HandicapSparkLine: React.FC<Props> = ({ rounds, handicap }) => {
  const data = useMemo(() => {
    return rounds
      .filter((r) => typeof r.differential === 'number' && Number.isFinite(r.differential))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10)
      .map((r) => r.differential as number);
  }, [rounds]);

  if (data.length < 3 || handicap === null) return null;

  const width = 120;
  const height = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const lastTwo = data.slice(-2);
  const trend = lastTwo.length === 2 ? lastTwo[1] - lastTwo[0] : 0;
  const trendLabel = trend < -0.5 ? 'Improving' : trend > 0.5 ? 'Rising' : 'Stable';
  const trendColor = trend < -0.5 ? '#10B981' : trend > 0.5 ? '#EF4444' : '#9CA3AF';

  const lastX = width;
  const lastY = height - ((data[data.length - 1] - min) / range) * height;

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.label}>Player Rating</Text>
        <Text style={styles.value}>{handicap.toFixed(1)}</Text>
        <Text style={[styles.trend, { color: trendColor }]}>{trendLabel}</Text>
      </View>
      <Svg width={width} height={height} style={styles.chart}>
        <Polyline points={points} fill="none" stroke="#4B5563" strokeWidth="1.5" />
        <Circle cx={lastX} cy={lastY} r="3" fill={trendColor} />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    marginHorizontal: 20,
  },
  left: {
    gap: 2,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  trend: {
    fontSize: 12,
    fontWeight: '600',
  },
  chart: {
    marginLeft: 16,
  },
});
