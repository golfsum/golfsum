import React, { useRef } from 'react';
import { Alert, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { SavedRound } from '../../types';
import { getRoundStatPreferences } from '../../utils/statPreferences';
import { buildRoundSummaryText } from '../../utils/roundSummary';
import { computeFirStats, computeGirStats, computeScramblingStats } from '../../utils/roundStats';
import { getRoundPar } from './historyUtils';
import { QuickStat } from './QuickStat';
import { formatCourseName } from '../../utils/courseName';
import { buildNormalizedScore } from '../../utils/conditionsNormalization';

interface RoundCardProps {
  round: SavedRound;
  isBest: boolean;
  isUsedForHandicap: boolean;
  allRounds: SavedRound[];
  onPress: () => void;
  onCoursePress?: () => void;
  onDelete: (e?: any) => void;
  onPlayAgain?: () => void;
  compareMode?: boolean;
  compareSelected?: boolean;
  compareDisabled?: boolean;
  onCompareToggle?: () => void;
  onCompareDisabledPress?: () => void;
  onShowEligibilityInfo?: (round: SavedRound) => void;
  styles: Record<string, any>;
}

const RoundCardComponent: React.FC<RoundCardProps> = ({
  round,
  isBest,
  isUsedForHandicap,
  allRounds,
  onPress,
  onCoursePress,
  onDelete,
  onPlayAgain,
  compareMode = false,
  compareSelected = false,
  compareDisabled = false,
  onCompareToggle,
  onCompareDisabledPress,
  onShowEligibilityInfo,
  styles,
}) => {
  const swipeRef = useRef<Swipeable>(null);
  const statPrefs = getRoundStatPreferences(round);
  const roundPar = getRoundPar(round);
  const differential = roundPar !== null ? round.score - roundPar : round.score - 72;

  const date = new Date(round.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const rawCourseName = typeof round.courseName === 'string' ? round.courseName.trim() : '';
  const isCourseMissing = rawCourseName.length === 0 || rawCourseName.toLowerCase() === 'test';
  const displayCourseName = isCourseMissing ? 'Unknown Course' : formatCourseName(rawCourseName);
  const roundLengthLabel = round.roundLength === 'front9'
    ? '9 Holes - Front'
    : round.roundLength === 'back9'
      ? '9 Holes - Back'
      : '9 Holes';
  const weatherParts: string[] = [];
  if (round.weather?.temp) weatherParts.push(round.weather.temp);
  if (round.weather?.conditions) weatherParts.push(round.weather.conditions);
  if (round.weather?.wind) weatherParts.push(`${round.weather.wind} wind`);
  const weatherText = weatherParts.join(' | ');

  const firStats = statPrefs.fir ? computeFirStats(round) : null;
  const girStats = statPrefs.gir ? computeGirStats(round) : null;
  const scramblingStats = statPrefs.scrambling ? computeScramblingStats(round) : null;
  const firTracked = !!firStats;
  const girTracked = !!girStats;
  const scramblingTracked = !!scramblingStats;

  const firPercentage = firStats ? firStats.percent : null;
  const girPercentage = girStats ? girStats.percent : null;
  const scrambling = scramblingStats ? scramblingStats.percent : null;
  const gpsGreenSummaries = round.gpsHoleSummaries ?? [];
  const gpsTrackedGreens = gpsGreenSummaries.length;
  const isGpsRound = (round.gpsShotCount ?? round.gpsShots?.length ?? 0) > 0;
  const firstPuttValues = gpsGreenSummaries
    .map((summary) => summary.firstPuttDistance)
    .filter((value): value is number => value !== null && value !== undefined);
  const avgFirstPuttDistance = firstPuttValues.length
    ? Math.round(firstPuttValues.reduce((sum, value) => sum + value, 0) / firstPuttValues.length)
    : null;
  const pinCounts = gpsGreenSummaries.reduce<Record<'front' | 'middle' | 'back', number>>((acc, summary) => {
    if (summary.pinLocation === 'front') acc.front += 1;
    if (summary.pinLocation === 'middle') acc.middle += 1;
    if (summary.pinLocation === 'back') acc.back += 1;
    return acc;
  }, { front: 0, middle: 0, back: 0 });
  const toughestPin = (Object.entries(pinCounts) as Array<['front' | 'middle' | 'back', number]>)
    .sort((a, b) => b[1] - a[1])[0];
  const toughestPinLabel = toughestPin && toughestPin[1] > 0
    ? toughestPin[0] === 'front' ? 'Front pin'
      : toughestPin[0] === 'middle' ? 'Middle pin'
        : 'Back pin'
    : null;

  const hasAdvancedStats = (statPrefs.putts && round.stats.putts !== undefined) || firTracked || girTracked || scramblingTracked;
  const enabledStatsCount = Number(statPrefs.putts) + Number(statPrefs.fir) + Number(statPrefs.gir) + Number(statPrefs.scrambling);
  const showStatGrid = enabledStatsCount > 0;
  const showNoStatsMessage = enabledStatsCount === 0 && !hasAdvancedStats;
  const summaryText = buildRoundSummaryText(round, allRounds);
  const courseRounds = allRounds.filter(
    r => r.id !== round.id && r.courseId === round.courseId && typeof r.score === 'number' && r.score > 0 && !r.isSample
  );
  const courseAverage = courseRounds.length > 0
    ? courseRounds.reduce((sum, r) => sum + r.score, 0) / courseRounds.length
    : null;
  const scoreDeltaVsCourseAvg = courseAverage !== null ? courseAverage - round.score : null;
  const derivedInsight =
    scoreDeltaVsCourseAvg !== null && Math.abs(scoreDeltaVsCourseAvg) >= 1
      ? scoreDeltaVsCourseAvg > 0
        ? `${Math.abs(scoreDeltaVsCourseAvg).toFixed(1)} better than your avg here`
        : `${Math.abs(scoreDeltaVsCourseAvg).toFixed(1)} worse than your avg here`
      : summaryText;
  const normalizedScore = buildNormalizedScore(round);
  const isImported =
    typeof round.notes === 'string' &&
    round.notes.trim().toLowerCase().startsWith('imported scorecard');
  const isSample = !!round.isSample;

  const handleCardPress = () => {
    if (compareMode) {
      if (compareDisabled) {
        onCompareDisabledPress?.();
        return;
      }
      if (onCompareToggle) onCompareToggle();
      return;
    }
    onPress();
  };

  const renderRightActions = () => (
    <View style={styles.swipeActions}>
      {onPlayAgain && (
        <TouchableOpacity
          style={[styles.swipeAction, styles.swipePlay]}
          onPress={() => {
            swipeRef.current?.close();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPlayAgain();
          }}
        >
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.swipeActionText}>{'Play\nAgain'}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.swipeAction, styles.swipeDelete]}
        onPress={(e) => {
          swipeRef.current?.close();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onDelete(e);
        }}
      >
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={styles.swipeActionText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      enabled={!compareMode}
    >
      <TouchableOpacity
        style={styles.roundCard}
        onPress={handleCardPress}
        activeOpacity={0.7}
      >
        <View style={styles.roundCardTop}>
          <View style={styles.roundCardLeft}>
            {onCoursePress ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onCoursePress();
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.roundCardCourse,
                    isCourseMissing && styles.roundCardCoursePlaceholder,
                    displayCourseName.length > 22 && { fontSize: 13 },
                    displayCourseName.length > 28 && { fontSize: 12 },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {displayCourseName}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text
                style={[
                  styles.roundCardCourse,
                  isCourseMissing && styles.roundCardCoursePlaceholder,
                  displayCourseName.length > 22 && { fontSize: 13 },
                  displayCourseName.length > 28 && { fontSize: 12 },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {displayCourseName}
              </Text>
            )}
            <View style={styles.roundCardBadgeRow}>
              {isGpsRound && (
                <View style={styles.gpsBadge}>
                  <Ionicons name="navigate" size={12} color="#22C55E" />
                  <Text style={styles.gpsBadgeText}>GPS</Text>
                </View>
              )}
              {round.isCustomCourse && (
                <View style={styles.customCourseBadge}>
                  <Ionicons name="create-outline" size={12} color="#3B82F6" />
                  <Text style={styles.customCourseBadgeText}>Custom</Text>
                </View>
              )}
              {round.startType === 'shotgun' && (
                <View style={[styles.customCourseBadge, styles.shotgunBadge]}>
                  <Ionicons name="people" size={12} color="#F59E0B" />
                  <Text style={[styles.customCourseBadgeText, styles.shotgunBadgeText]}>
                    Shotgun | {round.holeCount || 0} holes
                  </Text>
                </View>
              )}
              {round.isNineHoleRound && !round.startType && (
                <View style={[styles.customCourseBadge, styles.nineHoleBadge]}>
                  <Ionicons name="golf" size={12} color="#F59E0B" />
                  <Text style={[styles.customCourseBadgeText, styles.nineHoleBadgeText]}>{roundLengthLabel}</Text>
                </View>
              )}
              {round.isIncomplete && !round.isNineHoleRound && round.startType !== 'shotgun' && (
                <View style={[styles.customCourseBadge, styles.incompleteBadge]}>
                  <Ionicons name="alert-circle-outline" size={12} color="#9CA3AF" />
                  <Text style={[styles.customCourseBadgeText, styles.incompleteBadgeText]}>
                    {round.holeCount && round.plannedHoles
                      ? `${round.holeCount} of ${round.plannedHoles} holes`
                      : 'Incomplete'}
                  </Text>
                </View>
              )}
              {isBest && (
                <View style={styles.bestBadge}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.bestBadgeText}>Best</Text>
                </View>
              )}
              {isSample && (
                <View style={styles.sampleBadge}>
                  <Ionicons name="flask-outline" size={12} color="#10B981" />
                  <Text style={styles.sampleBadgeText}>Sample</Text>
                </View>
              )}
              {isUsedForHandicap && (
                <View style={styles.whsBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#10B981" />
                  <Text style={styles.whsBadgeText}>GSR</Text>
                </View>
              )}
              {round.isAcceptableForHandicap === false && !isSample && (
                <TouchableOpacity
                  style={styles.notEligibleBadge}
                  onPress={() => onShowEligibilityInfo?.(round)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="alert-circle-outline" size={12} color="#F59E0B" />
                  <Text style={styles.notEligibleBadgeText}>Unrated</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.roundCardMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                <Text style={styles.metaText}>{date}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={styles.metaText}>{round.teeName || 'White'} Tees</Text>
              </View>
              {weatherText.length > 0 && (
                <Text style={styles.metaText}>{weatherText}</Text>
              )}
            </View>
          </View>

          <View style={styles.roundCardRight}>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>{round.score}</Text>
              <View style={styles.scoreDiff}>
                <Text
                  style={[
                    styles.scoreDiffText,
                    differential < 0 ? styles.textGreen : differential > 0 ? styles.textRed : styles.textGray,
                  ]}
                >
                  {differential > 0 ? '+' : ''}{differential}
                </Text>
                <Text style={styles.scoreDiffLabel}>
                  {roundPar !== null ? `vs par ${roundPar}` : 'vs par'}
                </Text>
                {normalizedScore?.significant && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Text style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic' }}>
                      Equiv. ~{normalizedScore.normalizedScore} in normal conditions
                    </Text>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        Alert.alert(
                          'Conditions-Normalized Score',
                          'Estimated equivalent score if conditions were calm and mild. Does not affect your player rating.'
                        );
                      }}
                    >
                      <Ionicons name="information-circle-outline" size={12} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
            {compareMode && (
              <View
                style={[
                  styles.compareCheck,
                  compareSelected && styles.compareCheckSelected,
                  compareDisabled && { opacity: 0.45 },
                ]}
              >
                <Ionicons
                  name={compareSelected ? 'checkmark' : compareDisabled ? 'ellipse' : 'ellipse-outline'}
                  size={16}
                  color={compareSelected ? '#10B981' : compareDisabled ? '#4B5563' : '#6B7280'}
                />
              </View>
            )}
          </View>
        </View>

        {showStatGrid ? (
          <View style={styles.quickStatsGrid}>
            {statPrefs.fir && (
              <QuickStat
                label="FIR"
                value={firTracked && firPercentage !== null ? `${firPercentage}%` : '—'}
                subValue={firTracked && firStats ? `${firStats.hit}/${firStats.possible}` : undefined}
                styles={styles}
              />
            )}
            {statPrefs.putts && round.stats.putts !== undefined && (
              <QuickStat label="Putts" value={round.stats.putts.toString()} styles={styles} />
            )}
            {statPrefs.gir && (
              <QuickStat
                label="GIR"
                value={girTracked && girPercentage !== null ? `${girPercentage}%` : '—'}
                subValue={girTracked && girStats ? `${girStats.hit}/${girStats.possible}` : undefined}
                styles={styles}
              />
            )}
            {statPrefs.scrambling && (
              <QuickStat
                label="Up & Down"
                value={scramblingTracked && scrambling !== null ? `${scrambling}%` : '—'}
                styles={styles}
              />
            )}
          </View>
        ) : showNoStatsMessage ? (
          <View style={styles.statsNotTrackedContainer}>
            <Text style={styles.statsNotTrackedText}>Stats not tracked</Text>
          </View>
        ) : null}

        {gpsTrackedGreens > 0 ? (
          <View style={styles.gpsGreenRow}>
            <View style={styles.gpsGreenPill}>
              <Ionicons name="golf-outline" size={12} color="#10B981" />
              <Text style={styles.gpsGreenPillText}>{gpsTrackedGreens} greens tracked</Text>
            </View>
            {avgFirstPuttDistance !== null ? (
              <View style={styles.gpsGreenPill}>
                <Ionicons name="resize-outline" size={12} color="#6B7280" />
                <Text style={styles.gpsGreenPillText}>{avgFirstPuttDistance} ft first putt</Text>
              </View>
            ) : null}
            {toughestPinLabel ? (
              <View style={styles.gpsGreenPill}>
                <Ionicons name="flag-outline" size={12} color="#6B7280" />
                <Text style={styles.gpsGreenPillText}>{toughestPinLabel}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.roundCardBottom}>
          <View style={styles.notesRow}>
            {isImported && (
              <View style={styles.importedBadge}>
                <Text style={styles.importedBadgeText}>Imported</Text>
              </View>
            )}
            {!isImported && round.notes && (
              <>
                <Ionicons name="chatbubble-outline" size={14} color="#6B7280" />
                <Text style={styles.notesText} numberOfLines={1}>{round.notes}</Text>
              </>
            )}
            {!round.notes && derivedInsight && (
              <Text style={styles.notesPlaceholder} numberOfLines={1}>{derivedInsight}</Text>
            )}
          </View>
          <View style={styles.actionRow}>
            <View style={styles.actionRowLeft}>
              {onPlayAgain && (
                <TouchableOpacity
                  style={styles.playAgainButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onPlayAgain();
                  }}
                >
                  <Ionicons name="refresh" size={16} color="#10B981" />
                  <Text style={styles.playAgainText}>Play Again</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.viewDetailsRow}
                onPress={(e) => {
                  e.stopPropagation();
                  handleCardPress();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.viewDetailsText}>View Details</Text>
                <Ionicons name="arrow-forward" size={16} color="#10B981" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={(e) => {
                e.stopPropagation();
                onDelete(e);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={18} color="#E07575" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};

export const RoundCard = React.memo(RoundCardComponent);
RoundCard.displayName = 'RoundCard';
