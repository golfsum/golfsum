import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SavedRound } from '../../types';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { getRoundPar } from './historyUtils';
import { buildAiComparisonSummary, getMetricValue } from './roundComparison.utils';

interface RoundComparisonSheetProps {
  visible: boolean;
  rounds: SavedRound[];
  onClose: () => void;
}

type MetricKey = 'score' | 'scoreToPar' | 'fir' | 'gir' | 'putts' | 'updown' | 'playerRating';

interface MetricConfig {
  key: MetricKey;
  label: string;
  lowerBetter: boolean;
  formatValue: (value: number | null) => string;
}

const ROUND_COLORS = ['#FFFFFF', '#10B981', '#F59E0B', '#60A5FA'];
const SHEET_HEIGHT = Dimensions.get('window').height * 0.92;
const DASH = '—';

const METRICS: MetricConfig[] = [
  { key: 'score', label: 'Score', lowerBetter: true, formatValue: (v) => (v == null ? DASH : `${Math.round(v)}`) },
  {
    key: 'scoreToPar',
    label: 'Score vs Par',
    lowerBetter: true,
    formatValue: (v) => (v == null ? DASH : `${v > 0 ? '+' : ''}${Math.round(v)}`),
  },
  { key: 'fir', label: 'FIR', lowerBetter: false, formatValue: (v) => (v == null ? DASH : `${Math.round(v)}%`) },
  { key: 'gir', label: 'GIR', lowerBetter: false, formatValue: (v) => (v == null ? DASH : `${Math.round(v)}%`) },
  { key: 'putts', label: 'Putts', lowerBetter: true, formatValue: (v) => (v == null ? DASH : `${Math.round(v)}`) },
  {
    key: 'updown',
    label: 'Up & Down',
    lowerBetter: false,
    formatValue: (v) => (v == null ? DASH : `${Math.round(v)}%`),
  },
  {
    key: 'playerRating',
    label: 'Player Rating',
    lowerBetter: false,
    formatValue: (v) => (v == null ? DASH : Number(v).toFixed(1)),
  },
];

const truncateCourse = (name: string, max = 20) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

 

export const RoundComparisonSheet: React.FC<RoundComparisonSheetProps> = ({ visible, rounds, onClose }) => {
  const selectedRounds = useMemo(() => rounds.slice(0, 4), [rounds]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState('Compare individual stats above for details.');

  const sheetTranslateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const legendAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const cardPulse = useRef(new Animated.Value(1)).current;
  const cardAnimsRef = useRef<Animated.Value[]>([]);

  const cards = useMemo(() => {
    const hasPlayerRating = selectedRounds.length > 0 && selectedRounds.every((round) => getMetricValue(round, 'playerRating') != null);
    return METRICS.filter((metric) => metric.key !== 'playerRating' || hasPlayerRating);
  }, [selectedRounds]);

  if (cardAnimsRef.current.length !== cards.length) {
    cardAnimsRef.current = cards.map(() => new Animated.Value(0));
  }

  const closeSheet = useCallback(() => {
    Animated.spring(dragY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 24,
      stiffness: 260,
      mass: 0.9,
    }).start();
    Animated.timing(sheetTranslateY, {
      toValue: SHEET_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [dragY, onClose, sheetTranslateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 10,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) dragY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 140 || gesture.vy > 1.2) {
          closeSheet();
          return;
        }
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 24,
          stiffness: 260,
          mass: 0.9,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (!visible) return;
    dragY.setValue(0);
    sheetTranslateY.setValue(SHEET_HEIGHT);
    legendAnims.forEach((anim) => anim.setValue(0));
    cardAnimsRef.current.forEach((anim) => anim.setValue(0));
    cardPulse.setValue(1);

    Animated.spring(sheetTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 24,
      stiffness: 250,
      mass: 0.9,
    }).start();

    Animated.stagger(50, legendAnims.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      })
    )).start(() => {
      Animated.stagger(30, cardAnimsRef.current.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 170,
          useNativeDriver: true,
        })
      )).start(() => {
        Animated.sequence([
          Animated.timing(cardPulse, { toValue: 1.04, duration: 170, useNativeDriver: true }),
          Animated.timing(cardPulse, { toValue: 1, duration: 170, useNativeDriver: true }),
        ]).start();
      });
    });
  }, [cardPulse, dragY, legendAnims, sheetTranslateY, visible]);

  useEffect(() => {
    if (!visible || selectedRounds.length < 2) return;
    setSummaryLoading(true);
    const timer = setTimeout(() => {
      try {
        setSummaryText(buildAiComparisonSummary(selectedRounds));
      } catch {
        setSummaryText('Compare individual stats above for details.');
      } finally {
        setSummaryLoading(false);
      }
    }, 520);
    return () => clearTimeout(timer);
  }, [selectedRounds, visible]);

  if (!visible || selectedRounds.length < 2) return null;

  const sheetTransform = { transform: [{ translateY: Animated.add(sheetTranslateY, dragY) }] };
  const baseline = selectedRounds[0];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeSheet}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeSheet} />
        <Animated.View style={[styles.sheet, sheetTransform]}>
          <View {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={closeSheet}>
            <Ionicons name="close" size={20} color={colors.text.secondary} />
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {selectedRounds.map((round, idx) => {
              const par = getRoundPar(round);
              const scorePar = par !== null ? round.score - par : null;
              return (
                <Animated.View
                  key={round.id}
                  style={[
                    styles.legendRow,
                    {
                      opacity: legendAnims[idx] || 1,
                      transform: [
                        {
                          translateY: (legendAnims[idx] || legendAnims[0]).interpolate({
                            inputRange: [0, 1],
                            outputRange: [6, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={[styles.legendDot, { backgroundColor: ROUND_COLORS[idx] }]} />
                  <Text style={styles.legendLabel}>R{idx + 1}</Text>
                  <Text style={styles.legendCourse} numberOfLines={1}>
                    {truncateCourse((round.courseName || 'Unknown Course').trim() || 'Unknown Course')}
                  </Text>
                  <Text style={styles.legendDate}>
                    {new Date(round.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={styles.legendScore}>
                    {round.score} {scorePar == null ? '' : `${scorePar > 0 ? '+' : ''}${scorePar}`}
                  </Text>
                </Animated.View>
              );
            })}

            <View style={styles.legendDivider} />

            {cards.map((metric, cardIdx) => {
              const values = selectedRounds.map((round) => getMetricValue(round, metric.key));
              const valid = values.filter((v): v is number => typeof v === 'number');
              const best = valid.length
                ? (metric.lowerBetter ? Math.min(...valid) : Math.max(...valid))
                : null;

              return (
                <Animated.View
                  key={metric.key}
                  style={[
                    styles.metricCard,
                    {
                      opacity: cardAnimsRef.current[cardIdx] || 1,
                      transform: [
                        {
                          translateY: (cardAnimsRef.current[cardIdx] || cardAnimsRef.current[0]).interpolate({
                            inputRange: [0, 1],
                            outputRange: [8, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.metricLabel}>{metric.label.toUpperCase()}</Text>
                  <View style={styles.metricColumns}>
                    {selectedRounds.map((round, idx) => {
                      const value = values[idx];
                      const baselineValue = getMetricValue(baseline, metric.key);
                      const diff = idx === 0 || value == null || baselineValue == null ? null : value - baselineValue;
                      const isGood = diff != null ? (metric.lowerBetter ? diff < 0 : diff > 0) : false;
                      const isZero = diff === 0;
                      const isBest = value != null && best != null && value === best;
                      const suffix = metric.key === 'fir' || metric.key === 'gir' || metric.key === 'updown' ? 'pt' : '';
                      const diffText =
                        diff == null
                          ? ''
                          : isZero
                            ? DASH
                            : `${diff > 0 ? '+' : ''}${Math.round(diff)}${suffix}${isGood ? '▲' : '▼'}`;

                      return (
                        <Animated.View
                          key={round.id}
                          style={[
                            styles.metricColumn,
                            isBest && styles.metricBestCell,
                            isBest && { transform: [{ scale: cardPulse }] },
                          ]}
                        >
                          <View style={[styles.metricDot, { backgroundColor: ROUND_COLORS[idx] }]} />
                          <Text style={styles.metricRoundLabel}>R{idx + 1}</Text>
                          <Text style={styles.metricValue}>{metric.formatValue(value)}</Text>
                          {idx > 0 && (
                            <Text
                              style={[
                                styles.metricDelta,
                                diff == null || isZero
                                  ? styles.metricDeltaNeutral
                                  : isGood
                                    ? styles.metricDeltaGood
                                    : styles.metricDeltaBad,
                              ]}
                            >
                              {diff == null ? '' : diffText}
                            </Text>
                          )}
                        </Animated.View>
                      );
                    })}
                  </View>
                </Animated.View>
              );
            })}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>⚡ Round Comparison Summary</Text>
              {summaryLoading ? (
                <View>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, { width: '82%' }]} />
                  <View style={[styles.skeletonLine, { width: '68%' }]} />
                </View>
              ) : (
                <Text style={styles.summaryBody}>{summaryText || 'Compare individual stats above for details.'}</Text>
              )}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  handle: {
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#374151',
  },
  closeButton: {
    position: 'absolute',
    right: 12,
    top: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    ...typography.labelSm,
    color: colors.text.secondary,
    width: 22,
  },
  legendCourse: {
    ...typography.labelSm,
    color: colors.text.primary,
    flex: 1,
  },
  legendDate: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    width: 56,
    textAlign: 'right',
  },
  legendScore: {
    ...typography.labelSm,
    color: colors.text.primary,
    width: 62,
    textAlign: 'right',
  },
  legendDivider: {
    height: 1,
    backgroundColor: '#1F2937',
    marginTop: 2,
    marginBottom: 12,
  },
  metricCard: {
    backgroundColor: '#111827',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
    marginBottom: 10,
  },
  metricLabel: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    marginBottom: 8,
  },
  metricColumns: {
    flexDirection: 'row',
    gap: 8,
  },
  metricColumn: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 8,
  },
  metricBestCell: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  metricDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  metricRoundLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F9FAFB',
  },
  metricDelta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    minHeight: 16,
  },
  metricDeltaGood: {
    color: '#10B981',
  },
  metricDeltaBad: {
    color: '#EF4444',
  },
  metricDeltaNeutral: {
    color: '#9CA3AF',
  },
  summaryCard: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
  },
  summaryTitle: {
    ...typography.labelMd,
    color: colors.text.primary,
    marginBottom: 8,
  },
  summaryBody: {
    ...typography.bodySm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    marginBottom: 8,
    width: '94%',
  },
});
