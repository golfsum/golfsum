import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EMPTY_STATE_COPY } from '../../constants/emptyStateCopy';
import { UI_COPY } from '../../constants/uiCopy';

interface RoundsSummaryCardProps {
  roundsCount: number;
  sinceLabel: string;
  bestLabel: string | null;
  streakLabel: string | null;
  onBestPress?: () => void;
  onStartRound?: () => void;
  styles: any;
}

export const RoundsSummaryCard: React.FC<RoundsSummaryCardProps> = ({
  roundsCount,
  sinceLabel,
  bestLabel,
  streakLabel,
  onBestPress,
  onStartRound,
  styles,
}) => {
  const hasRounds = roundsCount > 0;

  return (
    <View style={styles.roundsSummaryCard}>
      <View style={styles.roundsSummaryHeader}>
        <Ionicons name="stats-chart" size={16} color="#10B981" />
        <Text style={styles.roundsSummaryTitle}>ROUNDS SUMMARY</Text>
      </View>
      {hasRounds ? (
        <>
          <Text style={styles.roundsSummaryLine}>
            {roundsCount} round{roundsCount !== 1 ? 's' : ''} played · {sinceLabel}
          </Text>
          {bestLabel && (
            <TouchableOpacity
              style={styles.roundsSummaryBestRow}
              onPress={onBestPress}
              disabled={!onBestPress}
            >
              <Text style={styles.roundsSummaryLine}>Best: {bestLabel}</Text>
              {onBestPress && <Ionicons name="chevron-forward" size={14} color="#6B7280" />}
            </TouchableOpacity>
          )}
          {streakLabel && (
            <View style={styles.roundsSummaryStreakRow}>
              <Ionicons name="flame" size={14} color="#F59E0B" />
              <Text style={styles.roundsSummaryStreakText}>{streakLabel}</Text>
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={styles.roundsSummaryEmptyText}>{EMPTY_STATE_COPY.noRoundsStartOrImport}</Text>
          {onStartRound && (
            <TouchableOpacity style={styles.roundsSummaryCta} onPress={onStartRound}>
              <Text style={styles.roundsSummaryCtaText}>{UI_COPY.actions.startRound}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
};
