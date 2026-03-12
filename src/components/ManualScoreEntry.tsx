import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Share,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CourseDetails, TeeBox } from '../services/golfCourseApiService';
import { saveRound, calculateHandicapIndex } from '../services/roundsService';
import { processIncompleteRound, process9HoleRound, meetsWHSMinimum } from '../services/whsCalculations';
import { fetchLocalWeather, getCurrentWeather, WeatherData as LocalWeatherData } from '../services/weatherService';
import type { PendingGpsRoundData, SavedRound, RoundHole } from '../types';
import { getStatPreferencesFromProfile } from '../utils/statPreferences';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { TrialBanner } from './TrialBanner';
import type { UpgradeTrigger } from './UpgradeSheet';
import Storage from '../services/storage';
import { ScoreEntryHeader } from './score-entry/ScoreEntryHeader';
import { TeeSelectionModal } from './score-entry/TeeSelectionModal';
import { StartingHolePickerModal } from './score-entry/StartingHolePickerModal';
import { CourseRoutingModal, type CourseRouteOption } from './score-entry/CourseRoutingModal';
import { ClubPickerModal } from './score-entry/ClubPickerModal';
import { ApproachDistancePickerModal } from './score-entry/ApproachDistancePickerModal';
import { PenaltySheet } from './score-entry/PenaltySheet';
import { HoleOverviewChips } from './score-entry/HoleOverviewChips';
import { HoleScoreCard } from './score-entry/HoleScoreCard';
import { QuickScoreMode } from './score-entry/QuickScoreMode';
import { MiniScorecard } from './score-entry/MiniScorecard';
import { FullScorecardModal } from './score-entry/FullScorecardModal';
import { PreRoundSplash } from './score-entry/PreRoundSplash';
import { LeaveRoundModal } from './score-entry/LeaveRoundModal';
import { EndRoundReasonModal } from './score-entry/EndRoundReasonModal';
import { DiscardRoundModal } from './score-entry/DiscardRoundModal';
import { RoundProgress } from './score-entry/RoundProgress';
import { QuickActions } from './score-entry/QuickActions';
import { CollapsibleSection } from './score-entry/CollapsibleSection';
import { useScoreEntryProfile } from './score-entry/hooks/useScoreEntryProfile';
import { useScoreEntryCourse } from './score-entry/hooks/useScoreEntryCourse';
import { useScoreEntryState } from './score-entry/hooks/useScoreEntryState';
import {
  APPROACH_DISTANCE_BUCKETS,
  ApproachDistance,
  FIRResult,
  GIRResult,
  HoleScore,
} from './score-entry/types';
import { buildCourseSnapshot } from './score-entry/scoreEntryUtils';
import { clearInProgressRound, InProgressRoundDraft } from '../services/inProgressRoundService';
import { useHoleNotes } from './score-entry/hooks/useHoleNotes';
import { useRoundContext } from './score-entry/hooks/useRoundContext';
import { useRoundSave } from './score-entry/hooks/useRoundSave';
import { logger } from '../utils/logger';
import { styles } from './score-entry/ManualScoreEntry.styles';
import { formatYardage, getYardageUnitLabel, type DistanceUnit } from '../utils/distance';
import { FEEDBACK_COPY } from '../constants/feedbackCopy';
import { calculateLiveRoundStats, LiveRoundStats } from '../utils/liveRoundStats';
import { buildHoleQualityRead, HoleQualityRead } from '../utils/holeQualityRead';
import { buildComebackAnalysis, ComebackAnalysis } from '../utils/comebackTracker';
import { buildGhostComparison, GhostComparison } from '../services/ghostRoundService';

const TEE_CLUB_OPTIONS = [
  'Driver',
  '3 Wood',
  '5 Wood',
  '7 Wood',
  'Hybrid',
  '2 Iron',
  '3 Iron',
  '4 Iron',
  '5 Iron',
  '6 Iron',
  '7 Iron',
  '8 Iron',
  '9 Iron',
  'PW',
  'GW',
  'SW',
  'LW',
];

const APPROACH_CLUB_OPTIONS = [...TEE_CLUB_OPTIONS, 'PW', 'GW', 'SW', 'LW'];

const KNOWN_COURSE_NINES: Record<string, string[]> = {
  'tubac golf resort': ['Anza', 'Rancho', 'Otero'],
  'tubac golf resort & spa': ['Anza', 'Rancho', 'Otero'],
  'cinnabar hills golf club': ['Canyon', 'Lake', 'Mountain'],
};

const getKnownNineNames = (courseName?: string): string[] => {
  const normalized = (courseName || '').toLowerCase().trim();
  if (!normalized) return [];
  const direct = KNOWN_COURSE_NINES[normalized];
  if (direct) return direct;
  const fuzzyKey = Object.keys(KNOWN_COURSE_NINES).find((key) => normalized.includes(key));
  return fuzzyKey ? KNOWN_COURSE_NINES[fuzzyKey] : [];
};

interface ManualScoreEntryProps {
  courseId: string;
  onBack: () => void;
  onRoundSaved: (round: SavedRound) => void;
  onNavigateToProfile?: (trigger: UpgradeTrigger) => void;
  courseOverride?: CourseDetails;
  quickStart?: {
    teeName?: string;
    startingHole?: number;
  };
  resumeDraft?: InProgressRoundDraft | null;
  gpsRoundData?: PendingGpsRoundData | null;
}


export const ManualScoreEntry: React.FC<ManualScoreEntryProps> = ({
  courseId,
  onBack,
  onRoundSaved,
  onNavigateToProfile,
  courseOverride,
  quickStart,
  resumeDraft,
  gpsRoundData,
}) => {
  const ACTION_ICON_SIZE = 18;
  const [isSaving, setIsSaving] = useState(false);
  const [showTeeSelection, setShowTeeSelection] = useState(true);
  const [showFullScorecard, setShowFullScorecard] = useState(false);
  const [eventTag, setEventTag] = useState<string>('');
  const [showStartingHolePicker, setShowStartingHolePicker] = useState(false);
  const { userProfile, clubDistances, viewMode } = useScoreEntryProfile();
  const {
    course,
    isLoading,
    isFavorite,
    courseElevationFt,
    toggleFavorite,
  } = useScoreEntryCourse({
    courseId,
    courseOverride,
    onBack,
    onShowTeeSelection: setShowTeeSelection,
  });
  const {
    selectedTeeBox,
    holes,
    setHoles,
    startingHole,
    setStartingHole,
    startType,
    setStartType,
    currentHole,
    setCurrentHole,
    goToHole,
    nextHole,
    prevHole,
    firstHoleIndex,
    lastHoleIndex,
    handleTeeBoxSelected,
  } = useScoreEntryState({
    course,
    courseId,
    quickStart,
    gpsRoundData,
    defaultTeeName: userProfile?.coursePreferences?.favoriteTee,
    resumeDraft,
    showTeeSelection,
    setShowTeeSelection,
    courseOverride,
  });
  const [showTeeClubPicker, setShowTeeClubPicker] = useState(false);
  const [showApproachDistancePicker, setShowApproachDistancePicker] = useState(false);
  const [penaltySheetVisible, setPenaltySheetVisible] = useState(false);
  const [shotDetailsExpanded, setShotDetailsExpanded] = useState(true);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('yards');
  const { isPremium, canAccess, inTrial, trialRoundsUsed, trialLimit } = useFeatureGate();
  const rawStatPreferences = getStatPreferencesFromProfile(userProfile);

  // Trial users + premium: full stats. Free users (post-trial): score + putts only.
  const hasStatAccess = canAccess('gir');
  const statPreferences = hasStatAccess
    ? rawStatPreferences
    : {
        ...rawStatPreferences,
        fir: false,
        gir: false,
        scrambling: false,
        penalties: false,
        bunkers: false,
      };
  const holeCount = holes.length;

  const [showApproachClubPicker, setShowApproachClubPicker] = useState(false);
  const [showRoutingModal, setShowRoutingModal] = useState(false);
  const [routingTeeBox, setRoutingTeeBox] = useState<TeeBox | null>(null);
  const [routingOptions, setRoutingOptions] = useState<CourseRouteOption[]>([]);
  const [showLeaveRoundModal, setShowLeaveRoundModal] = useState(false);
  const [showEndRoundModal, setShowEndRoundModal] = useState(false);
  const [showDiscardConfirmModal, setShowDiscardConfirmModal] = useState(false);
  const [endRoundReason, setEndRoundReason] = useState<'finished-early' | 'nine-holes' | 'weather' | 'practice' | 'other' | null>(null);
  const [currentWeather, setCurrentWeather] = useState<LocalWeatherData | null>(null);
  const [showPreRoundTip, setShowPreRoundTip] = useState(true);
  const [showWeatherTip, setShowWeatherTip] = useState(true);
  const [windDirection, setWindDirection] = useState<'into' | 'helping' | 'cross-l' | 'cross-r' | 'swirling' | 'calm'>('calm');
  const [weatherFront9, setWeatherFront9] = useState<LocalWeatherData | null>(null);
  const [weatherBack9, setWeatherBack9] = useState<LocalWeatherData | null>(null);
  const [showTurnWeatherPrompt, setShowTurnWeatherPrompt] = useState(false);
  const [entryMode, setEntryMode] = useState<'detailed' | 'quick'>('detailed');
  const [miniScorecardExpanded, setMiniScorecardExpanded] = useState(false);
  const [showPreRoundSplash, setShowPreRoundSplash] = useState(true);
  const holeScrollViewRef = useRef<ScrollView>(null);
  const quickAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holeReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstSaveTimestampRef = useRef<number | null>(null);
  const lastSaveTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gpsRoundData?.startedAt) return;
    firstSaveTimestampRef.current = gpsRoundData.startedAt;
    lastSaveTimestampRef.current = gpsRoundData.endedAt || gpsRoundData.startedAt;
  }, [gpsRoundData]);
  const holeReadOpacity = useRef(new Animated.Value(0)).current;
  const [holeRead, setHoleRead] = useState<HoleQualityRead | null>(null);

  const activeHoleNumber = holes?.[currentHole]?.hole ?? null;
  const {
    holeNotes,
    holeNotesExpanded,
    setHoleNotesExpanded,
    holeNoteDraft,
    setHoleNoteDraft,
    handleSaveHoleNote,
  } = useHoleNotes(courseId, activeHoleNumber);

  const {
    historicalRounds,
    scorePrediction,
    ghostRound,
    historicalBaseline,
    preRoundTip,
    weatherContextTip,
    caddieNote,
    caddieNoteLabel,
  } = useRoundContext({
    courseId,
    selectedTeeBox,
    showTeeSelection,
    currentWeather,
  });

  const {
    calculateStats,
    saveIncompleteRound,
    handleSaveRound,
    saveRoundData,
    generateScorecardHTML,
    copyScorecardHTML,
  } = useRoundSave({
    course,
    selectedTeeBox,
    courseOverride,
    courseElevationFt,
    holes,
    currentHole,
    startType,
    startingHole,
    eventTag,
    statPreferences,
    hasStatAccess,
    entryMode,
    userProfile,
    distanceUnit,
    currentWeather,
    setCurrentWeather,
    weatherFront9,
    weatherBack9,
    windDirection,
    gpsRoundData,
    onRoundSaved,
    setIsSaving,
    firstSaveTimestampRef,
    lastSaveTimestampRef,
  });

  useEffect(() => {
    loadWeather();
  }, [courseId, courseOverride]);

  useEffect(() => {
    if (!course || currentWeather) return;
    if (course.latitude === undefined || course.longitude === undefined) return;
    loadWeather();
  }, [course, currentWeather]);

  useEffect(() => {
    if (selectedTeeBox && holes.length > 0) {
      setShowPreRoundSplash(true);
    }
  }, [selectedTeeBox?.name, holes.length]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (quickAdvanceTimeoutRef.current) {
        clearTimeout(quickAdvanceTimeoutRef.current);
        quickAdvanceTimeoutRef.current = null;
      }
      if (holeReadTimeoutRef.current) {
        clearTimeout(holeReadTimeoutRef.current);
        holeReadTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    Storage.getItem('@GolfSum:expandedSections')
      .then(value => {
        if (!value) return;
        const parsed = JSON.parse(value) as { shotDetails?: boolean };
        if (typeof parsed.shotDetails === 'boolean') {
          setShotDetailsExpanded(parsed.shotDetails);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    Storage.setItem('@GolfSum:expandedSections', JSON.stringify({ shotDetails: shotDetailsExpanded }))
      .catch(() => undefined);
  }, [shotDetailsExpanded]);

  useEffect(() => {
    Storage.getItem('distanceUnit')
      .then((value) => {
        if (value === 'yards' || value === 'meters') {
          setDistanceUnit(value);
        }
      })
      .catch(() => undefined);
  }, []);

  const loadWeather = async () => {
    const courseLat = course?.latitude ?? courseOverride?.latitude;
    const courseLon = course?.longitude ?? courseOverride?.longitude;
    const weather = courseLat !== undefined && courseLon !== undefined
      ? await getCurrentWeather(courseLat, courseLon)
      : await fetchLocalWeather();
    if (weather) {
      setCurrentWeather(weather);
      if (weather.wind === 'Calm' || weather.wind === 'Light') {
        setWindDirection('calm');
      }
    }
  };

  const handleStartRound = () => {
    setWeatherFront9(currentWeather);
    setWeatherBack9(null);
    setShowPreRoundSplash(false);
  };

  const refreshBackNineWeather = async () => {
    const courseLat = course?.latitude ?? courseOverride?.latitude;
    const courseLon = course?.longitude ?? courseOverride?.longitude;
    const weather = courseLat !== undefined && courseLon !== undefined
      ? await getCurrentWeather(courseLat, courseLon)
      : await fetchLocalWeather();
    if (weather) {
      setCurrentWeather(weather);
      setWeatherBack9(weather);
      if (weather.wind === 'Calm' || weather.wind === 'Light') {
        setWindDirection('calm');
      }
    }
    setShowTurnWeatherPrompt(false);
  };

  // Auto-scroll hole chips when current hole changes
  useEffect(() => {
    if (holeScrollViewRef.current && holes.length > 0) {
      // Calculate position to center the current hole chip
      const chipWidth = 34; // 28 width + 6 margin
      const scrollPosition = Math.max(0, currentHole * chipWidth - 50);
      
      holeScrollViewRef.current.scrollTo({
        x: scrollPosition,
        animated: true,
      });
    }
  }, [currentHole, holes.length]);

  const handleTeeSelection = (teeBox: TeeBox) => {
    if (!teeBox || !teeBox.holes || teeBox.holes.length === 0) {
      Alert.alert('Error', 'Selected tee box has no hole data');
      return;
    }

    const totalHoles = teeBox.holes.length;
    if (totalHoles <= 18) {
      handleTeeBoxSelected(teeBox);
      return;
    }

    const chunks: Array<{ id: string; label: string; holes: typeof teeBox.holes; nineName?: string }> = [];
    const knownNames = getKnownNineNames(course?.name);
    for (let i = 0; i < teeBox.holes.length; i += 9) {
      const nine = teeBox.holes.slice(i, i + 9);
      if (nine.length === 9) {
        const start = nine[0]?.hole ?? i + 1;
        const end = nine[8]?.hole ?? i + 9;
        const fromHoleData = nine
          .map((h) => h.nineName?.trim())
          .find((value): value is string => !!value);
        const knownName = knownNames[Math.floor(i / 9)];
        const nineName = fromHoleData || knownName;
        const prefix = nineName ? `${nineName} • ` : '';
        chunks.push({
          id: `n-${i / 9 + 1}`,
          label: `${prefix}9 holes: ${start}-${end}`,
          holes: nine,
          nineName,
        });
      }
    }

    const routes: CourseRouteOption[] = [];
    chunks.forEach((chunk) => {
      routes.push({
        id: chunk.id,
        label: chunk.label,
        holes: chunk.holes,
      });
    });

    for (let i = 0; i < chunks.length; i += 1) {
      for (let j = i + 1; j < chunks.length; j += 1) {
        const start = chunks[i].holes[0]?.hole ?? 1;
        const end = chunks[j].holes[8]?.hole ?? 18;
        const pairName =
          chunks[i].nineName && chunks[j].nineName
            ? `${chunks[i].nineName} + ${chunks[j].nineName} • `
            : '';
        routes.push({
          id: `pair-${i + 1}-${j + 1}`,
          label: `${pairName}18 holes: ${start}-${end}`,
          holes: [...chunks[i].holes, ...chunks[j].holes],
        });
      }
    }

    if (routes.length === 0) {
      Alert.alert('Routing unavailable', 'This course does not expose enough hole detail to choose custom 9s.');
      handleTeeBoxSelected(teeBox);
      return;
    }

    setRoutingTeeBox(teeBox);
    setRoutingOptions(routes);
    setShowRoutingModal(true);
  };

  const handleRoutingSelected = (route: CourseRouteOption) => {
    if (!routingTeeBox) return;
    const routedHoles = route.holes.map((hole, index) => ({
      ...hole,
      hole: index + 1,
    }));
    const routedTee: TeeBox = {
      ...routingTeeBox,
      name: `${routingTeeBox.name} • ${route.label}`,
      holes: routedHoles,
      yardage: routedHoles.reduce((sum, hole) => sum + (hole.yardage || 0), 0),
    };
    setShowRoutingModal(false);
    if (startingHole > routedHoles.length) {
      setStartingHole(1);
    }
    handleTeeBoxSelected(routedTee);
  };


  /**
   * Handle back button press with confirmation modal
   * CRITICAL: Never discard round data without explicit confirmation
   */
  const handleBackPress = () => {
    // Special case: Hole 1, no data entered yet
    if (currentHole === 0 && !holes[0].score && !holes[0].isSaved) {
      // Show simplified "Change Course" modal
      Alert.alert(
        'Wrong course?',
        "You haven't started scoring yet.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Change Course',
            onPress: () => {
              // Safe to go back - no data loss
              onBack();
            },
          },
        ]
      );
      return;
    }

    // In-progress round: Show blocking confirmation modal
    setShowLeaveRoundModal(true);
  };

  /**
   * Handle "End Round" action from modal
   */
  const handleEndRound = () => {
    setShowLeaveRoundModal(false);
    setShowEndRoundModal(true);
  };

  /**
   * Handle "Discard Round" action from modal
   */
  const handleDiscardRound = () => {
    setShowLeaveRoundModal(false);
    setShowDiscardConfirmModal(true);
  };

  /**
   * Confirm discard - permanent deletion
   */
  const handleConfirmDiscard = () => {
    setShowDiscardConfirmModal(false);
    clearInProgressRound().catch(() => undefined);
    onBack(); // No data saved
  };

  /**
   * Save incomplete round with WHS-compliant handling
   * Now supports shotgun/event rounds with non-sequential hole completion
   */

  const updateHoleScore = (holeIndex: number, field: keyof HoleScore, value: any) => {
    setHoles(prev => {
      const updated = [...prev];
      updated[holeIndex] = { ...updated[holeIndex], [field]: value };
      return updated;
    });
  };

  const lightHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const mediumHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  };

  const successHaptic = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const getPenaltyStrokeCountForHole = (holeData: HoleScore) =>
    Number(!!holeData.hazardOrDrop) + Number(!!holeData.outOfBounds);

  const applyHoleStrokeSplit = (holeIndex: number, nextManual: number, nextPenalty: number) => {
    const manualStrokes = Math.max(1, Math.min(15, nextManual));
    const penaltyStrokes = Math.max(0, Math.min(6, nextPenalty));
    const total = Math.max(1, Math.min(15, manualStrokes + penaltyStrokes));
    setHoles(prev => {
      const updated = [...prev];
      updated[holeIndex] = {
        ...updated[holeIndex],
        manualStrokes,
        penaltyStrokes,
        score: total,
      };
      return updated;
    });
  };

  const scheduleQuickAdvance = () => {
    if (quickAdvanceTimeoutRef.current) {
      clearTimeout(quickAdvanceTimeoutRef.current);
    }
    quickAdvanceTimeoutRef.current = setTimeout(() => {
      handleSaveHole();
    }, 350);
  };

  const changeScore = (holeIndex: number, delta: number) => {
    const hole = holes[holeIndex];
    const inferredPenalty = getPenaltyStrokeCountForHole(hole);
    const penaltyStrokes = hole.penaltyStrokes ?? inferredPenalty;
    const manualBase = hole.manualStrokes ?? Math.max(1, (hole.score ?? hole.par) - penaltyStrokes);
    applyHoleStrokeSplit(holeIndex, manualBase + delta, penaltyStrokes);
    lightHaptic();
    if (entryMode === 'quick') {
      scheduleQuickAdvance();
    }
  };

  const changePutts = (holeIndex: number, delta: number) => {
    const currentPutts = holes[holeIndex].putts ?? 2;
    const newPutts = Math.max(0, Math.min(10, currentPutts + delta));
    updateHoleScore(holeIndex, 'putts', newPutts);
    lightHaptic();
    if (entryMode === 'quick') {
      scheduleQuickAdvance();
    }
  };

  const setFIR = (holeIndex: number, value: FIRResult) => {
    const hole = holes[holeIndex];
    if (hole.par === 3) return; // FIR not applicable for par 3
    updateHoleScore(holeIndex, 'fir', value);
    lightHaptic();
  };

  const setGIR = (holeIndex: number, value: GIRResult) => {
    updateHoleScore(holeIndex, 'gir', value);
    if (value === 'hit' || value === null) {
      updateHoleScore(holeIndex, 'upDown', null);
    }
    lightHaptic();
  };

  const maybeAutoCollapseShotDetails = (holeIndex: number, updates: Partial<HoleScore>) => {
    const trackClubs = userProfile?.scoringPreferences?.trackClubs !== false;
    const trackPuttDistance = userProfile?.scoringPreferences?.trackPuttDistance === true;
    const nextHole = { ...holes[holeIndex], ...updates };
    const isPar3 = nextHole.par === 3;
    const hasClubs = !trackClubs || (!!nextHole.teeClub && (isPar3 || !!nextHole.approachClub));
    const hasDistance = !statPreferences.approachDistance || isPar3 || !!nextHole.approachDistance;
    const hasPuttDistance = !trackPuttDistance || nextHole.firstPuttDistance !== null;
    if (shotDetailsExpanded && hasClubs && hasDistance && hasPuttDistance) {
      setTimeout(() => {
        setShotDetailsExpanded(false);
      }, 2000);
    }
  };

  const setApproachDistance = (holeIndex: number, value: ApproachDistance) => {
    updateHoleScore(holeIndex, 'approachDistance', value);
    maybeAutoCollapseShotDetails(holeIndex, { approachDistance: value });
  };

  const setUpDown = (holeIndex: number, value: boolean | null) => {
    updateHoleScore(holeIndex, 'upDown', value);
    lightHaptic();
  };

  const changePuttDistance = (holeIndex: number, delta: number) => {
    const currentDistance = holes[holeIndex].firstPuttDistance || 0;
    const newDistance = Math.max(0, Math.min(100, currentDistance + delta));
    updateHoleScore(holeIndex, 'firstPuttDistance', newDistance);
  };

  const setPuttDistance = (holeIndex: number, value: number | null) => {
    const nextValue = value === null ? null : Math.max(0, Math.min(100, value));
    updateHoleScore(holeIndex, 'firstPuttDistance', nextValue);
    maybeAutoCollapseShotDetails(holeIndex, { firstPuttDistance: nextValue });
  };

  const toggleMisHit = (holeIndex: number) => {
    updateHoleScore(holeIndex, 'misHit', !holes[holeIndex].misHit);
  };

  const toggleMissedGreen = (holeIndex: number) => {
    updateHoleScore(holeIndex, 'missedGreen', !holes[holeIndex].missedGreen);
  };

  const toggleBunker = (holeIndex: number, type: 'fairway' | 'greenside') => {
    if (type === 'fairway') {
      updateHoleScore(holeIndex, 'fairwayBunker', !holes[holeIndex].fairwayBunker);
    } else {
      updateHoleScore(holeIndex, 'greenSideBunker', !holes[holeIndex].greenSideBunker);
    }
    mediumHaptic();
  };

  const togglePenalty = (holeIndex: number, type: 'hazard' | 'drop' | 'ob') => {
    const hole = holes[holeIndex];
    const inferredPenalty = getPenaltyStrokeCountForHole(hole);
    const currentPenaltyStrokes = hole.penaltyStrokes ?? inferredPenalty;
    const currentManual = hole.manualStrokes ?? Math.max(1, (hole.score ?? hole.par) - currentPenaltyStrokes);
    let nextPenaltyStrokes = currentPenaltyStrokes;

    if (type === 'hazard') {
      const nextValue = !hole.hazardOrDrop;
      updateHoleScore(holeIndex, 'hazardOrDrop', nextValue);
      nextPenaltyStrokes += nextValue ? 1 : -1;
    } else if (type === 'drop') {
      updateHoleScore(holeIndex, 'dropShot', !hole.dropShot);
    } else {
      const nextValue = !hole.outOfBounds;
      updateHoleScore(holeIndex, 'outOfBounds', nextValue);
      nextPenaltyStrokes += nextValue ? 1 : -1;
    }

    applyHoleStrokeSplit(holeIndex, currentManual, nextPenaltyStrokes);
    mediumHaptic();
  };

  const changeDrinks = (holeIndex: number, delta: number) => {
    const currentDrinks = holes[holeIndex].drinks || 0;
    const newDrinks = Math.max(0, Math.min(10, currentDrinks + delta));
    updateHoleScore(holeIndex, 'drinks', newDrinks);
  };

  const setClub = (holeIndex: number, type: 'tee' | 'approach', club: string) => {
    if (type === 'tee') {
      updateHoleScore(holeIndex, 'teeClub', club);
      setShowTeeClubPicker(false);
      maybeAutoCollapseShotDetails(holeIndex, { teeClub: club });
    } else {
      updateHoleScore(holeIndex, 'approachClub', club);
      setShowApproachClubPicker(false);
      maybeAutoCollapseShotDetails(holeIndex, { approachClub: club });
    }
  };

  const toggleShotDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShotDetailsExpanded(prev => !prev);
  };

  const getTeeColor = (teeName: string): string => {
    const normalized = teeName.toLowerCase();
    if (normalized.includes('black')) return '#1F2937';
    if (normalized.includes('green')) return '#10B981';
    if (normalized.includes('bronze')) return '#92400E';
    if (normalized.includes('silver')) return '#9CA3AF';
    if (normalized.includes('gold')) return '#F59E0B';
    if (normalized.includes('blue')) return '#3B82F6';
    if (normalized.includes('white')) return '#F3F4F6';
    if (normalized.includes('red')) return '#EF4444';
    return '#6B7280';
  };

  // S+ TIER: Generate intelligent round insights (max 2 takeaways)
  const generateRoundInsights = () => {
    const stats = calculateStats();
    const scoreToPar = stats.totalScore - stats.totalPar;
    const avgPuttsNum = statPreferences.putts && stats.puttsTracked ? parseFloat(stats.avgPutts) : null;
    const completedHoles = holes.filter(h => h.isSaved || (h.score !== null && h.score > 0));
    const threePutts = statPreferences.putts
      ? completedHoles.filter(h => h.putts !== null && h.putts !== undefined && h.putts >= 3).length
      : 0;
    const threePuttRate = statPreferences.putts && completedHoles.length > 0
      ? threePutts / completedHoles.length
      : null;
    const doublePlusCount = completedHoles.filter(h => h.par && h.score && h.score >= h.par + 2).length;
    const penaltyCount = holes.reduce((sum, h) => (
      sum + Number(!!h.hazardOrDrop) + Number(!!h.dropShot) + Number(!!h.outOfBounds)
    ), 0);
    const scrambleRate = stats.upDownAttempts > 0
      ? (stats.upDownMade / stats.upDownAttempts) * 100
      : null;
    const slopeRating = selectedTeeBox?.slope;
    const courseRating = selectedTeeBox?.rating;
    const coursePar = course?.par;
    const ratingDiff = courseRating && coursePar ? courseRating - coursePar : null;
    const weatherWind = currentWeather?.wind;
    const weatherConditions = currentWeather?.conditions || '';
    
    // Determine Round Theme (one sentence, auto-generated)
    let theme = '';
    if (scoreToPar <= -2) {
      theme = 'Outstanding round';
    } else if (scoreToPar <= 0) {
      theme = 'Solid performance';
    } else if (scoreToPar <= 5) {
      theme = 'Steady round';
    } else if (scoreToPar <= 10) {
      theme = 'Building momentum';
    } else {
      theme = 'Every round counts';
    }

    // Add nuance based on stats
    if (stats.girPercent >= 60 && scoreToPar > 3) {
      theme = 'Great ball-striking despite the score';
    } else if (avgPuttsNum !== null && avgPuttsNum < 1.8 && scoreToPar > 0) {
      theme = 'Putting kept you in it';
    } else if (stats.firPercent >= 70) {
      theme = 'Accuracy was your strength';
    }

    // One thing you did well (always positive, specific)
    let strength = '';
    if (avgPuttsNum !== null && avgPuttsNum < 1.9) {
      strength = `Excellent putting (${avgPuttsNum}/hole)`;
    } else if (stats.girPercent >= 55 && stats.girTotal > 0) {
      strength = `Strong approach shots (${stats.girHit}/${stats.girTotal} GIR)`;
    } else if (stats.firPercent >= 65 && stats.firTotal > 0) {
      strength = `Accurate off the tee (${stats.firHit}/${stats.firTotal} FIR)`;
    } else if (scoreToPar <= stats.totalPar * 0.15) {
      strength = 'Consistent scoring throughout';
    } else {
      strength = 'You showed up and played';
    }

    // One opportunity (never say "weakness" or "bad")
    let opportunity = '';
    if (threePuttRate !== null && threePuttRate >= 0.2) {
      opportunity = 'Reduce 3-putts with better speed control';
    } else if (penaltyCount >= 2) {
      opportunity = 'Avoid penalties with safer targets';
    } else if (doublePlusCount >= 3) {
      opportunity = 'Limit doubles with simple recoveries';
    } else if (scrambleRate !== null && scrambleRate < 40) {
      opportunity = 'Save more pars after missed greens';
    } else if (avgPuttsNum !== null && avgPuttsNum >= 2.2) {
      opportunity = 'Fewer putts = lower scores';
    } else if (stats.girPercent < 40 && stats.girTotal > 0) {
      opportunity = 'More greens in regulation';
    } else if (stats.firPercent < 50 && stats.firTotal > 0) {
      opportunity = 'Find more fairways';
    } else if (scoreToPar > 8) {
      opportunity = 'Keep playing to build consistency';
    } else if (slopeRating && slopeRating >= 130 && scoreToPar > 0) {
      opportunity = 'Tough setup today; prioritize conservative targets';
    } else if (slopeRating && slopeRating <= 115 && scoreToPar > 0) {
      opportunity = 'Scoring chances were there; be more aggressive with good looks';
    } else if (ratingDiff !== null && ratingDiff >= 1.5 && scoreToPar > 0) {
      opportunity = 'Harder course setup calls for patience and safe lines';
    } else if (weatherWind && (weatherWind === 'Strong' || weatherWind === 'Very Strong') && scoreToPar > 0) {
      opportunity = 'Windy conditions today; favor center targets and solid contact';
    } else if (weatherConditions.toLowerCase().includes('rain') && scoreToPar > 0) {
      opportunity = 'Wet conditions today; keep it in play and avoid risky shots';
    } else {
      opportunity = 'Small gains add up quickly';
    }

    return { theme, strength, opportunity };
  };

  const handleSaveHole = () => {
    // Mark the current hole as explicitly saved by the golfer
    const now = Date.now();
    if (!firstSaveTimestampRef.current) {
      firstSaveTimestampRef.current = gpsRoundData?.startedAt ?? now;
    }
    if (!gpsRoundData?.endedAt) {
      lastSaveTimestampRef.current = now;
    }

    let updatedHoles: typeof holes = holes;
    setHoles(prev => {
      updatedHoles = prev.map((h, idx) => {
        if (idx !== currentHole) return h;
        const inferredPenalty = getPenaltyStrokeCountForHole(h);
        const currentPenalty = h.penaltyStrokes ?? inferredPenalty;
        const currentManual = h.manualStrokes ?? Math.max(1, (h.score ?? h.par) - currentPenalty);
        const hole = { ...h, isSaved: true, penaltyStrokes: currentPenalty, manualStrokes: currentManual };
        if (hole.par === 3) {
          hole.fir = null;
        }
        // If score wasn't explicitly set, use displayed default (par)
        if (hole.score === null) {
          hole.score = Math.max(1, Math.min(15, currentManual + currentPenalty));
        }
        // If putts weren't explicitly set but putts tracking is on, use default (2)
        if (hole.putts === null && statPreferences.putts) {
          hole.putts = 2;
        }
        return hole;
      });
      return updatedHoles;
    });

    if (currentHole === 8) {
      setShowTurnWeatherPrompt(true);
    }

    successHaptic();

    const savedHole = updatedHoles[currentHole];
    if (savedHole && savedHole.score != null) {
      const read = buildHoleQualityRead({
        par: savedHole.par,
        score: savedHole.score,
        putts: savedHole.putts,
        greenHit: savedHole.gir === 'hit' ? true : savedHole.gir,
        fairwayHit: savedHole.fir === 'hit' ? true : savedHole.fir,
        approachClub: savedHole.approachClub,
        greenSideBunker: savedHole.greenSideBunker,
        fairwayBunker: savedHole.fairwayBunker,
        upDown: savedHole.upDown,
        handicapIndex: savedHole.handicap,
        playerHandicap: userProfile?.coursePreferences?.typicalHandicap ?? null,
      });
      setHoleRead(read);
      holeReadOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(holeReadOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(holeReadOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }

    // If on last hole, save the round; otherwise advance
    if (currentHole === lastHoleIndex) {
      if (holeReadTimeoutRef.current) {
        clearTimeout(holeReadTimeoutRef.current);
      }
      holeReadTimeoutRef.current = setTimeout(() => {
        setHoleRead(null);
        handleSaveRound(updatedHoles);
      }, 1500);
      return;
    } else {
      setHoleNotesExpanded(false);
      setHoleNoteDraft('');
      if (holeReadTimeoutRef.current) {
        clearTimeout(holeReadTimeoutRef.current);
      }
      holeReadTimeoutRef.current = setTimeout(() => {
        setHoleRead(null);
        nextHole();
      }, 1500);
      return;
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading course...</Text>
      </View>
    );
  }

  if (!course || (!selectedTeeBox && !showTeeSelection)) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>Failed to load course</Text>
        <TouchableOpacity style={styles.button} onPress={onBack}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hole = holes && holes.length > 0 ? holes[currentHole] : null;
  const stats = selectedTeeBox && holes.length > 0 ? calculateStats() : null;
  const coursePar = selectedTeeBox?.holes?.reduce((sum, h) => sum + (h.par || 0), 0) ?? 72;
  const liveStats: LiveRoundStats | null = holes.length > 0
    ? calculateLiveRoundStats(
      holes.map((h) => ({
        number: h.hole,
        par: h.par,
        score: h.score ?? 0,
        putts: h.putts,
        greenHit: h.gir === 'hit' ? true : h.gir,
        fairwayHit: h.fir === 'hit' ? true : h.fir,
        upDown: h.upDown,
        greenSideBunker: h.greenSideBunker,
      })),
      coursePar,
      historicalBaseline ?? undefined
    )
    : null;
  const playedHoles = holes
    .map((h) => ({ number: h.hole, par: h.par, score: h.score ?? 0 }))
    .filter((h) => h.score > 0 && h.par > 0);
  const ghostComparison: GhostComparison | null = ghostRound
    ? buildGhostComparison(ghostRound, playedHoles, hole?.hole ?? (currentHole + 1), holes.length || 18)
    : null;
  const frontPlayed = playedHoles.filter((h) => h.number <= 9);
  const backPlayed = playedHoles.filter((h) => h.number >= 10);
  const backNineParTotal = holes.filter((h) => h.hole >= 10).reduce((sum, h) => sum + h.par, 0);
  const comebackForDisplay: ComebackAnalysis | null = frontPlayed.length >= 9 && holes.length >= 18
    ? buildComebackAnalysis(
      frontPlayed.reduce((s, h) => s + h.score, 0),
      frontPlayed.reduce((s, h) => s + h.par, 0),
      backNineParTotal,
      historicalRounds.filter((r) => r.courseId === courseId && r.score > 0),
      historicalRounds
    )
    : null;
  const dynamicComebackMessage = (() => {
    if (!comebackForDisplay?.shouldShow || !comebackForDisplay.primaryTarget) return null;
    const backScoreSoFar = backPlayed.reduce((s, h) => s + h.score, 0);
    const backHolesRemaining = Math.max(0, 9 - backPlayed.length);
    const neededRemaining = comebackForDisplay.primaryTarget.targetBack - backScoreSoFar;
    if (backPlayed.length === 0) return comebackForDisplay.message;
    return `Back nine target: ${neededRemaining} in ${backHolesRemaining} holes to hit your goal.`;
  })();
  const dynamicComebackSecondary = comebackForDisplay?.secondaryTarget
    ? comebackForDisplay.secondaryTarget.message
    : null;
  const trackClubs = userProfile?.scoringPreferences?.trackClubs !== false;
  const scorecardColorsEnabled = userProfile?.scoringPreferences?.scorecardColorsEnabled !== false;
  const fairwayMissed = hole?.fir !== null && hole?.fir !== 'hit';
  const greenMissed = hole?.gir !== null && hole?.gir !== 'hit';

  const renderDirectionPicker = (value: FIRResult | GIRResult, onChange: (next: FIRResult | GIRResult) => void) => (
    <View style={styles.compactDirectionGrid}>
      <View style={styles.compactDirectionRowCenter}>
        <TouchableOpacity
          style={[styles.compactDirectionButton, value === 'long' && styles.compactDirectionButtonActive]}
          onPress={() => {
            onChange(value === 'long' ? null : 'long');
            lightHaptic();
          }}
        >
          <Ionicons name="arrow-up" size={14} color={value === 'long' ? '#E5E7EB' : '#9CA3AF'} />
          <Text style={[styles.compactDirectionText, value === 'long' && styles.compactDirectionTextActive]}>Long</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.compactDirectionRow}>
        <TouchableOpacity
          style={[styles.compactDirectionButton, value === 'left' && styles.compactDirectionButtonActive]}
          onPress={() => {
            onChange(value === 'left' ? null : 'left');
            lightHaptic();
          }}
        >
          <Ionicons name="arrow-back" size={14} color={value === 'left' ? '#E5E7EB' : '#9CA3AF'} />
          <Text style={[styles.compactDirectionText, value === 'left' && styles.compactDirectionTextActive]}>Left</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.compactDirectionButton, value === 'right' && styles.compactDirectionButtonActive]}
          onPress={() => {
            onChange(value === 'right' ? null : 'right');
            lightHaptic();
          }}
        >
          <Ionicons name="arrow-forward" size={14} color={value === 'right' ? '#E5E7EB' : '#9CA3AF'} />
          <Text style={[styles.compactDirectionText, value === 'right' && styles.compactDirectionTextActive]}>Right</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.compactDirectionRowCenter}>
        <TouchableOpacity
          style={[styles.compactDirectionButton, value === 'short' && styles.compactDirectionButtonActive]}
          onPress={() => {
            onChange(value === 'short' ? null : 'short');
            lightHaptic();
          }}
        >
          <Ionicons name="arrow-down" size={14} color={value === 'short' ? '#E5E7EB' : '#9CA3AF'} />
          <Text style={[styles.compactDirectionText, value === 'short' && styles.compactDirectionTextActive]}>Short</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const handlePrevHole = () => {
    lightHaptic();
    prevHole();
  };

  const handleNextHole = () => {
    lightHaptic();
    nextHole();
  };

  const handleGoToHole = (index: number) => {
    lightHaptic();
    goToHole(index);
  };

  const openPenaltySheet = () => {
    lightHaptic();
    setPenaltySheetVisible(true);
  };

  return (
    <View style={styles.container}>
      <TeeSelectionModal
        visible={showTeeSelection}
        course={course}
        selectedTeeBox={selectedTeeBox}
        startingHole={startingHole}
        onStartingHoleChange={setStartingHole}
        onOpenStartingHolePicker={() => setShowStartingHolePicker(true)}
        onSelectTeeBox={handleTeeSelection}
        onBack={onBack}
        getTeeColor={getTeeColor}
        distanceUnit={distanceUnit}
        styles={styles}
      />
      <CourseRoutingModal
        visible={showRoutingModal}
        teeBox={routingTeeBox}
        routes={routingOptions}
        onClose={() => setShowRoutingModal(false)}
        onSelectRoute={handleRoutingSelected}
        styles={styles}
      />

      <ClubPickerModal
        visible={showTeeClubPicker}
        title="Select Tee Club"
        selectedClub={hole?.teeClub ?? null}
        availableClubs={TEE_CLUB_OPTIONS}
        clubDistances={clubDistances}
        onSelect={(club) => setClub(currentHole, 'tee', club)}
        onClose={() => setShowTeeClubPicker(false)}
        styles={styles}
      />

      <StartingHolePickerModal
        visible={showStartingHolePicker}
        course={course}
        startingHole={startingHole}
        onClose={() => setShowStartingHolePicker(false)}
        onSelectHole={setStartingHole}
        styles={styles}
      />

      <ClubPickerModal
        visible={showApproachClubPicker}
        title="Select Approach Club"
        selectedClub={hole?.approachClub ?? null}
        availableClubs={APPROACH_CLUB_OPTIONS}
        clubDistances={clubDistances}
        onSelect={(club) => setClub(currentHole, 'approach', club)}
        onClose={() => setShowApproachClubPicker(false)}
        styles={styles}
      />

      <ApproachDistancePickerModal
        visible={showApproachDistancePicker}
        selected={hole?.approachDistance ?? null}
        buckets={APPROACH_DISTANCE_BUCKETS}
        onSelect={(value) => setApproachDistance(currentHole, value)}
        onClose={() => setShowApproachDistancePicker(false)}
        styles={styles}
      />

      <PenaltySheet
        visible={penaltySheetVisible}
        allowBunkers={statPreferences.bunkers}
        allowPenalties={statPreferences.penalties}
        showFairwayBunker={!!hole?.fairwayBunker}
        showGreensideBunker={!!hole?.greenSideBunker}
        showHazard={!!hole?.hazardOrDrop}
        showDrop={!!hole?.dropShot}
        showOb={!!hole?.outOfBounds}
        onToggleBunker={(type) => toggleBunker(currentHole, type)}
        onTogglePenalty={(type) => togglePenalty(currentHole, type)}
        onClose={() => setPenaltySheetVisible(false)}
        styles={styles}
      />

      {selectedTeeBox && course && (
        <ScoreEntryHeader
          courseName={course.name}
          teeName={selectedTeeBox.name}
          totalPar={selectedTeeBox.holes.reduce((sum, h) => sum + h.par, 0)}
          startType={startType}
          isFavorite={isFavorite}
          entryMode={entryMode}
          onToggleEntryMode={() => setEntryMode(entryMode === 'quick' ? 'detailed' : 'quick')}
          onBack={handleBackPress}
          onToggleFavorite={toggleFavorite}
          styles={styles}
        />
      )}

      {selectedTeeBox && course && holes.length > 0 && (
        <PreRoundSplash
          visible={
            showPreRoundSplash &&
            !!(preRoundTip || caddieNote || weatherContextTip || currentWeather)
          }
          courseName={course.name}
          teeName={selectedTeeBox.name}
          totalPar={selectedTeeBox.holes.reduce((sum, h) => sum + h.par, 0)}
          totalYards={selectedTeeBox.holes.reduce((sum, h) => sum + (h.yardage || 0), 0)}
          distanceUnit={distanceUnit}
          tip={showPreRoundTip ? preRoundTip : null}
          caddieNote={caddieNote}
          caddieNoteLabel={caddieNoteLabel}
          weatherSummary={
            currentWeather
              ? `${currentWeather.temp}F · ${currentWeather.conditions ?? 'Conditions'} · ${currentWeather.wind ?? 'Light wind'}`
              : null
          }
          weatherContext={showWeatherTip ? weatherContextTip : null}
          prediction={scorePrediction}
          windLevel={currentWeather?.wind ?? null}
          windDirection={windDirection}
          onSelectWindDirection={setWindDirection}
          onStart={handleStartRound}
          styles={styles}
        />
      )}

      {selectedTeeBox && holes.length > 0 && hole && <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Trial status indicator */}
        {!isPremium && inTrial && (
          <TrialBanner
            trialRoundsUsed={trialRoundsUsed}
            trialLimit={trialLimit}
            variant="in-trial"
          />
        )}

        <HoleOverviewChips
          ref={holeScrollViewRef}
          holes={holes}
          currentHole={currentHole}
          onSelect={handleGoToHole}
          showScores={entryMode === 'quick'}
          styles={styles}
        />

        {ghostComparison?.currentHoleGhostScore != null && (
          <Text style={styles.ghostHoleTarget}>
            Best round: {ghostComparison.currentHoleGhostScore}
            {ghostComparison.currentHoleGhostToPar != null
              ? ghostComparison.currentHoleGhostToPar === 0
                ? ' (par)'
                : ghostComparison.currentHoleGhostToPar < 0
                  ? ` (${ghostComparison.currentHoleGhostToPar})`
                  : ` (+${ghostComparison.currentHoleGhostToPar})`
              : ''}
            {' '}on your best round
          </Text>
        )}

        {entryMode === 'quick' ? (
          <QuickScoreMode
            hole={hole}
            isFirstHole={currentHole === firstHoleIndex}
            isLastHole={currentHole === lastHoleIndex}
            distanceUnit={distanceUnit}
            onPrev={handlePrevHole}
            onNext={handleNextHole}
            onScoreChange={(delta) => changeScore(currentHole, delta)}
            onPuttsChange={(delta) => changePutts(currentHole, delta)}
            showPutts={statPreferences.putts}
            scorecardColorsEnabled={scorecardColorsEnabled}
            styles={styles}
          />
        ) : (
          <HoleScoreCard
            hole={hole}
            currentHole={currentHole}
            totalHoles={holes.length}
            isFirstHole={currentHole === firstHoleIndex}
            isLastHole={currentHole === lastHoleIndex}
            viewMode={viewMode}
            statPreferences={statPreferences}
            trackClubs={trackClubs}
            trackPuttDistance={userProfile?.scoringPreferences?.trackPuttDistance === true}
            distanceUnit={distanceUnit}
            scorecardColorsEnabled={scorecardColorsEnabled}
            shotDetailsExpanded={shotDetailsExpanded}
            onToggleShotDetails={toggleShotDetails}
            onPrev={handlePrevHole}
            onNext={handleNextHole}
            changeScore={changeScore}
            changePutts={changePutts}
            penaltyStrokes={hole.penaltyStrokes ?? getPenaltyStrokeCountForHole(hole)}
            setPuttDistance={setPuttDistance}
            setFIR={setFIR}
            setGIR={setGIR}
            setUpDown={setUpDown}
            onOpenTeeClubPicker={() => setShowTeeClubPicker(true)}
            onOpenApproachClubPicker={() => setShowApproachClubPicker(true)}
            onOpenApproachDistancePicker={() => setShowApproachDistancePicker(true)}
            onOpenPenaltySheet={openPenaltySheet}
            renderDirectionPicker={renderDirectionPicker}
            fairwayMissed={fairwayMissed}
            greenMissed={greenMissed}
            actionIconSize={ACTION_ICON_SIZE}
            styles={styles}
            CollapsibleSection={CollapsibleSection}
          />
        )}

        {showTurnWeatherPrompt && (
          <View style={styles.turnWeatherBanner}>
            <Text style={styles.turnWeatherTitle}>Conditions changed?</Text>
            <Text style={styles.turnWeatherBody}>Update back-nine weather for better condition insights.</Text>
            <View style={styles.turnWeatherActions}>
              <TouchableOpacity
                style={styles.turnWeatherSecondary}
                onPress={() => {
                  setWeatherBack9(null);
                  setShowTurnWeatherPrompt(false);
                }}
              >
                <Text style={styles.turnWeatherSecondaryText}>Same</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.turnWeatherPrimary} onPress={refreshBackNineWeather}>
                <Text style={styles.turnWeatherPrimaryText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {stats && (
          <RoundProgress
            completedHoles={stats.completedHoles}
            totalHoles={holes.length}
            totalScore={stats.totalScore}
            scoreToPar={stats.scoreToPar}
            totalPutts={stats.totalPutts}
            puttsTracked={stats.puttsTracked}
            firHit={stats.firHit}
            firTotal={stats.firTotal}
            girHit={stats.girHit}
            girTotal={stats.girTotal}
            upDownMade={stats.upDownMade}
            upDownAttempts={stats.upDownAttempts}
            showFir={statPreferences.fir}
            showGir={statPreferences.gir}
            showPutts={statPreferences.putts}
            showUpDown={statPreferences.scrambling && stats.upDownAttempts > 0}
            liveStats={liveStats}
            ghostMessage={ghostComparison && ghostComparison.holesCompared >= 1 ? ghostComparison.message : null}
            ghostTone={ghostComparison?.tone ?? null}
            comebackMessage={comebackForDisplay?.shouldShow ? dynamicComebackMessage : null}
            comebackSecondary={comebackForDisplay?.shouldShow ? dynamicComebackSecondary : null}
            styles={styles}
          />
        )}

        <View style={styles.holeNotesCompact}>
          <TouchableOpacity
            style={styles.holeNotesCompactHeader}
            onPress={() => setHoleNotesExpanded(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel="Toggle hole notes"
          >
            <View style={styles.holeNotesCompactTitleRow}>
              <Text style={styles.holeNotesCompactTitle}>Hole Notes</Text>
              {(holeNotes.length > 0 || holeNoteDraft.trim().length > 0) && (
                <View style={styles.holeNotesDot} />
              )}
            </View>
            <Ionicons name={holeNotesExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
          </TouchableOpacity>
          <TextInput
            value={holeNoteDraft}
            onChangeText={setHoleNoteDraft}
            placeholder="Add a note..."
            placeholderTextColor="#6B7280"
            style={[styles.holeNoteInputCompact, holeNotesExpanded && styles.holeNoteInputCompactExpanded]}
            multiline={holeNotesExpanded}
            numberOfLines={holeNotesExpanded ? 3 : 1}
            maxLength={200}
            onFocus={() => setHoleNotesExpanded(true)}
          />
          {holeNotesExpanded && (
            <View style={styles.holeNotesCompactActions}>
              <TouchableOpacity
                style={[styles.holeNoteSaveButton, !holeNoteDraft.trim() && styles.holeNoteSaveButtonDisabled]}
                onPress={handleSaveHoleNote}
                disabled={!holeNoteDraft.trim()}
                accessibilityRole="button"
                accessibilityLabel="Save hole note"
              >
                <Text style={styles.holeNoteSaveText}>Save Note</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <MiniScorecard
          holes={holes}
          expanded={miniScorecardExpanded}
          onToggle={() => setMiniScorecardExpanded(prev => !prev)}
          onSelectHole={handleGoToHole}
          styles={styles}
        />

        {selectedTeeBox && holes.length > 0 && (
          <TouchableOpacity
            style={styles.fullScorecardLink}
            onPress={() => setShowFullScorecard(true)}
            accessibilityRole="button"
            accessibilityLabel="View full scorecard"
          >
            <Ionicons name="grid" size={18} color="#9CA3AF" />
            <Text style={styles.fullScorecardLinkText}>View Full Scorecard</Text>
          </TouchableOpacity>
        )}

        {/* Round Summary removed from active round view */}
      </ScrollView>}

      {holeRead && (
        <Animated.View style={[styles.holeReadBanner, { opacity: holeReadOpacity }]}>
          <Text
            style={[
              styles.holeReadText,
              holeRead.tone === 'great' && styles.holeReadGreat,
              holeRead.tone === 'good' && styles.holeReadGood,
              holeRead.tone === 'bad' && styles.holeReadBad,
              holeRead.tone === 'reset' && styles.holeReadReset,
            ]}
          >
            {holeRead.text}
          </Text>
        </Animated.View>
      )}

      <QuickActions
        showScorecard={false}
        showSave={!!stats && holes.length > 0}
        isLastHole={currentHole === lastHoleIndex}
        onOpenScorecard={() => setShowFullScorecard(true)}
        onSave={handleSaveHole}
        styles={styles}
      />

      <FullScorecardModal
        visible={showFullScorecard && holes.length > 0}
        courseName={course?.name}
        teeName={selectedTeeBox?.name ?? null}
        holes={holes.map(h => ({
          hole: h.hole,
          par: h.par,
          yardage: h.yardage,
          handicap: h.handicap,
          score: h.score,
          putts: h.putts,
          fir: h.fir,
          gir: h.gir,
        }))}
        onClose={() => setShowFullScorecard(false)}
        distanceUnit={distanceUnit}
        styles={styles}
        scorecardColorsEnabled={scorecardColorsEnabled}
        generateScorecardHTML={generateScorecardHTML}
        copyScorecardHTML={copyScorecardHTML}
      />

      <LeaveRoundModal
        visible={showLeaveRoundModal}
        currentHole={currentHole}
        courseName={course?.name}
        holes={holes}
        onContinue={() => setShowLeaveRoundModal(false)}
        onEndRound={handleEndRound}
        onAbandon={handleDiscardRound}
        styles={styles}
      />

      <EndRoundReasonModal
        visible={showEndRoundModal}
        holesWithScores={holes.filter(h => h.isSaved || (h.score !== null && h.score > 0)).length}
        onClose={() => setShowEndRoundModal(false)}
        onSelectReason={(reason) => {
          setEndRoundReason(reason);
          setShowEndRoundModal(false);
          saveIncompleteRound(reason);
        }}
        onExitWithoutSaving={() => {
          setShowEndRoundModal(false);
          onBack();
        }}
        styles={styles}
      />

      <DiscardRoundModal
        visible={showDiscardConfirmModal}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setShowDiscardConfirmModal(false)}
        styles={styles}
      />

    </View>
  );
};
