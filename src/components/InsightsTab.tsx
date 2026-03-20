/**
 * Insights Tab - Prescriptive Analysis
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SavedRound, Insight, InsightType, InsightConfidence, INSIGHT_THRESHOLDS } from '../types';
import { InsightCategory } from '../types';
import { getRounds, dismissSampleRound } from '../services/roundsService';
import { getUserProfile } from '../services/userService';
import { generateInsights } from '../services/analyticsCalculations';
import { calculateBenchmarkDelta } from '../services/analyticsService';
import {
  generatePatternInsights,
  PatternInsight,
  getInsightFooter,
  generateNextRoundFocus,
  generatePracticePlan,
  PracticePlan,
  generateGamePlanCard,
  GamePlanCard as GamePlan,
} from '../services/patternInsights';
import { exportPracticePlanPdf, sharePracticePlanText } from '../services/practicePlanExport';
import { PatternInsightCard, type PlayerTier } from './PatternInsightCard';
import { PracticePlanCard } from './PracticePlanCard';
import { GamePlanCard } from './GamePlanCard';
import { getRoundStatPreferences } from '../utils/statPreferences';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { logger } from '../utils/logger';
import {
  defaultInsightPreferences,
  InsightPreferences,
  loadInsightPreferences,
  saveInsightPreferences,
  recordFeedback as recordInsightFeedback,
  checkForRevisits,
  scoreInsight,
  enforceMinimumActiveInsights,
  getBaselineMetricForInsight,
} from '../services/insightPreferences';
import { EMPTY_STATE_COPY } from '../constants/emptyStateCopy';
import { UI_COPY } from '../constants/uiCopy';
import type { UpgradeTrigger } from './UpgradeSheet';
import { requestAppReviewIfEligible } from '../services/reviewService';
import { analyzeScoringDistribution } from '../services/scoringDistribution';

interface Props {
  refreshTrigger?: number;
  onNavigateToPlay?: () => void;
  onNavigateToProfile?: (trigger: UpgradeTrigger) => void;
  onImportScorecard?: () => void;
}

type InsightsSubTab = 'focus' | 'patterns' | 'trends';

const createStarterPracticePlan = (): PracticePlan => ({
  drills: [
    {
      title: 'Fairway Start-Line Ladder',
      duration: '12 min',
      category: 'TEE',
      steps: [
        'Hit 10 drives to a center target with one consistent setup.',
        'Track start line: left, center, or right of target.',
        'Goal: 7/10 starting on the intended line.',
      ],
      constraints: { successGoal: '7/10 start on line' },
    },
    {
      title: 'Approach Distance Control',
      duration: '12 min',
      category: 'APPROACH',
      steps: [
        'Hit 12 shots to one green target using 2 clubs.',
        'Alternate clubs every shot and commit to full routine.',
        'Goal: 8/12 inside your normal scoring window.',
      ],
      constraints: { successGoal: '8/12 in scoring window' },
    },
    {
      title: 'Lag Putting Gate',
      duration: '10 min',
      category: 'PUTTING',
      steps: [
        'Putt 12 balls from 25-40 feet.',
        'Finish every putt inside a 3-foot circle.',
        'Goal: 10/12 inside the circle, zero 3-putts.',
      ],
      constraints: { successGoal: '10/12 inside 3 feet' },
    },
  ],
  totalDuration: '34 min',
  quickWarmUp: {
    duration: '5 min',
    steps: ['3 tee shots', '3 approach swings', '5 lag putts'],
  },
});

export const InsightsTab: React.FC<Props> = ({
  refreshTrigger,
  onNavigateToPlay,
  onNavigateToProfile,
  onImportScorecard,
}) => {
  const [rounds, setRounds] = useState<SavedRound[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [patternInsights, setPatternInsights] = useState<PatternInsight[]>([]);
  const [nextRoundFocus, setNextRoundFocus] = useState<string[]>([]);
  const [practicePlan, setPracticePlan] = useState<PracticePlan | null>(null);
  const [gamePlanCard, setGamePlanCard] = useState<GamePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [coachView, setCoachView] = useState(false);
  const [activeTab, setActiveTab] = useState<InsightsSubTab>('focus');
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [userHandicap, setUserHandicap] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSampleRound, setHasSampleRound] = useState(false);
  const [insightPrefs, setInsightPrefs] = useState<InsightPreferences>(defaultInsightPreferences);
  const [sampleInsightIndex, setSampleInsightIndex] = useState(0);
  const { canAccess } = useFeatureGate({ refreshKey: refreshTrigger });
  const hasCoachingAccess = canAccess('coaching_insights') || true; // Always allow insights; free users still see basic-stat insights.
  const getPlayerTier = (playerRating: number | null | undefined): PlayerTier => {
    if (playerRating === null || playerRating === undefined) return 'high';
    if (playerRating > 14) return 'high';
    if (playerRating > 5) return 'mid';
    return 'low';
  };

  useEffect(() => {
    loadInsights();
  }, [refreshTrigger]);

  useEffect(() => {
    loadInsightPreferences()
      .then(setInsightPrefs)
      .catch(error => logger.error('Failed to load insight preferences:', error));
  }, []);

  // Auto-rotate sample insights every 5 seconds (safe at top level)
  const isEmptyState = !loading && rounds.length < INSIGHT_THRESHOLDS.LIGHT_TREND;
  useEffect(() => {
    if (!isEmptyState) return;
    const timer = setInterval(() => {
      setSampleInsightIndex(prev => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(timer);
  }, [isEmptyState]);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const allRounds = await getRounds();
      const profile = await getUserProfile();
      const handicap = profile?.coursePreferences?.typicalHandicap ?? null;
      setPlayerName(profile?.personalInfo?.name || null);
      setUserHandicap(handicap);
      const sortedRounds = [...allRounds].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRounds(sortedRounds);
      setHasSampleRound(allRounds.some(round => round.isSample));

      let generatedInsights: Insight[] = [];
      let generatedPatterns: PatternInsight[] = [];
      try {
        generatedInsights = generateInsights(allRounds, handicap, profile?.clubDistances ?? {});
      } catch (error) {
        logger.error('Error generating insights:', error);
      }

      try {
        generatedPatterns = generatePatternInsights(allRounds, handicap);
      } catch (error) {
        logger.error('Error generating pattern insights:', error);
      }
      try {
        const loadedPrefs = await loadInsightPreferences();
        const scoringProfile = analyzeScoringDistribution(sortedRounds, handicap);
        let tunedPrefs = loadedPrefs;
        if (scoringProfile?.coachingFocus === 'FLOOR') {
          tunedPrefs = {
            ...loadedPrefs,
            affinities: {
              ...loadedPrefs.affinities,
              [InsightCategory.PENALTY]: Math.min(1.5, (loadedPrefs.affinities[InsightCategory.PENALTY] ?? 1) + 0.2),
              [InsightCategory.MENTAL]: Math.min(1.5, (loadedPrefs.affinities[InsightCategory.MENTAL] ?? 1) + 0.2),
            },
          };
        }
        const revisitedPrefs = await checkForRevisits(tunedPrefs, generatedInsights, sortedRounds, sortedRounds.length);
        setInsightPrefs(revisitedPrefs);
      } catch (error) {
        logger.error('Error loading insight preference engine:', error);
      }

      setInsights(generatedInsights);
      setPatternInsights(generatedPatterns);
      setNextRoundFocus(generateNextRoundFocus(generatedPatterns));
      const generatedPracticePlan = generatedPatterns.length > 0
        ? generatePracticePlan(generatedPatterns, handicap)
        : null;
      const hasGeneratedPracticePlan = !!generatedPracticePlan && generatedPracticePlan.drills.length > 0;
      const shouldUseStarterPracticePlan = !hasGeneratedPracticePlan && allRounds.length >= INSIGHT_THRESHOLDS.FOCUS_INSIGHT;
      setPracticePlan(shouldUseStarterPracticePlan ? createStarterPracticePlan() : generatedPracticePlan);
      setGamePlanCard(generatedPatterns.length > 0 ? generateGamePlanCard(generatedPatterns, handicap) : null);
    } catch (error) {
      logger.error('Error loading insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInsights();
    setRefreshing(false);
  };

  const handleSharePracticePlan = async () => {
    if (!practicePlan) return;
    await sharePracticePlanText(practicePlan, {
      playerName,
      roundsCount: rounds.length,
    });
  };

  const handleExportPracticePlan = async () => {
    if (!practicePlan) return;
    await exportPracticePlanPdf(practicePlan, {
      playerName,
      roundsCount: rounds.length,
    });
  };

  const anyTrackedStatsEnabled = useMemo(() => (
    rounds.some(round => {
      const prefs = getRoundStatPreferences(round);
      return prefs.putts || prefs.fir || prefs.gir || prefs.penalties || prefs.scrambling;
    })
  ), [rounds]);

  const patternStatProgress = useMemo(() => {
    const minRounds = 3;
    const countRoundsWithFir = rounds.reduce((count, round) => {
      const prefs = getRoundStatPreferences(round);
      if (!prefs.fir) return count;
      if (round.holes && round.holes.length > 0) {
        const firTracked = round.holes.some(
          hole => (hole.par === 4 || hole.par === 5) && hole.fairwayHit !== null && hole.fairwayHit !== undefined
        );
        return count + (firTracked ? 1 : 0);
      }
      const hasAggregateFir = typeof round.stats?.fairways === 'number'
        && typeof round.stats?.fairwaysPossible === 'number'
        && round.stats.fairwaysPossible > 0;
      return count + (hasAggregateFir ? 1 : 0);
    }, 0);

    const countRoundsWithGir = rounds.reduce((count, round) => {
      const prefs = getRoundStatPreferences(round);
      if (!prefs.gir) return count;
      if (round.holes && round.holes.length > 0) {
        const girTracked = round.holes.some(
          hole => hole.greenHit !== null && hole.greenHit !== undefined
        );
        return count + (girTracked ? 1 : 0);
      }
      const hasAggregateGir = typeof round.stats?.greens === 'number'
        && typeof round.stats?.greensPossible === 'number'
        && round.stats.greensPossible > 0;
      return count + (hasAggregateGir ? 1 : 0);
    }, 0);

    const countRoundsWithPutts = rounds.reduce((count, round) => {
      const prefs = getRoundStatPreferences(round);
      if (!prefs.putts) return count;
      if (round.holes && round.holes.length > 0) {
        const puttsTracked = round.holes.some(
          hole => typeof hole.putts === 'number' && hole.putts > 0
        );
        return count + (puttsTracked ? 1 : 0);
      }
      const hasAggregatePutts = typeof round.stats?.putts === 'number' && round.stats.putts > 0;
      return count + (hasAggregatePutts ? 1 : 0);
    }, 0);

    return [
      { key: 'fir', label: 'FIR tracked rounds', tracked: countRoundsWithFir, required: minRounds },
      { key: 'gir', label: 'GIR tracked rounds', tracked: countRoundsWithGir, required: minRounds },
      { key: 'putts', label: 'Putts tracked rounds', tracked: countRoundsWithPutts, required: minRounds },
    ];
  }, [rounds]);

  const previousPatternProgressRef = useRef<Record<string, number>>({});
  useEffect(() => {
    let unlockedAny = false;
    const nextProgress: Record<string, number> = { ...previousPatternProgressRef.current };

    patternStatProgress.forEach(item => {
      const previous = nextProgress[item.key];
      if (typeof previous === 'number' && previous < item.required && item.tracked >= item.required) {
        unlockedAny = true;
      }
      nextProgress[item.key] = item.tracked;
    });

    previousPatternProgressRef.current = nextProgress;

    if (unlockedAny) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  }, [patternStatProgress]);

  const weeklyFocus = useMemo(() => (
    insights.filter(i => i.type === InsightType.WEEKLY_FOCUS)
      .sort((a, b) => a.priority - b.priority)[0]
  ), [insights]);

  const trendInsights = useMemo(() => (
    insights.filter(i => i.type === InsightType.TREND || i.type === InsightType.COURSE_AWARE || i.type === InsightType.SUPPORTING)
  ), [insights]);

  const visibleTrendInsights = useMemo(() => {
    const currentRoundCount = rounds.length;
    const scored = trendInsights
      .map(insight => {
        const lastShown = insightPrefs.seenHistory
          .filter(h => h.insightId === insight.id)
          .sort((a, b) => b.roundCount - a.roundCount)[0]?.roundCount ?? null;
        return {
          insight,
          score: scoreInsight(insight, insightPrefs, userHandicap, currentRoundCount, lastShown),
        };
      })
      .filter(item => item.score > -Infinity)
      .sort((a, b) => b.score - a.score);

    const active = enforceMinimumActiveInsights(
      scored.map(s => s.insight),
      insightPrefs,
      currentRoundCount
    );

    const display = active.slice(0, 3).map(insight => {
      const revisit = insightPrefs.revisitQueue.find(r => r.insightId === insight.id && !r.shown);
      if (!revisit) return insight;
      return {
        ...insight,
        isRevisit: true,
        revisitDescription: revisit.metricChangeDescription,
      };
    });

    return display;
  }, [trendInsights, insightPrefs, userHandicap, rounds.length]);

  useEffect(() => {
    if (!visibleTrendInsights.length) return;
    const newEntries = visibleTrendInsights.map(i => ({ insightId: i.id, roundCount: rounds.length }));
    const updatedPrefs: InsightPreferences = {
      ...insightPrefs,
      seenHistory: [...insightPrefs.seenHistory, ...newEntries].slice(-200),
    };
    setInsightPrefs(updatedPrefs);
    saveInsightPreferences(updatedPrefs).catch(() => undefined);

    requestAppReviewIfEligible({
      trigger: 'insight_unlocked',
      roundsCount: rounds.length,
      isInRound: false,
    }).catch(() => undefined);
  }, [visibleTrendInsights.map(i => i.id).join(','), rounds.length]);

  const benchmarkDelta = useMemo(() => (
    calculateBenchmarkDelta(rounds, userHandicap ?? 10)
  ), [rounds, userHandicap]);
  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="hourglass-outline" size={48} color="#6B7280" />
        <Text style={styles.emptyText}>Loading your stats</Text>
      </View>
    );
  }

  if (rounds.length === 0) {
    const requiredRounds = INSIGHT_THRESHOLDS.LIGHT_TREND;
    const progress = 0;
    const sampleInsights = [
      {
        type: 'Trend',
        icon: 'analytics-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Fairway Miss Trend',
        text: 'You miss 65% of fairways left with Driver on holes under 380 yards. Your 3-wood FIR is 83% on those holes. Consider the 3-wood on shorter par 4s.',
      },
      {
        type: 'Course',
        icon: 'golf-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Course Strategy',
        text: 'At your home course, your hardest holes are 5, 11, and 15. You average +1.8 on those holes, all with water left of the green.',
      },
      {
        type: 'Trend',
        icon: 'trending-up' as keyof typeof Ionicons.glyphMap,
        title: 'Improving Iron Play',
        text: 'Your GIR% improved from 44% to 61% over your last 8 rounds. Your iron play is trending up.',
      },
    ];
    const currentSample = sampleInsights[sampleInsightIndex % sampleInsights.length];

    return (
      <ScrollView contentContainerStyle={styles.emptyScrollContainer}>
        <Ionicons name="bulb-outline" size={64} color="#10B981" />
        <Text style={styles.emptyTitle}>{EMPTY_STATE_COPY.titles.yourInsightsAreBuilding}</Text>
        <Text style={styles.emptyTextCentered}>
          Play or import a few rounds and your stats will start to show here.
        </Text>
        <View style={styles.progressSection}>
          <Text style={styles.progressText}>
            {progress} of {requiredRounds} rounds here
          </Text>
          <View style={styles.progressBarTrack} />
          <Text style={styles.progressSubtext}>
            {requiredRounds} rounds here shows your first tips
          </Text>
        </View>
        {onNavigateToPlay && (
          <TouchableOpacity style={styles.explainerButton} onPress={onNavigateToPlay}>
            <Text style={styles.explainerButtonText}>{UI_COPY.actions.startRound}</Text>
          </TouchableOpacity>
        )}
        {onImportScorecard && (
          <TouchableOpacity style={styles.secondaryActionButton} onPress={onImportScorecard}>
            <Text style={styles.secondaryActionButtonText}>{UI_COPY.actions.importScorecard}</Text>
          </TouchableOpacity>
        )}
        <View style={styles.featurePreview}>
          <Text style={styles.previewTitle}>WHAT SHOWS HERE</Text>
          <TouchableOpacity
            style={styles.previewInsightCard}
            onPress={() => setSampleInsightIndex(prev => (prev + 1) % sampleInsights.length)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Next example insight"
          >
            <View style={styles.previewInsightHeader}>
              <Ionicons name={currentSample.icon} size={16} color="#10B981" />
              <Text style={styles.previewInsightType}>{currentSample.type}</Text>
              <Text style={styles.previewInsightBadge}>Example</Text>
            </View>
            <Text style={styles.previewInsightTitle}>{currentSample.title}</Text>
            <Text style={styles.previewInsightText}>{currentSample.text}</Text>
            <View style={styles.previewInsightDots}>
              {sampleInsights.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.previewInsightDot,
                    i === (sampleInsightIndex % sampleInsights.length) && styles.previewInsightDotActive,
                  ]}
                />
              ))}
            </View>
          </TouchableOpacity>
          <View style={styles.featureRow}>
            <Ionicons name="analytics-outline" size={16} color="#10B981" />
            <Text style={styles.featureText}>What shows up across your rounds</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="trending-up" size={16} color="#10B981" />
            <Text style={styles.featureText}>What to work on next</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="pulse" size={16} color="#10B981" />
            <Text style={styles.featureText}>Performance trends</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (rounds.length === 1) {
    const firstRound = rounds[0];
    const firstRoundDate = new Date(firstRound.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return (
      <ScrollView contentContainerStyle={styles.emptyScrollContainer}>
        <Ionicons name="analytics-outline" size={64} color="#10B981" />
        <Text style={styles.emptyTitle}>{EMPTY_STATE_COPY.titles.oneMoreRound}</Text>
        <Text style={styles.emptyTextCentered}>
          One more round and your first tips will show here.
        </Text>
        <View style={styles.firstRoundCard}>
          <Text style={styles.firstRoundLabel}>Your last round</Text>
          <Text style={styles.firstRoundScore}>{firstRound.score}</Text>
          <Text style={styles.firstRoundMeta}>
            {firstRound.courseName || 'Unknown Course'} • {firstRoundDate}
          </Text>
        </View>
        {onNavigateToPlay && (
          <TouchableOpacity style={styles.explainerButton} onPress={onNavigateToPlay}>
            <Text style={styles.explainerButtonText}>{UI_COPY.actions.trackNextRound}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  if (rounds.length < INSIGHT_THRESHOLDS.LIGHT_TREND) {
    const requiredRounds = INSIGHT_THRESHOLDS.LIGHT_TREND;
    const remainingRounds = Math.max(0, requiredRounds - rounds.length);
    const progress = Math.min(100, Math.round((rounds.length / requiredRounds) * 100));

    const sampleInsights = [
      {
        type: 'Trend',
        icon: 'analytics-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Fairway Miss Trend',
        text: 'You miss 65% of fairways left with Driver on holes under 380 yards. Your 3-wood FIR is 83% on those holes. Consider the 3-wood on shorter par 4s.',
      },
      {
        type: 'Course',
        icon: 'golf-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Course Strategy',
        text: 'At your home course, your hardest holes are 5, 11, and 15. You average +1.8 on these holes, all with water left of the green.',
      },
      {
        type: 'Trend',
        icon: 'trending-up' as keyof typeof Ionicons.glyphMap,
        title: 'Improving Iron Play',
        text: 'Your GIR% improved from 44% to 61% over your last 8 rounds. Your iron play is trending up. Keep focusing on approach accuracy.',
      },
    ];

    const currentSample = sampleInsights[sampleInsightIndex % sampleInsights.length];

    return (
      <ScrollView contentContainerStyle={styles.emptyScrollContainer}>
        <Ionicons name="trending-up" size={64} color="#10B981" />
        <Text style={styles.emptyTitle}>{EMPTY_STATE_COPY.titles.yourInsightsAreBuilding}</Text>
        <View style={styles.progressSection}>
          <Text style={styles.progressText}>
            {rounds.length} of {requiredRounds} rounds here
          </Text>
          <View style={styles.progressBarTrack}>
            {progress > 0 && (
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            )}
          </View>
          <Text style={styles.progressSubtext}>
            {remainingRounds} more round{remainingRounds !== 1 ? 's' : ''} for your first tips here
          </Text>
        </View>
        {onNavigateToPlay && (
          <TouchableOpacity style={styles.explainerButton} onPress={onNavigateToPlay}>
            <Text style={styles.explainerButtonText}>{UI_COPY.actions.trackRound}</Text>
          </TouchableOpacity>
        )}
        <View style={styles.featurePreview}>
          <Text style={styles.previewTitle}>WHAT SHOWS HERE</Text>
          <TouchableOpacity
            style={styles.previewInsightCard}
            onPress={() => setSampleInsightIndex(prev => (prev + 1) % sampleInsights.length)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Next example insight"
          >
            <View style={styles.previewInsightHeader}>
              <Ionicons name={currentSample.icon} size={16} color="#10B981" />
              <Text style={styles.previewInsightType}>{currentSample.type}</Text>
              <Text style={styles.previewInsightBadge}>Example</Text>
            </View>
            <Text style={styles.previewInsightTitle}>{currentSample.title}</Text>
            <Text style={styles.previewInsightText}>{currentSample.text}</Text>
            <View style={styles.previewInsightDots}>
              {sampleInsights.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.previewInsightDot,
                    i === (sampleInsightIndex % sampleInsights.length) && styles.previewInsightDotActive,
                  ]}
                />
              ))}
            </View>
          </TouchableOpacity>
          <View style={styles.featureRow}>
            <Ionicons name="analytics-outline" size={16} color="#10B981" />
            <Text style={styles.featureText}>Trends across your rounds</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="trending-up" size={16} color="#10B981" />
            <Text style={styles.featureText}>What to work on next</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="pulse" size={16} color="#10B981" />
            <Text style={styles.featureText}>Performance trends</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
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
              await onRefresh();
            }}
          >
            <Text style={styles.sampleBannerActionText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTabButton, activeTab === 'focus' && styles.subTabButtonActive]}
          onPress={() => setActiveTab('focus')}
          accessibilityRole="tab"
          accessibilityLabel="Focus Areas tab"
          accessibilityState={{ selected: activeTab === 'focus' }}
        >
          <Text style={[styles.subTabButtonText, activeTab === 'focus' && styles.subTabButtonTextActive]}>Focus Areas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabButton, activeTab === 'patterns' && styles.subTabButtonActive]}
          onPress={() => setActiveTab('patterns')}
          accessibilityRole="tab"
          accessibilityLabel="Trends tab"
          accessibilityState={{ selected: activeTab === 'patterns' }}
        >
          <Text style={[styles.subTabButtonText, activeTab === 'patterns' && styles.subTabButtonTextActive]}>Trends</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabButton, activeTab === 'trends' && styles.subTabButtonActive]}
          onPress={() => setActiveTab('trends')}
          accessibilityRole="tab"
          accessibilityLabel="Trends tab"
          accessibilityState={{ selected: activeTab === 'trends' }}
        >
          <Text style={[styles.subTabButtonText, activeTab === 'trends' && styles.subTabButtonTextActive]}>Trends</Text>
        </TouchableOpacity>
      </View>

      {hasCoachingAccess ? (
        <>
          {activeTab === 'focus' && (
            <>
          {gamePlanCard && (
            <GamePlanCard gamePlan={gamePlanCard} />
          )}

          {weeklyFocus && (
            <View style={styles.weeklyFocusCard}>
              <View style={styles.weeklyFocusHeader}>
                <View style={styles.weeklyFocusIcon}>
                  <Ionicons name="bulb" size={24} color="#F59E0B" />
                </View>
                <View>
                  <Text style={styles.weeklyFocusLabel}>WEEKLY FOCUS</Text>
                  <Text style={styles.weeklyFocusConfidence}>
                    {weeklyFocus.confidence === InsightConfidence.HIGH ? 'Strong read' :
                     weeklyFocus.confidence === InsightConfidence.MEDIUM ? 'Recent rounds' :
                     'Early read'}
                  </Text>
                </View>
              </View>
              <Text style={styles.weeklyFocusTitle}>{weeklyFocus.title}</Text>
              <Text style={styles.weeklyFocusDesc}>{weeklyFocus.description}</Text>
              {weeklyFocus.actionable && (
                <View style={styles.actionableCard}>
                  <Ionicons name="arrow-forward-circle" size={18} color="#10B981" />
                  <Text style={styles.actionableText}>{weeklyFocus.actionable}</Text>
                </View>
              )}
            </View>
          )}

          {nextRoundFocus.length > 0 && (
            <View style={styles.focusCard}>
              <View style={styles.focusHeader}>
              <Ionicons name="locate" size={20} color="#10B981" />
                <Text style={styles.focusTitle}>What to focus on</Text>
              </View>
              <Text style={styles.focusText}>
                {nextRoundFocus.join(' - ')}
              </Text>
            </View>
          )}

          {!weeklyFocus && nextRoundFocus.length == 0 && insights.length == 0 && (
            <View style={styles.section}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              <Text style={styles.noInsightsTitle}>Looking Good!</Text>
              <Text style={styles.noInsightsText}>
                Keep playing and more will show here
              </Text>
            </View>
          )}

          {patternInsights.length == 0 && insights.length == 0 && (
            <View style={styles.noInsightsCard}>
              <Ionicons name="golf-outline" size={48} color="#6B7280" />
              <Text style={styles.noInsightsTitle}>
                {anyTrackedStatsEnabled ? 'No Trends Yet' : 'No Stats Enabled'}
              </Text>
              <Text style={styles.noInsightsText}>
                {anyTrackedStatsEnabled
                  ? 'Keep logging your stats and this will fill in.'
                  : 'Turn on the stats you want to log in Profile.'}
              </Text>
              {!anyTrackedStatsEnabled && (
                <Text style={styles.noInsightsSubtext}>
                  Only tracked stats show here.
                </Text>
              )}
            </View>
          )}

          {practicePlan && practicePlan.drills.length > 0 && (
            <PracticePlanCard
              practicePlan={practicePlan}
              onShare={handleSharePracticePlan}
              onExportPdf={handleExportPracticePlan}
            />
          )}
            </>
          )}

          {activeTab === 'patterns' && (
            <>
          {patternInsights.length > 0 && (
            <TouchableOpacity
              style={styles.coachToggle}
              onPress={() => setCoachView(!coachView)}
              activeOpacity={0.7}
            >
              <Ionicons name={coachView ? 'people' : 'person'} size={18} color="#9CA3AF" />
              <Text style={styles.coachToggleText}>
                {coachView ? 'Coach View' : 'Player View'}
              </Text>
              <Ionicons name="swap-horizontal" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          {patternInsights.length > 0 && (
            <Text style={styles.coachToggleHint}>
              Player view shows the simple read. Coach view shows more detail.
            </Text>
          )}

          {patternInsights.length > 0 && (
            <View style={styles.section}>
              <View style={styles.patternHeader}>
                <Ionicons name="analytics" size={24} color="#10B981" />
                <Text style={styles.patternTitle}>Shot Trends</Text>
              </View>
              <Text style={styles.patternSubtitle}>
                Shot-by-shot trends from tracked rounds
              </Text>
              {patternInsights.map((insight, i) => (
                <PatternInsightCard
                  key={insight.type}
                  insight={insight}
                  isExpanded={i === 0}
                  coachView={coachView}
                  playerTier={getPlayerTier(userHandicap)}
                />
              ))}
              <View style={styles.patternFooter}>
                <Ionicons name="information-circle-outline" size={14} color="#6B7280" />
                <Text style={styles.patternFooterText}>{getInsightFooter()}</Text>
              </View>
            </View>
          )}

          {patternInsights.length == 0 && (
            <View style={styles.section}>
              <Ionicons name="analytics-outline" size={48} color="#6B7280" />
              <Text style={styles.noInsightsTitle}>{EMPTY_STATE_COPY.titles.noPatternInsightsYet}</Text>
            <Text style={styles.noInsightsText}>
              {EMPTY_STATE_COPY.noPatternDataTrackMore}
            </Text>
              <View style={styles.patternProgressCard}>
                {patternStatProgress.map((item) => {
                  const progress = Math.min(100, Math.round((item.tracked / item.required) * 100));
                  const remaining = Math.max(0, item.required - item.tracked);
                  return (
                    <View key={item.key} style={styles.patternProgressRow}>
                      <View style={styles.patternProgressHeader}>
                        <Text style={styles.patternProgressLabel}>{item.label}</Text>
                        <Text style={styles.patternProgressCount}>{item.tracked}/{item.required}</Text>
                      </View>
                      <View style={styles.patternProgressTrack}>
                        {progress > 0 && (
                          <View style={[styles.patternProgressFill, { width: `${progress}%` }]} />
                        )}
                      </View>
                      <Text style={styles.patternProgressHint}>
                        {remaining > 0
                          ? `${remaining} more round${remaining !== 1 ? 's' : ''} here`
                          : 'Ready'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

            </>
          )}

          {activeTab === 'trends' && (
            <>
          {visibleTrendInsights.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Trends</Text>
              {visibleTrendInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  feedback={insightPrefs.feedback[insight.id]}
                  onDismiss={async () => {
                    const category = insight.category ?? InsightCategory.MENTAL;
                    const baselineMetric = getBaselineMetricForInsight(insight.id, rounds);
                    const updated = await recordInsightFeedback(
                      insightPrefs,
                      insight.id,
                      'down',
                      category,
                      rounds.length,
                      baselineMetric
                    );
                    setInsightPrefs(updated);
                  }}
                  onFeedback={async (value) => {
                    const category = insight.category ?? InsightCategory.MENTAL;
                    const baselineMetric = getBaselineMetricForInsight(insight.id, rounds);
                    let updated = await recordInsightFeedback(
                      insightPrefs,
                      insight.id,
                      value,
                      category,
                      rounds.length,
                      baselineMetric
                    );
                    if (insight.isRevisit) {
                      updated = {
                        ...updated,
                        revisitQueue: updated.revisitQueue.map(r =>
                          r.insightId === insight.id ? { ...r, shown: true } : r
                        ),
                      };
                      await saveInsightPreferences(updated);
                    }
                    setInsightPrefs(updated);
                  }}
                />
              ))}
            </View>
          ) : (
            <View style={styles.section}>
              <Ionicons name="trending-up" size={48} color="#6B7280" />
              <Text style={styles.noInsightsTitle}>No Trends Yet</Text>
              <Text style={styles.noInsightsText}>
                Add 5 rounds to see scoring, putting, and ball-striking trends.
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Benchmark Delta (Beta)</Text>
            {rounds.length < INSIGHT_THRESHOLDS.BENCHMARKS ? (
              <Text style={styles.noInsightsText}>
                Play {INSIGHT_THRESHOLDS.BENCHMARKS - rounds.length} more rounds to see benchmark deltas.
              </Text>
            ) : (
              <BenchmarkDeltaCard delta={benchmarkDelta} />
            )}
          </View>
            </>
          )}
        </>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Stats</Text>
            <Text style={styles.noInsightsText}>
              You can still view stats from your trial rounds.
            </Text>
          </View>
          <View style={[styles.section, styles.deeperAnalysisCard]}>
            <Text style={styles.deeperAnalysisTitle}>More Stats Available</Text>
            <Text style={styles.deeperAnalysisText}>
              Log detailed stats to see driving misses, approach accuracy, and where shots are getting away from you.
            </Text>
            <TouchableOpacity onPress={() => onNavigateToProfile?.('insights_card')} accessibilityRole="button">
              <Text style={styles.deeperAnalysisLink}>See full stat tracking</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {rounds.length} round{rounds.length !== 1 ? 's' : ''} here
        </Text>
        {rounds.length < INSIGHT_THRESHOLDS.BENCHMARKS && (
          <Text style={styles.footerSubtext}>
            {INSIGHT_THRESHOLDS.BENCHMARKS - rounds.length} more rounds for benchmark comparisons
          </Text>
        )}
      </View>
    </ScrollView>
  );
};

const InsightCard: React.FC<{
  insight: Insight;
  isNew?: boolean;
  feedback?: 'up' | 'down';
  onDismiss?: () => void;
  onFeedback?: (value: 'up' | 'down') => void;
}> = ({ insight, isNew = false, feedback, onDismiss, onFeedback }) => {
  const getInsightColor = () => {
    if (insight.type == InsightType.TREND) return '#3B82F6';
    if (insight.type == InsightType.COURSE_AWARE) return '#8B5CF6';
    return '#6B7280';
  };

  const getInsightIcon = () => {
    if (insight.type == InsightType.TREND) return 'trending-up';
    if (insight.type == InsightType.COURSE_AWARE) return 'location';
    return 'information-circle';
  };

  return (
    <View style={[styles.insightCard, { borderLeftColor: getInsightColor() }]}> 
      {insight.isRevisit && insight.revisitDescription && (
        <View style={styles.revisitBanner}>
          <Ionicons name="refresh" size={13} color="#10B981" />
          <Text style={styles.revisitText}>{insight.revisitDescription}</Text>
        </View>
      )}
      <View style={styles.insightCardHeader}>
        <View style={styles.insightHeaderLeft}>
          <Ionicons name={getInsightIcon()} size={18} color={getInsightColor()} />
          <Text style={[styles.insightCardTitle, { color: getInsightColor() }]}>
            {insight.title}
          </Text>
          {isNew && <Text style={styles.newBadge}>New</Text>}
        </View>
        {insight.dismissible && onDismiss && (
          <TouchableOpacity onPress={onDismiss} accessibilityRole="button">
            <Ionicons name="close" size={16} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.insightCardDesc}>{insight.description}</Text>
      {insight.actionable && (
        <Text style={styles.insightCardAction}>{insight.actionable}</Text>
      )}
      {onFeedback && (
        <View style={styles.insightFeedbackRow}>
          <Text style={styles.insightFeedbackLabel}>Helpful?</Text>
          <View style={styles.insightFeedbackButtons}>
            <TouchableOpacity
              style={[styles.feedbackButton, feedback === 'up' && styles.feedbackButtonActive]}
              onPress={() => onFeedback('up')}
            >
              <Ionicons name="thumbs-up" size={14} color={feedback === 'up' ? '#10B981' : '#6B7280'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.feedbackButton, feedback === 'down' && styles.feedbackButtonActive]}
              onPress={() => onFeedback('down')}
            >
              <Ionicons name="thumbs-down" size={14} color={feedback === 'down' ? '#EF4444' : '#6B7280'} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const BenchmarkDeltaCard: React.FC<{
  delta: {
    offTheTee: number;
    approach: number;
    aroundGreen: number;
    putting: number;
    total: number;
  };
}> = ({ delta }) => {
  const getDeltaToneColor = (value: number) => {
    if (value > 2.0) return '#991B1B';
    if (value > 0) return '#B45309';
    return '#1A7A4A';
  };
  const rows = [
    { label: 'Off the Tee', value: delta.offTheTee },
    { label: 'Approach', value: delta.approach },
    { label: 'Around the Green', value: delta.aroundGreen },
    { label: 'Putting', value: delta.putting },
  ];
  const worstDelta = Math.max(...rows.map(row => row.value));
  const maxAbs = Math.max(
    ...rows.map(row => Math.abs(row.value)),
    Math.abs(delta.total),
    0.1
  );

  return (
    <View style={styles.strokesCard}>
      {rows.map((row) => (
        <View key={row.label} style={styles.strokesRow}>
          <Text style={styles.strokesLabel}>{row.label}</Text>
          <View style={styles.strokesValueGroup}>
            <Text style={[styles.strokesValue, { color: getDeltaToneColor(row.value) }]}>
              {row.value >= 0 ? '+' : ''}{row.value.toFixed(2)}
            </Text>
            <View style={styles.strokesBarTrack}>
              <View style={styles.strokesBarCenter} />
              {Math.abs(row.value) > 0 && (
                <View
                  style={[
                    styles.strokesBarFill,
                    { backgroundColor: getDeltaToneColor(row.value) },
                    {
                      width: `${(Math.abs(row.value) / maxAbs) * 50}%`,
                      left: row.value >= 0 ? '50%' : undefined,
                      right: row.value < 0 ? '50%' : undefined,
                    },
                  ]}
                />
              )}
            </View>
            <View style={styles.strokesScaleRow}>
              <Text style={styles.strokesScaleText}>-{maxAbs.toFixed(2)}</Text>
              <Text style={styles.strokesScaleText}>+{maxAbs.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      ))}
      <View style={styles.strokesTotalRow}>
        <Text style={styles.strokesTotalLabel}>Total</Text>
        <Text style={[styles.strokesTotalValue, { color: getDeltaToneColor(worstDelta) }]}>
          {delta.total >= 0 ? '+' : ''}{delta.total.toFixed(2)}
        </Text>
      </View>
      <Text style={styles.strokesDisclaimer}>
        Vs. handicap benchmark. Directional only.
      </Text>
    </View>
  );
};

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
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  subTabButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  subTabButtonText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  subTabButtonTextActive: {
    color: '#10B981',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 32,
  },
  emptyScrollContainer: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 32,
    paddingBottom: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
  },
  emptyTextCentered: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
    textAlign: 'left',
    lineHeight: 21,
    width: '100%',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 12,
    textAlign: 'center',
  },
  explainerCard: {
    width: '100%',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    marginTop: 16,
  },
  explainerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 6,
  },
  explainerText: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 20,
    marginBottom: 10,
  },
  explainerButton: {
    alignSelf: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f1419',
  },
  secondaryActionButton: {
    alignSelf: 'center',
    borderColor: '#10B981',
    borderWidth: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  firstRoundCard: {
    width: '100%',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  firstRoundLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  firstRoundScore: {
    fontSize: 36,
    fontWeight: '800',
    color: '#E5E7EB',
    lineHeight: 38,
    marginBottom: 6,
  },
  firstRoundMeta: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  progressSection: {
    width: '100%',
    marginTop: 16,
  },
  progressText: {
    fontSize: 14,
    color: '#E5E7EB',
    marginBottom: 8,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  progressSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
  featurePreview: {
    width: '100%',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 8,
  },
  previewInsightCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  previewInsightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewInsightType: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
    flex: 1,
  },
  previewInsightBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  previewInsightTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 6,
  },
  previewInsightText: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
    marginBottom: 10,
  },
  previewInsightDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  previewInsightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  previewInsightDotActive: {
    backgroundColor: '#10B981',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  featureText: {
    fontSize: 12,
    color: '#E5E7EB',
  },
  weeklyFocusCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  weeklyFocusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  weeklyFocusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyFocusLabel: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '700',
  },
  weeklyFocusConfidence: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  weeklyFocusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  weeklyFocusDesc: {
    fontSize: 13,
    color: '#E5E7EB',
  },
  actionableCard: {
    marginTop: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionableText: {
    color: '#E5E7EB',
    fontSize: 12,
  },
  focusCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  focusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  focusText: {
    fontSize: 13,
    color: '#E5E7EB',
  },
  quickWinsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  quickWinsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  quickWinsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  quickWinRow: {
    marginTop: 6,
  },
  quickWinText: {
    fontSize: 12,
    color: '#E5E7EB',
  },
  section: {
    marginBottom: 16,
  },
  noInsightsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 8,
  },
  noInsightsText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  deeperAnalysisCard: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 14,
  },
  deeperAnalysisTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  deeperAnalysisText: {
    fontSize: 12,
    color: '#E5E7EB',
    lineHeight: 18,
    marginBottom: 8,
  },
  deeperAnalysisLink: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '700',
  },
  noInsightsCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  noInsightsSubtext: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
  },
  coachToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  coachToggleText: {
    color: '#9CA3AF',
    fontSize: 12,
    flex: 1,
    marginLeft: 8,
  },
  coachToggleHint: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
    marginBottom: 12,
  },
  patternHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  patternTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  patternSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  patternFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  patternFooterText: {
    fontSize: 11,
    color: '#6B7280',
  },
  patternProgressCard: {
    marginTop: 12,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  patternProgressRow: {
    gap: 6,
  },
  patternProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  patternProgressLabel: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  patternProgressCount: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  patternProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  patternProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#10B981',
  },
  patternProgressHint: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  insightCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    marginBottom: 8,
  },
  revisitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  revisitText: {
    flex: 1,
    fontSize: 11,
    color: '#A7F3D0',
  },
  insightCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    justifyContent: 'space-between',
  },
  insightHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightCardTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  newBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  insightCardDesc: {
    fontSize: 12,
    color: '#E5E7EB',
  },
  insightCardAction: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 6,
  },
  insightFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  insightFeedbackLabel: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  insightFeedbackButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  feedbackButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackButtonActive: {
    borderWidth: 1,
    borderColor: '#10B981',
  },
  strokesCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
    gap: 10,
  },
  strokesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  strokesLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    width: 120,
  },
  strokesValueGroup: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 6,
  },
  strokesValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  strokesBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  strokesBarCenter: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  strokesBarFill: {
    height: '100%',
    borderRadius: 4,
    position: 'absolute',
  },
  strokesBarGood: {
    backgroundColor: '#10B981',
  },
  strokesBarBad: {
    backgroundColor: '#EF4444',
  },
  strokesScaleRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  strokesScaleText: {
    fontSize: 10,
    color: '#6B7280',
  },
  strokesTotalRow: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  strokesTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  strokesTotalValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  strokesGood: {
    color: '#10B981',
  },
  strokesBad: {
    color: '#EF4444',
  },
  strokesDisclaimer: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 12,
  },
  footerText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  footerSubtext: {
    fontSize: 11,
    color: '#6B7280',
  },
});
