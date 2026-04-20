import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StatusBar,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Alert,
  ScrollView,
  AppState,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavigation, BOTTOM_NAV_CONTENT_HEIGHT } from './src/components/BottomNavigation';
import { HistoryTab } from './src/components/HistoryTab';
import { AveragesTab } from './src/components/AveragesTab';
import { InsightsTab } from './src/components/InsightsTab';
import { ProfileTab } from './src/components/ProfileTab';
import { CoachingNudgeCarousel } from './src/components/CoachingNudgeCarousel';
import { CourseSearchScreen } from './src/components/CourseSearchScreen';
import { CourseAnalyticsScreen } from './src/components/CourseAnalyticsScreen';
import { ManualScoreEntry } from './src/components/ManualScoreEntry';
import { ScorecardImportScreen } from './src/components/ScorecardImportScreen';
import { getRounds, calculateHandicapIndex, resetFirestoreConnection, syncLocalDataToFirestore, loadSampleRounds, getSampleRound, clearLocalRounds, seedPebbleHistoryRounds, seedHavenHistoryRounds } from './src/services/roundsService';
import { getCurrentUser, onAuthChange } from './src/services/firebaseAuthService';
import { RoundDetailView } from './src/components/RoundDetailView';
import { ScorecardViewer } from './src/components/ScorecardViewer';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { TabName, SavedRound, ScorecardResult, PendingGpsRoundData } from './src/types';
import { OSMGolfCourse } from './src/services/openStreetMapService';
import { CourseDetails } from './src/services/golfCourseApiService';
import { GolfSumLogo } from './src/components/ui/GolfSumLogo';
import { UpgradeTrigger } from './src/components/UpgradeSheet';
import Storage from './src/services/storage';
import {
  checkForResumableGpsRound,
  clearGpsInProgressRound,
  clearInProgressRound,
  getInProgressRound,
  InProgressRoundDraft,
  saveGpsInProgressRound,
  type GpsInProgressRound,
} from './src/services/inProgressRoundService';
import { savePausedGpsAsPartialRound } from './src/services/savePausedGpsAsPartialRound';
import { saveCompletedGpsRoundToHistory } from './src/services/saveCompletedGpsRoundToHistory';
import {
  closePauseEvent,
  createEstimatedPauseEvent,
  formatTimeAgo,
} from './src/services/roundTimingService';
import {
  appendPersonalBests,
  detectPersonalBests,
  PersonalBest,
} from './src/services/personalBestService';
import { useNetworkStatus } from './src/hooks/useNetworkStatus';
import { loadTrialCount } from './src/services/trialService';
import { saveLastError } from './src/services/userService';
import { getUserProfile, saveUserProfile } from './src/services/userService';
import { logger, setLoggerErrorHandler, setLoggerQuietMode } from './src/utils/logger';
import { syncSubscriptionEntitlement } from './src/services/billingService';
import { UI_COPY } from './src/constants/uiCopy';
import { processSyncQueue, getPendingSyncCount } from './src/services/syncQueue';
import { requestAppReviewIfEligible } from './src/services/reviewService';
import { ProUpgradeScreen } from './src/screens/ProUpgradeScreen';
import { appStyles as styles } from './src/app/appStyles';
import { AppScreen } from './src/app/appTypes';
import { AppMainContent } from './src/app/AppMainContent';
import { hasGpsHoleData, loadGpsRoundSetup } from './src/services/gpsRoundSetup';
import { haversineYards } from './src/services/haversine';
import { GpsRoundScreen } from './src/screens/GpsRoundScreen';
import { WebGpsRoundPreview } from './src/screens/WebGpsRoundPreview';
import SaveConfirmationOverlay from './src/components/SaveConfirmationOverlay';
import { detectMilestone, MilestoneEvent } from './src/services/milestoneDetector';
import { consumeWatchEndRoundFlag, initializeWatchReceiver, updateWatchGpsContext, type WatchBridgeEvent } from './src/services/watchBridgeService';
import {
  initializePushNotifications,
  syncPushRegistrationForProfile,
  type NotificationRoutePayload,
} from './src/services/pushNotificationService';

const ONBOARDING_COMPLETE_KEY = '@GolfSum:onboardingComplete';
const ONBOARDING_LEGACY_KEY = '@GolfSum:onboardingSeen';
const ONBOARDING_SETUP_KEY = '@GolfSum:onboardingSetup';
const LAST_SYNC_KEY = '@GolfSum:LastSync';
const WATCH_HAVEN_COURSE_ID = 'haven_golf_course_green_valley_az';

const mapOnboardingHandicapToTypical = (
  range: 'beginner' | '10-20' | '5-10' | 'scratch+'
): number => {
  switch (range) {
    case 'beginner':
      return 24;
    case '10-20':
      return 15;
    case '5-10':
      return 8;
    case 'scratch+':
      return 3;
    default:
      return 15;
  }
};

export default function App() {
  const insets = useSafeAreaInsets();
  /** Match `BottomNavigation` Android minimum — keeps scroll content clear of the tab bar. */
  const tabBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  // Navigation state — default tab determined after rounds load
  const [activeTab, setActiveTab] = useState<TabName>('upload');
  const [initialTabSet, setInitialTabSet] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('tabs');
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(null);

  const { isOffline } = useNetworkStatus();

  useEffect(() => {
    setLoggerQuietMode(!__DEV__);
    setLoggerErrorHandler((payload) => saveLastError(payload));
    syncSubscriptionEntitlement().catch(() => undefined);
  }, []);

  const processQueuedSync = async () => {
    const result = await processSyncQueue(syncLocalDataToFirestore);
    if (result.processed > 0 && result.failed === 0) {
      await Storage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    }
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncSubscriptionEntitlement().catch(() => undefined);
        processQueuedSync().catch(() => undefined);
        getUserProfile()
          .then((profile) => syncPushRegistrationForProfile(profile, { requestPermission: false }))
          .catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, []);

  const sendFullRoundDataToWatch = useCallback(async (
    courseId: string,
    courseName?: string,
    teeName?: string,
    startingHole: number = 1,
    roundId?: string,
  ) => {
    try {
      const setup = await loadGpsRoundSetup(courseId, courseName);
      const holes = Array.isArray(setup.course?.holes) ? setup.course.holes : [];
      const currentHole = holes.find((hole: any) => Number(hole?.hole ?? hole?.number) === startingHole) || holes[0] || null;
      const normalizedTee = String(teeName || setup.teeOptions?.[0]?.name || 'Blue').trim().toLowerCase();
      const tees = Array.isArray(currentHole?.tees) ? currentHole.tees : [];
      const matchingTee =
        tees.find((tee: any) => String(tee?.name || '').trim().toLowerCase() === normalizedTee) ||
        tees.find((tee: any) => String(tee?.color || '').trim().toLowerCase() === normalizedTee) ||
        tees[0] ||
        null;

      const pois = Array.isArray(currentHole?.pois) ? currentHole.pois : [];
      const greenFront = pois.find((poi: any) => poi?.POI === 'Green' && poi?.Location === 'F');
      const greenCenter = pois.find((poi: any) => poi?.POI === 'Green' && poi?.Location === 'C');
      const greenBack = pois.find((poi: any) => poi?.POI === 'Green' && poi?.Location === 'B');
      const teeBack = pois.find((poi: any) => poi?.POI === 'Tee Back');

      let ctr = Math.round(Number(matchingTee?.yards || currentHole?.yardage || 0)) || 0;
      let frt = ctr;
      let bck = ctr;
      if (
        teeBack &&
        greenFront && greenCenter && greenBack &&
        Number.isFinite(Number(teeBack.Latitude)) &&
        Number.isFinite(Number(teeBack.Longitude))
      ) {
        const hFrt = Math.round(
          haversineYards(
            Number(teeBack.Latitude),
            Number(teeBack.Longitude),
            Number(greenFront.Latitude),
            Number(greenFront.Longitude),
          ) ?? 0,
        );
        const hCtr = Math.round(
          haversineYards(
            Number(teeBack.Latitude),
            Number(teeBack.Longitude),
            Number(greenCenter.Latitude),
            Number(greenCenter.Longitude),
          ) ?? 0,
        );
        const hBck = Math.round(
          haversineYards(
            Number(teeBack.Latitude),
            Number(teeBack.Longitude),
            Number(greenBack.Latitude),
            Number(greenBack.Longitude),
          ) ?? 0,
        );
        // Only override the scorecard fallback if haversine actually produced
        // a sane center distance. Partial/invalid POI data returns 0 and would
        // otherwise clobber the 382-yard scorecard number with zeros.
        if (hCtr > 0) {
          frt = hFrt > 0 ? hFrt : ctr;
          ctr = hCtr;
          bck = hBck > 0 ? hBck : ctr;
        }
      }

      const holesForWatch = holes.map((hole: any, index: number) => {
        const number = Math.max(1, Math.round(Number(hole?.hole ?? index + 1)) || index + 1);
        const par = Math.max(3, Math.round(Number(hole?.par ?? 4)) || 4);
        const teesH = Array.isArray(hole?.tees) ? hole.tees : [];
        const teeMatch =
          teesH.find((tee: any) => String(tee?.name || '').trim().toLowerCase() === normalizedTee) ||
          teesH.find((tee: any) => String(tee?.color || '').trim().toLowerCase() === normalizedTee) ||
          teesH[0] ||
          null;
        const poisH = Array.isArray(hole?.pois) ? hole.pois : [];
        const gfH = poisH.find((poi: any) => poi?.POI === 'Green' && poi?.Location === 'F');
        const gcH = poisH.find((poi: any) => poi?.POI === 'Green' && poi?.Location === 'C');
        const gbH = poisH.find((poi: any) => poi?.POI === 'Green' && poi?.Location === 'B');
        const tbH = poisH.find((poi: any) => poi?.POI === 'Tee Back');
        let ctrH = Math.round(Number(teeMatch?.yards || hole?.yardage || 0)) || 0;
        let frtH = ctrH;
        let bckH = ctrH;
        if (
          tbH &&
          gfH && gcH && gbH &&
          Number.isFinite(Number(tbH.Latitude)) &&
          Number.isFinite(Number(tbH.Longitude))
        ) {
          const hF = Math.round(haversineYards(Number(tbH.Latitude), Number(tbH.Longitude), Number(gfH.Latitude), Number(gfH.Longitude)) ?? 0);
          const hC = Math.round(haversineYards(Number(tbH.Latitude), Number(tbH.Longitude), Number(gcH.Latitude), Number(gcH.Longitude)) ?? 0);
          const hB = Math.round(haversineYards(Number(tbH.Latitude), Number(tbH.Longitude), Number(gbH.Latitude), Number(gbH.Longitude)) ?? 0);
          if (hC > 0) {
            frtH = hF > 0 ? hF : ctrH;
            ctrH = hC;
            bckH = hB > 0 ? hB : ctrH;
          }
        }
        return { number, par, frt: frtH, ctr: ctrH, bck: bckH };
      });

      const payload = {
        type: 'startRound',
        action: 'roundState',
        active: true,
        roundActive: true,
        roundID: roundId || `gps-${courseId}-${Date.now()}`,
        roundId: roundId || `gps-${courseId}-${Date.now()}`,
        course: courseName || setup.course?.courseName || setup.course?.name || 'Haven',
        courseName: courseName || setup.course?.courseName || setup.course?.name || 'Haven',
        currentHole: Math.max(1, startingHole),
        hole: Math.max(1, startingHole),
        par: Math.max(3, Math.round(Number(currentHole?.par || 4)) || 4),
        yardage: ctr,
        tee: teeName || matchingTee?.name || 'Blue',
        teeName: teeName || matchingTee?.name || 'Blue',
        frt,
        ctr,
        bck,
        timestamp: Date.now() / 1000,
        lastSyncAt: Date.now() / 1000,
        lastUpdated: Date.now(),
        clubs: [],
        holes: holesForWatch,
      };
      console.log('[AppRoot→Watch] sendFullRoundDataToWatch: hole=%d frt=%d ctr=%d bck=%d holes=%d',
        startingHole, frt, ctr, bck, holesForWatch.length);
      updateWatchGpsContext(payload);
    } catch (error) {
      logger.warn('Could not hydrate full round data for watch sync', error);
      // Still push an active heartbeat so the watch doesn't hang at "Last Sync: Never"
      // when course POIs fail to load — yardages will fill in from GpsRoundScreen.
      updateWatchGpsContext({
        type: 'startRound',
        action: 'roundState',
        active: true,
        roundActive: true,
        roundID: roundId || `gps-${courseId}-${Date.now()}`,
        roundId: roundId || `gps-${courseId}-${Date.now()}`,
        course: courseName || 'Haven',
        courseName: courseName || 'Haven',
        currentHole: Math.max(1, startingHole),
        hole: Math.max(1, startingHole),
        par: 4,
        tee: teeName || 'Blue',
        teeName: teeName || 'Blue',
        timestamp: Date.now() / 1000,
        lastSyncAt: Date.now() / 1000,
      });
    }
  }, []);

  useEffect(() => {
    const checkWatchEndRound = async () => {
      const flag = await consumeWatchEndRoundFlag();
      if (!flag) return;
      setRefreshTrigger(prev => prev + 1);
      Alert.alert('Round synced from Apple Watch', 'Final hole saved. Finish and save on iPhone.');
    };
    checkWatchEndRound().catch(() => undefined);
  }, [currentScreen]);

  useEffect(() => {
    if (isOffline) return;
    processQueuedSync().catch(() => undefined);
  }, [isOffline]);
  
  // Data state
  const [selectedRound, setSelectedRound] = useState<SavedRound | null>(null);
  const [isNewRound, setIsNewRound] = useState(false);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [saveConfirmationRound, setSaveConfirmationRound] = useState<SavedRound | null>(null);
  const [saveRatingDelta, setSaveRatingDelta] = useState<{ newRating: number; oldRating: number } | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourseData, setSelectedCourseData] = useState<CourseDetails | null>(null);
  const [gpsRoundCourse, setGpsRoundCourse] = useState<{
    courseId: string;
    courseName?: string;
    teeColor?: string;
    startingHole?: number;
    endingHole?: number;
    roundLength?: '18' | 'front9' | 'back9';
    routeHoleNumbers?: number[];
    routeLabel?: string;
    tournamentMode?: boolean;
  } | null>(null);
  const [watchEndRoundRequest, setWatchEndRoundRequest] = useState(0);
  const [watchGpsCommandRequest, setWatchGpsCommandRequest] = useState<{ id: number; payload: Record<string, unknown> } | null>(null);
  const [planningCourse, setPlanningCourse] = useState<{
    courseId: string;
    courseName?: string;
    teeColor?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);
  const [selectedScorecard, setSelectedScorecard] = useState<ScorecardResult | null>(null);
  const [scorecardCourseSeed, setScorecardCourseSeed] = useState<OSMGolfCourse | null>(null);
  const [scorecardImportMode, setScorecardImportMode] = useState<'course' | 'completed'>('course');
  const [quickStartSettings, setQuickStartSettings] = useState<{ teeName?: string; startingHole?: number; endingHole?: number; roundLength?: '18' | 'front9' | 'back9'; routeHoleNumbers?: number[]; routeLabel?: string }>({});
  const [inProgressRound, setInProgressRound] = useState<InProgressRoundDraft | null>(null);
  const [resumeDraft, setResumeDraft] = useState<InProgressRoundDraft | null>(null);
  const [pendingGpsRoundData, setPendingGpsRoundData] = useState<PendingGpsRoundData | null>(null);
  const [gpsResumeData, setGpsResumeData] = useState<GpsInProgressRound | null>(null);
  const [resumableGpsRound, setResumableGpsRound] = useState<GpsInProgressRound | null>(null);
  const [showGpsResumeModal, setShowGpsResumeModal] = useState(false);
  const [savingPausedGps, setSavingPausedGps] = useState(false);
  const currentScreenRef = useRef(currentScreen);
  const gpsRoundCourseRef = useRef(gpsRoundCourse);
  const watchGpsCommandSeqRef = useRef(0);

  useEffect(() => {
    currentScreenRef.current = currentScreen;
  }, [currentScreen]);

  useEffect(() => {
    gpsRoundCourseRef.current = gpsRoundCourse;
  }, [gpsRoundCourse]);

  useEffect(() => {
    checkForResumableGpsRound().then((r) => {
      if (r) {
        setResumableGpsRound(r);
        setShowGpsResumeModal(true);
      }
    });
  }, []);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    logger.debug('🔐 Setting up auth state listener...');
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        logger.debug('✅ User authenticated:', user.email);
        // Re-sync trial count from Firestore after login
        await loadTrialCount().catch(() => undefined);
        syncSubscriptionEntitlement().catch(() => undefined);
        const profile = await getUserProfile().catch(() => null);
        await syncPushRegistrationForProfile(profile, { requestPermission: false }).catch(() => undefined);
        // Refresh rounds when user signs in
        setRefreshTrigger(prev => prev + 1);
      } else {
        logger.debug('👤 User signed out');
        syncSubscriptionEntitlement().catch(() => undefined);
        clearLocalRounds()
          .then(() => {
            setRounds([]);
            setHandicapIndex(null);
            setSelectedRound(null);
            setSelectedCourseId(null);
            setSelectedCourseData(null);
            setGpsRoundCourse(null);
            setSelectedScorecard(null);
            setScorecardCourseSeed(null);
            setScorecardImportMode('course');
            setSelectedCourseName(null);
            setCurrentScreen('tabs');
            setActiveTab('upload');
            setInitialTabSet(false);
            setPersonalBests([]);
            setShowQuickStartPrompt(false);
            setInProgressRound(null);
            setResumeDraft(null);
            setPendingGpsRoundData(null);
            clearInProgressRound().catch(() => undefined);
            clearGpsInProgressRound().catch(() => undefined);
            setRefreshTrigger(prev => prev + 1);
          })
          .catch(() => undefined);
      }
    });
    
    // Cleanup listener on unmount
    return () => unsubscribe();
  }, []);
  
  // Debug: Monitor screen changes
  useEffect(() => {
    logger.debug('🔄 Screen changed to:', currentScreen);
  }, [currentScreen]);
  
  useEffect(() => {
    logger.debug('🔄 Selected round changed:', selectedRound?.courseName);
  }, [selectedRound]);
  
  // Expose Firestore reset to browser console (for debugging)
  useEffect(() => {
    if (Platform.OS === 'web' && __DEV__) {
      (window as any).resetFirestore = () => {
        resetFirestoreConnection();
        setRefreshTrigger(prev => prev + 1);
      };
      (window as any).checkAuth = async () => {
        const user = getCurrentUser();
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.debug('🔐 AUTHENTICATION STATUS');
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        if (user) {
          logger.debug('✅ Signed in as:', user.email);
          logger.debug('   User ID:', user.uid);
          logger.debug('   Display name:', user.displayName || 'Not set');
        } else {
          logger.debug('❌ NOT SIGNED IN');
          logger.debug('   Go to Profile tab and sign in to enable cloud sync');
        }
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      };
      (window as any).testFirestore = async () => {
        const user = getCurrentUser();
        if (!user) {
          logger.debug('❌ Not signed in. Run window.checkAuth() first.');
          return;
        }
        logger.debug('🧪 Testing Firestore connection...');
        logger.debug('   User:', user.email);
        logger.debug('   Checking rounds...');
        try {
          const rounds = await getRounds();
          logger.debug('✅ SUCCESS! Firestore is accessible');
          logger.debug('   Found', rounds.length, 'rounds');
        } catch (error) {
          logger.debug('❌ Request failed:', error);
        }
      };
      (window as any).syncToCloud = async () => {
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.debug('☁️  SYNCING LOCAL ROUNDS TO FIRESTORE');
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        await syncLocalDataToFirestore();
        const pending = await getPendingSyncCount();
        logger.debug('   Pending sync tasks:', pending);
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        setRefreshTrigger(prev => prev + 1); // Refresh the UI
      };
      (window as any).seedPebbleHistory = async () => {
        const user = getCurrentUser();
        if (!user) {
          logger.debug('❌ Not signed in. Run window.checkAuth() first.');
          return;
        }
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.debug('🏌️  SEEDING PEBBLE BEACH HISTORY');
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const rounds = await seedPebbleHistoryRounds();
        logger.debug(`✅ Added ${rounds.length} Pebble rounds`);
        rounds.forEach((round, index) => {
          logger.debug(`   ${index + 1}. ${round.courseName} ${round.score}`);
        });
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        setRefreshTrigger(prev => prev + 1);
      };
      (window as any).seedHavenHistory = async () => {
        const user = getCurrentUser();
        if (!user) {
          logger.debug('❌ Not signed in. Run window.checkAuth() first.');
          return;
        }
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.debug('🏌️  SEEDING HAVEN HISTORY');
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const rounds = await seedHavenHistoryRounds();
        logger.debug(`✅ Added ${rounds.length} Haven rounds`);
        rounds.forEach((round, index) => {
          logger.debug(`   ${index + 1}. ${round.courseName} ${round.score}`);
        });
        logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        setRefreshTrigger(prev => prev + 1);
      };
      logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.debug('💡 CONSOLE COMMANDS:');
      logger.debug('   window.checkAuth()    - Check authentication status');
      logger.debug('   window.syncToCloud()  - Upload local rounds to Firestore');
      logger.debug('   window.testFirestore() - Test Firestore connection');
      logger.debug('   window.resetFirestore() - Reset Firestore after rule changes');
      logger.debug('   window.seedPebbleHistory() - Add 3 Pebble Beach test rounds');
      logger.debug('   window.seedHavenHistory() - Add 3 Haven Golf Course test rounds');
      logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }, []);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [rounds, setRounds] = useState<SavedRound[]>([]);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  
  // UI state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingHandicap, setOnboardingHandicap] = useState<'beginner' | '10-20' | '5-10' | 'scratch+'>('10-20');
  const [onboardingScoringMode, setOnboardingScoringMode] = useState<'basic' | 'advanced'>('basic');
  const [personalBests, setPersonalBests] = useState<PersonalBest[]>([]);
  const [activeMilestone, setActiveMilestone] = useState<MilestoneEvent | null>(null);
  const [showQuickStartPrompt, setShowQuickStartPrompt] = useState(false);
  const [upgradeTrigger, setUpgradeTrigger] = useState<UpgradeTrigger>('profile');
  const [upgradeReturnScreen, setUpgradeReturnScreen] = useState<AppScreen>('tabs');

  const handleNotificationOpen = useCallback(async (payload: NotificationRoutePayload) => {
    if (payload.screen === 'pro-upgrade') {
      setUpgradeTrigger((payload.source as UpgradeTrigger) || 'profile');
      setUpgradeReturnScreen('tabs');
      setCurrentScreen('pro-upgrade');
      return;
    }

    if (payload.tab && ['history', 'averages', 'upload', 'insights', 'profile'].includes(payload.tab)) {
      setActiveTab(payload.tab as TabName);
      setCurrentScreen('tabs');
      return;
    }

    if (payload.screen === 'round-detail' && payload.roundId) {
      const existingRound = rounds.find((round) => round.id === payload.roundId);
      const resolvedRound = existingRound || (await getRounds()).find((round) => round.id === payload.roundId);
      if (resolvedRound) {
        setSelectedRound(resolvedRound);
        setActiveTab('history');
        setCurrentScreen('round-detail');
        return;
      }
    }

    if (payload.screen === 'gps-round') {
      setActiveTab('upload');
      setCurrentScreen('tabs');
      return;
    }

    if (payload.screen && ['history', 'averages', 'upload', 'insights', 'profile'].includes(payload.screen)) {
      setActiveTab(payload.screen as TabName);
      setCurrentScreen('tabs');
    }
  }, [rounds]);

  useEffect(() => initializePushNotifications(handleNotificationOpen), [handleNotificationOpen]);


  useEffect(() => {
    const loadOnboarding = async () => {
      const complete = await Storage.getItem(ONBOARDING_COMPLETE_KEY);
      const legacy = await Storage.getItem(ONBOARDING_LEGACY_KEY);
      const setup = await Storage.getItem(ONBOARDING_SETUP_KEY);
      // Show onboarding for true first-run OR older installs that never saved setup.
      if ((!complete && !legacy) || !setup) {
        setShowOnboarding(true);
      }
    };
    loadOnboarding();
  }, []);

  useEffect(() => {
    const checkQuickStartPrompt = async () => {
      if (showOnboarding) return;
      if (currentScreen !== 'tabs') return;
      const setup = await Storage.getItem(ONBOARDING_SETUP_KEY);
      if (!setup) return;
      const importSeen = await Storage.getItem('@GolfSum:importPromptSeen');
      const sampleSeen = await Storage.getItem('@GolfSum:samplePromptSeen');
      if (importSeen && sampleSeen) return;
      const sample = await getSampleRound();
      const allRounds = await getRounds();
      const hasRealRounds = allRounds.some(round => !round.isSample);
      if (!hasRealRounds && !sample) {
        setShowQuickStartPrompt(true);
      }
    };
    checkQuickStartPrompt();
  }, [showOnboarding, currentScreen, refreshTrigger]);

  useEffect(() => {
    const loadInProgressRound = async () => {
      const draft = await getInProgressRound();
      setInProgressRound(draft);
    };
    loadInProgressRound();
  }, [currentScreen, refreshTrigger]);

  // Load rounds for insights
  useEffect(() => {
    // Don't reload if we're viewing a specific round
    if (currentScreen === 'round-detail' || currentScreen === 'scorecard-view') {
      logger.debug('⏸️  Skipping round reload (viewing detail)');
      return;
    }
    
    const loadRounds = async () => {
      try {
        logger.debug('🔄 Loading rounds...');
        // Load trial state into memory cache (merges local + Firestore)
        await loadTrialCount();
        const loadedRounds = await getRounds();
        setRounds(loadedRounds);
        const hc = await calculateHandicapIndex();
        setHandicapIndex(hc);
        logger.debug('✅ Rounds loaded:', loadedRounds.length);

        // Set initial landing tab based on round count (one-time on first load)
        if (!initialTabSet) {
          setInitialTabSet(true);
          if (loadedRounds.length >= 3) {
            setActiveTab('averages');
          } else {
            setActiveTab('upload');
          }
        }
      } catch (error) {
        logger.error('Error loading rounds:', error);
        if (!initialTabSet) {
          setInitialTabSet(true);
          setActiveTab('upload');
        }
      }
    };
    
    loadRounds();
  }, [refreshTrigger, currentScreen]);

  // Start new round flow
  const handleStartNewRound = () => {
    if (inProgressRound) {
      Alert.alert(
        'Resume Round?',
        `You have an unfinished round at ${inProgressRound.courseName}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Start New',
            style: 'destructive',
            onPress: async () => {
              await clearInProgressRound();
              setInProgressRound(null);
              setResumeDraft(null);
              setCurrentScreen('course-search');
            },
          },
          {
            text: 'Continue',
            onPress: () => handleResumeRound(inProgressRound),
          },
        ]
      );
      return;
    }
    setCurrentScreen('course-search');
  };

  // Course selected, go to score entry
  const handleCourseSelected = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedCourseData(null);
    setQuickStartSettings({});
    setResumeDraft(null);
    setPendingGpsRoundData(null);
    setCurrentScreen('score-entry');
  };

  const handleCommunityCourseSelected = (course: CourseDetails) => {
    setSelectedCourseData(course);
    setSelectedCourseId(course.id);
    setQuickStartSettings({});
    setResumeDraft(null);
    setPendingGpsRoundData(null);
    setCurrentScreen('score-entry');
  };

  const handleStartGpsRound = (
    courseId: string,
    courseName?: string,
    settings?: { teeName?: string; startingHole?: number; endingHole?: number; roundLength?: '18' | 'front9' | 'back9'; tournamentMode?: boolean; routeHoleNumbers?: number[]; routeLabel?: string }
  ) => {
    const teeName = settings?.teeName || 'Blue';
    const currentHole = settings?.startingHole || 1;
    const roundId = `gps-${courseId}-${Date.now()}`;
    // Immediate synchronous heartbeat so the watch sees Messages > 0 even if
    // POI hydration below fails or takes a while. Without this, the watch sits
    // at "Last Sync: Never" forever when course data isn't cached locally.
    updateWatchGpsContext({
      type: 'startRound',
      action: 'roundState',
      active: true,
      roundActive: true,
      roundID: roundId,
      roundId,
      course: courseName || 'Haven',
      courseName: courseName || 'Haven',
      currentHole,
      hole: currentHole,
      par: 4,
      tee: teeName,
      teeName,
      timestamp: Date.now() / 1000,
      lastSyncAt: Date.now() / 1000,
    });
    // Async follow-up with real POI-derived yardages.
    void sendFullRoundDataToWatch(courseId, courseName, teeName, currentHole, roundId);

    setGpsResumeData(null);
    setGpsRoundCourse({
      courseId,
      courseName,
      teeColor: teeName,
      startingHole: currentHole,
      endingHole: settings?.endingHole || 18,
      roundLength: settings?.roundLength || '18',
      routeHoleNumbers: settings?.routeHoleNumbers,
      routeLabel: settings?.routeLabel,
      tournamentMode: settings?.tournamentMode ?? false,
    });
    setCurrentScreen('gps-round');
  };

  const handleStartGpsRoundRef = useRef(handleStartGpsRound);
  handleStartGpsRoundRef.current = handleStartGpsRound;

  useLayoutEffect(() => {
    const teardown = initializeWatchReceiver(async (event: WatchBridgeEvent) => {
      if (event.type === 'startRoundFromWatch') {
        const cn = event.course || event.courseName || 'Haven';
        const tn = event.tee || event.teeName || 'Blue';
        const holeNumber = event.currentHole || event.holeNumber || 1;
        logger.debug('Start round requested from watch', event);

        // Ack the watch immediately so its debug panel moves off "Last Sync: Never"
        // regardless of whether course data loads. Real yardages follow below.
        const ackRoundId = `gps-${WATCH_HAVEN_COURSE_ID}-${Date.now()}`;
        updateWatchGpsContext({
          type: 'startRound',
          action: 'roundState',
          active: true,
          roundActive: true,
          roundID: ackRoundId,
          roundId: ackRoundId,
          course: cn,
          courseName: cn,
          currentHole: holeNumber,
          hole: holeNumber,
          par: 4,
          tee: tn,
          teeName: tn,
          timestamp: Date.now() / 1000,
          lastSyncAt: Date.now() / 1000,
        });

        let hasRealSetup = false;
        try {
          const setup = await loadGpsRoundSetup(WATCH_HAVEN_COURSE_ID, cn);
          hasRealSetup = !!(setup?.course && hasGpsHoleData(setup.course));
        } catch (error) {
          logger.warn('Watch start failed to hydrate GPS round setup', error);
        }
        if (!hasRealSetup) {
          // Previously we bailed here — which left watch commands (addShot / addPutt /
          // endRound) dangling because GpsRoundScreen never mounted. Instead, start the
          // round anyway. GpsRoundScreen has its own course loader; without POIs the
          // round degrades to map-only with scorecard yardages, which is still better
          // than locking the watch out of shot entry.
          logger.warn('Starting watch round without cached GPS hole data; yardages will be scorecard-only.');
        }

        handleStartGpsRoundRef.current(WATCH_HAVEN_COURSE_ID, cn, {
          teeName: tn,
          startingHole: holeNumber,
          endingHole: 18,
          roundLength: '18',
        });
        void sendFullRoundDataToWatch(WATCH_HAVEN_COURSE_ID, cn, tn, holeNumber);
        return;
      }
      if (event.type === 'endRound') {
        logger.debug('End round requested from watch', event);
        setWatchEndRoundRequest((prev) => prev + 1);
        if (gpsRoundCourseRef.current && currentScreenRef.current !== 'gps-round') {
          setCurrentScreen('gps-round');
        }
        return;
      }
      setRefreshTrigger((prev) => prev + 1);
      if (event.type === 'end_round') {
        Alert.alert('Round synced from Apple Watch', 'Final hole saved. Finish and save on iPhone.');
      }
    }, (payload) => {
      logger.debug('Watch GPS command fallback routed through AppRoot', payload);
      watchGpsCommandSeqRef.current += 1;
      setWatchGpsCommandRequest({
        id: watchGpsCommandSeqRef.current,
        payload,
      });
      if (gpsRoundCourseRef.current && currentScreenRef.current !== 'gps-round') {
        setCurrentScreen('gps-round');
      }
    });

    return () => teardown();
  }, [sendFullRoundDataToWatch]);

  const handleStartPlanning = (courseId: string, courseName?: string, teeColor?: string, latitude?: number, longitude?: number) => {
    setPlanningCourse({ courseId, courseName, teeColor, latitude, longitude });
    setCurrentScreen('course-planning');
  };

  const handleQuickStart = (courseId: string, teeName?: string) => {
    setSelectedCourseId(courseId);
    setSelectedCourseData(null);
    setQuickStartSettings({ teeName, startingHole: 1 });
    setResumeDraft(null);
    setPendingGpsRoundData(null);
    setCurrentScreen('score-entry');
  };

  const handleResumeRound = (draft: InProgressRoundDraft) => {
    setSelectedCourseId(draft.courseId);
    setSelectedCourseData(draft.courseOverride || null);
    setQuickStartSettings({});
    setResumeDraft(draft);
    setPendingGpsRoundData(null);
    setCurrentScreen('score-entry');
  };

  const handleFinishGpsRound = async (data: PendingGpsRoundData) => {
    // Save GPS rounds directly to history (avoid routing through score-entry / old scorecard flow).
    try {
      const saved = await saveCompletedGpsRoundToHistory(data);
      updateWatchGpsContext({
        active: false,
        roundActive: false,
        action: 'roundState',
        type: 'roundEnded',
        roundID: data.courseId,
        roundId: data.courseId,
        finalHole: data.endingHole || data.startingHole || 18,
        timestamp: Date.now() / 1000,
        lastSyncAt: Date.now() / 1000,
        frt: 0,
        ctr: 0,
        bck: 0,
        clubs: [],
        holes: [],
      });
      setSelectedRound(saved);
      setGpsRoundCourse(null);
      setGpsResumeData(null);
      setPendingGpsRoundData(null);
      setQuickStartSettings({});
      setResumeDraft(null);
      setSelectedCourseId(null);
      setSelectedCourseData(null);
      setRefreshTrigger(prev => prev + 1);
      setCurrentScreen('gps-round-summary');
    } catch (e) {
      logger.error('Failed to save GPS round', e);
      Alert.alert('Save failed', 'Could not save this GPS round. Please try again.');
      // Fallback to the previous flow so the user can still preserve their data.
      setPendingGpsRoundData(data);
      setSelectedCourseId(data.courseId);
      setSelectedCourseData(null);
      setQuickStartSettings({
        teeName: data.teeName,
        startingHole: data.startingHole || 1,
        endingHole: data.endingHole || 18,
        roundLength: data.roundLength || '18',
        routeHoleNumbers: data.routeHoleNumbers,
        routeLabel: data.routeLabel,
      });
      setResumeDraft(null);
      setGpsRoundCourse(null);
      setGpsResumeData(null);
      setCurrentScreen('score-entry');
    }
  };

  const handleResumePausedGpsRound = async (bucket: string | null) => {
    setShowGpsResumeModal(false);
    const r = resumableGpsRound;
    if (!r) return;
    let updatedPauseEvents = [...(r.timing.pauseEvents || [])];
    const hasOpenPause = updatedPauseEvents.some((p) => !p.resumedAt);
    if (!hasOpenPause && bucket) {
      updatedPauseEvents.push(createEstimatedPauseEvent(bucket, r.timing.lastActiveAt));
    } else if (hasOpenPause) {
      updatedPauseEvents = updatedPauseEvents.map((p) => (p.resumedAt ? p : closePauseEvent(p)));
    }
    const next: GpsInProgressRound = {
      ...r,
      status: 'in_progress',
      timing: {
        ...r.timing,
        pauseEvents: updatedPauseEvents,
        lastActiveAt: Date.now(),
      },
    };
    await saveGpsInProgressRound(next);
    setGpsResumeData(next);
    setResumableGpsRound(null);
    setGpsRoundCourse({
      courseId: next.courseId,
      courseName: next.courseName,
      teeColor: next.teeColor,
      startingHole: next.startingHole ?? 1,
      endingHole: next.endingHole ?? 18,
      roundLength: next.roundLength || '18',
      routeHoleNumbers: next.routeHoleNumbers,
      routeLabel: next.routeLabel,
      tournamentMode: next.tournamentMode ?? false,
    });
    setCurrentScreen('gps-round');
  };

  const handleDismissGpsResumeModal = () => {
    setShowGpsResumeModal(false);
  };

  const handleAbandonPausedGpsRound = async () => {
    setShowGpsResumeModal(false);
    await clearGpsInProgressRound().catch(() => undefined);
    setResumableGpsRound(null);
    Alert.alert('Paused round discarded', 'You can start a new GPS round anytime.');
  };

  const handleUploadScorecard = (seed?: OSMGolfCourse) => {
    setScorecardCourseSeed(seed || null);
    setScorecardImportMode('course');
    setCurrentScreen('scorecard-import');
  };

  const handleImportCompletedScorecard = () => {
    setScorecardCourseSeed(null);
    setScorecardImportMode('completed');
    setCurrentScreen('scorecard-import');
  };

  const handleUpgrade = async (trigger: UpgradeTrigger) => {
    setUpgradeTrigger(trigger);
    setUpgradeReturnScreen(currentScreen);
    setCurrentScreen('pro-upgrade');
  };

  // Round saved — show confirmation overlay then navigate to detail
  const handleRoundSaved = (round: SavedRound) => {
    // Clear entry state
    setSelectedCourseId(null);
    setSelectedCourseData(null);
    setQuickStartSettings({});
    setResumeDraft(null);
    setPendingGpsRoundData(null);
    setSelectedScorecard(null);

    // Detect milestones and personal bests in background
    const milestone = detectMilestone(round, [...rounds, round], handicapIndex);
    setActiveMilestone(milestone);
    const bests = detectPersonalBests(round, rounds);
    if (bests.length > 0) {
      setPersonalBests(bests);
      appendPersonalBests(bests).catch(() => undefined);
      requestAppReviewIfEligible({
        trigger: 'personal_best',
        roundsCount: rounds.length + 1,
        isInRound: false,
      }).catch(() => undefined);
    } else {
      setPersonalBests([]);
    }

    // Compute Player Rating delta and persist to profile
    const oldRating = handicapIndex;
    calculateHandicapIndex().then(async (newRating) => {
      if (oldRating != null && newRating != null) {
        setSaveRatingDelta({ oldRating, newRating });
      } else {
        setSaveRatingDelta(null);
      }
      // Persist playerRating to profile for web dashboard / cross-device
      if (newRating != null) {
        try {
          const profile = await getUserProfile();
          await saveUserProfile({ ...profile, playerRating: newRating });
        } catch { /* non-critical */ }
      }
    }).catch(() => setSaveRatingDelta(null));

    // Show save confirmation overlay
    setSaveConfirmationRound(round);
    setShowSaveConfirmation(true);
  };

  const handleSavePausedGpsToHistory = async () => {
    const r = resumableGpsRound;
    if (!r || savingPausedGps) return;
    setSavingPausedGps(true);
    try {
      const saved = await savePausedGpsAsPartialRound(r);
      if (!saved) {
        Alert.alert(
          'Could not save',
          'You need at least one hole with shots or a score. If you are offline, try again when course details can load.'
        );
        return;
      }
      await clearGpsInProgressRound().catch(() => undefined);
      setResumableGpsRound(null);
      setShowGpsResumeModal(false);
      setGpsResumeData(null);
      handleRoundSaved(saved);
    } catch (e) {
      logger.error('handleSavePausedGpsToHistory', e);
      Alert.alert('Save failed', 'Please try again.');
    } finally {
      setSavingPausedGps(false);
    }
  };

  // Called after 2.5s confirmation auto-advance
  const handleSaveConfirmationComplete = useCallback(() => {
    setShowSaveConfirmation(false);
    const round = saveConfirmationRound;
    setSaveConfirmationRound(null);
    setSaveRatingDelta(null);
    if (round) {
      setSelectedRound(round);
      setIsNewRound(true);
      setCurrentScreen('round-detail');
      setActiveTab('history');
      setRefreshTrigger(prev => prev + 1);
    }
  }, [saveConfirmationRound]);

  const handlePlayAgain = (round: SavedRound) => {
    const courseId = round.courseId || round.courseSnapshot?.courseId;
    if (!courseId) {
      Alert.alert('Missing Course', 'This round is missing course details. Please re-select the course.');
      return;
    }
    setSelectedCourseId(courseId);
    setSelectedCourseData(null);
    setQuickStartSettings({ teeName: round.teeName || round.stats?.teeBox, startingHole: 1 });
    setResumeDraft(null);
    setPendingGpsRoundData(null);
    setCurrentScreen('score-entry');
  };

  // View round detail from history
  const handleRoundPress = (round: SavedRound) => {
    logger.debug('📊 handleRoundPress called');
    logger.debug('📊 Opening round detail:', round.courseName, round.score);
    logger.debug('📊 Current screen:', currentScreen);
    
    // Batch state updates to prevent race conditions on iOS
    setSelectedRound(prevRound => {
      logger.debug('📊 Setting selected round');
      return round;
    });
    setCurrentScreen(prevScreen => {
      logger.debug('📊 Setting screen to round-detail');
      return 'round-detail';
    });
  };

  const handleCourseStatsPress = (courseName: string) => {
    setSelectedCourseName(courseName);
    setCurrentScreen('course-analytics');
  };

  // View scorecard from round detail
  const handleViewScorecard = (scorecard: ScorecardResult) => {
    setSelectedScorecard(scorecard);
    setCurrentScreen('scorecard-view');
  };

  // Back navigation
  const handleBack = () => {
    if (currentScreen === 'score-entry') {
      setSelectedCourseId(null);
      setSelectedCourseData(null);
      setQuickStartSettings({});
      setResumeDraft(null);
      setPendingGpsRoundData(null);
      setCurrentScreen('course-search');
    } else if (currentScreen === 'course-search') {
      setCurrentScreen('tabs');
    } else if (currentScreen === 'scorecard-import') {
      if (scorecardImportMode === 'completed') {
        setActiveTab('history');
        setCurrentScreen('tabs');
      } else {
        setCurrentScreen('course-search');
      }
    } else if (currentScreen === 'round-detail') {
      setSelectedRound(null);
      setCurrentScreen('tabs');
    } else if (currentScreen === 'scorecard-view') {
      setSelectedScorecard(null);
      if (selectedRound) {
        setCurrentScreen('round-detail');
      } else {
        setCurrentScreen('tabs');
      }
    } else if (currentScreen === 'course-analytics') {
      setSelectedCourseName(null);
      setCurrentScreen('tabs');
    } else if (currentScreen === 'pro-upgrade') {
      setCurrentScreen(upgradeReturnScreen === 'pro-upgrade' ? 'tabs' : upgradeReturnScreen);
    } else if (currentScreen === 'gps-round') {
      setGpsRoundCourse(null);
      setGpsResumeData(null);
      setCurrentScreen('course-search');
    } else if (currentScreen === 'course-planning') {
      setPlanningCourse(null);
      setCurrentScreen('course-search');
    } else if (currentScreen === 'gps-round-review') {
      setCurrentScreen('round-detail');
    } else {
      setCurrentScreen('tabs');
    }
  };

  // Tab press
  const handleTabPress = (tab: TabName) => {
    setActiveTab(tab);
    setCurrentScreen('tabs');
    setSelectedRound(null);
    setSelectedCourseId(null);
    setSelectedScorecard(null);
    setSelectedCourseName(null);
    setGpsRoundCourse(null);
    setPlanningCourse(null);
    setPendingGpsRoundData(null);
  };

  const completeOnboarding = async () => {
    try {
      const profile = await getUserProfile();
      const typicalHandicap = mapOnboardingHandicapToTypical(onboardingHandicap);
      await saveUserProfile({
        ...profile,
        scoringMode: onboardingScoringMode,
        coursePreferences: {
          ...profile.coursePreferences,
          typicalHandicap,
        },
      });
    } catch {
      // Onboarding should not block on profile persistence.
    }

    await Storage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    await Storage.setItem(ONBOARDING_LEGACY_KEY, 'true');
    await Storage.setItem(ONBOARDING_SETUP_KEY, JSON.stringify({
      handicapRange: onboardingHandicap,
      scoringMode: onboardingScoringMode,
    }));
    setShowOnboarding(false);
    setOnboardingStep(0);
  };

  const content = (
    <AppMainContent
      currentScreen={currentScreen}
      activeTab={activeTab}
      selectedRound={selectedRound}
      selectedCourseId={selectedCourseId}
      selectedCourseData={selectedCourseData}
      selectedScorecard={selectedScorecard}
      selectedCourseName={selectedCourseName}
      rounds={rounds}
      handicapIndex={handicapIndex}
      inProgressRound={inProgressRound}
      isOffline={isOffline}
      refreshTrigger={refreshTrigger}
      personalBests={personalBests}
      milestoneEvent={activeMilestone}
      upgradeTrigger={upgradeTrigger}
      scorecardCourseSeed={scorecardCourseSeed}
      scorecardImportMode={scorecardImportMode}
      quickStartSettings={quickStartSettings}
      resumeDraft={resumeDraft}
      pendingGpsRoundData={pendingGpsRoundData}
      onSetActiveTab={setActiveTab}
      onSetCurrentScreen={setCurrentScreen}
      onSetSelectedCourseData={setSelectedCourseData}
      onSetSelectedCourseId={setSelectedCourseId}
      onSetSelectedRound={setSelectedRound}
      onSetRefreshTrigger={setRefreshTrigger}
      onSetPersonalBests={setPersonalBests}
      onDismissMilestone={() => setActiveMilestone(null)}
      onSetInProgressRound={setInProgressRound}
      onSetResumeDraft={setResumeDraft}
      onCourseSelected={handleCourseSelected}
      onStartGpsRound={handleStartGpsRound}
      onFinishGpsRound={handleFinishGpsRound}
      onBack={handleBack}
      onUploadScorecard={handleUploadScorecard}
      onCommunityCourseSelected={handleCommunityCourseSelected}
      onQuickStart={handleQuickStart}
      onResumeRound={handleResumeRound}
      isNewRound={isNewRound}
      onClearNewRound={() => setIsNewRound(false)}
      onRoundSaved={handleRoundSaved}
      onCourseStatsPress={handleCourseStatsPress}
      onRoundPress={handleRoundPress}
      onPlayAgain={handlePlayAgain}
      onStartNewRound={handleStartNewRound}
      onImportCompletedScorecard={handleImportCompletedScorecard}
      onUpgrade={handleUpgrade}
      onSyncSubscriptionEntitlement={syncSubscriptionEntitlement}
      gpsRoundCourse={gpsRoundCourse}
      planningCourse={planningCourse}
      onStartPlanning={handleStartPlanning}
    />
  );

  // Show header and bottom nav only on tabs screen
  const showHeaderAndNav = currentScreen === 'tabs';

  const currentOnboarding = onboardingStep; // 0 = welcome, 1 = choose path

  return (
    <GestureHandlerRootView style={styles.container}>
      <ErrorBoundary>
        <View style={[styles.container, { backgroundColor: '#1C1C1E' }]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent={Platform.OS === 'android'}
        />
      {showOnboarding && (
        <View style={styles.onboardingOverlay}>
          {currentOnboarding === 0 ? (
            <View style={styles.onboardingCard}>
              <TouchableOpacity onPress={completeOnboarding} style={styles.onboardingTopSkip}>
                <Text style={styles.onboardingSkip}>Skip</Text>
              </TouchableOpacity>
              <GolfSumLogo variant="splash" />
              <Text style={styles.onboardingTitleLeft}>Your rounds. Your data. Your edge.</Text>
              <Text style={styles.onboardingDescriptionLeft}>
                Snap a photo of any scorecard or enter your round. GolfSum turns it into coaching insights.
              </Text>
              <TouchableOpacity
                style={styles.onboardingPrimaryButton}
                onPress={() => setOnboardingStep(1)}
              >
                <Text style={styles.onboardingPrimaryButtonText}>Get Started</Text>
                <Ionicons name="arrow-forward" size={18} color="#0f1419" />
              </TouchableOpacity>
            </View>
          ) : currentOnboarding === 1 ? (
            <View style={styles.onboardingCard}>
              <TouchableOpacity onPress={completeOnboarding} style={styles.onboardingTopSkip}>
                <Text style={styles.onboardingSkip}>Skip</Text>
              </TouchableOpacity>
              <Text style={styles.onboardingTitle}>How it works</Text>
              <View style={styles.onboardingStepRow}>
                <Ionicons name="camera" size={20} color="#10B981" />
                <View style={styles.onboardingStepText}>
                  <Text style={styles.onboardingStepTitle}>Snap or Score</Text>
                  <Text style={styles.onboardingStepBody}>Photograph a scorecard or track live</Text>
                </View>
              </View>
              <View style={styles.onboardingStepRow}>
                <Ionicons name="stats-chart" size={20} color="#10B981" />
                <View style={styles.onboardingStepText}>
                  <Text style={styles.onboardingStepTitle}>See patterns</Text>
                  <Text style={styles.onboardingStepBody}>FW misses, GIR trends, putting habits</Text>
                </View>
              </View>
              <View style={styles.onboardingStepRow}>
                <Ionicons name="bulb" size={20} color="#10B981" />
                <View style={styles.onboardingStepText}>
                  <Text style={styles.onboardingStepTitle}>Get coached</Text>
                  <Text style={styles.onboardingStepBody}>Coaching tips built from your rounds</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.onboardingPrimaryButton} onPress={() => setOnboardingStep(2)}>
                <Text style={styles.onboardingPrimaryButtonText}>Next</Text>
                <Ionicons name="arrow-forward" size={18} color="#0f1419" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.onboardingCard}>
              <TouchableOpacity onPress={completeOnboarding} style={styles.onboardingTopSkip}>
                <Text style={styles.onboardingSkip}>Skip</Text>
              </TouchableOpacity>
              <Text style={styles.onboardingTitle}>Quick setup</Text>
              <Text style={styles.onboardingDescriptionLeft}>Help us personalize your experience</Text>

              <Text style={styles.onboardingFieldLabel}>Handicap range</Text>
              <View style={styles.onboardingChoiceWrap}>
                {[
                  ['beginner', 'Beginner'],
                  ['10-20', '10-20'],
                  ['5-10', '5-10'],
                  ['scratch+', 'Scratch+'],
                ].map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.onboardingChoice, onboardingHandicap === value && styles.onboardingChoiceActive]}
                    onPress={() => setOnboardingHandicap(value as 'beginner' | '10-20' | '5-10' | 'scratch+')}
                  >
                    <Text style={[styles.onboardingChoiceText, onboardingHandicap === value && styles.onboardingChoiceTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.onboardingFieldLabel}>Scoring mode</Text>
              <View style={styles.onboardingChoiceColumn}>
                <TouchableOpacity
                  style={[styles.onboardingPathCard, onboardingScoringMode === 'basic' && styles.onboardingPathCardActive]}
                  onPress={() => setOnboardingScoringMode('basic')}
                >
                  <View style={styles.onboardingPathTextContainer}>
                    <Text style={styles.onboardingPathTitle}>Basic — Score & Putts</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.onboardingPathCard, onboardingScoringMode === 'advanced' && styles.onboardingPathCardActive]}
                  onPress={() => setOnboardingScoringMode('advanced')}
                >
                  <View style={styles.onboardingPathTextContainer}>
                    <Text style={styles.onboardingPathTitle}>Advanced — Full Stats</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {onboardingScoringMode === 'advanced' && (
                <Text style={styles.onboardingHint}>
                  You get 3 free Advanced rounds to try it out. No credit card. No time limit.
                </Text>
              )}

              <TouchableOpacity
                style={styles.onboardingPrimaryButton}
                onPress={completeOnboarding}
              >
                <Text style={styles.onboardingPrimaryButtonText}>Start Tracking</Text>
                <Ionicons name="arrow-forward" size={18} color="#0f1419" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {showQuickStartPrompt && (
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingCard}>
            <TouchableOpacity
              onPress={async () => {
                await Storage.setItem('@GolfSum:importPromptSeen', 'true');
                await Storage.setItem('@GolfSum:samplePromptSeen', 'true');
                setShowQuickStartPrompt(false);
              }}
              style={styles.onboardingTopSkip}
            >
              <Text style={styles.onboardingSkip}>Skip</Text>
            </TouchableOpacity>
            <Ionicons name="sparkles-outline" size={48} color="#10B981" />
            <Text style={styles.onboardingTitle}>Start Your First Insights</Text>
            <Text style={styles.onboardingDescriptionLeft}>
              Import a scorecard or load sample data to preview averages, insights, and history.
            </Text>
            <View style={{ width: '100%', gap: 10 }}>
              <TouchableOpacity
                style={styles.onboardingPrimaryButton}
                onPress={async () => {
                  await Storage.setItem('@GolfSum:importPromptSeen', 'true');
                  await Storage.setItem('@GolfSum:samplePromptSeen', 'true');
                  setShowQuickStartPrompt(false);
                  handleImportCompletedScorecard();
                }}
              >
                <Text style={styles.onboardingPrimaryButtonText}>{UI_COPY.actions.importScorecards}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.onboardingPrimaryButton, { backgroundColor: '#242d38' }]}
                onPress={async () => {
                  await loadSampleRounds();
                  await Storage.setItem('@GolfSum:importPromptSeen', 'true');
                  await Storage.setItem('@GolfSum:samplePromptSeen', 'true');
                  setShowQuickStartPrompt(false);
                  setRefreshTrigger(prev => prev + 1);
                }}
              >
                <Text style={[styles.onboardingPrimaryButtonText, { color: '#E5E7EB' }]}>Load Sample Rounds</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      
      {/* Header - only show on tabs */}
      {showHeaderAndNav && (
        <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
          <GolfSumLogo variant="header" />
          {isOffline && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>Offline</Text>
            </View>
          )}
        </View>
      )}

      {/* Main Content — pad for absolute bottom tab bar + home indicator */}
      <View
        style={[
          styles.mainContent,
          showHeaderAndNav && { paddingBottom: BOTTOM_NAV_CONTENT_HEIGHT + tabBottomInset },
        ]}
      >
        {showHeaderAndNav && resumableGpsRound && !showGpsResumeModal ? (
          <TouchableOpacity
            style={resumeBannerStyles.wrap}
            onPress={() => setShowGpsResumeModal(true)}
            activeOpacity={0.85}
          >
            <View style={resumeBannerStyles.row}>
              <View style={resumeBannerStyles.left}>
                <View style={resumeBannerStyles.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={resumeBannerStyles.title}>Round paused — {resumableGpsRound.courseName}</Text>
                  <Text style={resumeBannerStyles.sub}>
                    Hole {resumableGpsRound.pausedOnHole ?? '—'} · {formatTimeAgo(resumableGpsRound.timing.lastActiveAt)}
                  </Text>
                </View>
              </View>
              <Text style={resumeBannerStyles.cta}>Resume →</Text>
            </View>
          </TouchableOpacity>
        ) : null}
        {content}
      </View>

      {/* GPS Round — full-screen absolute overlay, bypasses mainContent constraints */}
      {currentScreen === 'gps-round' && gpsRoundCourse && (
        Platform.OS === 'web' ? (
          <View style={StyleSheet.absoluteFillObject}>
            <WebGpsRoundPreview
              courseId={gpsRoundCourse.courseId}
              courseName={gpsRoundCourse.courseName}
              teeColor={gpsRoundCourse.teeColor}
              startingHole={gpsRoundCourse.startingHole}
              endingHole={gpsRoundCourse.endingHole}
              roundLength={gpsRoundCourse.roundLength}
              routeHoleNumbers={gpsRoundCourse.routeHoleNumbers as any}
              routeLabel={gpsRoundCourse.routeLabel}
              tournamentMode={gpsRoundCourse.tournamentMode}
              onBack={handleBack}
              onSwitchToManual={handleBack}
            />
          </View>
        ) : (
          <View style={StyleSheet.absoluteFillObject}>
            <GpsRoundScreen
              courseId={gpsRoundCourse.courseId}
              courseName={gpsRoundCourse.courseName}
              teeColor={gpsRoundCourse.teeColor}
              startingHole={gpsRoundCourse.startingHole}
              endingHole={gpsRoundCourse.endingHole}
              roundLength={gpsRoundCourse.roundLength}
              routeHoleNumbers={gpsRoundCourse.routeHoleNumbers as any}
              routeLabel={gpsRoundCourse.routeLabel}
              tournamentMode={gpsRoundCourse.tournamentMode}
              onBack={handleBack}
              onFinishRound={handleFinishGpsRound}
              resumedRoundData={gpsResumeData as any}
              watchEndRoundRequest={watchEndRoundRequest}
              watchGpsCommandRequest={watchGpsCommandRequest}
            />
          </View>
        )
      )}

      {/* Bottom Navigation */}
      {showHeaderAndNav && (
        <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} bottomInset={insets.bottom} />
      )}

      {showSaveConfirmation && saveConfirmationRound && (
        <SaveConfirmationOverlay
          visible={showSaveConfirmation}
          courseName={saveConfirmationRound.courseName}
          score={saveConfirmationRound.score}
          scoreToPar={saveConfirmationRound.score - (saveConfirmationRound.holes || []).reduce((s, h) => s + h.par, 0)}
          teeName={saveConfirmationRound.teeName || 'Standard'}
          ratingDelta={saveRatingDelta}
          onComplete={handleSaveConfirmationComplete}
        />
      )}

      {showGpsResumeModal && resumableGpsRound ? (
        <Modal visible transparent animationType="fade" onRequestClose={handleDismissGpsResumeModal}>
          <View style={resumeModalStyles.backdrop}>
            <View style={resumeModalStyles.card}>
              <Text style={resumeModalStyles.title}>Round paused</Text>
              <Text style={resumeModalStyles.course}>{resumableGpsRound.courseName}</Text>
              <Text style={resumeModalStyles.meta}>
                Hole {resumableGpsRound.pausedOnHole ?? '—'} · {formatTimeAgo(resumableGpsRound.timing.lastActiveAt)}
              </Text>
              <TouchableOpacity
                style={resumeModalStyles.primaryBtn}
                disabled={savingPausedGps}
                onPress={() => handleResumePausedGpsRound(null)}
              >
                <Text style={resumeModalStyles.primaryBtnText}>Resume round</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[resumeModalStyles.outlineBtn, savingPausedGps && resumeModalStyles.btnDisabled]}
                disabled={savingPausedGps}
                onPress={handleSavePausedGpsToHistory}
              >
                {savingPausedGps ? (
                  <ActivityIndicator color="#facc15" />
                ) : (
                  <Text style={resumeModalStyles.outlineBtnText}>Save to history</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={resumeModalStyles.secondaryBtn}
                disabled={savingPausedGps}
                onPress={handleAbandonPausedGpsRound}
              >
                <Text style={resumeModalStyles.secondaryBtnText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={resumeModalStyles.dismissBtn}
                disabled={savingPausedGps}
                onPress={handleDismissGpsResumeModal}
              >
                <Text style={resumeModalStyles.dismissText}>Remind me later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}

        </View>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const resumeBannerStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.3)',
    backgroundColor: 'rgba(250,204,21,0.12)',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#facc15',
    marginRight: 10,
  },
  title: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 },
  cta: { color: '#facc15', fontSize: 13, fontWeight: '600' },
});

const resumeModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: '#facc15', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  course: { color: '#fff', fontSize: 18, fontWeight: '700' },
  meta: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 6, marginBottom: 18 },
  primaryBtn: {
    backgroundColor: '#facc15',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#0f1419', fontWeight: '700', fontSize: 15 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.55)',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 46,
    justifyContent: 'center',
  },
  outlineBtnText: { color: '#facc15', fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.55 },
  secondaryBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryBtnText: { color: '#f87171', fontWeight: '600', fontSize: 15 },
  dismissBtn: { paddingVertical: 8, alignItems: 'center' },
  dismissText: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
});
