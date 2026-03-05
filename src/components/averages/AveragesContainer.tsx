/**
 * Averages Tab - Redesigned
 * 
 * NEW PRINCIPLES:
 * - Show what's typical, not what's possible
 * - Emphasize recent form
 * - Always anchor performance to handicap expectations
 * - Never overwhelm
 * 
 * LAYOUT:
 * 1. Performance Snapshot (Fairways, GIR, Putts, Penalties)
 * 2. Tee & Approach Breakdown
 * 3. Short Game & Putting
 * 4. Context Splits (Expandable)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SavedRound, StatWithContext, ConfidenceLevel } from '../../types';
import { getRoundStatPreferences } from '../../utils/statPreferences';
import { useAveragesData, PerformanceStats } from './hooks/useAveragesData';
import { OverviewSubTab } from './OverviewSubTab';
import { BallStrikingSubTab } from './BallStrikingSubTab';
import { ByParSubTab } from './ByParSubTab';
import { getConfidenceTooltip, getTrendTooltip } from '../../utils/averagesAnalytics';
import { dismissSampleRound } from '../../services/roundsService';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import { UI_COPY } from '../../constants/uiCopy';
import { EMPTY_STATE_COPY } from '../../constants/emptyStateCopy';
import { analyzeScoringDistribution } from '../../services/scoringDistribution';
import { getClubUsageSummary } from '../../services/analyticsService';

interface Props {
  refreshTrigger?: number;
  onNavigateToInsights?: () => void;
  onNavigateToPlay?: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToCourseStats?: (courseName: string) => void;
  onImportScorecard?: () => void;
}

interface ConditionSplit {
  label: string;
  summary: string;
}

type AveragesSubTab = 'overview' | 'ball-striking' | 'by-par';

export const AveragesTab: React.FC<Props> = ({ refreshTrigger, onNavigateToPlay, onNavigateToProfile, onNavigateToCourseStats, onImportScorecard }) => {
  const { canAccess } = useFeatureGate({ refreshKey: refreshTrigger });
  const hasFullAverages = canAccess('averages_full');
  const hasStatAccess = canAccess('gir');
  const [showContextSplits, setShowContextSplits] = useState(false);
  const [tooltipModal, setTooltipModal] = useState<{ title: string; content: string } | null>(null);
  const [activeTab, setActiveTab] = useState<AveragesSubTab>('overview');
  const [trendRange, setTrendRange] = useState<5 | 10 | 20>(20);
  const [samplePreviewIndex, setSamplePreviewIndex] = useState(0);
  const {
    rounds,
    loading,
    refreshing,
    handicap,
    whsDetails,
    performanceStats,
    ballStrikingTotals,
    trendSeries,
    sparklineSeries,
    frontBackSplit,
    parStats,
    onRefresh,
  } = useAveragesData({ refreshTrigger, trendRange });

  const handleUpgradePress = () => {
    onNavigateToProfile?.();
  };

  const courseOptions = useMemo(() => {
    const map = new Map<string, { name: string; count: number; bestScore: number }>();
    rounds.forEach(round => {
      const name = (round.courseName || '').trim();
      if (!name || name.toLowerCase() === 'test') return;
      const entry = map.get(name) || { name, count: 0, bestScore: round.score };
      entry.count += 1;
      entry.bestScore = Math.min(entry.bestScore, round.score);
      map.set(name, entry);
    });
    return [...map.values()]
      .filter(entry => entry.count >= 2)
      .sort((a, b) => b.count - a.count);
  }, [rounds]);

  const buildConditionSplits = (allRounds: SavedRound[]): ConditionSplit[] => {
    const scoredRounds = allRounds.filter(r => r.holes && r.holes.length > 0);
    const splits: ConditionSplit[] = [];

    const parseTemp = (value: string | undefined): number | null => {
      if (!value) return null;
      const match = value.match(/-?\d+(\.\d+)?/);
      if (!match) return null;
      const parsed = parseFloat(match[0]);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const calmRounds = scoredRounds.filter(r => r.weather?.wind === 'Calm' || r.weather?.wind === 'Light');
    const windyRounds = scoredRounds.filter(r => r.weather?.wind === 'Strong' || r.weather?.wind === 'Very Strong');
    const moderateWindRounds = scoredRounds.filter(r => r.weather?.wind === 'Moderate');
    const rainyRounds = scoredRounds.filter(r => (r.weather?.conditions || '').toLowerCase().includes('rain'));
    const dryRounds = scoredRounds.filter(r => !(r.weather?.conditions || '').toLowerCase().includes('rain'));
    const coldRounds = scoredRounds.filter(r => {
      const temp = parseTemp(r.weather?.temp);
      return temp !== null && temp <= 50;
    });
    const hotRounds = scoredRounds.filter(r => {
      const temp = parseTemp(r.weather?.temp);
      return temp !== null && temp >= 85;
    });
    const humidRounds = scoredRounds.filter(r => (r.weather?.humidity ?? -1) >= 70);
    const dryHumidityRounds = scoredRounds.filter(r => (r.weather?.humidity ?? 101) <= 40);
    const highElevationRounds = scoredRounds.filter(r => (r.courseSnapshot?.location?.elevationFt ?? -1) >= 2000);
    const lowElevationRounds = scoredRounds.filter(r => (r.courseSnapshot?.location?.elevationFt ?? 99999) <= 500);

    const averageScore = (roundsSubset: SavedRound[]): number | null => {
      if (roundsSubset.length === 0) return null;
      const total = roundsSubset.reduce((sum, r) => sum + r.score, 0);
      return total / roundsSubset.length;
    };

    if (calmRounds.length >= 2 && windyRounds.length >= 2) {
      const calmAvg = averageScore(calmRounds);
      const windyAvg = averageScore(windyRounds);
      if (calmAvg !== null && windyAvg !== null) {
        const diff = windyAvg - calmAvg;
        const direction = diff > 0 ? 'worse' : 'better';
        splits.push({
          label: 'Wind Impact',
          summary: `Windy rounds are ${Math.abs(diff).toFixed(1)} strokes ${direction} than calm rounds`,
        });
      }
    }

    if (calmRounds.length >= 2 && moderateWindRounds.length >= 2) {
      const calmAvg = averageScore(calmRounds);
      const moderateAvg = averageScore(moderateWindRounds);
      if (calmAvg !== null && moderateAvg !== null) {
        const diff = moderateAvg - calmAvg;
        const direction = diff > 0 ? 'worse' : 'better';
        splits.push({
          label: 'Breezy Rounds',
          summary: `Moderate wind rounds are ${Math.abs(diff).toFixed(1)} strokes ${direction} than calm rounds`,
        });
      }
    }

    if (dryRounds.length >= 2 && rainyRounds.length >= 2) {
      const dryAvg = averageScore(dryRounds);
      const rainAvg = averageScore(rainyRounds);
      if (dryAvg !== null && rainAvg !== null) {
        const diff = rainAvg - dryAvg;
        const direction = diff > 0 ? 'worse' : 'better';
        splits.push({
          label: 'Rain Impact',
          summary: `Rainy rounds are ${Math.abs(diff).toFixed(1)} strokes ${direction} than dry rounds`,
        });
      }
    }

    if (humidRounds.length >= 2 && dryHumidityRounds.length >= 2) {
      const humidAvg = averageScore(humidRounds);
      const dryAvg = averageScore(dryHumidityRounds);
      if (humidAvg !== null && dryAvg !== null) {
        const diff = humidAvg - dryAvg;
        const direction = diff > 0 ? 'worse' : 'better';
        splits.push({
          label: 'Humidity Impact',
          summary: `Humid rounds are ${Math.abs(diff).toFixed(1)} strokes ${direction} than dry-air rounds`,
        });
      }
    }

    if (highElevationRounds.length >= 2 && lowElevationRounds.length >= 2) {
      const highAvg = averageScore(highElevationRounds);
      const lowAvg = averageScore(lowElevationRounds);
      if (highAvg !== null && lowAvg !== null) {
        const diff = highAvg - lowAvg;
        const direction = diff > 0 ? 'worse' : 'better';
        splits.push({
          label: 'Elevation Impact',
          summary: `High-elevation rounds are ${Math.abs(diff).toFixed(1)} strokes ${direction} than low-elevation rounds`,
        });
      }
    }

    if (coldRounds.length >= 2 && hotRounds.length >= 2) {
      const coldAvg = averageScore(coldRounds);
      const hotAvg = averageScore(hotRounds);
      if (coldAvg !== null && hotAvg !== null) {
        const diff = hotAvg - coldAvg;
        const direction = diff > 0 ? 'worse' : 'better';
        splits.push({
          label: 'Temperature',
          summary: `Hot rounds are ${Math.abs(diff).toFixed(1)} strokes ${direction} than cold rounds`,
        });
      }
    }

    const parSplit = (par: number): number | null => {
      let total = 0;
      let count = 0;
      scoredRounds.forEach(round => {
        round.holes?.forEach(h => {
          if (h.par === par && h.score) {
            total += h.score - h.par;
            count += 1;
          }
        });
      });
      return count > 0 ? total / count : null;
    };

    const par3Over = parSplit(3);
    const par4Over = parSplit(4);
    const par5Over = parSplit(5);
    if (par3Over !== null && par4Over !== null && par5Over !== null) {
      const best = Math.min(par3Over, par4Over, par5Over);
      const worst = Math.max(par3Over, par4Over, par5Over);
      const bestLabel = best === par3Over ? 'Par 3s' : best === par4Over ? 'Par 4s' : 'Par 5s';
      const worstLabel = worst === par3Over ? 'Par 3s' : worst === par4Over ? 'Par 4s' : 'Par 5s';
      if (worst - best >= 0.4) {
        splits.push({
          label: 'Par Type Gap',
          summary: `${worstLabel} cost about ${(worst - best).toFixed(1)} more strokes per hole than ${bestLabel}`,
        });
      }
    }

    return splits.slice(0, 4);
  };

  const showTooltip = (title: string, content: string) => {
    setTooltipModal({ title, content });
  };

  const formatExpectedRange = (min: number, max: number, unit: string): string => {
    const useDecimals = min % 1 !== 0 || max % 1 !== 0;
    const formatValue = (value: number) => (useDecimals ? value.toFixed(1) : value.toFixed(0));
    const range = `${formatValue(min)}-${formatValue(max)}`;
    return unit ? `${range}${unit}` : range;
  };

  const buildFocusSummary = (stats: PerformanceStats | null): { primary: string; secondary: string } => {
    if (!stats) {
      return {
        primary: 'Use these patterns to guide decisions and practice priorities, not to judge individual shots.',
        secondary: 'Variation like this is normal in golf. Small improvements in any area can lead to better scoring.',
      };
    }

    const candidates = [
      { label: 'Fairways Reached', stat: stats.fairways, unit: '%', lowerBetter: false },
      { label: 'Greens Reached', stat: stats.gir, unit: '%', lowerBetter: false },
      { label: 'Putts Taken', stat: stats.putts, unit: '', lowerBetter: true },
      { label: 'Penalty Strokes', stat: stats.penalties, unit: '', lowerBetter: true },
      { label: 'Three-Putts', stat: stats.threePuttRate, unit: '%', lowerBetter: true },
      { label: 'Up & Down', stat: stats.upDown, unit: '%', lowerBetter: false },
    ];

    const scored = candidates
      .map(candidate => {
        const stat = candidate.stat;
        if (!stat || stat.sampleSize === 0 || !stat.expectedRange || stat.status !== 'BELOW') return null;
        if (stat.confidence === ConfidenceLevel.INSUFFICIENT) return null;
        const { min, max } = stat.expectedRange;
        const diff = candidate.lowerBetter ? stat.typical - max : min - stat.typical;
        if (diff <= 0) return null;
        const rangeSpan = Math.max(1, max - min);
        return {
          ...candidate,
          stat,
          diff,
          normalizedGap: diff / rangeSpan,
        };
      })
      .filter(Boolean) as Array<{
        label: string;
        stat: StatWithContext;
        unit: string;
        lowerBetter: boolean;
        diff: number;
        normalizedGap: number;
      }>;

    if (scored.length === 0) {
      return {
        primary: 'No major gaps vs handicap benchmarks across tracked stats.',
        secondary: 'Keep building sample size to surface a clearer focus area.',
      };
    }

    const topGap = scored.sort((a, b) => b.normalizedGap - a.normalizedGap)[0];
    const expectedText = formatExpectedRange(topGap.stat.expectedRange!.min, topGap.stat.expectedRange!.max, topGap.unit);
    const diffValue = topGap.unit === '%'
      ? `${topGap.diff.toFixed(1)}%`
      : topGap.diff.toFixed(1);
    const direction = topGap.lowerBetter ? 'higher' : 'lower';
    const unitSuffix = topGap.unit === '%' ? '%' : '';

    return {
      primary: `Biggest gap: ${topGap.label}. Typical ${topGap.stat.typical}${unitSuffix} vs expected ${expectedText} (${diffValue} ${direction}).`,
      secondary: 'Treat this as your best ROI area for practice and decision-making right now.',
    };
  };

  const notEligibleCount = whsDetails
    ? Math.max(0, rounds.length - whsDetails.acceptableRoundsCount)
    : 0;

  useEffect(() => {
    if (rounds.length !== 0) return;
    const timer = setInterval(() => {
      setSamplePreviewIndex(prev => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(timer);
  }, [rounds.length]);

  useEffect(() => {
    if (!hasFullAverages && activeTab !== 'overview') {
      setActiveTab('overview');
    }
  }, [hasFullAverages, activeTab]);

  const conditionSplits = buildConditionSplits(rounds);
  const scoringProfile = useMemo(() => analyzeScoringDistribution(rounds, handicap), [rounds, handicap]);
  const clubUsageSummary = useMemo(() => getClubUsageSummary(rounds), [rounds]);
  const scoringHero = useMemo(() => {
    const completed = rounds.filter((round) => typeof round.score === 'number' && round.score > 0);
    if (completed.length === 0) return null;
    const avgScore = completed.reduce((sum, round) => sum + round.score, 0) / completed.length;
    const avgToPar =
      completed.reduce((sum, round) => {
        const roundPar = (round.holes || []).reduce((parSum, hole) => parSum + (hole.par || 0), 0);
        const fallbackPar = round.holeCount === 9 ? 36 : 72;
        const resolvedPar = roundPar > 0 ? roundPar : fallbackPar;
        return sum + (round.score - resolvedPar);
      }, 0) / completed.length;
    return { avgScore, avgToPar, rounds: completed.length };
  }, [rounds]);
  const scoringStyleCard = useMemo(() => {
    if (!scoringProfile) return null;
    const focus =
      scoringProfile.coachingFocus === 'FLOOR'
        ? 'Focus: protect floor by removing doubles and compounding holes.'
        : scoringProfile.coachingFocus === 'CEILING'
          ? 'Focus: raise ceiling by creating more realistic birdie chances.'
          : scoringProfile.coachingFocus === 'MOMENTUM'
            ? 'Focus: stabilize transitions after birdies, bogeys, and doubles.'
            : 'Focus: preserve consistency and keep baseline process stable.';
    const titleByArchetype: Record<string, string> = {
      CEILING_CHASER: 'Your Scoring Style: Ceiling Chaser',
      EXPLOSIVE: 'Your Scoring Style: Explosive',
      FLOOR_RAISER: 'Your Scoring Style: Floor Raiser',
      STREAKY_SCORER: 'Your Scoring Style: Streaky Scorer',
      CONSISTENT_GRINDER: 'Your Scoring Style: Consistent Grinder',
      DEVELOPING: 'Your Scoring Style: Developing',
    };
    return {
      title: titleByArchetype[scoringProfile.archetype] ?? 'Your Scoring Style',
      summary: `Volatility ${scoringProfile.volatility.level.toLowerCase()} (std dev ${scoringProfile.volatility.stdDev.toFixed(1)}). Blowups ${(scoringProfile.distribution.blowupRate * 100).toFixed(0)}%. Birdie-or-better ${(scoringProfile.distribution.scoringRate * 100).toFixed(0)}%.`,
      focus,
    };
  }, [scoringProfile]);

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="hourglass-outline" size={48} color="#6B7280" />
        <Text style={styles.emptyText}>Loading stats...</Text>
      </View>
    );
  }

  const averagesRequiredRounds = 3;
  const averagesRoundsRemaining = Math.max(0, averagesRequiredRounds - rounds.length);
  const averagesProgress = Math.min(100, Math.round((rounds.length / averagesRequiredRounds) * 100));
  const averagesProgressText = `${rounds.length} of ${averagesRequiredRounds} rounds recorded`;
  const averagesRemainingText =
    averagesRoundsRemaining > 0
      ? `Need ${averagesRoundsRemaining} more round${averagesRoundsRemaining === 1 ? '' : 's'}`
      : 'Averages unlocked';

  if (rounds.length === 0) {
    const progress = 0;
    const samplePreviews = [
      {
        type: 'Trend',
        icon: 'trending-up' as keyof typeof Ionicons.glyphMap,
        title: 'Score Trend',
        text: 'See score movement over time so you can quickly spot if recent rounds are improving or slipping.',
      },
      {
        type: 'Ball Striking',
        icon: 'analytics-outline' as keyof typeof Ionicons.glyphMap,
        title: 'FIR / GIR Accuracy',
        text: 'Track fairways and greens together to see if misses come from tee shots, approaches, or both.',
      },
      {
        type: 'Putting',
        icon: 'golf-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Putting Baseline',
        text: 'Compare putts per round and three-putt rate so you know where fast scoring gains are available.',
      },
    ];
    const currentPreview = samplePreviews[samplePreviewIndex % samplePreviews.length];

    return (
      <ScrollView contentContainerStyle={styles.emptyPreviewContainer}>
        <View style={styles.emptyStateCard}>
          <Ionicons name="bar-chart-outline" size={52} color="#10B981" />
          <Text style={styles.emptyStateTitle}>{EMPTY_STATE_COPY.titles.nothingToAverageYet}</Text>
          <Text style={styles.emptyStateText}>
            Play or import your first round to see your stats.
          </Text>
          <View style={styles.progressSection}>
            <Text style={styles.progressText}>0 of {averagesRequiredRounds} rounds complete</Text>
            <View style={styles.progressBarTrack}>
              {progress > 0 && (
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              )}
            </View>
            <Text style={styles.progressSubtext}>
              {averagesRequiredRounds} rounds builds your scoring averages and trend stats
            </Text>
          </View>
          {onNavigateToPlay && (
            <TouchableOpacity style={styles.trackRoundButton} onPress={onNavigateToPlay}>
              <Text style={styles.trackRoundButtonText}>{UI_COPY.actions.startRound}</Text>
            </TouchableOpacity>
          )}
          {onImportScorecard && (
            <TouchableOpacity style={styles.secondaryEmptyButton} onPress={onImportScorecard}>
              <Text style={styles.secondaryEmptyButtonText}>{UI_COPY.actions.importScorecard}</Text>
            </TouchableOpacity>
          )}

          <View style={[styles.previewChartBlock, { width: '100%', marginTop: 16, marginBottom: 0 }]}>
            <View style={styles.previewChartHeader}>
              <Text style={styles.previewChartTitle}>What You'll See</Text>
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}>Example</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.emptyPreviewInsightCard}
              onPress={() => setSamplePreviewIndex(prev => (prev + 1) % samplePreviews.length)}
              activeOpacity={0.8}
            >
              <View style={styles.emptyPreviewInsightHeader}>
                <Ionicons name={currentPreview.icon} size={16} color="#10B981" />
                <Text style={styles.emptyPreviewInsightType}>{currentPreview.type}</Text>
              </View>
              <Text style={styles.emptyPreviewInsightTitle}>{currentPreview.title}</Text>
              <Text style={styles.emptyPreviewInsightText}>{currentPreview.text}</Text>
              <View style={styles.emptyPreviewDots}>
                {samplePreviews.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.emptyPreviewDot,
                      i === (samplePreviewIndex % samplePreviews.length) && styles.emptyPreviewDotActive,
                    ]}
                  />
                ))}
              </View>
            </TouchableOpacity>
          </View>

          <View style={[styles.unlockSummaryCard, { width: '100%', marginTop: 12 }]}>
            <View style={styles.unlockSummaryHeader}>
              <Ionicons name="stats-chart" size={18} color="#10B981" />
              <Text style={styles.unlockSummaryTitle}>After 3 rounds, you'll see:</Text>
            </View>
            <View style={styles.unlockSummaryList}>
              <Text style={styles.unlockSummaryItem}>• Average score and scoring trend</Text>
              <Text style={styles.unlockSummaryItem}>• FIR and GIR breakdown</Text>
              <Text style={styles.unlockSummaryItem}>• Putting averages by round</Text>
              <Text style={styles.unlockSummaryItem}>• Progress toward your goals</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (rounds.length === 1) {
    const firstRound = rounds[0];
    return (
      <ScrollView contentContainerStyle={styles.emptyPreviewContainer}>
        <View style={styles.compactProgress}>
          <Text style={styles.progressText}>1 of {averagesRequiredRounds} rounds complete</Text>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${averagesProgress}%` }]} />
          </View>
          <Text style={styles.progressSubtext}>Averages get more accurate with more rounds.</Text>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Current Baseline</Text>
          <View style={styles.previewRow}>
            <View style={styles.previewStat}>
              <Text style={styles.previewValue}>{firstRound.score}</Text>
              <Text style={styles.previewLabel}>Score</Text>
            </View>
            <View style={styles.previewStat}>
              <Text style={styles.previewValue}>{firstRound.stats?.putts ?? '—'}</Text>
              <Text style={styles.previewLabel}>Putts</Text>
            </View>
            <View style={styles.previewStat}>
              <Text style={styles.previewValue}>{firstRound.courseName || '—'}</Text>
              <Text style={styles.previewLabel}>Course</Text>
            </View>
          </View>
        </View>

        {onNavigateToPlay && (
          <TouchableOpacity style={styles.trackRoundButton} onPress={onNavigateToPlay}>
            <Text style={styles.trackRoundButtonText}>{UI_COPY.actions.trackNextRound}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  if (rounds.length < averagesRequiredRounds) {
    const previewRound = rounds[0];
    const previewStats = previewRound
      ? {
          score: previewRound.score,
          putts: previewRound.stats?.putts ?? null,
          fir: previewRound.stats?.fairwaysPossible
            ? Math.round(((previewRound.stats.fairways || 0) / previewRound.stats.fairwaysPossible) * 100)
            : null,
          gir: previewRound.stats?.greensPossible
            ? Math.round(((previewRound.stats.greens || 0) / previewRound.stats.greensPossible) * 100)
            : null,
        }
      : null;

    // Real scores from user's rounds + gray placeholders for remaining slots
    const realScores = rounds.map(r => r.score);
    const placeholderHeights = [35, 42, 28, 45, 32, 38];
    const placeholderCount = Math.max(0, 7 - realScores.length);

    return (
      <ScrollView contentContainerStyle={styles.emptyPreviewContainer}>
        {/* Progress card */}
        <View style={styles.compactProgress}>
          <Text style={styles.progressText}>
            {averagesProgressText}
          </Text>
          <View style={styles.progressBarTrack}>
            {averagesProgress > 0 && (
              <View style={[styles.progressBarFill, { width: `${averagesProgress}%` }]} />
            )}
          </View>
          <Text style={styles.progressSubtext}>
            {averagesRemainingText}. 3 rounds builds your scoring average, putting stats, accuracy breakdown, and trend tracking
          </Text>
        </View>

        {/* CTA — moved to top, right after progress */}
        <TouchableOpacity
          style={styles.trackRoundButton}
          onPress={onNavigateToPlay}
          disabled={!onNavigateToPlay}
        >
          <Text style={styles.trackRoundButtonText}>Track Your Next Round</Text>
        </TouchableOpacity>

        {/* Import shortcut — elevated card */}
        {onImportScorecard && (
          <TouchableOpacity style={styles.importCard} onPress={onImportScorecard} activeOpacity={0.7}>
            <View style={styles.importCardIcon}>
              <Ionicons name="camera" size={24} color="#10B981" />
            </View>
            <View style={styles.importCardTextContainer}>
              <Text style={styles.importCardTitle}>Import Past Scorecards</Text>
              <Text style={styles.importCardDesc}>
                Photograph your scorecards to add stats today. No round needed.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        )}

        {/* Latest round preview */}
        {previewStats && (
          <View style={[styles.previewCard, { marginTop: 16 }]}>
            <Text style={styles.previewTitle}>Latest Round Preview</Text>
            <View style={styles.previewRow}>
              <View style={styles.previewStat}>
                <Text style={styles.previewValue}>{previewStats.score}</Text>
                <Text style={styles.previewLabel}>Score</Text>
              </View>
              <View style={styles.previewStat}>
                <Text style={styles.previewValue}>{previewStats.putts ?? '—'}</Text>
                <Text style={styles.previewLabel}>Putts</Text>
              </View>
              <View style={styles.previewStat}>
                <Text style={styles.previewValue}>
                  {previewStats.fir !== null ? `${previewStats.fir}%` : '—'}
                </Text>
                <Text style={styles.previewLabel}>FIR</Text>
              </View>
              <View style={styles.previewStat}>
                <Text style={styles.previewValue}>
                  {previewStats.gir !== null ? `${previewStats.gir}%` : '—'}
                </Text>
                <Text style={styles.previewLabel}>GIR</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Scoring Trend Preview</Text>
          <View style={styles.previewSparklineRow}>
            {realScores.map((score, i) => {
              const lo = Math.min(...realScores);
              const barH = Math.max(25, ((score - lo + 3) / 15) * 60 + 20);
              return (
                <View key={`r-${i}`} style={styles.previewBarContainer}>
                  <View style={[styles.previewBar, { height: barH, backgroundColor: '#10B981' }]} />
                  <Text style={styles.previewBarLabel}>{score}</Text>
                </View>
              );
            })}
            {Array.from({ length: placeholderCount }).map((_, i) => (
              <View key={`p-${i}`} style={styles.previewBarContainer}>
                <View style={[styles.previewBar, { height: placeholderHeights[i % placeholderHeights.length], backgroundColor: '#1F2937' }]} />
                <Text style={[styles.previewBarLabel, { color: '#374151' }]}>—</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Ball Striking Preview</Text>
          <View style={styles.previewAccuracyRow}>
            <View style={styles.previewAccuracyStat}>
              <Text style={styles.previewAccuracyValue}>
                {previewStats?.fir != null ? `${previewStats.fir}%` : '—'}
              </Text>
              <Text style={styles.previewAccuracyLabel}>FIR</Text>
            </View>
            <View style={styles.previewAccuracyDivider} />
            <View style={styles.previewAccuracyStat}>
              <Text style={styles.previewAccuracyValue}>
                {previewStats?.gir != null ? `${previewStats.gir}%` : '—'}
              </Text>
              <Text style={styles.previewAccuracyLabel}>GIR</Text>
            </View>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.unlockSummaryCard}>
          <View style={styles.unlockSummaryHeader}>
            <Ionicons name="stats-chart" size={18} color="#10B981" />
            <Text style={styles.unlockSummaryTitle}>After 3 rounds, you'll see:</Text>
          </View>
          <View style={styles.unlockSummaryList}>
            <Text style={styles.unlockSummaryItem}>• Average score & scoring trend</Text>
            <Text style={styles.unlockSummaryItem}>• FIR% and GIR% with round-by-round breakdown</Text>
            <Text style={styles.unlockSummaryItem}>• Putting average per round</Text>
            <Text style={styles.unlockSummaryItem}>• Goal tracking with progress bars</Text>
            <Text style={styles.unlockSummaryItem}>• Front 9 vs Back 9 comparison</Text>
          </View>
          <Text style={styles.unlockSummaryFooter}>The more you track, the smarter your insights become.</Text>
        </View>
      </ScrollView>
    );
  }

  if (!performanceStats) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Calculating statistics...</Text>
      </View>
    );
  }

  // Check if any stats exist for "How You Typically Play" section
  const hasPerformanceStats = Boolean(
    (performanceStats.fairways && performanceStats.fairways.sampleSize > 0) ||
    (performanceStats.gir && performanceStats.gir.sampleSize > 0) ||
    (performanceStats.putts && performanceStats.putts.sampleSize > 0) ||
    (performanceStats.penalties && performanceStats.penalties.sampleSize > 0)
  );

  // Check if any stats exist for "Scoring Efficiency" section
  const hasScoringStats = Boolean(
    (performanceStats.threePuttRate && performanceStats.threePuttRate.sampleSize > 0) ||
    (performanceStats.upDown && performanceStats.upDown.sampleSize > 0)
  );

  const anyTrackedStatsEnabled = rounds.some(round => {
    const prefs = getRoundStatPreferences(round);
    return prefs.putts || prefs.fir || prefs.gir || prefs.penalties || prefs.scrambling;
  });
  const hasWeatherData = rounds.some(round => !!round.weather?.conditions || !!round.weather?.wind || round.weather?.humidity !== undefined || !!round.weather?.temp);
  const hasConditionsData = conditionSplits.length > 0 && hasWeatherData;
  const conditionsRoundsRemaining = Math.max(0, 10 - rounds.length);
  const hasParStats = parStats
    ? parStats.par3.holesPlayed + parStats.par4.holesPlayed + parStats.par5.holesPlayed > 0
    : false;
  const hasSampleRound = rounds.some(round => round.isSample);

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#10B981"
            colors={['#10B981']}
            progressBackgroundColor="#1F2937"
          />
        }
      >
        {hasSampleRound && (
          <View style={styles.sampleBanner}>
            <View style={styles.sampleBannerText}>
              <Text style={styles.sampleBannerTitle}>Sample data</Text>
              <Text style={styles.sampleBannerSubtitle}>
                This is demo content. Play your first round to see your own stats.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.sampleBannerAction}
              onPress={async () => {
                await dismissSampleRound();
                onRefresh();
              }}
            >
              <Text style={styles.sampleBannerActionText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* ==================================================================== */}
        {/* GOLFSUM PLAYER RATING SUMMARY */}
        {/* ==================================================================== */}
        <View style={styles.section}>
          <View style={styles.handicapCard}>
            <View style={styles.handicapHeader}>
              <Text style={styles.handicapLabel}>GolfSum Player Rating</Text>
              <TouchableOpacity
                onPress={() => showTooltip(
                  'GolfSum Player Rating',
                  'GolfSum Player Rating is based on adjusted score versus course par. Lower is better. It uses your best ratings from recent rounds and becomes more stable with more rounds.'
                )}
              >
                <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.handicapValue}>
              {whsDetails?.handicapIndex !== null && whsDetails?.handicapIndex !== undefined
                ? whsDetails.handicapIndex.toFixed(1)
                : 'Minimum 3 rated rounds required'}
            </Text>
            <Text style={styles.handicapMeta}>
              {whsDetails
                ? `Based on ${whsDetails.acceptableRoundsCount} rated round${whsDetails.acceptableRoundsCount === 1 ? '' : 's'}${notEligibleCount > 0 ? ` · ${notEligibleCount} unrated` : ''} · ${whsDetails.reason}`
                : 'Calculating player rating...'}
            </Text>
          </View>
        </View>
        {scoringHero && (
          <View style={styles.section}>
            <View style={styles.heroRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroValue}>{scoringHero.avgScore.toFixed(1)}</Text>
                <Text style={styles.heroLabel}>Avg Score</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroValue}>
                  {scoringHero.avgToPar > 0 ? '+' : ''}
                  {scoringHero.avgToPar.toFixed(1)}
                </Text>
                <Text style={styles.heroLabel}>Avg vs Par</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroValue}>{scoringHero.rounds}</Text>
                <Text style={styles.heroLabel}>Rounds</Text>
              </View>
            </View>
          </View>
        )}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'overview' && styles.tabButtonActive]}
            onPress={() => setActiveTab('overview')}
            accessibilityRole="tab"
            accessibilityLabel="Overview tab"
            accessibilityState={{ selected: activeTab === 'overview' }}
          >
            <Text style={[styles.tabButtonText, activeTab === 'overview' && styles.tabButtonTextActive]}>Overview</Text>
          </TouchableOpacity>
          {hasFullAverages && (
            <>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'ball-striking' && styles.tabButtonActive]}
                onPress={() => setActiveTab('ball-striking')}
                accessibilityRole="tab"
                accessibilityLabel="Ball Striking tab"
                accessibilityState={{ selected: activeTab === 'ball-striking' }}
              >
                <Text style={[styles.tabButtonText, activeTab === 'ball-striking' && styles.tabButtonTextActive]}>Ball Striking</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'by-par' && styles.tabButtonActive]}
                onPress={() => setActiveTab('by-par')}
                accessibilityRole="tab"
                accessibilityLabel="By Par tab"
                accessibilityState={{ selected: activeTab === 'by-par' }}
              >
                <Text style={[styles.tabButtonText, activeTab === 'by-par' && styles.tabButtonTextActive]}>By Par</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <OverviewSubTab
          active={activeTab === 'overview'}
          performanceStats={performanceStats}
          hasPerformanceStats={hasPerformanceStats}
          hasScoringStats={hasScoringStats}
          trendRange={trendRange}
          onTrendRangeChange={setTrendRange}
          trendSeries={trendSeries}
          sparklineSeries={sparklineSeries}
          courseOptions={courseOptions}
          onCourseStatsPress={onNavigateToCourseStats}
          showTooltip={showTooltip}
          showContextSplits={showContextSplits}
          onToggleContextSplits={() => setShowContextSplits(!showContextSplits)}
          conditionSplits={conditionSplits}
          scoringStyleCard={scoringStyleCard}
          hasConditionsData={hasConditionsData}
          styles={styles}
        />

        {hasFullAverages && (
          <BallStrikingSubTab
            active={activeTab === 'ball-striking'}
            performanceStats={performanceStats}
            hasPerformanceStats={hasPerformanceStats}
            ballStrikingTotals={ballStrikingTotals}
            sparklineSeries={sparklineSeries}
            showTooltip={showTooltip}
            styles={styles}
          />
        )}
        {/* Show message if no advanced stats are tracked yet */}
        {activeTab !== 'by-par' && !hasPerformanceStats && !hasScoringStats && (
          <View style={styles.section}>
            <View style={styles.advancedModePrompt}>
              <Ionicons name="stats-chart-outline" size={48} color="#6B7280" />
              <Text style={styles.advancedModeTitle}>
                {anyTrackedStatsEnabled ? 'Building Your Averages' : 'No Stats Enabled'}
              </Text>
              <Text style={styles.advancedModeText}>
                {anyTrackedStatsEnabled
                  ? `Play ${averagesRoundsRemaining} more round${averagesRoundsRemaining !== 1 ? 's' : ''} to build your statistics.`
                  : 'Enable the stats you want to track in Profile - Stat Tracking.'}
              </Text>
              {anyTrackedStatsEnabled && (
                <View style={styles.lockedProgress}>
                  <Text style={styles.lockedProgressText}>
                    {averagesProgressText} - {averagesRemainingText}
                  </Text>
                  <View style={styles.lockedProgressTrack}>
                    {averagesProgress > 0 && (
                      <View style={[styles.lockedProgressFill, { width: `${averagesProgress}%` }]} />
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {hasFullAverages && (
          <ByParSubTab
            active={activeTab === 'by-par'}
            hasParStats={hasParStats}
            parStats={parStats}
            frontBackSplit={frontBackSplit}
            showTooltip={showTooltip}
            styles={styles}
          />
        )}

        {hasStatAccess && activeTab === 'overview' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Club Tracking</Text>
            {clubUsageSummary.hasData ? (
              <View style={styles.clubUsageCard}>
                <View style={styles.clubUsageRow}>
                  <View style={styles.clubUsageStat}>
                    <Text style={styles.clubUsageLabel}>ROUNDS WITH CLUB DATA</Text>
                    <Text style={styles.clubUsageValue}>{clubUsageSummary.roundsWithClubData}</Text>
                  </View>
                  {clubUsageSummary.topTeeClub && (
                    <View style={styles.clubUsageStat}>
                      <Text style={styles.clubUsageLabel}>TOP TEE CLUB</Text>
                      <Text style={styles.clubUsageValue}>{clubUsageSummary.topTeeClub}</Text>
                    </View>
                  )}
                  {clubUsageSummary.topApproachClub && (
                    <View style={styles.clubUsageStat}>
                      <Text style={styles.clubUsageLabel}>TOP APPROACH</Text>
                      <Text style={styles.clubUsageValue}>{clubUsageSummary.topApproachClub}</Text>
                    </View>
                  )}
                </View>
                {clubUsageSummary.clubs.slice(0, 6).map((club) => (
                  <View key={club.club} style={styles.clubUsageBarRow}>
                    <Text style={styles.clubUsageBarLabel}>{club.club}</Text>
                    <View style={styles.clubUsageBarTrack}>
                      <View
                        style={[
                          styles.clubUsageBarFill,
                          {
                            width: `${Math.min(
                              100,
                              (club.usageCount / (clubUsageSummary.clubs[0]?.usageCount || 1)) * 100
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.clubUsageBarCount}>{club.usageCount}×</Text>
                    {club.successRate !== undefined && (
                      <Text style={styles.clubUsageSuccessRate}>
                        {Math.round(club.successRate * 100)}%
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.clubEmptyState}>
                <Ionicons name="golf-outline" size={36} color="#6B7280" />
                <Text style={styles.clubEmptyTitle}>No club data yet</Text>
                <Text style={styles.clubEmptyBody}>
                  Enable club tracking in Profile → Scoring Mode → Advanced to see
                  which clubs you rely on and how often they hit fairways and greens.
                </Text>
                <TouchableOpacity
                  style={styles.clubEmptyAction}
                  onPress={handleUpgradePress}
                  accessibilityRole="button"
                  accessibilityLabel="Enable club tracking"
                >
                  <Text style={styles.clubEmptyActionText}>Enable Club Tracking</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {!hasFullAverages && rounds.length >= 3 && (
          <View style={styles.section}>
            <View style={styles.softUpgradeCard}>
              <Text style={styles.softUpgradeTitle}>See where your strokes go</Text>
              <Text style={styles.softUpgradeBody}>
                Track fairways, greens, and clubs to add direction patterns, scrambling rate, and club-by-club performance.
              </Text>
              <TouchableOpacity onPress={handleUpgradePress} accessibilityRole="button">
                <Text style={styles.softUpgradeLink}>See what Pro tracks</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Tooltip Modal */}
      <Modal
        visible={tooltipModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltipModal(null)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTooltipModal(null)}
        >
          <View style={styles.tooltipModal}>
            <Text style={styles.tooltipTitle}>{tooltipModal?.title}</Text>
            <Text style={styles.tooltipContent}>{tooltipModal?.content}</Text>
            <TouchableOpacity 
              style={styles.tooltipCloseButton}
              onPress={() => setTooltipModal(null)}
            >
              <Text style={styles.tooltipCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  sampleBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sampleBannerText: {
    flex: 1,
  },
  sampleBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 4,
  },
  sampleBannerSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  sampleBannerAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  sampleBannerActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E7EB',
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 4,
    marginTop: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  tabButtonText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#10B981',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
  progressSection: {
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  progressText: {
    fontSize: 14,
    color: '#E5E7EB',
    marginBottom: 12,
    textAlign: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'left',
  },
  emptyPreviewContainer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#111827',
  },
  compactProgress: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  emptyStateCard: {
    backgroundColor: '#1F2937',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E5E7EB',
    marginTop: 12,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  secondaryEmptyButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingVertical: 12,
    marginTop: 10,
  },
  secondaryEmptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  previewCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewStat: {
    alignItems: 'center',
    flex: 1,
  },
  previewValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 4,
  },
  previewLabel: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  previewChartBlock: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  previewChartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  previewChartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  previewBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewBadgeText: {
    fontSize: 11,
    color: '#CBD5F5',
  },
  previewChartDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 10,
  },
  emptyPreviewInsightCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyPreviewInsightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  emptyPreviewInsightType: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  emptyPreviewInsightTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 6,
  },
  emptyPreviewInsightText: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
    marginBottom: 10,
  },
  emptyPreviewDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  emptyPreviewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  emptyPreviewDotActive: {
    backgroundColor: '#10B981',
  },
  previewChartSkeleton: {
    height: 120,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  previewChartSkeletonWide: {
    height: 80,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  trackRoundButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  trackRoundButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f1419',
  },
  importCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  importCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  importCardTextContainer: {
    flex: 1,
  },
  importCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 3,
  },
  importCardDesc: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  previewSparklineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 80,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  previewBarContainer: {
    alignItems: 'center',
    gap: 4,
  },
  previewBar: {
    width: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 4,
  },
  previewBarLabel: {
    fontSize: 10,
    color: '#6B7280',
  },
  previewAccuracyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  previewAccuracyStat: {
    alignItems: 'center',
    flex: 1,
  },
  previewAccuracyValue: {
    fontSize: 24,
    fontWeight: '700',
    color: 'rgba(229, 231, 235, 0.5)',
  },
  previewAccuracyLabel: {
    fontSize: 12,
    color: 'rgba(156, 163, 175, 0.5)',
    marginTop: 4,
  },
  previewAccuracyDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  unlockSummaryCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginTop: 8,
  },
  unlockSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  unlockSummaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  unlockSummaryList: {
    marginBottom: 12,
  },
  unlockSummaryItem: {
    fontSize: 13,
    color: '#D1D5DB',
    lineHeight: 22,
  },
  unlockSummaryFooter: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  softUpgradeCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 14,
  },
  softUpgradeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  softUpgradeBody: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 19,
    marginBottom: 10,
  },
  softUpgradeLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
  },
  clubUsageCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  clubUsageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  clubUsageStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  clubUsageLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  clubUsageValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E5E7EB',
    textAlign: 'center',
  },
  clubUsageBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  clubUsageBarLabel: {
    width: 72,
    fontSize: 12,
    color: '#9CA3AF',
  },
  clubUsageBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  clubUsageBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  clubUsageBarCount: {
    width: 28,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  clubUsageSuccessRate: {
    width: 36,
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    textAlign: 'right',
  },
  clubEmptyState: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  clubEmptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 12,
    marginBottom: 8,
  },
  clubEmptyBody: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  clubEmptyAction: {
    marginTop: 14,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  clubEmptyActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f1419',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  handicapCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  handicapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  handicapLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  handicapValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 6,
  },
  handicapMeta: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#374151',
  },
  heroValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  heroLabel: {
    marginTop: 2,
    fontSize: 11,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trendDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  trendRangeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  trendRangeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  trendRangeButtonActive: {
    backgroundColor: '#10B981',
  },
  trendRangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  trendRangeTextActive: {
    color: '#0f1419',
  },
  trendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  contextSplitsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  contextPreview: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
    marginBottom: 8,
  },
  contextSplitsContent: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  contextSplitRow: {
    marginBottom: 12,
  },
  contextSplitLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  contextSplitValue: {
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
  },
  contextNote: {
    fontSize: 14,
    color: '#D1D5DB',
    textAlign: 'center',
    marginBottom: 8,
  },
  contextNoteDetail: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  lockedCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
  },
  lockIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  lockedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 6,
  },
  lockedDescription: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  lockedRequirement: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
  },
  courseStatsList: {
    gap: 8,
    marginTop: 12,
  },
  courseStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  courseStatsLeft: {
    flex: 1,
    marginRight: 12,
  },
  courseStatsName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 4,
  },
  courseStatsMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  courseStatsMore: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
  },
  lockedProgress: {
    width: '100%',
    marginTop: 12,
    marginBottom: 8,
  },
  lockedProgressText: {
    fontSize: 13,
    color: '#E5E7EB',
    textAlign: 'center',
    marginBottom: 8,
  },
  lockedProgressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: 4,
    overflow: 'hidden',
  },
  lockedProgressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  tooltipModal: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    width: '100%',
    borderWidth: 1,
    borderColor: '#374151',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  tooltipContent: {
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
    marginBottom: 20,
  },
  tooltipCloseButton: {
    backgroundColor: '#10b981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  tooltipCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3B82F6',
  },
  infoText: {
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
  },
  focusSection: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  focusTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#10B981',
  },
  focusText: {
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
    marginBottom: 8,
  },
  focusSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  advancedModePrompt: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  advancedModeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E5E7EB',
    marginTop: 12,
    marginBottom: 8,
  },
  advancedModeText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  advancedModeBold: {
    fontWeight: '700',
    color: '#10B981',
  },
  advancedModeList: {
    alignSelf: 'stretch',
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  advancedModeItem: {
    fontSize: 14,
    color: '#D1D5DB',
    marginBottom: 8,
  },
  advancedModeSubtext: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
