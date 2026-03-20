import React from 'react';
import { View, Text } from 'react-native';
import { DetailedStatCard } from '../DetailedStatCard';
import { formatPercent } from '../../utils/formatStat';
import { StatWithContext } from '../../types';
import { EMPTY_STATE_COPY } from '../../constants/emptyStateCopy';

interface PerformanceStats {
  fairways: StatWithContext | null;
  gir: StatWithContext | null;
  putts: StatWithContext | null;
  penalties: StatWithContext | null;
  threePuttRate: StatWithContext | null;
  upDown: StatWithContext | null;
}

interface BallStrikingTotals {
  fairwaysHit: number;
  fairwaysTotal: number;
  greensHit: number;
  greensTotal: number;
  puttsTotal: number;
  puttsRounds: number;
  upDownMade: number;
  upDownAttempts: number;
  threePutts: number;
}

interface SparklineSeries {
  putts: number[];
  penalties: number[];
  threePuttRate: number[];
  upDown: number[];
  fir: number[];
  gir: number[];
}

interface BallStrikingSubTabProps {
  active: boolean;
  performanceStats: PerformanceStats | null;
  hasPerformanceStats: boolean;
  ballStrikingTotals: BallStrikingTotals;
  sparklineSeries: SparklineSeries;
  showTooltip: (title: string, content: string) => void;
  styles: any;
}

export const BallStrikingSubTab: React.FC<BallStrikingSubTabProps> = ({
  active,
  performanceStats,
  hasPerformanceStats,
  ballStrikingTotals,
  sparklineSeries,
  showTooltip,
  styles,
}) => {
  if (!active || !hasPerformanceStats || !performanceStats) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Ball Striking Performance</Text>
      <Text style={styles.sectionSubtitle}>
        How well you execute tee shots, approach shots, and putting
      </Text>

      {performanceStats.fairways && (
        <DetailedStatCard
          title="Fairways Reached"
          stat={performanceStats.fairways}
          unit="%"
          trackedRoundsLabel="rounds with FIR tracked"
          sparkline={sparklineSeries.fir}
          detail={
            ballStrikingTotals.fairwaysTotal > 0
              ? `${ballStrikingTotals.fairwaysHit}/${ballStrikingTotals.fairwaysTotal} fairways hit`
              : EMPTY_STATE_COPY.noFairwayDataTrackMore
          }
          insight="Fairways set up easier approach shots and better scoring opportunities."
          infoText="Fairways set up easier approach shots and help avoid penalty strokes."
          onInfoPress={() =>
            showTooltip(
              'Fairways Reached',
              'Fairways set up easier approach shots and help avoid penalty strokes.'
            )
          }
        />
      )}

      {performanceStats.gir && (
        <DetailedStatCard
          title="Greens in Regulation"
          stat={performanceStats.gir}
          unit="%"
          trackedRoundsLabel="rounds with GIR tracked"
          sparkline={sparklineSeries.gir}
          detail={
            ballStrikingTotals.greensTotal > 0
              ? `${ballStrikingTotals.greensHit}/${ballStrikingTotals.greensTotal} greens hit`
              : EMPTY_STATE_COPY.noGreenDataTrackMore
          }
          insight="More greens means more birdie chances and fewer scramble situations."
          infoText="More greens steady your scoring and save strokes."
          onInfoPress={() =>
            showTooltip(
              'Greens in Regulation',
              'More greens steady your scoring and save strokes.'
            )
          }
        />
      )}

      {performanceStats.putts && (
        <DetailedStatCard
          title="Putts per Round"
          stat={performanceStats.putts}
          unit=""
          trackedRoundsLabel="rounds with putts tracked"
          sparkline={sparklineSeries.putts}
          detail={
            ballStrikingTotals.puttsRounds > 0
              ? `${ballStrikingTotals.puttsTotal} total putts in ${ballStrikingTotals.puttsRounds} rounds`
              : EMPTY_STATE_COPY.noPuttDataTrackMore
          }
          insight="Reducing putts by 2-3 per round can save multiple strokes."
          infoText="Putting totals are based on rounds with recorded putts."
          onInfoPress={() =>
            showTooltip('Putts per Round', 'Putting totals are based on rounds with recorded putts.')
          }
        />
      )}

      {performanceStats.upDown && (
        <DetailedStatCard
          title="Up & Down Percentage"
          stat={performanceStats.upDown}
          unit="%"
          trackedRoundsLabel="rounds with up & downs tracked"
          sparkline={sparklineSeries.upDown}
          detail={
            ballStrikingTotals.upDownAttempts > 0
              ? `${ballStrikingTotals.upDownMade}/${ballStrikingTotals.upDownAttempts} up & downs`
              : EMPTY_STATE_COPY.noUpDownDataTrackMore
          }
          insight="Strong up & down play turns missed greens into saves instead of bogeys."
          infoText="Up & down rate reflects how often you save par after missing greens."
          onInfoPress={() =>
            showTooltip(
              'Up & Down Percentage',
              'Up & down rate reflects how often you save par after missing greens.'
            )
          }
          subStats={
            performanceStats.threePuttRate && ballStrikingTotals.threePutts > 0
              ? [
                  {
                    label: 'Three-Putts',
                    value: formatPercent(performanceStats.threePuttRate.typical),
                    detail: `${ballStrikingTotals.threePutts} total`,
                  },
                ]
              : undefined
          }
        />
      )}
    </View>
  );
};
