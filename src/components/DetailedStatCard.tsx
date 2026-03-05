/**
 * DetailedStatCard Component
 *
 * Displays a single stat with:
 * - Typical and recent form
 * - Confidence and trend
 * - Expected range comparison
 * - Insight text and optional info drawer
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ConfidenceLevel, StatWithContext, TrendDirection } from '../types';
import {
  getConfidenceLabel,
  getStatusColor,
  getStatusLabel,
  getTrendLabel,
} from '../utils/averagesAnalytics';
import { formatAverage, formatPercent } from '../utils/formatStat';
import { Sparkline } from './Sparkline';
import { EMPTY_STATE_COPY } from '../constants/emptyStateCopy';

interface DetailedStatCardProps {
  title: string;
  stat: StatWithContext | null;
  unit?: string;
  detail: string;
  insight: string;
  infoText?: string;
  onInfoPress?: () => void;
  sparkline?: number[];
  subStats?: Array<{
    label: string;
    value: string;
    detail?: string;
  }>;
  minRoundsForConfidence?: number;
  trackedRoundsLabel?: string;
}

export const DetailedStatCard: React.FC<DetailedStatCardProps> = ({
  title,
  stat,
  unit = '',
  detail,
  insight,
  infoText,
  onInfoPress,
  sparkline,
  subStats,
  minRoundsForConfidence = 3,
  trackedRoundsLabel = 'rounds tracked',
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasSparkline = Boolean(sparkline && sparkline.length >= 3);
  const sampleSize = Math.max(0, stat?.sampleSize ?? 0);
  const progressPct = Math.min(100, Math.round((sampleSize / Math.max(1, minRoundsForConfidence)) * 100));
  const roundsRemaining = Math.max(0, minRoundsForConfidence - sampleSize);
  const previousSampleSizeRef = useRef(sampleSize);

  useEffect(() => {
    const previous = previousSampleSizeRef.current;
    if (previous < minRoundsForConfidence && sampleSize >= minRoundsForConfidence) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    previousSampleSizeRef.current = sampleSize;
  }, [sampleSize, minRoundsForConfidence]);

  const renderUnlockProgress = () => (
    <View style={styles.unlockContainer}>
      <View style={styles.unlockProgressRow}>
        <Text style={styles.unlockProgressLabel}>
          {sampleSize} of {minRoundsForConfidence} {trackedRoundsLabel}
        </Text>
        <Text style={styles.unlockProgressLabel}>
          {progressPct}%
        </Text>
      </View>
      <View style={styles.unlockProgressTrack}>
        {progressPct > 0 && (
          <View style={[styles.unlockProgressFill, { width: `${progressPct}%` }]} />
        )}
      </View>
      <Text style={styles.unlockProgressHint}>
        {roundsRemaining > 0
          ? `Need ${roundsRemaining} more round${roundsRemaining !== 1 ? 's' : ''} with ${trackedRoundsLabel}.`
          : 'Enough rounds tracked. Keep logging to increase confidence.'}
      </Text>
    </View>
  );

  if (!stat) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.insufficientContainer}>
          <Text style={styles.insufficientText}>
            There isn't enough consistent data yet to surface this confidently.
          </Text>
          <Text style={styles.insufficientSubtext}>{EMPTY_STATE_COPY.unlockAfterThreeRounds}</Text>
          {renderUnlockProgress()}
        </View>
      </View>
    );
  }
  if (stat.confidence === ConfidenceLevel.INSUFFICIENT && unit === '%' && stat.sampleSize === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.insufficientContainer}>
          <Text style={styles.statValue}>—</Text>
          <Text style={styles.noDataText}>No opportunities recorded.</Text>
          {renderUnlockProgress()}
        </View>
      </View>
    );
  }
  if (stat.confidence === ConfidenceLevel.INSUFFICIENT) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.insufficientContainer}>
          <Text style={styles.insufficientText}>
            There isn't enough consistent data yet to surface this confidently.
          </Text>
          <Text style={styles.insufficientSubtext}>{EMPTY_STATE_COPY.unlockAfterThreeRounds}</Text>
          {renderUnlockProgress()}
        </View>
      </View>
    );
  }

  const confidenceLabel = getConfidenceLabel(stat.confidence);
  const trendLabel = stat.trend ? getTrendLabel(stat.trend) : undefined;
  const statusLabel = stat.status ? getStatusLabel(stat.status) : undefined;
  const statusColor = stat.status ? getStatusColor(stat.status) : '#6B7280';
  const hasInfo = Boolean(infoText && onInfoPress);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => {
        if (!hasSparkline) return;
        setExpanded(prev => !prev);
      }}
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {hasInfo && (
          <TouchableOpacity onPress={onInfoPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="information-circle-outline" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.mainStats}>
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>Typical</Text>
          <View style={styles.statValueRow}>
            <Text style={styles.statValue}>
              {formatValue(stat.typical, unit)}
            </Text>
            {confidenceLabel ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{confidenceLabel}</Text>
              </View>
            ) : null}
            {hasSparkline && (
              <View style={styles.sparklineCompact}>
                <Sparkline values={sparkline!} width={70} height={20} />
              </View>
            )}
          </View>
        </View>
        {stat.form !== undefined && (
          <View style={styles.statColumn}>
            <Text style={styles.statLabel}>Form (Last 5)</Text>
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>{formatValue(stat.form, unit)}</Text>
              {trendLabel && (
                <View style={styles.trendRow}>
                  <View style={[styles.trendDot, { backgroundColor: getTrendColor(stat.trend) }]} />
                  <Text style={[styles.trendText, { color: getTrendColor(stat.trend) }]}>{trendLabel}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {hasSparkline && expanded && (
        <View style={styles.sparklineExpanded}>
          <Text style={styles.sparklineLabel}>Last 10 rounds</Text>
          <Sparkline values={sparkline!} height={56} />
        </View>
      )}

      <Text style={styles.detail}>{detail}</Text>

      {stat.expectedRange && statusLabel && (
        <>
          <View style={styles.divider} />
          <Text style={styles.expectedLabel}>
            Expected: {stat.expectedRange.min}-{stat.expectedRange.max}{unit}
          </Text>
          <View style={styles.statusRow}>
            <Ionicons
              name={stat.status === 'ABOVE' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={14}
              color={statusColor}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </>
      )}

      <View style={styles.divider} />
      <Text style={styles.insight}>{insight}</Text>

      {subStats && subStats.length > 0 && (
        <View style={styles.subStats}>
          {subStats.map((subStat, index) => (
            <View key={index} style={styles.subStat}>
              <Text style={styles.subStatLabel}>{subStat.label}</Text>
              <Text style={styles.subStatValue}>{subStat.value}</Text>
              {subStat.detail && <Text style={styles.subStatDetail}>{subStat.detail}</Text>}
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
};

function formatValue(value: number, unit: string): string {
  if (unit === '%') {
    return formatPercent(value);
  }
  const formatted = formatAverage(value);
  return `${formatted}${unit}`;
}

function getTrendColor(trend?: TrendDirection): string {
  if (!trend) return '#6B7280';
  switch (trend) {
    case TrendDirection.IMPROVING:
      return '#10B981';
    case TrendDirection.DECLINING:
      return '#F59E0B';
    case TrendDirection.STABLE:
    default:
      return '#6B7280';
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
  mainStats: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 12,
  },
  statColumn: {
    flex: 1,
  },
  statLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  sparklineCompact: {
    marginTop: 6,
    flexBasis: '100%',
  },
  statValue: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    color: '#E5E7EB',
    fontWeight: '600',
  },
  trendRow: {
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
    fontSize: 12,
    fontWeight: '600',
  },
  detail: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },
  sparklineExpanded: {
    marginBottom: 12,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  sparklineLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  expectedLabel: {
    fontSize: 13,
    color: '#D1D5DB',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  insight: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  subStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  subStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 10,
    borderRadius: 8,
  },
  subStatLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  subStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  subStatDetail: {
    fontSize: 10,
    color: '#6B7280',
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
  unlockContainer: {
    marginTop: 12,
  },
  unlockProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  unlockProgressLabel: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  unlockProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  unlockProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#10B981',
  },
  unlockProgressHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
