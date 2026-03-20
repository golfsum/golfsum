/**
 * AveragesStatCard Component
 * 
 * Displays a single stat with:
 * - Typical value
 * - Form (last 5)
 * - Trend
 * - Confidence indicator
 * - Handicap comparison
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatWithContext, ConfidenceLevel, TrendDirection } from '../types';
import {
  getConfidenceLabel,
  getConfidenceTooltip,
  getTrendLabel,
  getTrendTooltip,
  getStatusLabel,
  getStatusTooltip,
  getStatusColor,
} from '../utils/averagesAnalytics';
import { formatAverage, formatPercent } from '../utils/formatStat';
import { Sparkline } from './Sparkline';

interface AveragesStatCardProps {
  title: string;
  stat: StatWithContext | null;
  unit?: string; // '%', 'yds', 'strokes', etc.
  showRange?: boolean; // Show expected range for handicap
  onInfoPress?: () => void; // Show tooltip modal
  actionHint?: string; // What this means for the player
  sparkline?: number[];
}

export const AveragesStatCard: React.FC<AveragesStatCardProps> = ({
  title,
  stat,
  unit = '',
  showRange = true,
  onInfoPress,
  actionHint,
  sparkline,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasSparkline = Boolean(sparkline && sparkline.length >= 3);

  // Handle insufficient data
  if (!stat) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.insufficientContainer}>
          <Text
            style={styles.insufficientText}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            Add a few more rounds to see this stat.
          </Text>
          <Text style={styles.insufficientSubtext}>3 rounds here shows this best.</Text>
        </View>
      </View>
    );
  }
  if (stat.confidence === ConfidenceLevel.INSUFFICIENT && unit === '%' && stat.sampleSize === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.insufficientContainer}>
          <Text style={styles.typicalValue}>—</Text>
          <Text style={styles.noDataText}>No opportunities recorded.</Text>
        </View>
      </View>
    );
  }
  if (stat.confidence === ConfidenceLevel.INSUFFICIENT) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.insufficientContainer}>
          <Text
            style={styles.insufficientText}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            Add a few more rounds to see this stat.
          </Text>
          <Text style={styles.insufficientSubtext}>3 rounds here shows this best.</Text>
        </View>
      </View>
    );
  }

  const confidenceLabel = getConfidenceLabel(stat.confidence);
  const statusColor = stat.status ? getStatusColor(stat.status) : '#6b7280';
  const formatValue = (value?: number | string) => {
    if (value === undefined || value === null) return '—';
    if (typeof value === 'number') {
      return unit === '%' ? formatPercent(value).replace('%', '') : formatAverage(value);
    }
    return value;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => {
        if (!hasSparkline) return;
        setExpanded(prev => !prev);
      }}
      style={styles.card}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={onInfoPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </TouchableOpacity>
      </View>

      {/* Main Value */}
      <View style={styles.mainValueContainer}>
        <View style={styles.typicalRow}>
          <View style={styles.typicalLeft}>
            <Text style={styles.typicalLabel}>Typical</Text>
            <Text style={styles.typicalValue}>
              {formatValue(stat.typical)}
              {unit}
            </Text>
          </View>
          {confidenceLabel && (
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceText}>{confidenceLabel}</Text>
            </View>
          )}
          {hasSparkline && (
            <View style={styles.sparklineCompact}>
              <Sparkline values={sparkline!} width={70} height={20} />
            </View>
          )}
        </View>
      </View>

      {hasSparkline && expanded && (
        <View style={styles.sparklineExpanded}>
          <Text style={styles.sparklineLabel}>Last 10 rounds</Text>
          <Sparkline values={sparkline!} height={56} />
        </View>
      )}

      {/* Form & Trend */}
      {stat.form !== undefined && (
        <View style={styles.secondaryRow}>
          <Text style={styles.secondaryLabel}>Form (Last 5)</Text>
          <Text style={styles.secondaryValue}>
            {formatValue(stat.form)}
            {unit}
          </Text>
        </View>
      )}

      {stat.trend !== undefined && (
        <View style={styles.secondaryRow}>
          <Text style={styles.secondaryLabel}>Trend</Text>
          <View style={styles.trendContainer}>
            <View style={[styles.trendDot, { backgroundColor: getTrendColor(stat.trend) }]} />
            <Text style={[styles.trendText, { color: getTrendColor(stat.trend) }]}>
              {getTrendLabel(stat.trend)}
            </Text>
          </View>
        </View>
      )}

      {/* Handicap Comparison */}
      {showRange && stat.expectedRange && stat.status && (
        <View style={styles.expectedContainer}>
          <Text style={styles.expectedLabel}>
            Expected: {formatValue(stat.expectedRange.min)}–{formatValue(stat.expectedRange.max)}
            {unit}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {getStatusLabel(stat.status)}
            </Text>
          </View>
        </View>
      )}

      {/* Action Hint */}
      {actionHint && (
        <View style={styles.actionHintContainer}>
          <Text style={styles.actionHintText}>{actionHint}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Helper function for trend colors
function getTrendColor(trend: TrendDirection): string {
  switch (trend) {
    case TrendDirection.IMPROVING:
      return '#10b981'; // Green
    case TrendDirection.STABLE:
      return '#6b7280'; // Gray
    case TrendDirection.DECLINING:
      return '#f59e0b'; // Amber
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  infoIcon: {
    fontSize: 18,
    color: '#9CA3AF',
  },
  mainValueContainer: {
    marginBottom: 12,
  },
  typicalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  typicalLeft: {
    flex: 1,
  },
  typicalLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  typicalValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  confidenceBadge: {
    backgroundColor: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sparklineCompact: {
    marginLeft: 8,
  },
  sparklineExpanded: {
    marginTop: 8,
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  sparklineLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  confidenceText: {
    fontSize: 12,
    color: '#D1D5DB',
    fontWeight: '500',
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  secondaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trendText: {
    fontSize: 14,
    fontWeight: '600',
  },
  expectedContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  expectedLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  insufficientContainer: {
    paddingVertical: 20,
  },
  insufficientText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 6,
  },
  insufficientSubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  noDataText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
  },
  actionHintContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  actionHintText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    lineHeight: 16,
  },
});
