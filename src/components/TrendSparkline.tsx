import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface TrendSparklineProps {
  values: number[];
  height?: number;
  color?: string;
  showScale?: boolean;
}

export const TrendSparkline: React.FC<TrendSparklineProps> = ({
  values,
  height = 36,
  color = '#3B82F6',
  showScale = false,
}) => {
  if (!values || values.length === 0) {
    return null;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const paddedMax = max + range * 0.1;
  const paddedMin = min - range * 0.1;
  const paddedRange = paddedMax - paddedMin || 1;

  return (
    <View style={styles.wrapper}>
      {showScale && (
        <View style={[styles.axis, { height }]}>
          <Text style={styles.axisLabel}>{Math.round(paddedMax)}</Text>
          <Text style={styles.axisLabel}>{Math.round(paddedMin)}</Text>
        </View>
      )}
      <View style={[styles.container, { height }]}>
        {values.map((value, index) => {
          const normalized = (value - paddedMin) / paddedRange;
          const barHeight = Math.max(2, Math.round(normalized * height));
          const isLast = index === values.length - 1;
          return (
            <View
              key={`${value}-${index}`}
              style={[
                styles.bar,
                {
                  height: barHeight,
                  backgroundColor: isLast ? color : `${color}66`,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  axis: {
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  axisLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    flex: 1,
  },
  bar: {
    flex: 1,
    borderRadius: 4,
  },
});
