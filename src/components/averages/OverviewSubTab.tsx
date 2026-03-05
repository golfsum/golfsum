import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AveragesStatCard } from '../AveragesStatCard';
import { TrendMiniCard } from '../TrendMiniCard';
import { StatWithContext } from '../../types';
import { formatCourseName } from '../../utils/courseName';

interface PerformanceStats {
  fairways: StatWithContext | null;
  gir: StatWithContext | null;
  putts: StatWithContext | null;
  penalties: StatWithContext | null;
  threePuttRate: StatWithContext | null;
  upDown: StatWithContext | null;
}

interface ConditionSplit {
  label: string;
  summary: string;
}

interface ScoringStyleCard {
  title: string;
  summary: string;
  focus: string;
}

interface TrendSeries {
  score: number[];
  fir: number[];
  gir: number[];
  putts: number[];
}

interface SparklineSeries {
  putts: number[];
  penalties: number[];
  threePuttRate: number[];
  upDown: number[];
  fir: number[];
  gir: number[];
}

interface OverviewSubTabProps {
  active: boolean;
  performanceStats: PerformanceStats | null;
  hasPerformanceStats: boolean;
  hasScoringStats: boolean;
  trendRange: 5 | 10 | 20;
  onTrendRangeChange: (value: 5 | 10 | 20) => void;
  trendSeries: TrendSeries;
  sparklineSeries: SparklineSeries;
  courseOptions: Array<{ name: string; count: number; bestScore: number }>;
  onCourseStatsPress?: (courseName: string) => void;
  showTooltip: (title: string, content: string) => void;
  showContextSplits: boolean;
  onToggleContextSplits: () => void;
  conditionSplits: ConditionSplit[];
  scoringStyleCard: ScoringStyleCard | null;
  hasConditionsData: boolean;
  styles: any;
}

export const OverviewSubTab: React.FC<OverviewSubTabProps> = ({
  active,
  performanceStats,
  hasPerformanceStats,
  hasScoringStats,
  trendRange,
  onTrendRangeChange,
  trendSeries,
  sparklineSeries,
  courseOptions,
  onCourseStatsPress,
  showTooltip,
  showContextSplits,
  onToggleContextSplits,
  conditionSplits,
  scoringStyleCard,
  hasConditionsData,
  styles,
}) => {
  if (!active) return null;

  return (
    <>
      {hasPerformanceStats && performanceStats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scoring Snapshot</Text>
          <Text style={styles.sectionSubtitle}>
            Core scoring stats based on your tracked rounds
          </Text>

          {performanceStats.putts && performanceStats.putts.sampleSize > 0 && (
            <AveragesStatCard
              title="Putts Taken"
              stat={performanceStats.putts}
              unit=""
              sparkline={sparklineSeries.putts}
              onInfoPress={() =>
                showTooltip(
                  'Putts Taken',
                  'Total putts per round. Lower numbers indicate better green reading, speed control, and hole-out efficiency.'
                )
              }
              actionHint="Reducing putts by 2-3 per round can save multiple strokes."
            />
          )}

          {performanceStats.penalties && performanceStats.penalties.sampleSize > 0 && (
            <AveragesStatCard
              title="Penalty Strokes"
              stat={performanceStats.penalties}
              unit=""
              sparkline={sparklineSeries.penalties}
              onInfoPress={() =>
                showTooltip(
                  'Penalty Strokes',
                  'Penalty strokes per round (OB, water, unplayable lies). These add full strokes to your score.'
                )
              }
              actionHint="Each penalty costs a full stroke-avoiding one is as good as making a birdie."
            />
          )}

          {performanceStats.threePuttRate && performanceStats.threePuttRate.sampleSize > 0 && (
            <AveragesStatCard
              title="Three-Putts"
              stat={performanceStats.threePuttRate}
              unit="%"
              sparkline={sparklineSeries.threePuttRate}
              onInfoPress={() =>
                showTooltip(
                  'Three-Putts',
                  'Percentage of greens where you needed 3+ putts. Speed control on long first putts is the most common cause.'
                )
              }
              actionHint="Lower three-putt rate = fewer dropped strokes on greens you've already reached."
            />
          )}

          {performanceStats.upDown && (
            <AveragesStatCard
              title="Up & Down Percentage"
              stat={performanceStats.upDown}
              unit="%"
              sparkline={sparklineSeries.upDown}
              onInfoPress={() =>
                showTooltip(
                  'Up & Down Percentage',
                  'How often you save par (or better) after missing the green. This combines chipping and short putting.'
                )
              }
              actionHint="Strong up & down play turns missed greens into saves instead of bogeys."
            />
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Course Stats</Text>
        <Text style={styles.sectionSubtitle}>
          Tap a course to see hole-by-hole performance
        </Text>
        {courseOptions.length === 0 && (
          <View style={styles.lockedCard}>
            <View style={styles.lockIconContainer}>
              <Ionicons name="golf-outline" size={24} color="#9CA3AF" />
            </View>
            <Text style={styles.lockedTitle}>Play 2 rounds at the same course</Text>
            <Text style={styles.lockedDescription}>
              Course analytics unlock after two rounds at one course.
            </Text>
          </View>
        )}
        {courseOptions.length > 0 && (
          <View style={styles.courseStatsList}>
            {courseOptions.slice(0, 3).map(course => (
              <TouchableOpacity
                key={course.name}
                style={styles.courseStatsRow}
                onPress={() => onCourseStatsPress?.(course.name)}
                disabled={!onCourseStatsPress}
              >
                <View style={styles.courseStatsLeft}>
                  <Text style={styles.courseStatsName} numberOfLines={1}>{formatCourseName(course.name)}</Text>
                  <Text style={styles.courseStatsMeta}>
                    {course.count} rounds · Best {course.bestScore}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#6B7280" />
              </TouchableOpacity>
            ))}
            {courseOptions.length > 3 && (
              <Text style={styles.courseStatsMore}>
                {courseOptions.length - 3} more course{courseOptions.length - 3 === 1 ? '' : 's'} available
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.trendHeader}>
          <View>
            <Text style={styles.sectionTitle}>Trend Charts</Text>
            <Text style={styles.sectionSubtitle}>Last {trendRange} rounds</Text>
          </View>
          <View style={styles.trendRangeToggle}>
            {[5, 10, 20].map(value => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.trendRangeButton,
                  trendRange === value && styles.trendRangeButtonActive,
                ]}
                onPress={() => onTrendRangeChange(value as 5 | 10 | 20)}
              >
                <Text
                  style={[
                    styles.trendRangeText,
                    trendRange === value && styles.trendRangeTextActive,
                  ]}
                >
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text style={styles.trendDescription}>
          See how your scores and key stats move over time. Lower score/putts and higher FIR/GIR indicate progress.
        </Text>
        <View style={styles.trendGrid}>
          <TrendMiniCard title="Score" values={trendSeries.score} color="#3B82F6" showScale />
          <TrendMiniCard title="FIR %" values={trendSeries.fir} unit="%" color="#10B981" showScale />
          <TrendMiniCard title="GIR %" values={trendSeries.gir} unit="%" color="#10B981" showScale />
          <TrendMiniCard title="Putts" values={trendSeries.putts} color="#F59E0B" showScale />
        </View>
      </View>

      {(hasPerformanceStats || hasScoringStats) && hasConditionsData && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.contextSplitsHeader} onPress={onToggleContextSplits}>
            <Text style={styles.sectionTitle}>When Conditions Change</Text>
            <Ionicons
              name={showContextSplits ? 'chevron-up' : 'chevron-down'}
              size={24}
              color="#9CA3AF"
            />
          </TouchableOpacity>
          {!showContextSplits && conditionSplits.length > 0 && (
            <Text style={styles.contextPreview}>{conditionSplits[0].summary}</Text>
          )}

          {showContextSplits && (
            <View style={styles.contextSplitsContent}>
              <Ionicons
                name="flask-outline"
                size={24}
                color="#9CA3AF"
                style={{ alignSelf: 'center', marginBottom: 8 }}
              />
              {conditionSplits.map(split => (
                <View key={split.label} style={styles.contextSplitRow}>
                  <Text style={styles.contextSplitLabel}>{split.label}</Text>
                  <Text style={styles.contextSplitValue}>{split.summary}</Text>
                </View>
              ))}
              {scoringStyleCard && (
                <View style={styles.contextSplitRow}>
                  <Text style={styles.contextSplitLabel}>{scoringStyleCard.title}</Text>
                  <Text style={styles.contextSplitValue}>{scoringStyleCard.summary}</Text>
                  <Text style={styles.contextSplitValue}>{scoringStyleCard.focus}</Text>
                </View>
              )}
              <Text style={styles.contextNote}>
                Conditions insights get stronger as you track more rounds with weather data.
              </Text>
              <Text style={styles.contextNoteDetail}>
                These are directional signals, not absolutes.
              </Text>
            </View>
          )}
        </View>
      )}

      {(hasPerformanceStats || hasScoringStats) && !hasConditionsData && (
        <View style={styles.section}>
          <View style={styles.lockedCard}>
            <View style={styles.lockIconContainer}>
              <Ionicons name="cloudy-outline" size={24} color="#9CA3AF" />
            </View>
            <Text style={styles.lockedTitle}>When Conditions Change</Text>
            <Text style={styles.lockedDescription}>
              Compare performance in different weather once you have enough rounds tracked.
            </Text>
            <Text style={styles.lockedRequirement}>Capture weather on more rounds to unlock</Text>
          </View>
        </View>
      )}
    </>
  );
};
