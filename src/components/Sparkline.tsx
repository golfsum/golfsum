import React, { useMemo, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
}

type Point = { x: number; y: number };

const COLORS = {
  up: '#10B981',
  down: '#EF4444',
  flat: '#9CA3AF',
  track: 'rgba(255,255,255,0.08)',
};

export const Sparkline: React.FC<SparklineProps> = ({
  values,
  width,
  height = 20,
  strokeWidth = 2,
}) => {
  const [layoutWidth, setLayoutWidth] = useState(width ?? 0);
  const resolvedWidth = width ?? layoutWidth;

  const { points, color } = useMemo(() => {
    const clean = values.filter(value => Number.isFinite(value));
    if (clean.length < 2 || resolvedWidth <= 0) {
      return { points: [] as Point[], color: COLORS.flat };
    }

    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = max - min || 1;
    const step = resolvedWidth / Math.max(1, clean.length - 1);

    const mapped = clean.map((value, index) => ({
      x: step * index,
      y: height - ((value - min) / range) * height,
    }));

    const slope = calculateSlope(clean);
    const normalizedSlope = Math.abs(slope) / range;
    const trendColor = normalizedSlope < 0.02
      ? COLORS.flat
      : slope > 0
        ? COLORS.up
        : COLORS.down;

    return { points: mapped, color: trendColor };
  }, [values, resolvedWidth, height]);

  const handleLayout = (event: LayoutChangeEvent) => {
    if (width !== undefined) return;
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0 && nextWidth !== layoutWidth) {
      setLayoutWidth(nextWidth);
    }
  };

  if (values.length < 2) {
    return null;
  }

  return (
    <View
      style={[styles.container, { width: width ?? '100%', height }]}
      onLayout={handleLayout}
    >
      <View style={[styles.track, { height: strokeWidth }]} />
      {points.length >= 2 && points.slice(1).map((point, index) => {
        const prev = points[index];
        const dx = point.x - prev.x;
        const dy = point.y - prev.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const centerX = (point.x + prev.x) / 2;
        const centerY = (point.y + prev.y) / 2;

        return (
          <View
            key={`${index}-${point.x}`}
            style={[
              styles.segment,
              {
                width: length,
                height: strokeWidth,
                backgroundColor: color,
                left: centerX - length / 2,
                top: centerY - strokeWidth / 2,
                transform: [{ rotate: `${angle}rad` }],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const calculateSlope = (values: number[]): number => {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    const xDelta = index - xMean;
    numerator += xDelta * (value - yMean);
    denominator += xDelta * xDelta;
  });
  return denominator === 0 ? 0 : numerator / denominator;
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: COLORS.track,
    top: '50%',
    transform: [{ translateY: -1 }],
  },
  segment: {
    position: 'absolute',
    borderRadius: 2,
  },
});
