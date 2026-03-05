import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme/tokens';
import type { RoundSummary } from './types';

interface RoundSummaryCardProps {
  summary: RoundSummary;
  showAdvancedStats?: boolean;
  showAdvancedDataHint?: boolean;
}

export const RoundSummaryCard: React.FC<RoundSummaryCardProps> = ({
  summary,
  showAdvancedStats = true,
  showAdvancedDataHint = false,
}) => {
  const scoreToPar =
    summary.scoreToPar === 0 ? 'E' : summary.scoreToPar > 0 ? `+${summary.scoreToPar}` : `${summary.scoreToPar}`;

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryName}>{summary.playerName}</Text>
        <View style={styles.summaryScoreContainer}>
          <Text style={styles.summaryScore}>{summary.totalScore || '—'}</Text>
          <Text style={styles.summaryToPar}>({scoreToPar})</Text>
        </View>
      </View>
      <View style={styles.summaryStats}>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryStatValue}>{summary.totalPutts || '—'}</Text>
          <Text style={styles.summaryStatLabel}>Putts</Text>
        </View>
        {showAdvancedStats && (
          <>
            <View style={styles.summaryStatDivider} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatValue}>
                {summary.fairwaysPossible > 0
                  ? `${summary.fairwaysHit}/${summary.fairwaysPossible}`
                  : '—'}
              </Text>
              <Text style={styles.summaryStatLabel}>FIR</Text>
            </View>
            <View style={styles.summaryStatDivider} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatValue}>
                {summary.greensPossible > 0
                  ? `${summary.greensHit}/${summary.greensPossible}`
                  : '—'}
              </Text>
              <Text style={styles.summaryStatLabel}>GIR</Text>
            </View>
          </>
        )}
        {summary.penalties > 0 && (
          <>
            <View style={styles.summaryStatDivider} />
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryStatValue, styles.penaltyValue]}>
                {summary.penalties}
              </Text>
              <Text style={styles.summaryStatLabel}>Pen</Text>
            </View>
          </>
        )}
      </View>
      {showAdvancedDataHint && (
        <Text style={styles.summaryHint}>
          We found fairway and green data on this card. Save that tracking with Pro.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  summaryCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.bg.tertiary,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryName: {
    ...typography.headingSm,
    color: colors.text.primary,
  },
  summaryScoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  summaryScore: {
    ...typography.statSm,
    fontVariant: [...typography.statSm.fontVariant],
    color: colors.text.primary,
  },
  summaryToPar: {
    ...typography.bodySm,
    color: colors.text.secondary,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryStatValue: {
    ...typography.labelLg,
    color: colors.text.primary,
  },
  summaryStatLabel: {
    ...typography.labelSm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  summaryStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.bg.tertiary,
  },
  penaltyValue: {
    color: colors.semantic.warning,
  },
  summaryHint: {
    ...typography.bodySm,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
});
