import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendSparkline } from './TrendSparkline';
import { formatAverage, formatPercent } from '../utils/formatStat';
import { EMPTY_STATE_COPY } from '../constants/emptyStateCopy';

interface TrendMiniCardProps {
  title: string;
  values: number[];
  unit?: string;
  color?: string;
  showScale?: boolean;
}

export const TrendMiniCard: React.FC<TrendMiniCardProps> = ({
  title,
  values,
  unit = '',
  color = '#3B82F6',
  showScale = false,
}) => {
  const latest = values.length > 0 ? values[values.length - 1] : null;
  const formatted = latest !== null ? formatValue(latest, unit) : '—';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value}>{formatted}</Text>
      </View>
      {values.length > 1 ? (
        <TrendSparkline values={values} color={color} showScale={showScale} />
      ) : (
        <Text style={styles.noDataText}>{EMPTY_STATE_COPY.noDataTrackMoreRounds}</Text>
      )}
    </View>
  );
};

const formatValue = (value: number, unit: string) => {
  if (unit === '%') {
    return formatPercent(value);
  }
  return `${formatAverage(value)}${unit}`;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#374151',
    flex: 1,
    minWidth: '45%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  value: {
    fontSize: 16,
    color: '#E5E7EB',
    fontWeight: '700',
  },
  noDataText: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
  },
});
