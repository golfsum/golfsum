import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme/tokens';

interface StatDisplayProps {
  value: string | number;
  label: string;
  sublabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export const StatDisplay: React.FC<StatDisplayProps> = ({
  value,
  label,
  sublabel,
  trend,
  trendValue,
  size = 'md',
  color = colors.text.primary,
}) => {
  const valueStyle =
    size === 'lg'
      ? typography.statLg
      : size === 'sm'
      ? typography.statSm
      : typography.statMd;

  const trendColor =
    trend === 'up'
      ? colors.semantic.success
      : trend === 'down'
      ? colors.semantic.error
      : colors.text.tertiary;

  const trendIcon =
    trend === 'up'
      ? 'trending-up'
      : trend === 'down'
      ? 'trending-down'
      : 'remove';

  return (
    <View style={styles.container}>
      <Text style={[styles.value, valueStyle as any, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
      {trend && (
        <View style={styles.trendContainer}>
          <Ionicons name={trendIcon as any} size={14} color={trendColor} />
          {trendValue && (
            <Text style={[styles.trendValue, { color: trendColor }]}>
              {trendValue}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  value: {
    color: colors.text.primary,
  },
  label: {
    ...typography.labelMd,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  sublabel: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: 4,
  },
  trendValue: {
    ...typography.labelSm,
  },
});
