import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  TextInput,
  Alert,
  ScrollView,
  Linking,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  User,
  getCurrentUser,
  getPrimaryProviderId,
  reauthenticateWithPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  signOut,
  sendPasswordReset,
} from '../services/firebaseAuthService';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useAppleAuth } from '../hooks/useAppleAuth';
import { UserProfile, getDefaultProfile, StatPreferences, SavedRound } from '../types';
import Storage from '../services/storage';
import {
  ensureUserDocument,
  saveUserProfile,
  getUserProfile,
  reportUserIssue,
  saveLastError,
  getUserAccountMeta,
  getReportedIssuesForUser,
  appendReportReply,
  ReportedIssue,
} from '../services/userService';
import { syncLocalDataToFirestore, getRounds, clearLocalRounds } from '../services/roundsService';
import { getStatPreferencesFromProfile } from '../utils/statPreferences';
import { getHandicapCalculationDetails } from '../services/whsCalculations';
import { exportRoundsCsv, exportRoundsExcel, exportRoundsJson } from '../services/dataExportService';
import { AuthFormView } from './profile/AuthFormView';
import { GuestView } from './profile/GuestView';
import { ProfileHeader } from './profile/ProfileHeader';
import { HandicapCard } from './profile/HandicapCard';
import { GoalsSection } from './profile/GoalsSection';
import { ScoringModeSection } from './profile/ScoringModeSection';
import { StatTrackingSection } from './profile/StatTrackingSection';
import { BagBuilderSection } from './profile/BagBuilderSection';
import { BackupSyncSection } from './profile/BackupSyncSection';
import { DataExportSection } from './profile/DataExportSection';
import { ReportIssueSection } from './profile/ReportIssueSection';
import { PreferencesSection } from './profile/PreferencesSection';
import { AboutSection } from './profile/AboutSection';
import { RoundsSummaryCard } from './profile/RoundsSummaryCard';
import { logger } from '../utils/logger';
import { formatStat, formatHandicap } from '../utils/formatStat';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { formatCourseName } from '../utils/courseName';
import { styles } from './ProfileTab.styles';
import { getFavoriteCourses, GolfCourse } from '../services/golfCourseApiService';
import { validatePassword, validateEmail } from '../utils/passwordValidation';
import { hasTrackingData, isFairwayHit, isGreenHit, isGreenMiss } from '../utils/statChecks';
import { FEEDBACK_COPY } from '../constants/feedbackCopy';
import { enqueueLocalDataSync, getPendingSyncCount } from '../services/syncQueue';
import {
  getSubscriptionStatus,
  openManageSubscriptions,
  restorePurchases,
} from '../services/billingService';
import { SubscriptionSection } from './profile/SubscriptionSection';
import { deleteAccountAndUserData } from '../services/accountDeletionService';
import { analyzeClubYardages } from '../services/clubYardageIntelligence';
import { buildGolfDNA, GolfDNA } from '../services/golfDnaService';
import { GolfDNACard } from './GolfDNACard';
import { buildImprovementLoop, ImprovementLoopData } from '../services/improvementLoopService';
import { ImprovementLoopScreen } from './ImprovementLoopScreen';
import { getQueuedWatchEvents, isWatchBridgeAvailable } from '../services/watchBridgeService';
import {
  deactivatePushRegistrationForCurrentUser,
  getPushPermissionSnapshot,
  syncPushRegistrationForProfile,
} from '../services/pushNotificationService';

const PROFILE_STORAGE_KEY = '@GolfSum:UserProfile';
const LAST_SYNC_KEY = '@GolfSum:LastSync';
const DATE_FORMAT_KEY = '@GolfSum:DateFormat';
const REPORT_SEEN_KEY = '@GolfSum:SeenReportUpdates';
const MIN_ELIGIBLE_ROUNDS = 3;

interface Props {
  onAuthChange?: (user: User | null) => void;
  onNavigateToAverages?: () => void;
  onNavigateToPlay?: () => void;
  onNavigateToRoundDetail?: (round: SavedRound) => void;
  onOpenUpgrade?: (source?: string) => void;
  isActive?: boolean;
  suppressReportPopup?: boolean;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

export const ProfileTab: React.FC<Props> = ({
  onAuthChange,
  onNavigateToAverages,
  onNavigateToPlay,
  onNavigateToRoundDetail,
  onOpenUpgrade,
  isActive = false,
  suppressReportPopup = false,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>(getDefaultProfile());
  const [profileSaved, setProfileSaved] = useState(false);
  const [showScoringPrefs, setShowScoringPrefs] = useState(false);
  const [showBagBuilder, setShowBagBuilder] = useState(false);
  const [rounds, setRounds] = useState<SavedRound[]>([]);
  const [golfDNA, setGolfDNA] = useState<GolfDNA | null>(null);
  const [dnaLastUpdated, setDnaLastUpdated] = useState<string>('');
  const [showImprovementLoop, setShowImprovementLoop] = useState(false);
  const [improvementData, setImprovementData] = useState<ImprovementLoopData | null>(null);
  const [handicapDetails, setHandicapDetails] = useState<ReturnType<typeof getHandicapCalculationDetails> | null>(null);
  const [previousHandicap, setPreviousHandicap] = useState<number | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [distanceUnit, setDistanceUnit] = useState<'yards' | 'meters'>('yards');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [dateFormat, setDateFormat] = useState('auto');
  const [pushPermissionLabel, setPushPermissionLabel] = useState('Not enabled');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [goalRoundDrafts, setGoalRoundDrafts] = useState<Record<string, string>>({});
  const [advancedPrefsCache, setAdvancedPrefsCache] = useState<StatPreferences | null>(null);
  const [advancedScoringCache, setAdvancedScoringCache] = useState<UserProfile['scoringPreferences'] | null>(null);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<User | null>(null);
  const [pendingAppleUser, setPendingAppleUser] = useState<User | null>(null);

  const syncLocalDataBestEffort = async () => {
    try {
      await syncLocalDataToFirestore();
      await recordLastSync(new Date());
      const pending = await getPendingSyncCount();
      setPendingSyncCount(pending);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/network|offline|fetch|unavailable/i.test(message)) {
        await enqueueLocalDataSync('profile_auth_sync');
        const pending = await getPendingSyncCount();
        setPendingSyncCount(pending);
      }
    }
  };
  const [favoriteCourses, setFavoriteCourses] = useState<GolfCourse[]>([]);
  const [reportMessage, setReportMessage] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);
  const [isReportingIssue, setIsReportingIssue] = useState(false);
  const [reportedIssues, setReportedIssues] = useState<ReportedIssue[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportSectionExpanded, setReportSectionExpanded] = useState(true);
  const [reportReplyMessage, setReportReplyMessage] = useState('');
  const [reportReplyError, setReportReplyError] = useState<string | null>(null);
  const [reportReplySuccess, setReportReplySuccess] = useState<string | null>(null);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [reportSeenMap, setReportSeenMap] = useState<Record<string, string>>({});
  const [isRefreshingReport, setIsRefreshingReport] = useState(false);
  const [reportUpdateBanner, setReportUpdateBanner] = useState(false);
  const [reportSectionY, setReportSectionY] = useState<number | null>(null);
  const [lastSeenReportSignature, setLastSeenReportSignature] = useState<string | null>(null);
  const [pendingReportSignature, setPendingReportSignature] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionRenewalLabel, setSubscriptionRenewalLabel] = useState<string | null>(null);
  const [subscriptionWillRenew, setSubscriptionWillRenew] = useState(true);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [watchDebugQueueCount, setWatchDebugQueueCount] = useState(0);
  const [watchDebugLastEvent, setWatchDebugLastEvent] = useState<string>('—');
  const scrollRef = useRef<ScrollView | null>(null);
  const autoHomeCourseAppliedRef = useRef(false);
  const { canAccess, inTrial, trialRoundsUsed, trialLimit, refreshTrial } = useFeatureGate({ refreshKey: isActive ? 1 : 0 });
  const hasProAccess = canAccess('gir');

  const refreshWatchDebugPanel = async () => {
    if (!__DEV__) return;
    try {
      const events = await getQueuedWatchEvents();
      setWatchDebugQueueCount(events.length);
      if (events.length === 0) {
        setWatchDebugLastEvent('—');
        return;
      }
      const last = events[events.length - 1];
      const ts = last.savedAt ? new Date(last.savedAt * 1000).toLocaleTimeString() : 'unknown time';
      setWatchDebugLastEvent(`${last.type} • H${last.holeNumber} • ${ts}`);
    } catch {
      setWatchDebugLastEvent('error');
    }
  };

  useEffect(() => {
    if (!__DEV__ || !isActive) return;
    refreshWatchDebugPanel().catch(() => undefined);
  }, [isActive, rounds.length, pendingSyncCount]);

  // Google Sign-In hook for mobile (EAS Build)
  const { promptGoogleSignIn } = useGoogleAuth(
    (googleUser) => setPendingGoogleUser(googleUser),
    (msg) => { setError(msg); setIsLoading(false); },
  );

  // Apple Sign-In hook for iOS
  const { promptAppleSignIn, isAvailable: isAppleAvailable } = useAppleAuth(
    (appleUser) => setPendingAppleUser(appleUser),
    (msg) => { setError(msg); setIsLoading(false); },
  );

  const resolvedStatPrefs = getStatPreferencesFromProfile(profile);
  const statPresets: Record<'all' | 'shots' | 'shortGame' | 'minimal', StatPreferences> = {
    all: {
      score: true,
      putts: true,
      fir: true,
      gir: true,
      scrambling: true,
      approachDistance: true,
      penalties: true,
      bunkers: true,
    },
    shots: {
      score: true,
      putts: true,
      fir: true,
      gir: true,
      scrambling: false,
      approachDistance: true,
      penalties: false,
      bunkers: false,
    },
    shortGame: {
      score: true,
      putts: true,
      fir: false,
      gir: true,
      scrambling: true,
      approachDistance: false,
      penalties: true,
      bunkers: true,
    },
    minimal: {
      score: true,
      putts: true,
      fir: true,
      gir: true,
      scrambling: false,
      approachDistance: false,
      penalties: false,
      bunkers: false,
    },
  };
  const applyPreset = (presetKey: keyof typeof statPresets) => {
    const preset = statPresets[presetKey];
    const trackClubs = presetKey === 'all' || presetKey === 'shots';
    updateProfile({
      statPreferences: preset,
      scoringPreferences: {
        ...profile.scoringPreferences,
        trackPutts: preset.putts,
        trackPuttDistance: preset.putts ? (profile.scoringPreferences?.trackPuttDistance ?? false) : false,
        trackFairways: preset.fir,
        trackGreens: preset.gir,
        trackApproachDistance: preset.approachDistance,
        trackClubs,
        trackUpDown: preset.scrambling,
        trackBunkers: preset.bunkers,
        trackPenalties: preset.penalties,
      },
    });
  };

  useEffect(() => {
    const storedUser = getCurrentUser();
    if (storedUser) {
      setUser(storedUser);
      onAuthChange?.(storedUser);
    }
    loadProfile();
    loadRounds();
    loadFavorites();
    loadUnits();
    loadLastSync();
    loadDateFormat();
    loadPushPermissionLabel().catch(() => undefined);
    getPendingSyncCount().then(setPendingSyncCount).catch(() => setPendingSyncCount(0));
  }, []);

  const loadSubscriptionCard = async () => {
    try {
      setSubscriptionLoading(true);
      await refreshTrial();
      const status = await getSubscriptionStatus();
      if (status.expirationDate) {
        const renewal = new Date(status.expirationDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        setSubscriptionRenewalLabel(renewal);
      } else {
        setSubscriptionRenewalLabel(null);
      }
      setSubscriptionWillRenew(status.willRenew);
    } catch {
      setSubscriptionRenewalLabel(null);
      setSubscriptionWillRenew(true);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    loadSubscriptionCard();
  }, [isActive]);

  useEffect(() => {
    if (!user || !isActive) return;
    const hydrate = async () => {
      await Promise.all([
        loadRounds(),
        refreshTrial(),
        loadSubscriptionCard(),
      ]);
    };
    hydrate().catch(() => undefined);
  }, [user?.uid, isActive]);

  useEffect(() => {
    if (!user) {
      setReportedIssues([]);
      setSelectedReportId(null);
      return;
    }
    refreshReportedIssue();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (isActive) {
      refreshReportedIssue();
    }
  }, [isActive, user]);

  useEffect(() => {
    if (!isActive || suppressReportPopup) return;
    if (pendingReportSignature) {
      setReportUpdateBanner(true);
    }
  }, [isActive, suppressReportPopup, pendingReportSignature]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await Storage.getItem('@GolfSum:LastReportStatus');
        if (stored) setLastSeenReportSignature(stored);
      } catch {
        setLastSeenReportSignature(null);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await Storage.getItem(REPORT_SEEN_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object') {
            setReportSeenMap(parsed);
          }
        }
      } catch {
        setReportSeenMap({});
      }
    })();
  }, []);

  const refreshReportedIssue = async () => {
    if (!user) return;
    setIsRefreshingReport(true);
    try {
      const [meta, issuesFromCollection] = await Promise.all([
        getUserAccountMeta(),
        getReportedIssuesForUser(),
      ]);
      const fallbackIssue = meta.lastReportedIssue
        ? { ...meta.lastReportedIssue, id: meta.lastReportedIssue.createdAt || 'latest' }
        : null;
      const issues = issuesFromCollection.length
        ? issuesFromCollection
        : (fallbackIssue ? [{ ...fallbackIssue }] : []);
      const normalizedIssues = issues.map((issue, index) => ({
        ...issue,
        id: issue.id ?? issue.createdAt ?? `issue-${index}`,
      }));
      setReportedIssues(normalizedIssues);
      if (!selectedReportId || !normalizedIssues.find((issue) => issue.id === selectedReportId)) {
        setSelectedReportId(normalizedIssues[0]?.id ?? null);
      }
      const latest = normalizedIssues
        .slice()
        .sort((a, b) => {
          const aStamp = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const bStamp = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return bStamp - aStamp;
        })[0] || fallbackIssue;
      const signature = latest
        ? `${latest.id || latest.createdAt || ''}|${latest.updatedAt || latest.createdAt || ''}|${latest.status || ''}`
        : null;
      if (signature && signature !== lastSeenReportSignature) {
        setPendingReportSignature(signature);
        if (!suppressReportPopup && isActive) {
          setReportUpdateBanner(true);
        }
      }
    } catch {
      setReportedIssues([]);
    } finally {
      setIsRefreshingReport(false);
    }
  };

  const markReportSeen = async () => {
    if (!pendingReportSignature) return;
    setLastSeenReportSignature(pendingReportSignature);
    setPendingReportSignature(null);
    setReportUpdateBanner(false);
    try {
      await Storage.setItem('@GolfSum:LastReportStatus', pendingReportSignature);
    } catch {
      // ignore
    }
  };

  const handleViewReportUpdate = async () => {
    await markReportSeen();
    if (reportSectionY != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, reportSectionY - 12), animated: true });
    }
  };

  const handleSelectReport = async (id: string | null) => {
    setSelectedReportId(id);
    if (!id) return;
    const issue = reportedIssues.find((entry) => entry.id === id);
    if (!issue?.updatedAt && !issue?.createdAt) return;
    const stamp = issue.updatedAt || issue.createdAt || '';
    if (!stamp) return;
    const nextMap = { ...reportSeenMap, [id]: stamp };
    setReportSeenMap(nextMap);
    try {
      await Storage.setItem(REPORT_SEEN_KEY, JSON.stringify(nextMap));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setNicknameDraft(profile.personalInfo.nickname || '');
  }, [profile.personalInfo.nickname]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    const goals = profile.goals || {};
    (Object.keys(goals) as Array<keyof NonNullable<UserProfile['goals']>>).forEach((key) => {
      const value = goals[key];
      nextDrafts[key] = value !== null && value !== undefined ? `${value}` : '';
    });
    setGoalDrafts(nextDrafts);
  }, [profile.goals]);

  useEffect(() => {
    const nextRoundDrafts: Record<string, string> = {};
    const targets = profile.goalRoundTargets || {};
    (Object.keys(targets) as Array<keyof NonNullable<UserProfile['goalRoundTargets']>>).forEach((key) => {
      const value = targets[key];
      nextRoundDrafts[key] = value !== null && value !== undefined ? `${value}` : '';
    });
    setGoalRoundDrafts(nextRoundDrafts);
  }, [profile.goalRoundTargets]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const loadRounds = async () => {
    try {
      const savedRounds = await getRounds();
      setRounds(savedRounds);
      const details = getHandicapCalculationDetails(savedRounds);
      setHandicapDetails(details);
      if (savedRounds.length >= 4) {
        const previousDetails = getHandicapCalculationDetails(savedRounds.slice(1));
        setPreviousHandicap(previousDetails.handicapIndex);
      } else {
        setPreviousHandicap(null);
      }
    } catch (error) {
      logger.error('Failed to load rounds for profile:', error);
    }
  };

  const getMostPlayedCourseName = (savedRounds: SavedRound[]): string => {
    if (!savedRounds.length) return '';
    const counts = new Map<string, number>();
    for (const round of savedRounds) {
      const name = (round.courseName || '').trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    let winner = '';
    let maxCount = 0;
    for (const [name, count] of counts.entries()) {
      if (count > maxCount) {
        winner = name;
        maxCount = count;
      }
    }
    return winner;
  };

  useEffect(() => {
    const handicap = handicapDetails?.handicapIndex ?? profile.coursePreferences.typicalHandicap ?? null;
    const dna = buildGolfDNA(rounds, handicap);
    setGolfDNA(dna);
    setImprovementData(buildImprovementLoop(rounds));
    if (rounds.length > 0) {
      setDnaLastUpdated(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    }
  }, [rounds, handicapDetails?.handicapIndex, profile.coursePreferences.typicalHandicap, isActive]);

  useEffect(() => {
    if (autoHomeCourseAppliedRef.current) return;
    if (profile.coursePreferences.homeCourseName?.trim()) return;
    const inferredHome = getMostPlayedCourseName(rounds);
    if (!inferredHome) return;
    autoHomeCourseAppliedRef.current = true;
    void updateProfile({
      coursePreferences: { ...profile.coursePreferences, homeCourseName: inferredHome },
    });
  }, [rounds, profile.coursePreferences, profile.coursePreferences.homeCourseName]);

  const loadFavorites = async () => {
    try {
      const favorites = await getFavoriteCourses();
      setFavoriteCourses(favorites);
    } catch (error) {
      logger.error('Failed to load favorite courses:', error);
    }
  };

  const loadUnits = async () => {
    try {
      const savedDistance = await Storage.getItem('distanceUnit');
      if (savedDistance === 'yards' || savedDistance === 'meters') {
        setDistanceUnit(savedDistance);
      }
    } catch (error) {
      logger.error('Failed to load unit preferences:', error);
    }
  };
  const basicPreset: StatPreferences = {
    score: true,
    putts: true,
    fir: true,
    gir: true,
    scrambling: false,
    approachDistance: false,
    penalties: false,
    bunkers: false,
  };

  const loadLastSync = async () => {
    try {
      const stored = await Storage.getItem(LAST_SYNC_KEY);
      if (stored) {
        setLastSyncAt(stored);
      }
    } catch (error) {
      logger.error('Failed to load last sync timestamp:', error);
    }
  };
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDateFormat = async () => {
    try {
      const stored = await Storage.getItem(DATE_FORMAT_KEY);
      if (stored) {
        setDateFormat(stored);
      }
    } catch (error) {
      logger.error('Failed to load date format:', error);
    }
  };

  const loadPushPermissionLabel = async () => {
    const permissions = await getPushPermissionSnapshot();
    if (!permissions) {
      setPushPermissionLabel(Platform.OS === 'web' ? 'Unsupported' : 'Unavailable');
      return;
    }
    if (permissions.granted) {
      setPushPermissionLabel('Allowed');
      return;
    }
    if (permissions.canAskAgain) {
      setPushPermissionLabel('Ask me');
      return;
    }
    setPushPermissionLabel('Blocked');
  };

  const recordLastSync = async (date: Date) => {
    const value = date.toISOString();
    setLastSyncAt(value);
    try {
      await Storage.setItem(LAST_SYNC_KEY, value);
    } catch (error) {
      logger.error('Failed to store last sync timestamp:', error);
    }
  };

  const getExportRounds = async () => {
    const latestRounds = rounds.length ? rounds : await getRounds();
    if (!latestRounds.length) {
      Alert.alert('No Data', 'There are no rounds to export yet.');
      return null;
    }
    return latestRounds;
  };

  const getExportErrorMessage = (format: 'CSV' | 'Excel' | 'JSON', error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('permission')) {
      return `${format} export failed. Unable to save file. Check your device storage permissions.`;
    }
    if (message.toLowerCase().includes('sharing')) {
      return `${format} export failed. Sharing is not available on this device.`;
    }
    if (message.toLowerCase().includes('filesystem')) {
      return `${format} export failed. Unable to write the export file.`;
    }
    return `${format} export failed. Please try again.`;
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const latestRounds = await getExportRounds();
      if (!latestRounds) return;
      await exportRoundsCsv(latestRounds);
    } catch (error) {
      const message = getExportErrorMessage('CSV', error);
      setExportError(message);
      await saveLastError({
        message,
        name: error instanceof Error ? error.name : 'ExportError',
        stack: error instanceof Error ? error.stack : undefined,
        args: JSON.stringify({ format: 'CSV' }),
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const latestRounds = await getExportRounds();
      if (!latestRounds) return;
      await exportRoundsExcel(latestRounds);
    } catch (error) {
      const message = getExportErrorMessage('Excel', error);
      setExportError(message);
      await saveLastError({
        message,
        name: error instanceof Error ? error.name : 'ExportError',
        stack: error instanceof Error ? error.stack : undefined,
        args: JSON.stringify({ format: 'Excel' }),
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJson = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const latestRounds = await getExportRounds();
      if (!latestRounds) return;
      await exportRoundsJson(latestRounds);
    } catch (error) {
      const message = getExportErrorMessage('JSON', error);
      setExportError(message);
      await saveLastError({
        message,
        name: error instanceof Error ? error.name : 'ExportError',
        stack: error instanceof Error ? error.stack : undefined,
        args: JSON.stringify({ format: 'JSON' }),
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleReportExportIssue = () => {
    const subject = encodeURIComponent('GolfSum Export Issue');
    const body = encodeURIComponent(
      `Issue: ${exportError ?? 'Unknown export error'}\nPlatform: ${Platform.OS}\nTime: ${new Date().toISOString()}`
    );
    Linking.openURL(`mailto:support@golfsum.app?subject=${subject}&body=${body}`);
  };

  const handleReportIssue = async () => {
    if (!reportMessage.trim()) {
      setReportError('Please describe the issue before submitting.');
      return;
    }
    setIsReportingIssue(true);
    setReportError(null);
    setReportSuccess(null);
    try {
      await reportUserIssue(reportMessage.trim(), {
        screen: 'Profile',
        exportError: exportError ?? null,
      });
      setReportMessage('');
      setReportSuccess('Issue reported. Thank you.');
      await refreshReportedIssue();
    } catch (error) {
      setReportError('Report failed. Please try again.');
      await saveLastError({
        message: 'Report issue failed',
        name: error instanceof Error ? error.name : 'ReportError',
        stack: error instanceof Error ? error.stack : undefined,
        args: JSON.stringify({ screen: 'Profile' }),
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsReportingIssue(false);
    }
  };

  const handleSendReportReply = async () => {
    const selectedIssue = reportedIssues.find((issue) => issue.id === selectedReportId) || null;
    if (!selectedIssue || !selectedIssue.id) {
      setReportReplyError('Select a report to reply to.');
      return;
    }
    if (selectedIssue.id === selectedIssue.createdAt) {
      setReportReplyError('This report is still syncing. Please refresh and try again.');
      return;
    }
    if (!reportReplyMessage.trim()) {
      setReportReplyError('Please enter a reply.');
      return;
    }
    setIsSendingReply(true);
    setReportReplyError(null);
    setReportReplySuccess(null);
    try {
      await appendReportReply(selectedIssue.id, reportReplyMessage.trim());
      setReportReplyMessage('');
      setReportReplySuccess('Reply sent.');
      await refreshReportedIssue();
    } catch (error) {
      setReportReplyError('Reply failed. Please try again.');
      await saveLastError({
        message: 'Report reply failed',
        name: error instanceof Error ? error.name : 'ReportReplyError',
        stack: error instanceof Error ? error.stack : undefined,
        args: JSON.stringify({ screen: 'Profile', reportId: selectedIssue.id }),
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  const loadProfile = async () => {
    try {
      // Try loading from Firestore if authenticated
      if (user) {
        logger.debug('📥 Loading profile from Firestore...');
        const firestoreProfile = await getUserProfile();
        if (firestoreProfile) {
          logger.debug('✅ Profile loaded from Firestore:', {
            scoringMode: firestoreProfile.scoringMode,
            trackFairways: firestoreProfile.scoringPreferences?.trackFairways,
            trackGreens: firestoreProfile.scoringPreferences?.trackGreens,
          });
          // Merge with default profile to ensure all fields exist
          const mergedProfile: UserProfile = {
            ...getDefaultProfile(),
            ...firestoreProfile,
            scoringPreferences: {
              ...getDefaultProfile().scoringPreferences,
              ...firestoreProfile.scoringPreferences,
            },
            statPreferences: {
              ...basicPreset,
              ...firestoreProfile.statPreferences,
            },
            bag: {
              ...getDefaultProfile().bag,
              ...firestoreProfile.bag,
            },
          };
          // Migrate string yardage ranges to numeric midpoints
          if (mergedProfile.clubDistances) {
            const cleaned: Record<string, number> = {};
            for (const [club, val] of Object.entries(mergedProfile.clubDistances)) {
              if (typeof val === 'number') {
                cleaned[club] = val;
              }
            }
            mergedProfile.clubDistances = cleaned;
          }
          setProfile(mergedProfile);
          // Also cache locally
          await Storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(mergedProfile));
          return;
        }
      }
      
      // Fallback to AsyncStorage
      const stored = await Storage.getItem(PROFILE_STORAGE_KEY);
      if (stored) {
        const loadedProfile = JSON.parse(stored);
        logger.debug('✅ Profile loaded from local storage:', {
          scoringMode: loadedProfile.scoringMode
        });
        // Merge with default profile to ensure all fields exist
        const mergedProfile: UserProfile = {
          ...getDefaultProfile(),
          ...loadedProfile,
          scoringPreferences: {
            ...getDefaultProfile().scoringPreferences,
            ...loadedProfile.scoringPreferences,
          },
          statPreferences: {
            ...basicPreset,
            ...loadedProfile.statPreferences,
          },
          bag: {
            ...getDefaultProfile().bag,
            ...loadedProfile.bag,
          },
        };
        // Migrate string yardage ranges to numeric midpoints
        if (mergedProfile.clubDistances) {
          const cleaned: Record<string, number> = {};
          for (const [club, val] of Object.entries(mergedProfile.clubDistances)) {
            if (typeof val === 'number') {
              cleaned[club] = val;
            }
          }
          mergedProfile.clubDistances = cleaned;
        }
        setProfile(mergedProfile);
      } else {
        logger.debug('ℹ️ No saved profile found, using defaults');
      }
    } catch (error) {
      logger.error('❌ Could not load profile:', error);
    }
  };

  const triggerSaveFeedback = () => {
    setProfileSaved(true);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => setProfileSaved(false), 1500);
  };

  const persistProfile = async (nextProfile: UserProfile) => {
    try {
      logger.debug('💾 Saving profile:', {
        scoringMode: nextProfile.scoringMode,
        trackFairways: nextProfile.scoringPreferences?.trackFairways,
        trackGreens: nextProfile.scoringPreferences?.trackGreens,
      });
      if (user) {
        await saveUserProfile(nextProfile);
      }
      await Storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
      triggerSaveFeedback();
    } catch (error) {
      logger.error('❌ Could not save profile:', error);
      Alert.alert('Error', 'Failed to save profile');
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    // Deep merge to handle nested objects properly
    const mergedStatPreferences: StatPreferences | undefined = updates.statPreferences
      ? { ...(profile.statPreferences || resolvedStatPrefs), ...updates.statPreferences }
      : profile.statPreferences;
    const mergedScoringPreferences: UserProfile['scoringPreferences'] = updates.scoringPreferences
      ? { ...profile.scoringPreferences, ...updates.scoringPreferences }
      : profile.scoringPreferences;

    const newProfile: UserProfile = {
      ...profile,
      ...updates,
      // Ensure nested objects are preserved
      bag: updates.bag ? { ...profile.bag, ...updates.bag } : profile.bag,
      scoringPreferences: mergedScoringPreferences,
      statPreferences: mergedStatPreferences,
      goals: updates.goals ? { ...profile.goals, ...updates.goals } : profile.goals,
      coursePreferences: updates.coursePreferences ? { ...profile.coursePreferences, ...updates.coursePreferences } : profile.coursePreferences,
    };
    
    setProfile(newProfile);
    await persistProfile(newProfile);
  };

  const updateStatPreference = (
    updates: Partial<StatPreferences>,
    scoringUpdates?: Partial<UserProfile['scoringPreferences']>
  ) => {
    updateProfile({
      statPreferences: { ...(profile.statPreferences || resolvedStatPrefs), ...updates },
      scoringPreferences: scoringUpdates ? { ...profile.scoringPreferences, ...scoringUpdates } : profile.scoringPreferences,
    });
  };

  const handleScoringModeChange = (mode: 'basic' | 'advanced') => {
    if (mode === profile.scoringMode) return;

    if (mode === 'basic') {
      const hasCustomAdvanced = (Object.keys(basicPreset) as Array<keyof StatPreferences>).some(
        key => resolvedStatPrefs[key] !== basicPreset[key]
      );

      const applyBasic = () => {
        setAdvancedPrefsCache(resolvedStatPrefs);
        setAdvancedScoringCache(profile.scoringPreferences);
        updateProfile({
          scoringMode: 'basic',
          statPreferences: basicPreset,
          scoringPreferences: {
            ...profile.scoringPreferences,
            trackPutts: true,
            trackPuttDistance: false,
            trackFairways: true,
            trackGreens: true,
            trackUpDown: false,
            trackApproachDistance: false,
            trackClubs: false,
            trackPenalties: false,
            trackBunkers: false,
          },
        });
        setShowScoringPrefs(false);
      };

      if (hasCustomAdvanced) {
        Alert.alert(
          'Switch to Basic?',
          'Switching to Basic will track only Score, Putts, FIR, and GIR. Your advanced settings will be saved if you switch back.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Switch', onPress: applyBasic },
          ]
        );
      } else {
        applyBasic();
      }
      return;
    }

    const restoredPrefs = advancedPrefsCache || resolvedStatPrefs;
    const restoredScoring = advancedScoringCache || profile.scoringPreferences;
    updateProfile({
      scoringMode: 'advanced',
      statPreferences: restoredPrefs,
      scoringPreferences: {
        ...restoredScoring,
        trackClubs: restoredScoring.trackClubs ?? true,
      },
    });
  };

  const toggleClub = (category: 'woods' | 'hybrids' | 'irons' | 'wedges', club: string) => {
    const updated = { ...profile.bag };
    // Ensure the category array exists
    if (!updated[category]) {
      updated[category] = [];
    }
    const index = updated[category].indexOf(club);
    if (index > -1) {
      updated[category] = updated[category].filter(c => c !== club);
    } else {
      updated[category] = [...updated[category], club].sort();
    }
    updateProfile({ bag: updated });
  };

  const countClubs = (): number => {
    let count = 0;
    if (profile.bag?.driver) count++;
    count += profile.bag?.woods?.length || 0;
    count += profile.bag?.hybrids?.length || 0;
    count += profile.bag?.irons?.length || 0;
    count += profile.bag?.wedges?.length || 0;
    if (profile.bag?.putter) count++;
    return count;
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || (authMode !== 'forgot' && !password.trim())) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (authMode === 'forgot') {
        await sendPasswordReset(email);
        setSuccessMessage('Password reset email sent!');
        setTimeout(() => {
          setAuthMode('signin');
          setSuccessMessage(null);
        }, 3000);
      } else if (authMode === 'signup') {
        if (!validateEmail(email)) {
          setError('Please enter a valid email address');
          setIsLoading(false);
          return;
        }
        const validation = validatePassword(password);
        if (!validation.isValid) {
          setError('Password requires: ' + validation.errors.join(', '));
          setIsLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }
        const newUser = await signUpWithEmail(email, password);
        setUser(newUser);
        onAuthChange?.(newUser);
        setShowAuthForm(false);
        resetForm();
        
        // Load profile and sync local data
        await ensureUserDocument();
        await loadProfile();
        await syncLocalDataBestEffort();
        await loadRounds();
        await refreshTrial();
        await loadSubscriptionCard();
      } else {
        const loggedInUser = await signInWithEmail(email, password);
        setUser(loggedInUser);
        onAuthChange?.(loggedInUser);
        setShowAuthForm(false);
        resetForm();
        
        // Load profile and sync local data
        await ensureUserDocument();
        await loadProfile();
        await syncLocalDataBestEffort();
        await loadRounds();
        await refreshTrial();
        await loadSubscriptionCard();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    if (Platform.OS === 'web') {
      // Web: use Firebase popup directly (best UX)
      try {
        const googleUser = await signInWithGoogle();
        setUser(googleUser);
        onAuthChange?.(googleUser);
        setShowAuthForm(false);
        resetForm();

        await ensureUserDocument();
        await loadProfile();
        await syncLocalDataBestEffort();
        await loadRounds();
        await refreshTrial();
        await loadSubscriptionCard();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Mobile (EAS Build): use expo-auth-session Google provider hook
      // Success/error callbacks update state via setPendingGoogleUser / setError
      await promptGoogleSignIn();
    }
  };

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    await promptAppleSignIn();
  };

  const clearSignedInLocalState = async () => {
    await Storage.multiRemove([PROFILE_STORAGE_KEY, LAST_SYNC_KEY]);
    await clearLocalRounds();
    setRounds([]);
    setHandicapDetails(null);
    setPreviousHandicap(null);
    setProfile(getDefaultProfile());
    setProfileSaved(false);
    setShowScoringPrefs(false);
    setShowBagBuilder(false);
    setShowPreferences(false);
    setShowAbout(false);
    setShowGoals(false);
    setLastSyncAt(null);
    setSyncError(null);
    setExportError(null);
    setNicknameDraft('');
    setGoalDrafts({});
    setAdvancedPrefsCache(null);
    setAdvancedScoringCache(null);
  };

  const promptForPasswordReauth = (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      const value = window.prompt('For security, enter your password to delete your account.');
      const normalized = typeof value === 'string' ? value.trim() : '';
      return Promise.resolve(normalized || null);
    }

    if (Platform.OS === 'ios' && typeof (Alert as any).prompt === 'function') {
      return new Promise((resolve) => {
        (Alert as any).prompt(
          'Confirm Password',
          'Enter your password to continue account deletion.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
            { text: 'Continue', style: 'destructive', onPress: (value: string) => resolve(String(value || '').trim() || null) },
          ],
          'secure-text'
        );
      });
    }

    Alert.alert(
      'Re-authentication required',
      'Please sign out, sign back in, and then retry Delete Account.'
    );
    return Promise.resolve(null);
  };

  const performDeleteAccount = async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const providerId = getPrimaryProviderId();
      if (providerId === 'password') {
        const passwordValue = await promptForPasswordReauth();
        if (!passwordValue) {
          setIsDeletingAccount(false);
          return;
        }
        await reauthenticateWithPassword(passwordValue);
      }

      await deleteAccountAndUserData();
      await clearSignedInLocalState();
      setUser(null);
      onAuthChange?.(null);

      const msg = 'Account deleted. All user data and uploaded scorecards have been removed. Shared course information (yardages and par) was kept for the community catalog.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Account deleted', msg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/requires-recent-login|credential/i.test(message)) {
        Alert.alert(
          'Re-authentication required',
          'For security, sign out and sign back in, then retry Delete Account.'
        );
      } else {
        Alert.alert('Delete Account failed', 'We could not complete account deletion. Please try again.');
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleDeleteAccount = async () => {
    const warning = 'This permanently deletes your account and ALL user data, including uploaded scorecards, round history, profile, and backups. This cannot be undone.\n\nShared course information (yardages and par) will be kept for the community catalog.';
    if (Platform.OS === 'web') {
      const ok = window.confirm(warning);
      if (!ok) return;
      await performDeleteAccount();
      return;
    }
    Alert.alert('Delete Account', warning, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Account', style: 'destructive', onPress: () => { performDeleteAccount(); } },
    ]);
  };

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to sign out?')) {
        await deactivatePushRegistrationForCurrentUser().catch(() => undefined);
        await signOut();
        setUser(null);
        await clearSignedInLocalState();
        onAuthChange?.(null);
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await deactivatePushRegistrationForCurrentUser().catch(() => undefined);
            await signOut();
            setUser(null);
            await clearSignedInLocalState();
            onAuthChange?.(null);
          },
        },
      ]);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccessMessage(null);
  };

  // Process Google Sign-In result from mobile hook
  useEffect(() => {
    if (!pendingGoogleUser) return;
    const googleUser = pendingGoogleUser;
    setPendingGoogleUser(null);

    setUser(googleUser);
    onAuthChange?.(googleUser);
    setShowAuthForm(false);
    resetForm();
    setIsLoading(false);

    ensureUserDocument();
    loadProfile();
    syncLocalDataBestEffort()
      .then(() => Promise.all([loadRounds(), refreshTrial(), loadSubscriptionCard()]))
      .catch(() => undefined);
  }, [pendingGoogleUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Process Apple Sign-In result from hook
  useEffect(() => {
    if (!pendingAppleUser) return;
    const appleUser = pendingAppleUser;
    setPendingAppleUser(null);

    setUser(appleUser);
    onAuthChange?.(appleUser);
    setShowAuthForm(false);
    resetForm();
    setIsLoading(false);

    ensureUserDocument();
    loadProfile();
    syncLocalDataBestEffort()
      .then(() => Promise.all([loadRounds(), refreshTrial(), loadSubscriptionCard()]))
      .catch(() => undefined);
  }, [pendingAppleUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Signed in view
  if (user) {
    const eligibleRounds = rounds.filter(round => round.isAcceptableForHandicap).length;
    const notEligibleRounds = Math.max(0, rounds.length - eligibleRounds);
    const currentHandicap = handicapDetails?.handicapIndex ?? null;
    const handicapChange = currentHandicap !== null && previousHandicap !== null
      ? Number((currentHandicap - previousHandicap).toFixed(1))
      : null;
    const handicapImproving = handicapChange !== null && handicapChange < 0;
    const lastUpdated = rounds[0]?.date ? new Date(rounds[0].date).toLocaleDateString() : '—';
    const statsRounds = rounds.filter(round => typeof round.score === 'number' && round.score > 0);
    const averageScoreNumber = statsRounds.length > 0
      ? (statsRounds.reduce((sum, round) => sum + round.score, 0) / statsRounds.length)
      : null;
    const bestRound = statsRounds.length > 0
      ? statsRounds.reduce((best, round) => round.score < best.score ? round : best, statsRounds[0])
      : null;
    const puttsRounds = rounds.filter(round => typeof round.stats?.putts === 'number');
    const averagePuttsNumber = puttsRounds.length > 0
      ? (puttsRounds.reduce((sum, round) => sum + (round.stats.putts || 0), 0) / puttsRounds.length)
      : null;
    const hasFirData = hasTrackingData(rounds, 'fairwayHit')
      || rounds.some(round => (round.stats?.fairwaysPossible || 0) > 0);
    const hasGirData = hasTrackingData(rounds, 'greenHit')
      || rounds.some(round => (round.stats?.greensPossible || 0) > 0);
    const hasUpDownData = hasTrackingData(rounds, 'upDown')
      || rounds.some(round => (round.stats?.upDownAttempts || 0) > 0);

    let totalFairwaysHit = 0;
    let totalFairways = 0;
    let totalGreensHit = 0;
    let totalGreens = 0;
    let totalUpDownMade = 0;
    let totalUpDownAttempts = 0;

    rounds.forEach(round => {
      if (round.holes?.length) {
        const firHoles = round.holes.filter(
          hole => (hole.par === 4 || hole.par === 5) && hole.fairwayHit !== null && hole.fairwayHit !== undefined
        );
        totalFairways += firHoles.length;
        totalFairwaysHit += firHoles.filter(hole => isFairwayHit(hole.fairwayHit)).length;

        const girHoles = round.holes.filter(
          hole => hole.greenHit !== null && hole.greenHit !== undefined
        );
        totalGreens += girHoles.length;
        totalGreensHit += girHoles.filter(hole => isGreenHit(hole.greenHit)).length;

        const upDownHoles = round.holes.filter(
          hole => isGreenMiss(hole.greenHit) && hole.upDown !== null && hole.upDown !== undefined
        );
        totalUpDownAttempts += upDownHoles.length;
        totalUpDownMade += upDownHoles.filter(hole => hole.upDown === true).length;
        return;
      }

      totalFairways += round.stats?.fairwaysPossible || 0;
      totalFairwaysHit += round.stats?.fairways || 0;
      totalGreens += round.stats?.greensPossible || 0;
      totalGreensHit += round.stats?.greens || 0;
      totalUpDownAttempts += round.stats?.upDownAttempts || 0;
      totalUpDownMade += round.stats?.upDownMade || 0;
    });

    const firPercent = hasFirData && totalFairways > 0
      ? Math.round((totalFairwaysHit / totalFairways) * 100)
      : null;
    const girPercent = hasGirData && totalGreens > 0
      ? Math.round((totalGreensHit / totalGreens) * 100)
      : null;
    const upDownPercent = hasUpDownData && totalUpDownAttempts > 0
      ? Math.round((totalUpDownMade / totalUpDownAttempts) * 100)
      : null;
    const countEnabledStats = () => {
      const baseKeys: Array<keyof StatPreferences> = ['putts', 'fir', 'gir'];
      const advancedKeys: Array<keyof StatPreferences> = ['scrambling', 'approachDistance', 'penalties', 'bunkers'];
      const keys = profile.scoringMode === 'advanced' ? baseKeys.concat(advancedKeys) : baseKeys;
      const count = keys.filter((key) => resolvedStatPrefs[key]).length;
      const trackClubsEnabled = profile.scoringMode === 'advanced' && profile.scoringPreferences?.trackClubs !== false;
      return trackClubsEnabled ? count + 1 : count;
    };
    const activeStatsCount = countEnabledStats();
    const goals = profile.goals || {};
    const goalRoundTargets = profile.goalRoundTargets || {};
    const remainingEligible = Math.max(0, MIN_ELIGIBLE_ROUNDS - eligibleRounds);
    const isBasicMode = profile.scoringMode === 'basic';
    const showFirGoal = resolvedStatPrefs.fir;
    const showGirGoal = resolvedStatPrefs.gir;
    const showPuttsGoal = resolvedStatPrefs.putts;
    const showUpDownGoal = !isBasicMode && resolvedStatPrefs.scrambling;
    const yardageAnalysis = analyzeClubYardages(
      rounds,
      profile.clubDistances || {},
      profile.coursePreferences?.typicalHandicap ?? null
    );

    const sortedRounds = [...rounds].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const firstRoundDate = sortedRounds.length > 0 ? new Date(sortedRounds[0].date) : null;
    const roundsSinceLabel = firstRoundDate
      ? `Since ${firstRoundDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
      : 'Since —';
    const bestRoundLabel = bestRound
      ? `${bestRound.score} at ${formatCourseName(bestRound.courseName)}`
      : null;

    const getWeekKey = (date: Date) => {
      const normalized = new Date(date);
      normalized.setHours(0, 0, 0, 0);
      const day = (normalized.getDay() + 6) % 7;
      normalized.setDate(normalized.getDate() - day);
      return `${normalized.getFullYear()}-${normalized.getMonth()}-${normalized.getDate()}`;
    };

    const weekKeys = new Set(
      rounds.map(round => getWeekKey(new Date(round.date)))
    );
    const currentWeekKey = getWeekKey(new Date());
    let streakWeeks = 0;
    if (weekKeys.has(currentWeekKey)) {
      let cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      const day = (cursor.getDay() + 6) % 7;
      cursor.setDate(cursor.getDate() - day);
      while (weekKeys.has(getWeekKey(cursor))) {
        streakWeeks += 1;
        cursor.setDate(cursor.getDate() - 7);
      }
    }
    const streakLabel =
      rounds.length < 2
        ? null
        : streakWeeks >= 2
          ? `${streakWeeks}-week streak`
          : weekKeys.has(currentWeekKey)
            ? 'Active this week'
            : null;

    const getGoalProgress = (current: number | null, goal: number | null, lowerIsBetter: boolean) => {
      if (current === null || goal === null) return null;
      if (goal <= 0) return null;
      const ratio = lowerIsBetter ? goal / current : current / goal;
      return Math.max(0, Math.min(1, ratio));
    };

    const isGoalKey = (value: string): value is keyof NonNullable<UserProfile['goals']> => {
      return ['handicapIndex', 'averageScore', 'firPercent', 'girPercent', 'puttsPerRound', 'upDownPercent'].includes(value);
    };

    const handleGoalChange = (key: string, value: string) => {
      if (!isGoalKey(key)) return;
      setGoalDrafts(prev => ({ ...prev, [key]: value }));
    };

    const handleGoalCommit = (key: string) => {
      if (!isGoalKey(key)) return;
      const raw = (goalDrafts[key] ?? '').trim();
      const numeric = raw.length ? Number(raw) : null;
      if (raw.length && Number.isNaN(numeric)) {
        setGoalDrafts(prev => ({
          ...prev,
          [key]: goals?.[key] !== null && goals?.[key] !== undefined ? `${goals?.[key]}` : '',
        }));
        return;
      }
      updateProfile({
        goals: {
          ...goals,
          [key]: numeric,
        },
      });
    };

    const handleGoalRoundsChange = (key: string, value: string) => {
      if (!isGoalKey(key)) return;
      setGoalRoundDrafts(prev => ({ ...prev, [key]: value }));
    };

    const handleGoalRoundsCommit = (key: string) => {
      if (!isGoalKey(key)) return;
      const raw = (goalRoundDrafts[key] ?? '').trim();
      const numeric = raw.length ? Number(raw) : null;
      if (raw.length && (Number.isNaN(numeric ?? Number.NaN) || (numeric ?? 0) < 1)) {
        setGoalRoundDrafts(prev => ({
          ...prev,
          [key]:
            goalRoundTargets?.[key] !== null && goalRoundTargets?.[key] !== undefined
              ? `${goalRoundTargets?.[key]}`
              : '',
        }));
        return;
      }
      updateProfile({
        goalRoundTargets: {
          ...goalRoundTargets,
          [key]: numeric,
        },
      });
    };

    const renderGoalRow = (
      label: string,
      current: number | null,
      goal: number | null,
      lowerIsBetter: boolean,
      key: string,
      unit: string,
      format: 'average' | 'percent' | 'integer' | 'handicap'
    ) => {
      if (!isGoalKey(key)) return null;
      const progress = getGoalProgress(current, goal, lowerIsBetter);
      const progressPercent = progress !== null ? Math.round(progress * 100) : null;
      const currentLabel = current !== null ? formatStat(current, format) : '—';
      const goalValue = goalDrafts[key] ?? (goal !== null && goal !== undefined ? `${goal}` : '');
      const roundsTarget = goalRoundDrafts[key] ?? (
        goalRoundTargets?.[key] !== null && goalRoundTargets?.[key] !== undefined
          ? `${goalRoundTargets?.[key]}`
          : ''
      );
      const noOpportunities = format === 'percent' && current === null;

      return (
        <View style={styles.goalRow}>
          <View style={styles.goalHeaderRow}>
            <Text style={styles.goalLabel}>{label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.goalCurrent}>
                {format === 'percent' ? currentLabel : (unit ? `${currentLabel}${unit}` : currentLabel)}
              </Text>
              {noOpportunities && (
                <TouchableOpacity
                  onPress={() => Alert.alert(FEEDBACK_COPY.alerts.noOpportunitiesTitle, FEEDBACK_COPY.alerts.noOpportunitiesBody)}
                  accessibilityRole="button"
                  accessibilityLabel="No opportunities recorded"
                >
                  <Ionicons name="information-circle-outline" size={14} color="#6B7280" />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.goalInputRow}>
            <Text style={styles.goalInputLabel}>Goal</Text>
            <TextInput
              style={styles.goalInput}
              keyboardType="decimal-pad"
              placeholder="Set"
              placeholderTextColor="#6B7280"
              value={goalValue}
              onChangeText={(value) => handleGoalChange(key, value)}
              onBlur={() => handleGoalCommit(key)}
            />
          </View>
          <View style={styles.goalInputRow}>
            <Text style={styles.goalInputLabel}>By (rounds)</Text>
            <TextInput
              style={styles.goalInput}
              keyboardType="number-pad"
              placeholder="e.g. 10"
              placeholderTextColor="#6B7280"
              value={roundsTarget}
              onChangeText={(value) => handleGoalRoundsChange(key, value)}
              onBlur={() => handleGoalRoundsCommit(key)}
            />
          </View>
          {goal !== null && goal !== undefined && (
            current !== null ? (
              <View style={styles.goalProgressRow}>
                <View style={styles.goalProgressTrack}>
                  <View
                    style={[
                      styles.goalProgressFill,
                      progress !== null && progress >= 1 && styles.goalProgressFillDone,
                      { width: `${progressPercent ?? 0}%` },
                    ]}
                  />
                </View>
                <Text style={styles.goalProgressText}>
                  {progressPercent !== null ? `${progressPercent}%` : '—'}
                </Text>
              </View>
            ) : (
              <Text style={styles.goalNoDataText}>Play more rounds to track this goal.</Text>
            )
          )}
          {roundsTarget.trim().length > 0 && (
            <Text style={styles.goalNoDataText}>Target horizon: {roundsTarget} round{roundsTarget === '1' ? '' : 's'}</Text>
          )}
        </View>
      );
    };

    const inferredHomeCourseName = getMostPlayedCourseName(rounds);
    const displayHomeCourseName = profile.coursePreferences.homeCourseName || inferredHomeCourseName || '';

    const handleDistanceChange = async (unit: 'yards' | 'meters') => {
      setDistanceUnit(unit);
      await Storage.setItem('distanceUnit', unit);
      triggerSaveFeedback();
    };

  const handleDateFormatChange = async (format: string) => {
    setDateFormat(format);
    await Storage.setItem(DATE_FORMAT_KEY, format);
    triggerSaveFeedback();
  };

  const handleDefaultTeeChange = async (tee: string) => {
    await updateProfile({
      coursePreferences: { ...profile.coursePreferences, favoriteTee: tee },
    });
  };

    const handleHomeCourseChange = async (courseName: string) => {
    await updateProfile({
      coursePreferences: { ...profile.coursePreferences, homeCourseName: courseName },
    });
  };

  const handleNotificationPreferencesChange = async (
    updates: Partial<UserProfile['notificationPreferences']>,
    options?: { requestPermission?: boolean }
  ) => {
    const nextPreferences = {
      pushEnabled: profile.notificationPreferences?.pushEnabled === true,
      marketingEnabled: profile.notificationPreferences?.marketingEnabled === true,
      maintenanceEnabled: profile.notificationPreferences?.maintenanceEnabled !== false,
      ...updates,
    };
    const nextProfile = {
      ...profile,
      notificationPreferences: nextPreferences,
    };
    setProfile(nextProfile);
    await persistProfile(nextProfile);
    await syncPushRegistrationForProfile(nextProfile, {
      requestPermission: options?.requestPermission,
    }).catch(() => undefined);
    await loadPushPermissionLabel().catch(() => undefined);
  };

  const handlePushEnabledChange = async (enabled: boolean) => {
    await handleNotificationPreferencesChange(
      { pushEnabled: enabled },
      { requestPermission: enabled }
    );
  };

  const handleMarketingEnabledChange = async (enabled: boolean) => {
    await handleNotificationPreferencesChange({ marketingEnabled: enabled });
  };

  const handleMaintenanceEnabledChange = async (enabled: boolean) => {
    await handleNotificationPreferencesChange({ maintenanceEnabled: enabled });
  };

    const formatLastSync = (value: string | null) => {
      if (!value) return 'Never';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'Unknown';
      const diffMs = Date.now() - date.getTime();
      const dayMs = 1000 * 60 * 60 * 24;
      if (diffMs < dayMs) {
        const hours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
        return `Today · ${hours}h ago`;
      }
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    };

    const getSyncAgeDays = (value: string | null) => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      const diffMs = Date.now() - date.getTime();
      const dayMs = 1000 * 60 * 60 * 24;
      if (diffMs < dayMs) return 0;
      return Math.ceil(diffMs / dayMs);
    };

    const handleSyncNow = async () => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        await syncLocalDataToFirestore();
        await recordLastSync(new Date());
        await loadRounds();
        const pending = await getPendingSyncCount();
        setPendingSyncCount(pending);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (/network|offline|fetch|unavailable/i.test(message)) {
          await enqueueLocalDataSync('profile_manual_sync');
          setSyncError('Offline: sync queued and will retry when online.');
          const pending = await getPendingSyncCount();
          setPendingSyncCount(pending);
        } else {
          setSyncError('Sync failed. Please try again.');
        }
      } finally {
        setIsSyncing(false);
      }
    };

    const showHandicapInfo = () => {
      Alert.alert(
        'GolfSum Player Rating',
        'GolfSum Player Rating is calculated from adjusted score vs par using your rated rounds. Lower is better.\n\nGolfSum Player Rating is a proprietary performance metric calculated by GolfSum. It is independent of the World Handicap System™ and is not a USGA Handicap Index®. GolfSum is not affiliated with, authorized by, or endorsed by the USGA or The R&A. GolfSum Player Rating cannot be used as an official handicap for competition purposes. For an official Handicap Index, register with a USGA-affiliated golf club.',
        [{ text: 'OK' }]
      );
    };

    if (showImprovementLoop && improvementData) {
      return (
        <ImprovementLoopScreen
          data={improvementData}
          onClose={() => setShowImprovementLoop(false)}
        />
      );
    }

    return (
      <>
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.scrollContent}>
        <ProfileHeader
          displayName={user.displayName}
          email={user.email}
          photoURL={user.photoURL}
          nickname={nicknameDraft}
          isEditingNickname={isEditingNickname}
          onEditNickname={() => setIsEditingNickname(true)}
          onNicknameChange={setNicknameDraft}
          onNicknameBlur={() => {
            setIsEditingNickname(false);
            updateProfile({
              personalInfo: { ...profile.personalInfo, nickname: nicknameDraft.trim() },
            });
          }}
          styles={styles}
        />
        {profileSaved && (
          <View style={styles.saveToast}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text style={styles.saveToastText}>Saved</Text>
          </View>
        )}
        {reportUpdateBanner && (
          <TouchableOpacity style={styles.reportUpdateBanner} onPress={handleViewReportUpdate}>
            <Text style={styles.reportUpdateBannerText}>Report updated · Tap to view</Text>
            <Text style={styles.reportUpdateBannerAction}>View</Text>
          </TouchableOpacity>
        )}

        <HandicapCard
          handicapValue={currentHandicap !== null ? formatHandicap(currentHandicap) : '—'}
          statusText={currentHandicap === null
            ? (remainingEligible > 0
                ? `${remainingEligible} more rated round${remainingEligible !== 1 ? 's' : ''} to calculate your Player Rating`
                : 'Calculating your Player Rating...')
            : undefined}
          eligibleRounds={eligibleRounds}
          notEligibleRounds={notEligibleRounds}
          handicapChange={handicapChange}
          handicapImproving={handicapImproving}
          lastUpdated={lastUpdated}
          showFallbackBadge={Boolean(handicapDetails && handicapDetails.acceptableRoundsCount < 20 && handicapDetails.diffsUsed > 0)}
          fallbackRoundsUsed={handicapDetails?.diffsUsed ?? null}
          onInfoPress={showHandicapInfo}
          styles={styles}
        />

        <RoundsSummaryCard
          roundsCount={rounds.length}
          sinceLabel={roundsSinceLabel}
          bestLabel={bestRoundLabel}
          streakLabel={streakLabel}
          onBestPress={bestRound ? () => onNavigateToRoundDetail?.(bestRound) : undefined}
          onStartRound={onNavigateToPlay}
          styles={styles}
        />

        <Text style={styles.groupHeader}>YOUR GOLF DNA</Text>
        {golfDNA && (
          <GolfDNACard
            dna={golfDNA}
            lastUpdated={dnaLastUpdated || '—'}
            onRefresh={() => {
              const handicap = handicapDetails?.handicapIndex ?? profile.coursePreferences.typicalHandicap ?? null;
              setGolfDNA(buildGolfDNA(rounds, handicap));
              setImprovementData(buildImprovementLoop(rounds));
              setDnaLastUpdated(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
            }}
          />
        )}
        <TouchableOpacity
          style={styles.dnaActionRow}
          onPress={() => setShowImprovementLoop(true)}
        >
          <View style={styles.dnaActionLeft}>
            <Ionicons name="trending-up-outline" size={20} color="#10B981" />
            <View style={styles.dnaActionTextBlock}>
              <Text style={styles.dnaActionText}>Improvement Loop</Text>
              <Text style={styles.dnaActionSubtext}>Track measurable progress over time</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        <GoalsSection
          expanded={showGoals}
          handicapIndex={currentHandicap}
          averageScoreNumber={averageScoreNumber}
          firPercent={firPercent}
          girPercent={girPercent}
          averagePuttsNumber={averagePuttsNumber}
          upDownPercent={upDownPercent}
          showFir={showFirGoal}
          showGir={showGirGoal}
          showPutts={showPuttsGoal}
          showUpDown={showUpDownGoal}
          goals={goals}
          renderGoalRow={renderGoalRow}
          onToggle={() => setShowGoals(!showGoals)}
          styles={styles}
        />

        <Text style={styles.groupHeader}>GAME SETUP</Text>
        <ScoringModeSection
          scoringMode={profile.scoringMode}
          onSelect={(mode) => handleScoringModeChange(mode)}
          styles={styles}
        />

        <StatTrackingSection
          expanded={showScoringPrefs}
          activeStatsCount={activeStatsCount}
          scoringMode={profile.scoringMode}
          resolvedStatPrefs={resolvedStatPrefs}
          profileScoringPreferences={profile.scoringPreferences}
          onToggle={() => setShowScoringPrefs(!showScoringPrefs)}
          onApplyPreset={applyPreset}
          onUpdateStatPreference={updateStatPreference}
          onUpdateProfile={updateProfile}
          styles={styles}
          isPremium={hasProAccess}
        />

        <BagBuilderSection
          expanded={showBagBuilder}
          clubsCountLabel={`${countClubs()} clubs • Helps recognize club abbreviations`}
          profile={profile}
          onToggle={() => setShowBagBuilder(!showBagBuilder)}
          onUpdateProfile={updateProfile}
          onToggleClub={toggleClub}
          styles={styles}
          yardageAnalysis={yardageAnalysis}
        />

        <SubscriptionSection
          styles={styles}
          isPro={hasProAccess}
          inTrial={inTrial}
          trialRoundsUsed={trialRoundsUsed}
          trialLimit={trialLimit}
          renewalDateLabel={subscriptionRenewalLabel}
          willRenew={subscriptionWillRenew}
          isLoading={subscriptionLoading}
          onSeePlans={() => onOpenUpgrade?.('profile')}
          onRestore={async () => {
            const restored = await restorePurchases();
            if (restored.success) {
              Alert.alert('Purchase Restored', 'Your Pro subscription is active.');
            } else {
              Alert.alert('No previous purchase found', 'Make sure you are signed in with the correct Apple ID.');
            }
            await loadSubscriptionCard();
          }}
          onManage={async () => {
            try {
              await openManageSubscriptions();
            } catch {
              Alert.alert('Unable to open subscriptions', 'Please open App Store subscription settings manually.');
            }
          }}
        />

        <Text style={styles.groupHeader}>APP SETTINGS</Text>
        <PreferencesSection
          expanded={showPreferences}
          distanceUnit={distanceUnit}
          dateFormat={dateFormat}
          defaultTee={profile.coursePreferences.favoriteTee || 'Always Ask'}
          homeCourseName={displayHomeCourseName}
          favoriteCourses={favoriteCourses}
          pushEnabled={profile.notificationPreferences?.pushEnabled === true}
          marketingEnabled={profile.notificationPreferences?.marketingEnabled === true}
          maintenanceEnabled={profile.notificationPreferences?.maintenanceEnabled !== false}
          pushPermissionLabel={pushPermissionLabel}
          onToggle={() => setShowPreferences(!showPreferences)}
          onDistanceChange={handleDistanceChange}
          onDateFormatChange={handleDateFormatChange}
          onDefaultTeeChange={handleDefaultTeeChange}
          onHomeCourseChange={handleHomeCourseChange}
          onPushEnabledChange={handlePushEnabledChange}
          onMarketingEnabledChange={handleMarketingEnabledChange}
          onMaintenanceEnabledChange={handleMaintenanceEnabledChange}
          styles={styles}
        />

        <BackupSyncSection
          lastSyncLabel={formatLastSync(lastSyncAt)}
          lastSyncAgeDays={getSyncAgeDays(lastSyncAt)}
          pendingSyncCount={pendingSyncCount}
          isSyncing={isSyncing}
          syncError={syncError}
          onSync={handleSyncNow}
          styles={styles}
        />

        <DataExportSection
          isExporting={isExporting}
          exportError={exportError}
          onReportIssue={handleReportExportIssue}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportJson={handleExportJson}
          styles={styles}
        />

        <View onLayout={(e) => setReportSectionY(e.nativeEvent.layout.y)}>
          <ReportIssueSection
            expanded={reportSectionExpanded}
            onToggle={() => setReportSectionExpanded((prev) => !prev)}
            message={reportMessage}
            isSubmitting={isReportingIssue}
            error={reportError}
            success={reportSuccess}
            issues={reportedIssues}
            selectedIssueId={selectedReportId}
            onSelectIssue={handleSelectReport}
            seenMap={reportSeenMap}
            replyMessage={reportReplyMessage}
            replyError={reportReplyError}
            replySuccess={reportReplySuccess}
            isSendingReply={isSendingReply}
            onReplyChange={setReportReplyMessage}
            onSendReply={handleSendReportReply}
            isRefreshing={isRefreshingReport}
            onRefresh={refreshReportedIssue}
            onChange={setReportMessage}
            onSubmit={handleReportIssue}
            styles={styles}
          />
        </View>

        <AboutSection
          expanded={showAbout}
          onToggle={() => setShowAbout(!showAbout)}
          onOpenUrl={(url) => Linking.openURL(url)}
          onShare={() => Share.share({ message: 'Check out GolfSum - the golf stat tracking app.' })}
          styles={styles}
        />
        {__DEV__ && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.headerLeft}>
                <Ionicons name="watch-outline" size={20} color="#10B981" />
                <Text style={styles.sectionTitle}>WATCH DEBUG</Text>
              </View>
              <TouchableOpacity onPress={() => refreshWatchDebugPanel()}>
                <Ionicons name="refresh" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={styles.sectionContent}>
              <Text style={styles.settingLabel}>Bridge Available: {isWatchBridgeAvailable() ? 'Yes' : 'No'}</Text>
              <Text style={styles.settingValue}>Queued Events: {watchDebugQueueCount}</Text>
              <Text style={styles.settingValue}>Last Event: {watchDebugLastEvent}</Text>
            </View>
          </View>
        )}
        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#E07575" />
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.deleteDataFooter}>
          <TouchableOpacity
            style={styles.deleteDataLink}
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount}
          >
            <Text style={[styles.deleteDataLinkText, isDeletingAccount && styles.deleteAccountButtonDisabled]}>
              {isDeletingAccount ? 'Deleting data...' : 'Delete account & data'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.deleteAccountHint}>
            Permanent. This cannot be undone.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

    </>
    );
  }

  // Auth form view
  if (showAuthForm) {
    return (
      <AuthFormView
        authMode={authMode}
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        isLoading={isLoading}
        error={error}
        successMessage={successMessage}
        onBack={() => {
          setShowAuthForm(false);
          resetForm();
        }}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onSubmit={handleEmailAuth}
        onGoogleSignIn={handleGoogleSignIn}
        onAppleSignIn={handleAppleSignIn}
        isAppleAvailable={isAppleAvailable}
        onSetAuthMode={setAuthMode}
        styles={styles}
      />
    );
  }

  // Guest view
  return (
    <GuestView
      onSignIn={() => setShowAuthForm(true)}
      onExport={handleExportCsv}
      isExporting={isExporting}
      exportError={exportError}
      styles={styles}
    />
  );
};
