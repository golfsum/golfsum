import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SavedRound } from '../../types';
import { formatCourseName } from '../../utils/courseName';

interface StatPreferences {
  putts?: boolean;
  fir?: boolean;
  gir?: boolean;
}

interface RoundSummaryCardProps {
  round: SavedRound;
  metaLine: string;
  roundSummaryText: string;
  ratingText: string;
  isUsedForHandicap: boolean;
  statPreferences: StatPreferences;
  firLabel?: string | null;
  girLabel?: string | null;
  isScoreOnlyRound: boolean;
  formatDate: (date: Date | string) => string;
  onHandicapInfoPress?: () => void;
  onFindCoursePress?: () => void;
  onCoursePress?: () => void;
}

export const RoundSummaryCard: React.FC<RoundSummaryCardProps> = ({
  round,
  metaLine,
  roundSummaryText,
  ratingText,
  isUsedForHandicap,
  statPreferences,
  firLabel,
  girLabel,
  isScoreOnlyRound,
  formatDate,
  onHandicapInfoPress,
  onFindCoursePress,
  onCoursePress,
}) => {
  const rawCourseName = typeof round.courseName === 'string' ? round.courseName.trim() : '';
  const isCourseMissing = rawCourseName.length === 0 || rawCourseName.toLowerCase() === 'test';
  const displayCourseName = isCourseMissing ? 'Unknown Course' : formatCourseName(rawCourseName);
  const showPutts = round.stats.putts !== undefined;
  const showFir = !!statPreferences.fir;
  const showGir = !!statPreferences.gir;
  const hasPuttValue = typeof round.stats.putts === 'number';
  const showNoStats = !hasPuttValue && !firLabel && !girLabel && !showFir && !showGir;
  const showHandicapInfo = Boolean(onHandicapInfoPress);
  const showRatingActions = ratingText === 'Course details unavailable' && Boolean(onFindCoursePress);

  // Data completeness calculation
  const dataCompleteness = React.useMemo(() => {
    if (!round.holes || round.holes.length === 0) return null;
    const playedHoles = round.holes.filter(h => h.isSaved || (h.score && h.score > 0));
    if (playedHoles.length === 0) return null;

    const notes: string[] = [];

    // FIR completeness: check par 4/5 played holes
    if (statPreferences.fir) {
      const firEligible = playedHoles.filter(h => h.par >= 4);
      const firTracked = firEligible.filter(h => h.fairwayHit !== null && h.fairwayHit !== undefined);
      const firMissing = firEligible.length - firTracked.length;
      if (firMissing > 0 && firEligible.length > 0) {
        notes.push(`FIR: ${firTracked.length}/${firEligible.length} fairways tracked (${firMissing} not recorded)`);
      }
    }

    // GIR completeness
    if (statPreferences.gir) {
      const girTracked = playedHoles.filter(h => h.greenHit !== null && h.greenHit !== undefined);
      const girMissing = playedHoles.length - girTracked.length;
      if (girMissing > 0) {
        notes.push(`GIR: ${girTracked.length}/${playedHoles.length} holes tracked (${girMissing} not recorded)`);
      }
    }

    return notes.length > 0 ? notes : null;
  }, [round.holes, statPreferences.fir, statPreferences.gir]);

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryTop}>
        <View style={styles.summaryLeft}>
          {onCoursePress ? (
            <TouchableOpacity onPress={onCoursePress} activeOpacity={0.7}>
              <Text style={[styles.courseName, isCourseMissing && styles.courseNamePlaceholder]}>
                {displayCourseName}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.courseName, isCourseMissing && styles.courseNamePlaceholder]}>
              {displayCourseName}
            </Text>
          )}
          <Text style={styles.dateText}>{formatDate(round.date)}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{metaLine}</Text>
          </View>
          <Text style={styles.roundSummaryText} numberOfLines={1}>
            {roundSummaryText}
          </Text>
        </View>
        <View style={styles.summaryRight}>
          <Text style={styles.scoreValue}>{round.score}</Text>
          <Text style={styles.ratingText}>{ratingText}</Text>
          {showRatingActions && (
            <View style={styles.ratingActions}>
              {onFindCoursePress && (
                <TouchableOpacity
                  style={styles.ratingActionButton}
                  onPress={onFindCoursePress}
                  accessibilityRole="button"
                  accessibilityLabel="Find course"
                >
                  <Ionicons name="search-outline" size={14} color="#10B981" />
                  <Text style={styles.ratingActionText}>Find course</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      {round.startType === 'shotgun' && (
        <View style={[styles.whsBadge, styles.shotgunRoundBadge]}>
          <Ionicons name="people" size={16} color="#F59E0B" />
          <Text style={[styles.whsBadgeText, styles.shotgunRoundText]}>
            Shotgun / Event Round • {round.holeCount || 0} holes played
            {round.eventTag && `\nEvent: ${round.eventTag}`}
            {round.holesPlayed && `\nHoles: ${round.holesPlayed.sort((a, b) => a - b).join(', ')}`}
          </Text>
        </View>
      )}

      {round.isAcceptableForHandicap && round.differential && (
        <View style={styles.whsBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.whsBadgeText}>
            {isUsedForHandicap ? '✓ Used in Player Rating' : 'Rating Eligible'} • Round Rating: {round.differential > 0 ? '+' : ''}{round.differential.toFixed(1)}
          </Text>
        </View>
      )}

      {!round.isAcceptableForHandicap && round.handicapStatus && (
        <TouchableOpacity
          style={[styles.whsBadge, styles.notEligibleBadge]}
          onPress={onHandicapInfoPress}
          activeOpacity={showHandicapInfo ? 0.7 : 1}
          disabled={!showHandicapInfo}
          accessibilityRole={showHandicapInfo ? 'button' : 'none'}
          accessibilityLabel="Rating eligibility info"
        >
          <Ionicons name="information-circle" size={16} color="#9CA3AF" />
          <Text style={[styles.whsBadgeText, styles.notEligibleText, { flex: 1 }]}>
            {round.handicapStatus}
          </Text>
        </TouchableOpacity>
      )}
      {round.isCustomCourse && (
        <View style={[styles.whsBadge, styles.whsBadgeCustom]}>
          <Ionicons name="create-outline" size={16} color="#3B82F6" />
          <Text style={[styles.whsBadgeText, styles.whsBadgeTextCustom]}>Custom Course</Text>
        </View>
      )}

      <View style={styles.summaryStats}>
        {showPutts && (
          <StatPill label="Total Putts" value={round.stats.putts != null ? round.stats.putts.toString() : '—'} />
        )}
        {showFir && (
          <StatPill label="FIR" value={firLabel ?? '—'} />
        )}
        {showGir && (
          <StatPill label="GIR" value={girLabel ?? '—'} />
        )}
        {round.adjustedGrossScore && round.adjustedGrossScore !== round.score && (
          <StatPill label="Adjusted Score" value={round.adjustedGrossScore.toString()} />
        )}
      </View>

      {showNoStats && (
        <View style={styles.noStatsContainer}>
          <Text style={styles.noStatsText}>Advanced stats were not tracked for this round</Text>
        </View>
      )}

      {dataCompleteness && (
        <View style={styles.dataCompletenessContainer}>
          <Ionicons name="analytics-outline" size={14} color="#6B7280" />
          <View style={styles.dataCompletenessTextContainer}>
            {dataCompleteness.map((note, i) => (
              <Text key={i} style={styles.dataCompletenessText}>{note}</Text>
            ))}
          </View>
        </View>
      )}

      {isScoreOnlyRound && (
        <View style={styles.scoreOnlyBanner}>
          <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
          <Text style={styles.scoreOnlyText}>
            Score-only round. Add FIR and GIR to see more here.
          </Text>
        </View>
      )}
    </View>
  );
};

const StatPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.statPill}>
    <Text style={styles.statPillValue}>{value}</Text>
    <Text style={styles.statPillLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  summaryCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryLeft: {
    flex: 1,
  },
  courseName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  courseNamePlaceholder: {
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  dateText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  roundSummaryText: {
    fontSize: 13,
    color: '#D1D5DB',
    marginTop: 8,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#6B7280',
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontSize: 56,
    fontWeight: '800',
    color: '#10B981',
    lineHeight: 56,
  },
  ratingText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
  },
  ratingActions: {
    marginTop: 8,
    alignItems: 'flex-end',
    gap: 6,
  },
  ratingActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  ratingActionText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  whsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  whsBadgeNotUsed: {
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderColor: 'rgba(107, 114, 128, 0.3)',
  },
  whsBadgeCustom: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  shotgunRoundBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  incompleteRoundBadge: {
    backgroundColor: 'rgba(156, 163, 175, 0.1)',
    borderColor: 'rgba(156, 163, 175, 0.3)',
  },
  notEligibleBadge: {
    backgroundColor: 'rgba(156, 163, 175, 0.1)',
    borderColor: 'rgba(156, 163, 175, 0.3)',
  },
  whsBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
  whsBadgeTextNotUsed: {
    color: '#9CA3AF',
  },
  whsBadgeTextCustom: {
    color: '#3B82F6',
  },
  shotgunRoundText: {
    color: '#F59E0B',
  },
  incompleteRoundText: {
    color: '#9CA3AF',
  },
  notEligibleText: {
    color: '#9CA3AF',
  },
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    paddingTop: 16,
    marginTop: 16,
  },
  noStatsContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#374151',
    marginTop: 16,
  },
  noStatsText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  dataCompletenessContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    marginTop: 12,
    backgroundColor: 'rgba(107, 114, 128, 0.08)',
    borderRadius: 8,
  },
  dataCompletenessTextContainer: {
    flex: 1,
    gap: 2,
  },
  dataCompletenessText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  scoreOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    marginTop: 12,
  },
  scoreOnlyText: {
    flex: 1,
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
  },
  statPillValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statPillLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  infoButton: {
    marginLeft: 'auto',
  },
});
