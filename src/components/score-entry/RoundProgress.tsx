import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiveRoundStats } from '../../utils/liveRoundStats';

interface RoundProgressProps {
  completedHoles: number;
  totalHoles: number;
  totalScore: number;
  scoreToPar: number;
  totalPutts: number;
  puttsTracked?: boolean;
  firHit?: number;
  firTotal?: number;
  girHit?: number;
  girTotal?: number;
  upDownMade?: number;
  upDownAttempts?: number;
  showFir?: boolean;
  showGir?: boolean;
  showPutts?: boolean;
  showUpDown?: boolean;
  liveStats?: LiveRoundStats | null;
  ghostMessage?: string | null;
  ghostTone?: 'ahead' | 'behind' | 'tied' | 'insufficient_data' | null;
  comebackMessage?: string | null;
  comebackSecondary?: string | null;
  styles: Record<string, any>;
}

export const RoundProgress: React.FC<RoundProgressProps> = ({
  completedHoles,
  totalHoles,
  totalScore,
  scoreToPar,
  totalPutts,
  firHit,
  firTotal,
  girHit,
  girTotal,
  upDownMade,
  upDownAttempts,
  showFir = false,
  showGir = false,
  showPutts = true,
  showUpDown = false,
  liveStats = null,
  ghostMessage = null,
  ghostTone = null,
  comebackMessage = null,
  comebackSecondary = null,
  styles,
}) => {
  const rawProgress = totalHoles > 0 ? (completedHoles / totalHoles) * 100 : 0;
  const progress = Math.min(100, Math.max(0, rawProgress));
  const progressWidth = completedHoles > 0 ? `${progress}%` : '0%';
  const scoreLabel = totalScore.toString();
  const puttsLabel = showPutts ? totalPutts.toString() : '0';
  const toParLabel = `${scoreToPar > 0 ? '+' : ''}${scoreToPar}`;
  const firLabel = showFir ? `${firHit ?? 0}/${firTotal ?? 0}` : '0/0';
  const girLabel = showGir ? `${girHit ?? 0}/${girTotal ?? 0}` : '0/0';
  const upDownLabel = showUpDown ? `${upDownMade ?? 0}/${upDownAttempts ?? 0}` : '0/0';
  const showSecondRow = showFir || showGir || showUpDown;
  const projectedLabel = liveStats?.projectedScore != null ? String(liveStats.projectedScore) : '—';
  const puttsTopLabel = showPutts
    ? String(Math.max(totalPutts, liveStats?.putts ?? 0))
    : '0';
  const showLiveStrip = !!liveStats?.intelligenceReady && !!liveStats.primaryRead;

  return (
    <View style={styles.roundProgressCard}>
      <View style={styles.roundProgressHeader}>
        <Text style={styles.roundProgressTitle}>Round Progress</Text>
        <Text style={styles.roundProgressValue}>{completedHoles}/{totalHoles}</Text>
      </View>
      <View style={styles.roundProgressBar}>
        <View
          style={[
            styles.roundProgressFill,
            { width: progressWidth, opacity: completedHoles > 0 ? 1 : 0 },
          ]}
        />
      </View>
      <View style={styles.roundProgressStats}>
        <View style={styles.roundProgressStatsRow}>
          <View style={styles.roundProgressStat}>
            <Text style={styles.roundProgressStatValue}>{scoreLabel}</Text>
            <Text style={styles.roundProgressStatLabel}>Score</Text>
          </View>
          <View style={styles.roundProgressStat}>
            <Text
              style={[
                styles.roundProgressStatValue,
                scoreToPar < 0 ? styles.roundProgressStatGood : scoreToPar > 0 ? styles.roundProgressStatBad : null,
              ]}
            >
              {toParLabel}
            </Text>
            <Text style={styles.roundProgressStatLabel}>To Par</Text>
          </View>
          <View style={styles.roundProgressStat}>
            <Text style={styles.roundProgressStatValue}>{projectedLabel}</Text>
            <Text style={styles.roundProgressStatLabel}>Projected</Text>
          </View>
          <View style={styles.roundProgressStat}>
            <Text style={styles.roundProgressStatValue}>{puttsTopLabel}</Text>
            <Text style={styles.roundProgressStatLabel}>Putts</Text>
          </View>
        </View>
        {showLiveStrip && (
          <View style={styles.liveIntelStrip}>
            <View style={styles.liveIntelPrimary}>
              <Text style={styles.liveIntelLabel}>{liveStats.primaryRead?.label}</Text>
              <Text
                style={[
                  styles.liveIntelValue,
                  liveStats.primaryRead?.tone === 'positive' && styles.liveIntelPositive,
                  liveStats.primaryRead?.tone === 'negative' && styles.liveIntelNegative,
                ]}
              >
                {liveStats.primaryRead?.value}
              </Text>
            </View>
            <Text style={styles.liveIntelDetail}>{liveStats.primaryRead?.detail}</Text>
            {liveStats.secondaryRead && (
              <Text style={styles.liveIntelSecondary}>
                {liveStats.secondaryRead.label}: {liveStats.secondaryRead.value}
              </Text>
            )}
          </View>
        )}
        {showSecondRow && (
          <View style={styles.roundProgressStatsRow}>
            {showFir && (
              <View style={styles.roundProgressStat}>
                <Text style={styles.roundProgressStatValue}>{firLabel}</Text>
                <Text style={styles.roundProgressStatLabel}>FIR</Text>
              </View>
            )}
            {showGir && (
              <View style={styles.roundProgressStat}>
                <Text style={styles.roundProgressStatValue}>{girLabel}</Text>
                <Text style={styles.roundProgressStatLabel}>GIR</Text>
              </View>
            )}
            {showUpDown && (
              <View style={styles.roundProgressStat}>
                <Text style={styles.roundProgressStatValue}>{upDownLabel}</Text>
                <Text style={styles.roundProgressStatLabel}>U&D</Text>
              </View>
            )}
          </View>
        )}
        {!!comebackMessage && (
          <View style={styles.comebackCard}>
            <View style={styles.comebackHeader}>
              <Text style={styles.comebackLabel}>Back Nine Target</Text>
            </View>
            <Text style={styles.comebackMessage}>{comebackMessage}</Text>
            {!!comebackSecondary && (
              <Text style={styles.comebackSecondary}>{comebackSecondary}</Text>
            )}
          </View>
        )}
        {!!ghostMessage && (
          <View style={styles.ghostRow}>
            <Ionicons name="person-outline" size={12} color="#6B7280" />
            <Text
              style={[
                styles.ghostText,
                ghostTone === 'ahead' && styles.ghostAhead,
                ghostTone === 'behind' && styles.ghostBehind,
                ghostTone === 'tied' && styles.ghostTied,
              ]}
            >
              {ghostMessage}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};
