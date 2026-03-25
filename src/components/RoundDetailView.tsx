import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { SavedRound, RoundStats, CourseSource } from '../types';
import type { PersonalBest } from '../services/personalBestService';
import { updateRound, parseHtmlForStats, updateHandicapFlags, getRounds, deleteRound } from '../services/roundsService';
import { getHandicapCalculationDetails } from '../services/whsCalculations';
import { searchCourses, getCourseDetails } from '../services/golfCourseApiService';
import { RoundHeader } from './round-detail/RoundHeader';
import { RoundSummaryCard } from './round-detail/RoundSummaryCard';
import { RoundInsightsCard } from './round-detail/RoundInsightsCard';
import { ScoringDistribution } from './round-detail/ScoringDistribution';
import { ScorecardSection } from './round-detail/ScorecardSection';
import { TotalScoreFooter } from './round-detail/TotalScoreFooter';
import { PersonalBestModal } from './round-detail/PersonalBestModal';
import { CourseSearchModal } from './round-detail/CourseSearchModal';
import { ExpandedScorecardModal } from './round-detail/ExpandedScorecardModal';
import { useRoundDetailData } from './round-detail/hooks/useRoundDetailData';
import { ShareRoundCard } from './round-detail/ShareRoundCard';
import { MilestoneShareCard } from './MilestoneShareCard';
import { MilestoneEvent } from '../services/milestoneDetector';
import { logger } from '../utils/logger';
import { formatCourseName } from '../utils/courseName';
import { colors, spacing, typography, radius } from '../theme/tokens';
import { FEEDBACK_COPY } from '../constants/feedbackCopy';
import Storage from '../services/storage';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { buildNormalizedScore } from '../utils/conditionsNormalization';
import { useScorecardColorPreference } from '../hooks/useScorecardColorPreference';
import { getPuttColor } from '../utils/scoreColors';
import { formatDuration } from '../services/roundTimingService';

interface Props {
  round: SavedRound;
  onBack: () => void;
  onRoundUpdated?: (updatedRound: SavedRound) => void;
  personalBests?: PersonalBest[];
  onDismissPersonalBests?: () => void;
  onViewCourseStats?: (courseName: string) => void;
  onNavigateToProfile?: () => void;
  milestoneEvent?: MilestoneEvent | null;
  onDismissMilestone?: () => void;
}

interface EditTracker {
  originalValue: string;
  startTime: number;
  rowLabel: string;
  columnIndex?: number;
}

export const RoundDetailView: React.FC<Props> = ({
  round,
  onBack,
  onRoundUpdated,
  personalBests,
  onDismissPersonalBests,
  onViewCourseStats,
  onNavigateToProfile,
  milestoneEvent = null,
  onDismissMilestone,
}) => {
  const [currentRound, setCurrentRound] = useState<SavedRound>(round);
  const storyShotRef = useRef<ViewShot>(null);
  const squareShotRef = useRef<ViewShot>(null);
  const milestoneShotRef = useRef<ViewShot>(null);
  const [baselineRounds, setBaselineRounds] = useState<SavedRound[]>([]);
  const [scorecardExpanded, setScorecardExpanded] = useState(false);
  const [showPersonalBestModal, setShowPersonalBestModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentHtml, setCurrentHtml] = useState(round.html);
  const [isUsedForHandicap, setIsUsedForHandicap] = useState(false);
  const [showCourseSearch, setShowCourseSearch] = useState(false);
  const [courseQuery, setCourseQuery] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [courseSearchLoading, setCourseSearchLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const expandedIframeRef = useRef<HTMLIFrameElement>(null);
  const editTrackerRef = useRef<EditTracker | null>(null);
  const WebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;
  const [scorecardView, setScorecardView] = useState<'holes' | 'summary' | 'grid'>('summary');
  const [holeFilter, setHoleFilter] = useState<'front' | 'back' | null>(null);
  const [expandedHoles, setExpandedHoles] = useState<Set<number>>(new Set());
  const [showPostTrialPrompt, setShowPostTrialPrompt] = useState(false);
  const [showMilestoneSheet, setShowMilestoneSheet] = useState(false);
  const { width, height } = useWindowDimensions();
  const { scorecardColorsEnabled } = useScorecardColorPreference();
  const isLandscape = width > height;
  const { isPremium, trialRoundsUsed, trialLimit } = useFeatureGate();
  const {
    statPreferences,
    roundSummaryText,
    firStats,
    girStats,
    firPct,
    girPct,
    isScoreOnlyRound,
    formatDate,
    getRoundPar,
    calculateToPar,
    holeNumbers,
    holesByNumber,
    getHolePlayed,
    formatFairway,
    formatGreen,
    formatApproachDistance,
    buildSummary,
    frontNumbers,
    backNumbers,
    frontHasPlayed,
    backHasPlayed,
    insights,
    scoring,
  } = useRoundDetailData({ round: currentRound, baselineRounds });

  useEffect(() => {
    const checkPostTrialPrompt = async () => {
      try {
        const shown = await Storage.getItem('@GolfSum:postTrialPromptShown');
        if (shown) return;
        const isPostTrialFree = !isPremium && trialRoundsUsed >= trialLimit;
        const isBasicRound = currentRound.entryMode === 'basic';
        if (isPostTrialFree && isBasicRound) {
          setShowPostTrialPrompt(true);
        }
      } catch {
        // no-op
      }
    };
    checkPostTrialPrompt();
  }, [currentRound.entryMode, isPremium, trialLimit, trialRoundsUsed]);

  useEffect(() => {
    if (milestoneEvent) {
      setShowMilestoneSheet(true);
    }
  }, [milestoneEvent]);

  const handleShareMilestone = async () => {
    if (!milestoneEvent) return;
    try {
      const uri = await milestoneShotRef.current?.capture?.();
      if (uri) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: milestoneEvent.headline });
          return;
        }
        await Share.share({ url: uri, message: milestoneEvent.shareCaption });
      }
    } catch {
      await Share.share({ message: milestoneEvent.shareCaption });
    }
  };

  const scorecardInjectedScript = `
    (function() {
      var applyColors = ${scorecardColorsEnabled ? 'true' : 'false'};
      var table = document.querySelector('table');
      if (!table) return true;
      var rows = table.querySelectorAll('tr');
      var parRow = null;
      var scoreRow = null;
      rows.forEach(function(row) {
        var firstCell = row.querySelector('td:first-child, th:first-child');
        var label = firstCell ? (firstCell.textContent || '').toLowerCase() : '';
        if (label.includes('par')) parRow = row;
        if (label.includes('score')) scoreRow = row;
      });
      if (!parRow || !scoreRow) return true;
      if (applyColors) {
        var style = document.createElement('style');
        style.textContent = '.score-par{color:#E5E7EB;font-weight:700}'+
          '.score-birdie{color:#EF4444;border:2px solid #EF4444;border-radius:999px;font-weight:700}'+
          '.score-eagle{color:#EF4444;border:2px solid #EF4444;border-radius:999px;font-weight:700;box-shadow:0 0 0 2px #EF4444 inset}'+
          '.score-bogey{color:#1D4ED8;border:2px solid #1D4ED8;border-radius:4px;font-weight:700}'+
          '.score-double{color:#6B7280;border:2px solid #6B7280;border-radius:4px;font-weight:700;box-shadow:0 0 0 2px #6B7280 inset}'+
          '.score-triple{color:#6B7280;border:2px solid #6B7280;border-radius:4px;font-weight:700;box-shadow:0 0 0 2px #6B7280 inset}';
        document.head.appendChild(style);
      }
      var parCells = parRow.querySelectorAll('td');
      var scoreCells = scoreRow.querySelectorAll('td');
      var minLen = Math.min(parCells.length, scoreCells.length);
      for (var i = 1; i < minLen; i++) {
        var parVal = parseInt((parCells[i].textContent || '').trim(), 10);
        var scoreVal = parseInt((scoreCells[i].textContent || '').trim(), 10);
        if (!isFinite(parVal) || !isFinite(scoreVal)) continue;
        var diff = scoreVal - parVal;
        scoreCells[i].classList.remove('score-par','score-birdie','score-eagle','score-bogey','score-double','score-triple');
        if (!applyColors) continue;
        if (diff <= -2) scoreCells[i].classList.add('score-eagle');
        else if (diff === -1) scoreCells[i].classList.add('score-birdie');
        else if (diff === 0) scoreCells[i].classList.add('score-par');
        else if (diff === 1) scoreCells[i].classList.add('score-bogey');
        else if (diff === 2) scoreCells[i].classList.add('score-double');
        else if (diff > 2) scoreCells[i].classList.add('score-triple');
      }
      return true;
    })();
  `;
  useEffect(() => {
    setShowPersonalBestModal(!!personalBests && personalBests.length > 0);
  }, [personalBests]);

  const handleSharePersonalBests = async () => {
    if (!personalBests || personalBests.length === 0) return;
    const lines = personalBests.map(record => {
      const previous = record.previousText ? ` (prev ${record.previousText})` : '';
      return `${record.title}: ${record.valueText}${previous}`;
    });
    const message = `New Personal Bests at ${formatCourseName(currentRound.courseName)}:\n${lines.join('\n')}`;
    try {
      await Share.share({ message });
    } catch (error) {
      logger.warn('Share failed:', error);
    }
  };

  useEffect(() => {
    let isMounted = true;
    getRounds()
      .then((rounds) => {
        if (isMounted) setBaselineRounds(rounds);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  const handleShare = async () => {
    try {
      Alert.alert(FEEDBACK_COPY.alerts.shareRoundTitle, FEEDBACK_COPY.alerts.shareRoundBody, [
        {
          text: 'Story (1080x1920)',
          onPress: () => shareRoundCard('story'),
        },
        {
          text: 'Square (1080x1080)',
          onPress: () => shareRoundCard('square'),
        },
        { text: FEEDBACK_COPY.actions.cancel, style: 'cancel' },
      ]);
    } catch (error) {
      // Share cancelled or failed
    }
  };

  const shareRoundCard = async (size: 'story' | 'square') => {
    try {
      const targetRef = size === 'story' ? storyShotRef : squareShotRef;
      await new Promise(resolve => setTimeout(resolve, 50));
      const uri = await targetRef.current?.capture?.();
      if (!uri) throw new Error('Failed to capture share card');

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share Round',
        });
        return;
      }

      await Share.share({ url: uri, message: 'GolfSum Round' });
    } catch (error) {
      logger.warn('Share card failed:', error);
      await Share.share({
        message: `${currentRound.courseName} - Score ${currentRound.score}`,
      });
    }
  };

  const handleEdit = () => {
    if (Platform.OS === 'web') {
      setScorecardExpanded(true);
      return;
    }
    Alert.alert(FEEDBACK_COPY.alerts.editOnWebTitle, FEEDBACK_COPY.alerts.editOnWebBody);
  };

  const handleDelete = () => {
    Alert.alert(
      FEEDBACK_COPY.modals.deleteRoundTitle,
      FEEDBACK_COPY.modals.deleteRoundFromHistoryBody,
      [
        { text: FEEDBACK_COPY.actions.cancel, style: 'cancel' },
        { text: FEEDBACK_COPY.actions.delete, style: 'destructive', onPress: async () => {
          await deleteRound(currentRound.id);
          onBack();
        } },
      ]
    );
  };
  const renderScoreBadge = (score?: number, par?: number) => {
    if (typeof score !== 'number' || typeof par !== 'number') {
      return <Text style={styles.scoreBadgeTextMuted}>—</Text>;
    }
    const diff = score - par;
    if (!scorecardColorsEnabled) {
      return <Text style={styles.scoreBadgeTextPar}>{score}</Text>;
    }
    if (diff === 0) {
      return <Text style={styles.scoreBadgeTextPar}>{score}</Text>;
    }
    const isCircle = diff <= -1;
    const isDouble = diff <= -2 || diff >= 2;
    const borderColor = diff <= -1 ? '#EF4444' : diff === 1 ? '#2563EB' : '#6B7280';
    return (
      <View style={[
        styles.scoreBadgeOuter,
        isCircle ? styles.scoreBadgeCircle : styles.scoreBadgeSquare,
        { borderColor }
      ]}>
        {isDouble && (
          <View style={[
            styles.scoreBadgeInner,
            isCircle ? styles.scoreBadgeCircle : styles.scoreBadgeSquare,
            { borderColor }
          ]} />
        )}
        <Text style={[styles.scoreBadgeText, { color: borderColor }]}>{score}</Text>
      </View>
    );
  };

  const toggleHoleExpanded = (holeNumber: number) => {
    setExpandedHoles(prev => {
      const next = new Set(prev);
      if (next.has(holeNumber)) {
        next.delete(holeNumber);
      } else {
        next.add(holeNumber);
      }
      return next;
    });
  };

  useEffect(() => {
    // Check if this round is used in the current handicap calculation
    const checkHandicapUsage = async () => {
      const allRounds = await getRounds();
      const details = getHandicapCalculationDetails(allRounds);
      setIsUsedForHandicap(details.roundIdsUsed.includes(round.id));
    };
    checkHandicapUsage();
  }, [round.id]);

  const handleHandicapInfoPress = () => {
    Alert.alert(
      'Rating status',
      currentRound.handicapStatus || 'Not used for player rating',
      [
        {
          text: 'Find course',
          onPress: () => setShowCourseSearch(true),
        },
        { text: FEEDBACK_COPY.actions.notNow, style: 'cancel' },
      ]
    );
  };

  const handleCourseSearch = async (query: string) => {
    setCourseQuery(query);
    if (query.trim().length < 3) {
      setCourseResults([]);
      return;
    }
    setCourseSearchLoading(true);
    try {
      const results = await searchCourses(query.trim());
      setCourseResults(results.slice(0, 6));
    } catch (error) {
      setCourseResults([]);
    } finally {
      setCourseSearchLoading(false);
    }
  };

  const handleCourseSelect = async (courseId: string) => {
    try {
      const course = await getCourseDetails(courseId);
      const teeMatchName = (currentRound.stats.teeBox || currentRound.courseSnapshot?.tee.name || '').toLowerCase();
      const tee =
        course.teeBoxes.find(t => t.name.toLowerCase() === teeMatchName)
        || course.teeBoxes[0];
      if (!tee) {
        Alert.alert(FEEDBACK_COPY.alerts.courseSelectedTitle, FEEDBACK_COPY.alerts.courseSelectedBody);
        return;
      }
      const updated: SavedRound = {
        ...currentRound,
        courseName: course.name,
        courseId: course.id,
        courseSource: CourseSource.API,
      stats: {
        ...currentRound.stats,
        teeBox: tee.name,
      },
      courseSnapshot: {
          courseId: course.id,
          name: course.name,
          location: {
            city: course.city,
            state: course.state,
            country: course.country,
            latitude: course.latitude,
            longitude: course.longitude,
          },
          holesCount: tee.holes.length,
          tee: {
            name: tee.name,
            yardageTotal: tee.yardage,
          },
          holes: tee.holes.map(hole => ({
            number: hole.hole,
            par: hole.par,
            yardage: hole.yardage,
            handicapIndex: hole.handicap,
          })),
          source: 'API',
          version: course.version,
          lastVerifiedAt: course.lastVerifiedAt,
        },
      };
      const saved = await updateRound(currentRound.id, updated);
      await updateHandicapFlags();
      if (saved) {
        setCurrentRound(saved);
        onRoundUpdated?.(saved);
      } else {
        setCurrentRound(updated);
      }
      setShowCourseSearch(false);
    } catch (error) {
      Alert.alert(FEEDBACK_COPY.alerts.courseLookupFailedTitle, FEEDBACK_COPY.alerts.courseLookupFailedBody);
    }
  };

  // Flash cell green to indicate saved
  const flashCell = (cell: HTMLElement) => {
    cell.style.backgroundColor = '#10B981';
    cell.style.color = '#fff';
    setTimeout(() => {
      cell.style.backgroundColor = '';
      cell.style.color = '';
    }, 500);
  };

  // Calculate and update row totals
  const recalculateRowTotals = (row: any) => {
    const cells: any[] = Array.from(row.querySelectorAll('td'));
    if (cells.length < 20) return;

    let front9Sum = 0;
    let back9Sum = 0;
    let outCell: any = null;
    let inCell: any = null;
    let totCell: any = null;

    cells.forEach((cell, index) => {
      const text = cell.textContent?.trim() || '';
      const num = parseInt(text);

      if (index >= 1 && index <= 9 && !isNaN(num)) {
        front9Sum += num;
      }
      if (index === 10) outCell = cell;
      if (index >= 12 && index <= 20 && !isNaN(num)) {
        back9Sum += num;
      }
      if (index === 21) inCell = cell;
      if (index === 22 || index === cells.length - 1) totCell = cell;
    });

    if (outCell && front9Sum > 0) {
      const oldOut = outCell.textContent?.trim();
      outCell.textContent = String(front9Sum);
      if (oldOut !== String(front9Sum)) flashCell(outCell);
    }

    if (inCell && back9Sum > 0) {
      const oldIn = inCell.textContent?.trim();
      inCell.textContent = String(back9Sum);
      if (oldIn !== String(back9Sum)) flashCell(inCell);
    }

    if (totCell && (front9Sum > 0 || back9Sum > 0)) {
      const oldTot = totCell.textContent?.trim();
      const newTot = front9Sum + back9Sum;
      totCell.textContent = String(newTot);
      if (oldTot !== String(newTot)) flashCell(totCell);
    }
  };

  // Set up edit tracking
  const setupEditTracking = (iframe: HTMLIFrameElement | null) => {
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;

    doc.addEventListener('focusin', (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.getAttribute('contenteditable') === 'true') {
        const row = target.closest('tr');
        const rowLabel = row?.querySelector('td:first-child')?.textContent || '';
        const cells = Array.from(row?.querySelectorAll('td') || []);
        const columnIndex = cells.indexOf(target.closest('td') as HTMLTableCellElement);
        
        editTrackerRef.current = {
          originalValue: target.textContent || '',
          startTime: Date.now(),
          rowLabel,
          columnIndex,
        };
      }
    });

    doc.addEventListener('focusout', async (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.getAttribute('contenteditable') === 'true' && editTrackerRef.current) {
        const newValue = target.textContent || '';
        const { originalValue, rowLabel, columnIndex } = editTrackerRef.current;

        if (originalValue !== newValue) {
          setHasUnsavedChanges(true);
          flashCell(target);

          const colIdx = columnIndex || 0;

          const row = target.closest('tr') as HTMLTableRowElement;
          const rowLabelLower = rowLabel.toLowerCase();
          const isNumericRow = !rowLabelLower.includes('fairway') && 
                               !rowLabelLower.includes('green') && 
                               !rowLabelLower.includes('up') && 
                               !rowLabelLower.includes('down');
          
          const isHoleColumn = (colIdx >= 1 && colIdx <= 9) || (colIdx >= 12 && colIdx <= 20);
          
          if (row && isNumericRow && isHoleColumn) {
            recalculateRowTotals(row);
          }

          const updatedHtml = doc.documentElement.outerHTML;
          setCurrentHtml(updatedHtml);
          await saveChanges(updatedHtml);
        }

        editTrackerRef.current = null;
      }
    });
  };

  const saveChanges = async (html: string) => {
    try {
      const newStats = parseHtmlForStats(html);
      
      const updatedStats: RoundStats = {
        ...currentRound.stats,
        ...(newStats.score !== undefined && { score: newStats.score }),
        ...(newStats.putts !== undefined && { putts: newStats.putts }),
        ...(newStats.fairways !== undefined && { fairways: newStats.fairways }),
        ...(newStats.greens !== undefined && { greens: newStats.greens }),
        ...(newStats.upDownMade !== undefined && { upDownMade: newStats.upDownMade }),
        ...(newStats.upDownAttempts !== undefined && { upDownAttempts: newStats.upDownAttempts }),
      };

      const updatedRound = await updateRound(currentRound.id, {
        html,
        score: newStats.score || currentRound.score,
        stats: updatedStats,
      });

      if (updatedRound) {
        setCurrentRound(updatedRound);
        setHasUnsavedChanges(false);
        onRoundUpdated?.(updatedRound);
      }
    } catch (error) {
      logger.error('Error saving changes:', error);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', () => setupEditTracking(iframe));
    }
    return () => {
      if (iframe) {
        iframe.removeEventListener('load', () => setupEditTracking(iframe));
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !scorecardExpanded) return;
    const iframe = expandedIframeRef.current;
    if (iframe) {
      const handleLoad = () => setupEditTracking(iframe);
      iframe.addEventListener('load', handleLoad);
      return () => iframe.removeEventListener('load', handleLoad);
    }
  }, [scorecardExpanded]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (isLandscape) {
      setScorecardView('grid');
    }
  }, [isLandscape, scorecardView]);

  const ratingText = typeof currentRound.differential === 'number'
    ? `${currentRound.adjustedGrossScore ? 'Round Rating' : 'Baseline Rating'}: ${currentRound.differential > 0 ? '+' : ''}${currentRound.differential.toFixed(1)}`
    : 'Course details unavailable';
  const weatherParts: string[] = [];
  if (currentRound.weather?.temp) weatherParts.push(currentRound.weather.temp);
  if (currentRound.weather?.conditions) weatherParts.push(currentRound.weather.conditions);
  if (currentRound.weather?.wind) weatherParts.push(`${currentRound.weather.wind} wind`);
  const metaLineParts = [`${currentRound.teeName || 'White'} Tees`, ...weatherParts];
  const rawCourseName = typeof currentRound.courseName === 'string' ? currentRound.courseName.trim() : '';
  const isCourseMissing = rawCourseName.length === 0 || rawCourseName.toLowerCase() === 'test';
  const normalizedScore = buildNormalizedScore(currentRound);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <PersonalBestModal
          visible={showPersonalBestModal}
          personalBests={personalBests || []}
          onShare={handleSharePersonalBests}
          onContinue={() => {
            setShowPersonalBestModal(false);
            onDismissPersonalBests?.();
          }}
          styles={styles}
        />
        {showMilestoneSheet && milestoneEvent && (
          <View style={styles.milestoneOverlay}>
            <View style={styles.milestoneSheet}>
              <MilestoneShareCard event={milestoneEvent} />
              <View style={styles.milestoneActions}>
                <TouchableOpacity style={styles.milestoneShareButton} onPress={handleShareMilestone}>
                  <Ionicons name="share-outline" size={16} color="#0f1419" />
                  <Text style={styles.milestoneShareText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.milestoneDismissButton}
                  onPress={() => {
                    setShowMilestoneSheet(false);
                    onDismissMilestone?.();
                  }}
                >
                  <Text style={styles.milestoneDismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      <RoundHeader
        onBack={onBack}
        onEdit={handleEdit}
        onShare={handleShare}
        onDelete={handleDelete}
      />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <RoundSummaryCard
          round={currentRound}
          metaLine={metaLineParts.join(' | ')}
          roundSummaryText={roundSummaryText}
          ratingText={ratingText}
          isUsedForHandicap={isUsedForHandicap}
          statPreferences={statPreferences}
          firLabel={firStats ? `${firStats.hit}/${firStats.possible} (${firPct}%)` : null}
          girLabel={girStats ? `${girStats.hit}/${girStats.possible} (${girPct}%)` : null}
          isScoreOnlyRound={isScoreOnlyRound}
          formatDate={(date) => formatDate(date instanceof Date ? date : new Date(date))}
          onHandicapInfoPress={handleHandicapInfoPress}
          onFindCoursePress={() => setShowCourseSearch(true)}
          onCoursePress={
            onViewCourseStats && !isCourseMissing
              ? () => onViewCourseStats(rawCourseName)
              : undefined
          }
        />
        {normalizedScore?.significant && (
          <View style={styles.conditionsContext}>
            <Ionicons name="partly-sunny-outline" size={14} color="#9CA3AF" />
            <Text style={styles.conditionsContextText}>
              {normalizedScore.note}. Equivalent to ~{normalizedScore.normalizedScore} in normal conditions.
            </Text>
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  'Conditions-Normalized Score',
                  'Estimated equivalent score if conditions were calm and mild. Does not affect your player rating.'
                )
              }
            >
              <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}
        {showPostTrialPrompt && (
          <View style={styles.postTrialCard}>
            <Text style={styles.postTrialTitle}>With Advanced Scoring, this round would also show:</Text>
            <Text style={styles.postTrialBullet}>• Fairway direction (left/right miss trend)</Text>
            <Text style={styles.postTrialBullet}>• GIR misses (short/long/left/right)</Text>
            <Text style={styles.postTrialBullet}>• Club performance updates</Text>
            <Text style={styles.postTrialBullet}>Round tips from your saved rounds</Text>
            <View style={styles.postTrialActions}>
              <TouchableOpacity
                onPress={async () => {
                  await Storage.setItem('@GolfSum:postTrialPromptShown', 'true');
                  setShowPostTrialPrompt(false);
                  onNavigateToProfile?.();
                }}
              >
                <Text style={styles.postTrialUpgradeLink}>See full stat tracking</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  await Storage.setItem('@GolfSum:postTrialPromptShown', 'true');
                  setShowPostTrialPrompt(false);
                }}
              >
                <Text style={styles.postTrialDismissLink}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={styles.shareButtonRow}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share round"
          >
            <Ionicons name="share-outline" size={18} color={colors.brand.primary} />
            <Text style={styles.shareButtonText}>Share Round</Text>
          </TouchableOpacity>
        </View>
        {isCourseMissing && (
          <View style={styles.assignCourseCard}>
            <Text style={styles.assignCourseText}>No course assigned to this round.</Text>
            <TouchableOpacity
              style={styles.assignCourseButton}
              onPress={() => setShowCourseSearch(true)}
              accessibilityRole="button"
              accessibilityLabel="Assign course"
            >
              <Ionicons name="search-outline" size={16} color="#10B981" />
              <Text style={styles.assignCourseButtonText}>Assign Course</Text>
            </TouchableOpacity>
          </View>
        )}

        <RoundInsightsCard insights={insights} />

        {currentRound.roundTiming ? (
          <View style={styles.timingBlock}>
            <View style={styles.timingRow}>
              <View style={styles.timingItem}>
                <Text style={styles.timingLabel}>On course</Text>
                <Text style={styles.timingValue}>
                  {formatDuration(currentRound.roundTiming.totalElapsedMs)}
                </Text>
              </View>
              {currentRound.roundTiming.pausedMs > 60000 ? (
                <View style={styles.timingItem}>
                  <Text style={styles.timingLabel}>Play time</Text>
                  <Text style={styles.timingValue}>
                    {formatDuration(currentRound.roundTiming.playedMs)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.timingItem}>
                <Text style={styles.timingLabel}>Avg / hole</Text>
                <Text style={styles.timingValue}>
                  {formatDuration(currentRound.roundTiming.avgPerHoleMs)}
                </Text>
              </View>
            </View>
            {currentRound.roundTiming.pausedMs > 60000 ? (
              <View style={styles.timingDelayRow}>
                <Ionicons name="rainy-outline" size={12} color="rgba(255,255,255,0.4)" />
                <Text style={styles.timingDelayText}>
                  {formatDuration(currentRound.roundTiming.pausedMs)} delay
                  {currentRound.roundTiming.resumedNextDay ? ' · resumed next day' : ''}
                  {currentRound.roundTiming.pauseEvents?.some((p) => p.isEstimated) ? ' (estimated)' : ''}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <ScoringDistribution
          eagles={scoring.eagles}
          birdies={scoring.birdies}
          pars={scoring.pars}
          bogeys={scoring.bogeys}
          doubles={scoring.doubles}
          scorecardColorsEnabled={scorecardColorsEnabled}
        />

        <ScorecardSection
          isWeb={Platform.OS === 'web'}
          currentHtml={currentHtml}
          scorecardImageUri={currentRound.imageUri}
          iframeRef={iframeRef}
          onExpand={() => setScorecardExpanded(true)}
          WebView={WebView}
          scorecardInjectedScript={scorecardInjectedScript}
          scorecardView={scorecardView}
          onScorecardViewChange={setScorecardView}
          holeFilter={holeFilter}
          onHoleFilterChange={setHoleFilter}
          buildSummary={buildSummary}
          frontNumbers={frontNumbers}
          backNumbers={backNumbers}
          frontHasPlayed={frontHasPlayed}
          backHasPlayed={backHasPlayed}
          statPreferences={statPreferences}
          holeNumbers={holeNumbers}
          holesByNumber={holesByNumber}
          getHolePlayed={getHolePlayed}
          expandedHoles={expandedHoles}
          toggleHoleExpanded={toggleHoleExpanded}
          renderScoreBadge={renderScoreBadge}
          formatFairway={formatFairway}
          formatGreen={formatGreen}
          formatApproachDistance={formatApproachDistance}
          isLandscape={isLandscape}
          height={height}
          puttColorResolver={(putts, gir) => getPuttColor(putts, gir, scorecardColorsEnabled)}
        />

        <TotalScoreFooter
          score={currentRound.score}
          toPar={calculateToPar()}
          roundPar={getRoundPar() ?? 72}
        />
      </ScrollView>

      <View style={styles.shareCardCapture}>
        <ViewShot
          ref={storyShotRef}
          options={{ format: 'png', quality: 1 }}
          style={{ width: 1080, height: 1920 }}
        >
          <ShareRoundCard round={currentRound} size="story" />
        </ViewShot>
        <ViewShot
          ref={squareShotRef}
          options={{ format: 'png', quality: 1 }}
          style={{ width: 1080, height: 1080 }}
        >
          <ShareRoundCard round={currentRound} size="square" />
        </ViewShot>
        {milestoneEvent && (
          <ViewShot
            ref={milestoneShotRef}
            options={{ format: 'png', quality: 1 }}
            style={{ width: 1080, height: 1080 }}
          >
            <MilestoneShareCard event={milestoneEvent} />
          </ViewShot>
        )}
      </View>

      <CourseSearchModal
        visible={showCourseSearch}
        query={courseQuery}
        loading={courseSearchLoading}
        results={courseResults}
        onQueryChange={handleCourseSearch}
        onSelect={handleCourseSelect}
        onClose={() => setShowCourseSearch(false)}
        styles={styles}
      />

      {Platform.OS === 'web' && (
        <ExpandedScorecardModal
          visible={scorecardExpanded}
          currentHtml={currentHtml}
          onClose={() => setScorecardExpanded(false)}
          styles={styles}
          iframeRef={expandedIframeRef}
          webStyles={webStyles}
        />
      )}
      </View>
    </SafeAreaView>
  );
};

const webStyles: { [key: string]: React.CSSProperties } = {
  expandedIframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    backgroundColor: colors.text.inverse,
  },
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  milestoneOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 200,
    justifyContent: 'flex-end',
    padding: 16,
  },
  milestoneSheet: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
    gap: 12,
  },
  milestoneActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  milestoneShareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  milestoneShareText: {
    color: '#0f1419',
    fontWeight: '700',
    fontSize: 13,
  },
  milestoneDismissButton: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#1F2937',
  },
  milestoneDismissText: {
    color: '#D1D5DB',
    fontWeight: '600',
    fontSize: 13,
  },
  conditionsContext: {
    marginTop: 8,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  conditionsContextText: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 17,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bg.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.bg.elevated,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    minHeight: 44,
  },
  backText: {
    ...typography.bodyMd,
    color: colors.text.secondary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Content
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  timingBlock: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  timingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  timingItem: {
    flex: 1,
    minWidth: 0,
  },
  timingLabel: {
    color: colors.text.tertiary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  timingValue: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  timingDelayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  timingDelayText: {
    color: colors.text.secondary,
    fontSize: 12,
    flex: 1,
  },
  shareButtonRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
  },
  shareButtonText: {
    ...typography.bodySm,
    color: colors.brand.primary,
    fontWeight: '600',
  },
  shareCardCapture: {
    position: 'absolute',
    left: -2000,
    top: 0,
    opacity: 0,
    pointerEvents: 'none',
  },

  // Summary Card
  summaryMetricCard: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  summaryLeft: {
    flex: 1,
  },
  courseName: {
    ...typography.displaySm,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  dateText: {
    ...typography.bodyMd,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  roundSummaryText: {
    ...typography.bodySm,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    ...typography.bodySm,
    color: colors.text.tertiary,
  },
  metaDot: {
    ...typography.bodySm,
    color: colors.text.tertiary,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.brand.primary,
    lineHeight: 56,
  },
  ratingText: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  whsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brand.primaryMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
  },
  whsBadgeNotUsed: {
    backgroundColor: `${colors.text.tertiary}1A`,
    borderColor: `${colors.text.tertiary}4D`,
  },
  whsBadgeCustom: {
    backgroundColor: `${colors.semantic.info}1A`,
    borderColor: `${colors.semantic.info}4D`,
  },
  shotgunRoundBadge: {
    backgroundColor: `${colors.semantic.warning}1A`,
    borderColor: `${colors.semantic.warning}4D`,
  },
  incompleteRoundBadge: {
    backgroundColor: `${colors.text.secondary}1A`,
    borderColor: `${colors.text.secondary}4D`,
  },
  notEligibleBadge: {
    backgroundColor: `${colors.text.secondary}1A`,
    borderColor: `${colors.text.secondary}4D`,
  },
  whsBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand.primary,
  },
  whsBadgeTextNotUsed: {
    color: colors.text.secondary,
  },
  whsBadgeTextCustom: {
    color: colors.semantic.info,
  },
  shotgunRoundText: {
    color: colors.semantic.warning,
  },
  incompleteRoundText: {
    color: colors.text.secondary,
  },
  notEligibleText: {
    color: colors.text.secondary,
  },
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.bg.elevated,
    paddingTop: spacing.lg,
    marginTop: spacing.lg,
  },
  noStatsContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.bg.elevated,
    marginTop: spacing.lg,
  },
  noStatsText: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  scoreOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.bg.elevated,
    marginTop: spacing.md,
  },
  scoreOnlyText: {
    flex: 1,
    ...typography.bodySm,
    color: colors.text.secondary,
  },
  scoreBadgeOuter: {
    minWidth: 28,
    height: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadgeInner: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderWidth: 2,
  },
  scoreBadgeCircle: {
    borderRadius: 999,
  },
  scoreBadgeSquare: {
    borderRadius: 4,
  },
  scoreBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  scoreBadgeTextPar: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  scoreBadgeTextMuted: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
  },
  statPillValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  statPillLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
  },

  // Insights
  insightsSection: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  insightPositive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  insightWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    color: '#E5E7EB',
  },

  // Distribution
  distributionSection: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  distributionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreBox: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  scoreBoxInner: {
    width: '100%',
    height: 56,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 6,
  },
  scoreBoxCount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scoreBoxLabel: {
    fontSize: 11,
    color: '#6B7280',
  },

  // Scorecard
  scorecardSection: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  scorecardTabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  scorecardTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1a2028',
    alignItems: 'center',
  },
  scorecardTabActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  scorecardTabText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  scorecardTabTextActive: {
    color: '#10B981',
  },
  scorecardTabTextSecondary: {
    color: '#6B7280',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  expandButtonText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
  },
  scorecardPreview: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 12,
  },
  holeList: {
    marginTop: 4,
    gap: 8,
  },
  holeFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  holeFilterActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  holeFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  holeFilterClear: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  holeRow: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 64,
    borderWidth: 1,
    borderColor: '#374151',
  },
  holeRowMuted: {
    backgroundColor: '#141a23',
    borderColor: '#2f3642',
  },
  holeHeader: {
    fontSize: 13,
    color: '#E5E7EB',
    fontWeight: '600',
    marginBottom: 6,
  },
  holeStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  holeStatBlock: {
    minWidth: '22%',
  },
  holeStatLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  holeStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  holeStatValuePrimary: {
    fontSize: 26,
    fontWeight: '700',
    color: '#10B981',
  },
  holeExpanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2f3642',
    gap: 8,
  },
  holeExpandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  holeExpandedLabel: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  holeExpandedValue: {
    fontSize: 14,
    color: '#E5E7EB',
    fontWeight: '600',
  },
  summaryList: {
    gap: 12,
    marginTop: 4,
  },
  summaryCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryStatText: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  summaryEmptyText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  personalBestOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 20, 25, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  personalBestCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
  },
  personalBestTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 16,
  },
  personalBestList: {
    gap: 12,
    marginBottom: 16,
  },
  personalBestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  personalBestLabel: {
    flex: 1,
    fontSize: 14,
    color: '#E5E7EB',
    fontWeight: '600',
  },
  personalBestValue: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  personalBestActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  personalBestShare: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  personalBestShareText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  personalBestContinue: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  personalBestContinueText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f1419',
  },
  gridContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    marginTop: 4,
    opacity: 0.8,
  },
  gridHint: {
    fontSize: 12,
    color: '#9CA3AF',
    padding: 12,
  },
  gridWebView: {
    width: '100%',
    height: 420,
    backgroundColor: '#fff',
  },
  scorecardWebView: {
    width: '100%',
    height: 280,
    backgroundColor: '#fff',
  },
  webviewNote: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    padding: 40,
  },
  scorecardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overlayHintText: {
    fontSize: 13,
    color: '#FFFFFF',
  },
  editHint: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 10,
  },
  assignCourseCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  assignCourseText: {
    fontSize: 13,
    color: '#9CA3AF',
    flex: 1,
  },
  assignCourseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  assignCourseButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },

  // Total Footer
  totalFooter: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  totalLeft: {},
  totalLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 42,
    fontWeight: '800',
    color: '#10B981',
  },
  totalRight: {
    alignItems: 'flex-end',
  },
  totalDiff: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 2,
  },
  totalVsPar: {
    fontSize: 12,
    color: '#6B7280',
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,20,25,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  ratingModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  courseModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalTitleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#E5E7EB',
    marginBottom: 10,
    backgroundColor: '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalButtonPrimary: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalButtonPrimaryText: {
    color: '#0f1419',
    fontWeight: '700',
  },
  modalButtonSecondary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalButtonSecondaryText: {
    color: '#E5E7EB',
    fontWeight: '600',
  },
  courseResult: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2f3642',
  },
  courseResultName: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  courseResultMeta: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  emptyResults: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  expandedWebView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    alignItems: 'center',
  },
  modalHint: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  postTrialCard: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f3f38',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  postTrialTitle: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  postTrialBullet: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  postTrialActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postTrialUpgradeLink: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
  },
  postTrialDismissLink: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Common
  textGreen: {
    color: '#10B981',
  },
  textRed: {
    color: '#E07575',
  },
  textGray: {
    color: '#9CA3AF',
  },
});
