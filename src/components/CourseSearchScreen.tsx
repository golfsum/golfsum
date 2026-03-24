import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCourseName } from '../utils/courseName';
import * as Location from 'expo-location';
import {
  getRecentCourses,
  getFavoriteCourses,
  addToFavorites,
  removeFromFavorites,
  GolfCourse,
  CourseDetails,
} from '../services/golfCourseApiService';
import { getRounds } from '../services/roundsService';
import {
  OSMGolfCourse,
  searchGolfCoursesNearby,
  searchGolfCoursesByName,
} from '../services/openStreetMapService';
import {
  fetchCourseAsDetails as golfApiIoFetchDetails,
} from '../services/golfApiIoService';
import { searchGolfCoursesFromBackend } from '../services/golfApi';
import { findCommunityCoursesByName } from '../services/courseCatalogService';
import type { SavedRound } from '../types';
import { getDefaultProfile } from '../types';
import type { InProgressRoundDraft } from '../services/inProgressRoundService';
import { logger } from '../utils/logger';
import Storage from '../services/storage';
import { getUserProfile, saveUserProfile } from '../services/userService';
import { FEEDBACK_COPY } from '../constants/feedbackCopy';
import { GpsRoundSetupModal } from './gps/GpsRoundSetupModal';
import { loadGpsRoundSetup } from '../services/gpsRoundSetup';
import { getDefaultRoutingOption } from '../utils/courseRouting';
import ReportModal from './ReportModal';
import { getMissingYardageTees, hasSparseTeeList } from '../services/reportDetection';
import { isCourseCached, downloadCourse } from '../services/courseCache';

const PROFILE_STORAGE_KEY = '@GolfSum:UserProfile';
const LAST_GPS_ROUND_LENGTH_KEY = '@GolfSum:lastGpsRoundLength';
const GPS_SETUP_LAYOUT_KEY_PREFIX = '@GolfSum:gpsSetup:layout:';
const GPS_SETUP_TEE_KEY_PREFIX = '@GolfSum:gpsSetup:tee:';

type GpsRoundLength = '18' | 'front9' | 'back9';
type GpsRouteOption = { id: string; label: string; holeNumbers: number[]; holeCount: number };
type GpsCourseVariantOption = { id: string; label: string; subtitle?: string };
type ResolvedBackendCourse = {
  id: string;
  name: string;
  clubName?: string;
  city?: string;
  state?: string;
  holes?: number;
  distance?: number;
  latitude?: number;
  longitude?: number;
};

type SavedGpsSetup = {
  layoutId: string | null;
  teeName: string | null;
  roundLength: GpsRoundLength;
};

interface CourseSearchScreenProps {
  onCourseSelected: (courseId: string) => void;
  onGpsRoundStart?: (
    courseId: string,
    courseName?: string,
    settings?: { teeName?: string; startingHole?: number; endingHole?: number; roundLength?: GpsRoundLength; tournamentMode?: boolean; routeHoleNumbers?: number[]; routeLabel?: string }
  ) => void;
  onPlanCourse?: (
    courseId: string,
    courseName?: string,
    teeColor?: string,
    latitude?: number,
    longitude?: number
  ) => void;
  onBack: () => void;
  onManualCourseEntry?: () => void; // Trigger manual course entry fallback
  onUploadScorecard?: (courseSeed?: OSMGolfCourse) => void;
  onCommunityCourseSelected?: (course: CourseDetails) => void;
  onQuickStart?: (courseId: string, teeName?: string) => void;
  inProgressRound?: InProgressRoundDraft | null;
  onResumeRound?: (draft: InProgressRoundDraft) => void;
  onAbandonRound?: () => void;
  isOffline?: boolean;
}

export const CourseSearchScreen: React.FC<CourseSearchScreenProps> = ({
  onCourseSelected,
  onGpsRoundStart,
  onPlanCourse,
  onBack,
  onManualCourseEntry,
  onUploadScorecard,
  onCommunityCourseSelected,
  onQuickStart,
  inProgressRound,
  onResumeRound,
  onAbandonRound,
  isOffline = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [osmResults, setOsmResults] = useState<OSMGolfCourse[]>([]); // OSM discovery results
  const [recentCourses, setRecentCourses] = useState<GolfCourse[]>([]);
  const [favoriteCourses, setFavoriteCourses] = useState<GolfCourse[]>([]);
  const [rounds, setRounds] = useState<SavedRound[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFindingNearby, setIsFindingNearby] = useState(false);
  const [isLoadingCourse, setIsLoadingCourse] = useState(false); // Loading course details
  const [loadingQuickStartId, setLoadingQuickStartId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<Record<string, 'idle' | 'downloading' | 'done' | 'error'>>({});
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [offlineSaveNotice, setOfflineSaveNotice] = useState<string | null>(null);
  const [homeCourseName, setHomeCourseName] = useState<string>('');
  const [gpsSetupVisible, setGpsSetupVisible] = useState(false);
  const [gpsSetupLoading, setGpsSetupLoading] = useState(false);
  const [gpsSetupCourse, setGpsSetupCourse] = useState<{ courseId: string; courseName?: string } | null>(null);
  const [gpsSetupLocation, setGpsSetupLocation] = useState('');
  const [gpsTeeOptions, setGpsTeeOptions] = useState<Array<{ name: string; color?: string; totalYards: number }>>([]);
  const [gpsCourseVariants, setGpsCourseVariants] = useState<GpsCourseVariantOption[]>([]);
  const [gpsResolvedCourses, setGpsResolvedCourses] = useState<ResolvedBackendCourse[]>([]);
  const [selectedGpsCourseId, setSelectedGpsCourseId] = useState<string | null>(null);
  const [gpsRouteOptions, setGpsRouteOptions] = useState<GpsRouteOption[]>([]);
  const [selectedGpsRouteId, setSelectedGpsRouteId] = useState<string | null>(null);
  const [selectedGpsTee, setSelectedGpsTee] = useState('');
  const [gpsStartingHole, setGpsStartingHole] = useState(1);
  const [gpsHoleCount, setGpsHoleCount] = useState(18);
  const [gpsTournamentMode, setGpsTournamentMode] = useState(false);
  const [gpsRoundLength, setGpsRoundLength] = useState<GpsRoundLength>('18');
  const [gpsHolesWithData, setGpsHolesWithData] = useState<number[]>([]);
  const [searchAllAvailable, setSearchAllAvailable] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportContext, setReportContext] = useState<any | null>(null);
  const insets = useSafeAreaInsets();
  const selectedGpsRoute = useMemo(
    () => gpsRouteOptions.find((route) => route.id === selectedGpsRouteId) || null,
    [gpsRouteOptions, selectedGpsRouteId]
  );
  const selectedResolvedCourse = useMemo(
    () => gpsResolvedCourses.find((course) => course.id === selectedGpsCourseId) || null,
    [gpsResolvedCourses, selectedGpsCourseId]
  );
  const missingYardageTees = useMemo(() => getMissingYardageTees(gpsTeeOptions), [gpsTeeOptions]);
  const teeSetupReportPrompt = useMemo(() => {
    if (missingYardageTees.length > 0) return 'Missing a tee? Let us know.';
    if (hasSparseTeeList(gpsTeeOptions)) return 'Missing tees? Let us know.';
    return null;
  }, [gpsTeeOptions, missingYardageTees.length]);

  const getGpsHoleRange = (roundLength: GpsRoundLength) => {
    if (roundLength === 'front9') return { start: 1, end: 9, total: 9 };
    if (roundLength === 'back9') return { start: 10, end: 18, total: 9 };
    return { start: 1, end: 18, total: 18 };
  };

  const getPlayedHolesForCourse = (courseId?: string) => {
    if (!courseId) return [];
    const holes = new Set<number>();
    rounds.forEach((round) => {
      const roundCourseId = round.courseId || round.courseSnapshot?.courseId;
      if (roundCourseId !== courseId) return;
      (round.holes || []).forEach((hole) => {
        if ((hole?.score || 0) > 0 && Number.isFinite(hole?.number)) {
          holes.add(Number(hole.number));
        }
      });
      (round.gpsShots || []).forEach((shot) => {
        if (Number.isFinite(shot?.holeNumber)) {
          holes.add(Number(shot.holeNumber));
        }
      });
    });
    return [...holes].sort((a, b) => a - b);
  };

  const setPersistedRoundLength = (value: GpsRoundLength) => {
    setGpsRoundLength(value);
    Storage.setItem(LAST_GPS_ROUND_LENGTH_KEY, value).catch(() => undefined);
  };

  const openReport = (nextContext: any) => {
    setReportContext(nextContext);
    setReportModalVisible(true);
  };

  const normalizeStorageToken = (value?: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const buildGpsSetupFacilityKey = (params: {
    courseName?: string;
    location?: string;
    resolvedCourses?: ResolvedBackendCourse[];
  }) => {
    const { courseName, location, resolvedCourses = [] } = params;
    const leadCourse = resolvedCourses[0];
    const parts = [
      leadCourse?.clubName || courseName,
      leadCourse?.city,
      leadCourse?.state,
      location,
    ]
      .map((part) => normalizeStorageToken(part))
      .filter(Boolean);

    return parts.join(':') || normalizeStorageToken(courseName) || 'default';
  };

  const getGpsSetupStorageKeys = (facilityKey: string) => ({
    layout: `${GPS_SETUP_LAYOUT_KEY_PREFIX}${facilityKey}`,
    tee: `${GPS_SETUP_TEE_KEY_PREFIX}${facilityKey}`,
  });

  const loadSavedGpsSetup = async (facilityKey: string): Promise<SavedGpsSetup> => {
    const keys = getGpsSetupStorageKeys(facilityKey);
    const [layoutId, teeName, roundLengthValue] = await Promise.all([
      Storage.getItem(keys.layout),
      Storage.getItem(keys.tee),
      Storage.getItem(LAST_GPS_ROUND_LENGTH_KEY),
    ]);

    const normalizedRoundLength =
      roundLengthValue === '18' || roundLengthValue === 'front9' || roundLengthValue === 'back9'
        ? roundLengthValue
        : '18';

    return {
      layoutId,
      teeName,
      roundLength: normalizedRoundLength,
    };
  };

  const saveGpsSetup = async (
    facilityKey: string,
    layoutId: string | null,
    teeName: string | null,
    roundLength: GpsRoundLength
  ) => {
    const keys = getGpsSetupStorageKeys(facilityKey);
    const writes: Array<Promise<void>> = [
      Storage.setItem(LAST_GPS_ROUND_LENGTH_KEY, roundLength),
    ];

    if (layoutId) {
      writes.push(Storage.setItem(keys.layout, layoutId));
    }

    if (teeName) {
      writes.push(Storage.setItem(keys.tee, teeName));
    }

    await Promise.all(writes);
  };

  const isCombinationTeeName = (teeName?: string) => /[\/+]/.test(String(teeName || ''));

  const getDefaultTeeName = (
    tees: Array<{ name: string; totalYards: number }>,
    preferredTeeName?: string | null
  ) => {
    const normalizedPreferred = String(preferredTeeName || '').trim().toLowerCase();
    const preferredMatch = tees.find(
      (tee) => tee.name.trim().toLowerCase() === normalizedPreferred
    );
    if (preferredMatch) return preferredMatch.name;

    const standardTees = tees.filter((tee) => !isCombinationTeeName(tee.name));
    const orderedStandardTees = [...standardTees].sort(
      (left, right) => Number(right.totalYards || 0) - Number(left.totalYards || 0)
    );
    if (orderedStandardTees.length > 0) {
      return orderedStandardTees[Math.floor(orderedStandardTees.length / 2)]?.name || '';
    }

    return tees[0]?.name || '';
  };

  const normalizeCompare = (value?: string) =>
    String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');

  const buildResolverQueries = (name?: string) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return [];

    const variants = new Set<string>([trimmed]);
    const lower = trimmed.toLowerCase();
    const suffixes = [
      ' golf resort & spa',
      ' golf resort and spa',
      ' resort & spa',
      ' resort and spa',
      ' golf resort',
      ' resort',
      ' spa',
      ' golf club',
      ' country club',
      ' golf course',
    ];

    for (const suffix of suffixes) {
      if (lower.endsWith(suffix)) {
        const stripped = trimmed.slice(0, -suffix.length).trim();
        if (stripped) variants.add(stripped);
      }
    }

    if (lower.includes('&')) {
      variants.add(trimmed.replace(/\s*&\s*/g, ' ').replace(/\s+/g, ' ').trim());
    }

    return [...variants];
  };

  const buildCourseVariantOptions = (courses: ResolvedBackendCourse[]) =>
    courses.map((course) => ({
      id: `golfapiio_${course.id}`,
      label: formatCourseName(course.name || course.clubName || 'Course'),
      subtitle: [course.city, course.state].filter(Boolean).join(', '),
    }));

  const getResolvedFamilyCourses = (results: ResolvedBackendCourse[]) => {
    const courses = Array.isArray(results) ? results.filter((course) => course?.id) : [];
    if (courses.length <= 1) return courses;

    const [best] = courses;
    const bestClub = normalizeCompare(best.clubName || best.name);
    const bestCity = normalizeCompare(best.city);
    const bestState = normalizeCompare(best.state);

    const sameClub = courses.filter((course) => normalizeCompare(course.clubName || course.name) === bestClub);
    const family = sameClub.filter((course) => {
      const cityMatches = !bestCity || normalizeCompare(course.city) === bestCity;
      const stateMatches = !bestState || normalizeCompare(course.state) === bestState;
      return cityMatches && stateMatches;
    });

    return (family.length > 1 ? family : sameClub.length > 1 ? sameClub : [best])
      .sort((a, b) => {
        const holesDelta = Number(b.holes || 0) - Number(a.holes || 0);
        if (holesDelta !== 0) return holesDelta;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  };

  const loadGpsSetupForCourse = async (
    courseId: string,
    courseName: string,
    latitude?: number,
    longitude?: number,
    options?: { preferredTeeName?: string | null; preferredRoundLength?: GpsRoundLength }
  ) => {
    setGpsSetupCourse({ courseId, courseName });
    setGpsSetupLoading(true);
    setGpsRouteOptions([]);
    setSelectedGpsRouteId(null);
    setGpsTeeOptions([]);
    setSelectedGpsTee('');
    setGpsHolesWithData(getPlayedHolesForCourse(courseId));

    try {
      const setup = await loadGpsRoundSetup(courseId, courseName, latitude, longitude);
      const defaultTee = getDefaultTeeName(setup.teeOptions, options?.preferredTeeName);
      const defaultRoute = getDefaultRoutingOption(setup.routeOptions);
      setGpsTeeOptions(setup.teeOptions);
      setGpsRouteOptions(setup.routeOptions || []);
      setSelectedGpsRouteId(defaultRoute?.id || null);
      setSelectedGpsTee(defaultTee);
      setGpsHoleCount(defaultRoute?.holeCount || setup.holeCount || 18);
      if (defaultRoute) {
        setGpsRoundLength(defaultRoute.holeCount === 9 ? 'front9' : '18');
      } else if (options?.preferredRoundLength) {
        setGpsRoundLength(options.preferredRoundLength);
      }
    } finally {
      setGpsSetupLoading(false);
    }
  };

  useEffect(() => {
    loadRecentAndFavorites();
    loadHomeCourse();
    Storage.getItem(LAST_GPS_ROUND_LENGTH_KEY)
      .then((value) => {
        if (value === '18' || value === 'front9' || value === 'back9') {
          setGpsRoundLength(value);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!offlineSaveNotice) return;
    const t = setTimeout(() => setOfflineSaveNotice(null), 2200);
    return () => clearTimeout(t);
  }, [offlineSaveNotice]);

  useEffect(() => {
    if (selectedGpsRoute) {
      setGpsStartingHole(1);
      return;
    }
    const range = getGpsHoleRange(gpsRoundLength);
    setGpsStartingHole(range.start);
  }, [gpsRoundLength, selectedGpsRoute]);

  const loadRecentAndFavorites = async () => {
    try {
      const [recent, favorites, savedRounds] = await Promise.all([
        getRecentCourses(),
        getFavoriteCourses(),
        getRounds(),
      ]);
      const derivedRecent = deriveRecentCoursesFromRounds(savedRounds);
      setRecentCourses(recent.length > 0 ? recent : derivedRecent);
      setFavoriteCourses(favorites);
      setRounds(savedRounds);
    } catch (error) {
      logger.error('Error loading recent/favorites:', error);
    }
  };

  const deriveRecentCoursesFromRounds = (savedRounds: SavedRound[]): GolfCourse[] => {
    if (!savedRounds.length) return [];
    const byCourse = new Map<string, { course: GolfCourse; lastPlayedMs: number }>();

    for (const round of savedRounds) {
      const courseId = round.courseId || round.courseSnapshot?.courseId || '';
      const courseName = round.courseName || round.courseSnapshot?.name || '';
      if (!courseId || !courseName) continue;

      const roundDate = new Date(round.date).getTime();
      const nextTimestamp = Number.isFinite(roundDate) ? roundDate : 0;
      const existing = byCourse.get(courseId);
      if (!existing || nextTimestamp > existing.lastPlayedMs) {
        const snapshot = round.courseSnapshot;
        byCourse.set(courseId, {
          course: {
            id: courseId,
            name: courseName,
            city: snapshot?.location?.city ?? '',
            state: snapshot?.location?.state ?? '',
            country: snapshot?.location?.country ?? '',
            holes: snapshot?.holesCount ?? snapshot?.holes?.length ?? round.holeCount ?? 18,
            par: snapshot?.holes?.reduce((sum, hole) => sum + (hole.par || 0), 0) ?? 72,
            rating: snapshot?.tee?.rating,
            slope: snapshot?.tee?.slope,
            yardage: snapshot?.holes?.reduce((sum, hole) => sum + (hole.yardage || 0), 0),
            latitude: snapshot?.location?.latitude,
            longitude: snapshot?.location?.longitude,
          },
          lastPlayedMs: nextTimestamp,
        });
      }
    }

    return [...byCourse.values()]
      .sort((a, b) => b.lastPlayedMs - a.lastPlayedMs)
      .map((entry) => entry.course);
  };

  const loadHomeCourse = async () => {
    try {
      const stored = await Storage.getItem(PROFILE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const name = parsed?.coursePreferences?.homeCourseName || '';
        if (name) setHomeCourseName(name);
        return;
      }
      const profile = await getUserProfile();
      if (profile?.coursePreferences?.homeCourseName) {
        setHomeCourseName(profile.coursePreferences.homeCourseName);
      }
    } catch (error) {
      logger.warn('Failed to load home course:', error);
    }
  };

  const handleStartNewSelection = (action: () => void) => {
    if (!inProgressRound) {
      action();
      return;
    }

    Alert.alert(
      FEEDBACK_COPY.alerts.resumeRoundTitle,
      `You have an unfinished round at ${inProgressRound.courseName}.`,
      [
        { text: FEEDBACK_COPY.actions.cancel, style: 'cancel' },
        {
          text: 'Resume Round',
          onPress: () => onResumeRound?.(inProgressRound),
        },
        {
          text: FEEDBACK_COPY.actions.startNew,
          style: 'destructive',
          onPress: async () => {
            await onAbandonRound?.();
            action();
          },
        },
      ]
    );
  };

  const getLastRoundForCourse = (courseId: string): SavedRound | null => {
    const matches = rounds.filter(r => r.courseId === courseId || r.courseSnapshot?.courseId === courseId);
    if (matches.length === 0) return null;
    return matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;
  };

  const formatShortDate = (dateValue?: Date) => {
    if (!dateValue) return 'Unknown';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDistanceMiles = (distance?: number) => {
    if (distance === undefined || distance === null || !Number.isFinite(distance)) return null;
    return `${distance.toFixed(1)} mi`;
  };

  const getCourseInitials = (name: string) => {
    const ignore = new Set(['golf', 'course', 'club', 'country', 'gc', 'the']);
    const parts = name
      .split(' ')
      .map(part => part.trim())
      .filter(part => part.length > 0)
      .filter(part => !ignore.has(part.toLowerCase()));
    const initials = parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('');
    return initials || name.slice(0, 2).toUpperCase();
  };

  const getCourseColor = (name: string) => {
    const palette = ['#1F2937', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#6366F1', '#14B8A6'];
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash + name.charCodeAt(i) * (i + 1)) % palette.length;
    }
    return palette[hash];
  };

  const isCourseFavorite = (courseId: string) =>
    favoriteCourses.some(course => course.id === courseId);

  const normalizeCourseName = (name?: string) =>
    (name || '').trim().toLowerCase();

  const isHomeCourse = (courseName?: string) =>
    normalizeCourseName(courseName) !== '' &&
    normalizeCourseName(courseName) === normalizeCourseName(homeCourseName);

  const persistHomeCourse = async (courseName: string) => {
    const stored = await Storage.getItem(PROFILE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    const baseProfile = parsed
      ? {
          ...getDefaultProfile(),
          ...parsed,
          coursePreferences: {
            ...getDefaultProfile().coursePreferences,
            ...(parsed.coursePreferences || {}),
          },
        }
      : await getUserProfile();
    const nextProfile = {
      ...baseProfile,
      coursePreferences: {
        ...baseProfile.coursePreferences,
        homeCourseName: courseName,
      },
    };
    await Storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    try {
      await saveUserProfile(nextProfile);
    } catch (error) {
      logger.warn('Failed to sync home course to Firestore:', error);
    }
  };

  const handleToggleHomeCourse = async (course: GolfCourse) => {
    const nextName = isHomeCourse(course.name) ? '' : course.name;
    try {
      await persistHomeCourse(nextName);
      setHomeCourseName(nextName);
      if (nextName) {
        setOfflineSaveNotice(`Home course set to "${formatCourseName(nextName)}"`);
      } else {
        setOfflineSaveNotice('Home course cleared');
      }
    } catch (error) {
      logger.error('Failed to update home course:', error);
      Alert.alert(FEEDBACK_COPY.alerts.homeCourseTitle, FEEDBACK_COPY.alerts.homeCourseUpdateFailedBody);
    }
  };

  const handleToggleFavorite = async (course: GolfCourse) => {
    const isFavorite = isCourseFavorite(course.id);
    try {
      if (isFavorite) {
        await removeFromFavorites(course.id);
        setFavoriteCourses(prev => prev.filter(item => item.id !== course.id));
      } else {
        await addToFavorites(course);
        setFavoriteCourses(prev => [course, ...prev]);
      }
    } catch (toggleError) {
      logger.error('Failed to update favorites:', toggleError);
    }
  };

  const handleApiCoursePress = (course: GolfCourse) => {
    if (onGpsRoundStart) {
      handleGpsRoundPress(course);
      return;
    }
    handleStartNewSelection(async () => {
      setIsLoadingCourse(true);
      setError(null);
      try {
        // Try golfapi.io if we have a golfapi.io ID
        const apiId = course.id.startsWith('golfapiio_') ? course.id.slice('golfapiio_'.length) : null;
        if (apiId) {
          const details = await golfApiIoFetchDetails(apiId);
          if (details) {
            if (onCommunityCourseSelected) {
              onCommunityCourseSelected(details);
            } else {
              onCourseSelected(details.id);
            }
            return;
          }
        }
        // Fallback: navigate with bare ID
        onCourseSelected(course.id);
      } catch (err) {
        logger.error('Error fetching course details:', err);
        onCourseSelected(course.id);
      } finally {
        setIsLoadingCourse(false);
      }
    });
  };

  const handleGpsRoundPress = (course: GolfCourse) => {
    if (!onGpsRoundStart) return;
    handleStartNewSelection(async () => {
      const resolvedCourseId = course.id;
      const resolvedCourseName = course.name;
      const facilityKey = buildGpsSetupFacilityKey({
        courseName: resolvedCourseName,
        location: [course.city, course.state].filter(Boolean).join(', '),
      });
      const savedSetup = await loadSavedGpsSetup(facilityKey);

      setGpsSetupVisible(true);
      setGpsSetupLoading(true);
      setGpsSetupCourse({ courseId: resolvedCourseId, courseName: resolvedCourseName });
      setGpsSetupLocation([course.city, course.state].filter(Boolean).join(', '));
      setGpsStartingHole(1);
      setGpsTournamentMode(false);
      setGpsCourseVariants([]);
      setGpsResolvedCourses([]);
      setSelectedGpsCourseId(resolvedCourseId);
      setGpsTeeOptions([]);
      setGpsRouteOptions([]);
      setSelectedGpsRouteId(null);
      setSelectedGpsTee('');
      setGpsHolesWithData(getPlayedHolesForCourse(resolvedCourseId));
      setGpsRoundLength(savedSetup.roundLength);

      try {
        await loadGpsSetupForCourse(resolvedCourseId, resolvedCourseName, course.latitude, course.longitude, {
          preferredTeeName: savedSetup.teeName,
          preferredRoundLength: savedSetup.roundLength,
        });
      } catch (err) {
        logger.warn('GPS tee data unavailable — continuing without tee options:', err);
        // On web, CORS blocks API calls so tee data can't load.
        // Keep the modal open so the user can still start the round.
        if (Platform.OS !== 'web') {
          setGpsSetupVisible(false);
          Alert.alert('GPS Setup', err instanceof Error ? err.message : 'Unable to load tee box data.');
        }
      } finally {
        setGpsSetupLoading(false);
      }
    });
  };

  const toGolfCourseFromOsm = (course: OSMGolfCourse): GolfCourse => ({
    id: course.id,
    name: course.name,
    city: course.city || '',
    state: course.state || '',
    country: '',
    holes: 18,
    par: 72,
    latitude: course.latitude,
    longitude: course.longitude,
    distance: course.distance,
  });

  const handleOsmGpsRoundPress = (course: OSMGolfCourse) => {
    if (!onGpsRoundStart) return;
    handleStartNewSelection(async () => {
      setGpsSetupVisible(true);
      setGpsSetupLoading(true);
      setGpsSetupCourse({ courseId: course.id, courseName: course.name });
      setGpsSetupLocation([course.city, course.state].filter(Boolean).join(', '));
      setGpsStartingHole(1);
      setGpsTournamentMode(false);
      setGpsCourseVariants([]);
      setGpsResolvedCourses([]);
      setSelectedGpsCourseId(null);
      setGpsTeeOptions([]);
      setGpsRouteOptions([]);
      setSelectedGpsRouteId(null);
      setSelectedGpsTee('');
      setGpsHolesWithData([]);

      try {
        const resolved = await resolveOsmToGolfApi(course);
        const familyCourses = getResolvedFamilyCourses(resolved.results || []);
        const variantOptions = buildCourseVariantOptions(familyCourses);
        const facilityKey = buildGpsSetupFacilityKey({
          courseName: course.name,
          location: [course.city, course.state].filter(Boolean).join(', '),
          resolvedCourses: familyCourses,
        });
        const savedSetup = await loadSavedGpsSetup(facilityKey);
        const preferredCourse =
          familyCourses.find((item) => `golfapiio_${item.id}` === savedSetup.layoutId) || null;
        const resolvedCourse = preferredCourse || resolved.selected || familyCourses[0] || null;
        const resolvedId = resolvedCourse?.id ? `golfapiio_${resolvedCourse.id}` : course.id;
        const resolvedName = resolvedCourse?.name || course.name;
        setGpsResolvedCourses(familyCourses);
        setGpsCourseVariants(variantOptions);
        setSelectedGpsCourseId(resolvedId);
        setGpsSetupCourse({ courseId: resolvedId, courseName: resolvedName });
        setGpsSetupLocation([resolvedCourse?.city || course.city, resolvedCourse?.state || course.state].filter(Boolean).join(', '));
        setGpsRoundLength(savedSetup.roundLength);
        await loadGpsSetupForCourse(resolvedId, resolvedName, course.latitude, course.longitude, {
          preferredTeeName: savedSetup.teeName,
          preferredRoundLength: savedSetup.roundLength,
        });
      } catch (err) {
        logger.warn('GPS tee data unavailable — continuing without tee options:', err);
        if (Platform.OS !== 'web') {
          setGpsSetupVisible(false);
          Alert.alert('GPS Setup', err instanceof Error ? err.message : 'Unable to load tee box data.');
        }
      } finally {
        setGpsSetupLoading(false);
      }
    });
  };

  const handleCloseGpsSetup = () => {
    setGpsSetupVisible(false);
    setGpsSetupLoading(false);
    setGpsSetupCourse(null);
    setGpsSetupLocation('');
    setGpsCourseVariants([]);
    setGpsResolvedCourses([]);
    setSelectedGpsCourseId(null);
    setGpsTeeOptions([]);
    setGpsRouteOptions([]);
    setSelectedGpsRouteId(null);
    setSelectedGpsTee('');
    setGpsStartingHole(1);
    setGpsHoleCount(18);
    setGpsTournamentMode(false);
    setGpsHolesWithData([]);
  };

  const handleConfirmGpsSetup = () => {
    if (!gpsSetupCourse || !onGpsRoundStart) return;
    const holeRange = selectedGpsRoute
      ? { start: 1, end: selectedGpsRoute.holeCount, total: selectedGpsRoute.holeCount }
      : getGpsHoleRange(gpsRoundLength);
    const effectiveRoundLength = selectedGpsRoute
      ? (selectedGpsRoute.holeCount === 9 ? 'front9' : '18')
      : gpsRoundLength;
    onGpsRoundStart(gpsSetupCourse.courseId, gpsSetupCourse.courseName, {
      teeName: selectedGpsTee || undefined,
      startingHole: gpsStartingHole,
      endingHole: holeRange.end,
      roundLength: effectiveRoundLength,
      tournamentMode: gpsTournamentMode,
      routeHoleNumbers: selectedGpsRoute?.holeNumbers,
      routeLabel: selectedGpsRoute?.label,
    });
    const facilityKey = buildGpsSetupFacilityKey({
      courseName: gpsSetupCourse.courseName,
      location: gpsSetupLocation,
      resolvedCourses: gpsResolvedCourses,
    });
    saveGpsSetup(
      facilityKey,
      selectedGpsCourseId,
      selectedGpsTee || null,
      effectiveRoundLength
    ).catch((error) => logger.warn('Failed to save GPS setup defaults:', error));
    handleCloseGpsSetup();
  };

  const handleSelectGpsRoute = (routeId: string) => {
    setSelectedGpsRouteId(routeId);
    const route = gpsRouteOptions.find((option) => option.id === routeId);
    if (!route) return;
    setGpsStartingHole(1);
    setGpsHoleCount(route.holeCount);
    setGpsRoundLength(route.holeCount === 9 ? 'front9' : '18');
  };

  const handleSelectGpsCourseVariant = async (courseId: string) => {
    if (courseId === selectedGpsCourseId) return;
    const nextCourse = gpsResolvedCourses.find((course) => `golfapiio_${course.id}` === courseId);
    if (!nextCourse) return;
    setSelectedGpsCourseId(courseId);
    setGpsSetupLocation([nextCourse.city, nextCourse.state].filter(Boolean).join(', '));
    try {
      const facilityKey = buildGpsSetupFacilityKey({
        courseName: nextCourse.name,
        location: [nextCourse.city, nextCourse.state].filter(Boolean).join(', '),
        resolvedCourses: gpsResolvedCourses,
      });
      const savedSetup = await loadSavedGpsSetup(facilityKey);
      await loadGpsSetupForCourse(courseId, nextCourse.name, userLocation?.latitude, userLocation?.longitude, {
        preferredTeeName: savedSetup.teeName,
        preferredRoundLength: savedSetup.roundLength,
      });
    } catch (err) {
      logger.warn('GPS tee data unavailable for selected course variant:', err);
      if (Platform.OS !== 'web') {
        Alert.alert('GPS Setup', err instanceof Error ? err.message : 'Unable to load tee box data.');
      }
    }
  };

  const handleQuickStartPress = (course: GolfCourse, lastTeeName?: string) => {
    if (!onQuickStart) return;
    handleStartNewSelection(async () => {
      setLoadingQuickStartId(course.id);
      try {
        // Warm golfapi.io cache for offline use
        const apiId = course.id.startsWith('golfapiio_') ? course.id.slice('golfapiio_'.length) : null;
        if (apiId) {
          try {
            await golfApiIoFetchDetails(apiId);
            setOfflineSaveNotice(`Saved "${course.name}" for offline use`);
          } catch (prefetchError) {
            logger.warn('Quick Start prefetch failed:', prefetchError);
          }
        }
        await Promise.resolve(onQuickStart(course.id, lastTeeName));
      } finally {
        setTimeout(() => {
          setLoadingQuickStartId(current =>
            current === course.id ? null : current
          );
        }, 700);
      }
    });
  };

  // Check cached status for visible courses
  useEffect(() => {
    (async () => {
      const statuses: Record<string, 'idle' | 'done'> = {};
      for (const course of recentCourses) {
        const cached = await isCourseCached(course.id);
        statuses[course.id] = cached ? 'done' : 'idle';
      }
      setDownloadStatus(prev => ({ ...prev, ...statuses }));
    })();
  }, [recentCourses]);

  const handleDownloadCourse = async (course: GolfCourse) => {
    setDownloadStatus(prev => ({ ...prev, [course.id]: 'downloading' }));
    try {
      await downloadCourse(course.id, course.name, course.latitude, course.longitude);
      setDownloadStatus(prev => ({ ...prev, [course.id]: 'done' }));
    } catch {
      setDownloadStatus(prev => ({ ...prev, [course.id]: 'error' }));
    }
  };

  const handleSearch = async (searchAll: boolean = false) => {
    if (isOffline) {
      Alert.alert(FEEDBACK_COPY.alerts.offlineModeTitle, FEEDBACK_COPY.alerts.offlineCourseSearchBody);
      return;
    }
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);
    setOsmResults([]);
    setSearchAllAvailable(false);

    try {
      logger.debug(`🔍 Searching OSM for: "${searchQuery}"`);
      const osmCourses = await searchGolfCoursesByName(
        searchQuery,
        userLocation?.latitude,
        userLocation?.longitude
      );

      if (osmCourses.length === 0) {
        setError('No courses found. Try a different search term or browse nearby courses.');
      } else {
        setOsmResults(osmCourses);
      }
    } catch (err) {
      logger.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setOsmResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleFindNearby = async () => {
    if (isOffline) {
      Alert.alert(FEEDBACK_COPY.alerts.offlineModeTitle, FEEDBACK_COPY.alerts.offlineNearbyBody);
      return;
    }
    setIsFindingNearby(true);
    setError(null);
    setSearchQuery(''); // Clear search query

    try {
      let latitude: number;
      let longitude: number;

      // Platform-specific location handling
      if (Platform.OS === 'web') {
        // Use browser's native Geolocation API for web
        logger.debug('📍 Using browser geolocation...');
        
        if (!navigator.geolocation) {
          throw new Error('Geolocation is not supported by your browser');
        }

        // Check if page is served over HTTPS (required for geolocation on most browsers)
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          throw new Error('Location access requires HTTPS. Please use a secure connection.');
        }

        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            (error) => {
              logger.error('Geolocation error:', error);
              let errorMessage = '';
              switch (error.code) {
                case error.PERMISSION_DENIED:
                  errorMessage = 'Location permission denied.\n\n' +
                    'Click the location icon in your browser and allow location access for this site.';
                  break;
                case error.POSITION_UNAVAILABLE:
                  errorMessage = 'Location is unavailable. Check your device location settings.';
                  break;
                case error.TIMEOUT:
                  errorMessage = 'Location request timed out. Try again.';
                  break;
                default:
                  errorMessage = 'An error occurred while getting your location.';
              }
              reject(new Error(errorMessage));
            },
            {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 60000, // Use cached location if less than 1 min old
            }
          );
        });

        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        logger.debug(`📍 Browser location: ${latitude}, ${longitude}`);
      } else {
        // Use Expo Location for mobile
        logger.debug('📍 Requesting location permission...');
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          setError('Location permission denied. Turn on location services in Settings.');
          Alert.alert(
            'Location Permission Required',
            'Turn on location services in Settings to find nearby courses.',
            [{ text: 'OK' }]
          );
          setIsFindingNearby(false);
          return;
        }

        logger.debug('📍 Getting current location...');
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        latitude = location.coords.latitude;
        longitude = location.coords.longitude;
        logger.debug(`📍 Mobile location: ${latitude}, ${longitude}`);
      }

      setUserLocation({ latitude, longitude });
      logger.debug('🔍 Searching OSM nearby golf courses within 50 miles');
      const nearbyCourses = await searchGolfCoursesNearby(latitude, longitude, 50);
      if (nearbyCourses.length > 0) {
        setOsmResults(nearbyCourses);
        setError(null);
        logger.debug(`✅ OSM nearby: ${nearbyCourses.length} courses`);
      } else {
        setError('No courses found nearby. Try searching by name.');
        Alert.alert(
          'No Courses Found',
          'We couldn\'t find any golf courses within 50 miles.\n\nTry searching by course name instead.',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      logger.error('Error finding nearby courses:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to find nearby courses';
      setError(errorMessage);
      
      // Show different alert based on error type
      if (errorMessage.includes('rate limit')) {
        Alert.alert(
          'API Limit Reached',
          'You\'ve used all 100 free API requests today. Your quota resets in 24 hours.\n\n' +
          'Options:\n' +
          '• Wait for quota reset\n' +
          '• Search by name instead (type course name)\n' +
          '• Use Recent/Favorites\n' +
          '• Upgrade to paid plan ($9.99/month for 10,000 requests)',
          [{ text: 'OK' }]
        );
      } else if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
        // Location permission error - show helpful instructions
        if (Platform.OS === 'web') {
          Alert.alert(
            'Location Permission Needed',
            errorMessage + '\n\nSteps:\n' +
            '1. Click the lock icon (🔒) or info icon (ℹ️) in your browser\'s address bar\n' +
            '2. Find "Location" in the permissions list\n' +
            '3. Change it to "Allow"\n' +
            '4. Refresh the page and try again\n\n' +
            'Or search by name instead.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'Location Permission Required',
            errorMessage,
            [{ text: 'OK' }]
          );
        }
      } else {
        Alert.alert(
          'Location Error',
          errorMessage + '\n\nTry searching by name instead.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsFindingNearby(false);
    }
  };

  const reverseGeocodeToRegion = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Reverse geocode failed: ${response.status}`);
      }
      const json = await response.json();
      const address = json?.address || {};
      return {
        city: address.city || address.town || address.village || address.hamlet || '',
        state: address.state_code || address.state || '',
        country: address.country_code ? String(address.country_code).toUpperCase() : 'USA',
      };
    } catch (error) {
      logger.warn('Reverse geocode failed, using country fallback only:', error);
      return { city: '', state: '', country: 'USA' };
    }
  };

  const resolveOsmToGolfApi = async (osmCourse: OSMGolfCourse) => {
    if (osmCourse.id.startsWith('golfapiio_')) {
      return {
        selected: {
          id: osmCourse.id.slice('golfapiio_'.length),
          name: osmCourse.name,
        },
        results: [{
          id: osmCourse.id.slice('golfapiio_'.length),
          name: osmCourse.name,
        }],
      };
    }

    let apiCourses: ResolvedBackendCourse[] = [];
    const queries = buildResolverQueries(osmCourse.name);

    for (const query of queries) {
      const searchResponse = await searchGolfCoursesFromBackend({
        mode: 'name',
        query,
        latitude: osmCourse.latitude,
        longitude: osmCourse.longitude,
        city: undefined,
        state: undefined,
        country: undefined,
        radiusMiles: 50,
        searchAll: true,
      });
      apiCourses = Array.isArray((searchResponse as any)?.results) ? (searchResponse as any).results : [];
      if (apiCourses.length > 0) {
        break;
      }
    }

    if (apiCourses.length === 0 && osmCourse.latitude != null && osmCourse.longitude != null) {
      const nearbyResponse = await searchGolfCoursesFromBackend({
        mode: 'nearby',
        query: undefined,
        latitude: osmCourse.latitude,
        longitude: osmCourse.longitude,
        city: osmCourse.city || undefined,
        state: osmCourse.state || undefined,
        country: osmCourse.country || 'USA',
        radiusMiles: 50,
        searchAll: true,
      });
      const nearbyCourses = Array.isArray((nearbyResponse as any)?.results) ? (nearbyResponse as any).results : [];
      const osmName = normalizeCompare(osmCourse.name);
      const osmCity = normalizeCompare(osmCourse.city);
      const osmState = normalizeCompare(osmCourse.state);
      apiCourses = nearbyCourses
        .filter((course: ResolvedBackendCourse) => {
          const courseName = normalizeCompare(course.name);
          const clubName = normalizeCompare(course.clubName);
          const cityMatches = !osmCity || normalizeCompare(course.city) === osmCity;
          const stateMatches = !osmState || normalizeCompare(course.state) === osmState;
          const nameMatches =
            !osmName ||
            osmName.includes(courseName) ||
            courseName.includes(osmName) ||
            osmName.includes(clubName) ||
            clubName.includes(osmName);
          return (cityMatches && stateMatches) || nameMatches;
        })
        .sort((a: ResolvedBackendCourse, b: ResolvedBackendCourse) => {
          const distanceA = Number.isFinite(a.distance) ? Number(a.distance) : Number.MAX_SAFE_INTEGER;
          const distanceB = Number.isFinite(b.distance) ? Number(b.distance) : Number.MAX_SAFE_INTEGER;
          return distanceA - distanceB;
        });
    }

    return {
      selected: apiCourses[0] || null,
      results: apiCourses,
    };
  };

  /**
   * Handle clicking an OSM course - query GolfCourseAPI for full details
   * Uses smart search with name simplification to match OSM names to API names
   */
  const handleOSMCourseClick = async (osmCourse: OSMGolfCourse) => {
    setIsLoadingCourse(true);
    setError(null);

    try {
      logger.debug(`🔍 Resolving OSM course to golfapi.io: "${osmCourse.name}"`);
      const resolved = await resolveOsmToGolfApi(osmCourse);
      const resolvedCourse = resolved?.selected;
      if (!resolvedCourse?.id) {
        logger.debug(`⚠️ Course "${osmCourse.name}" not found on golfapi.io`);
        throw new Error('Course not found on golfapi.io');
      }
      const apiId = String(resolvedCourse.id);
      const details = await golfApiIoFetchDetails(apiId);
      if (details) {
        logger.debug(`✅ Found course on golfapi.io: "${details.name}" (id: ${details.id})`);
        if (onCommunityCourseSelected) {
          onCommunityCourseSelected(details);
        } else {
          onCourseSelected(details.id);
        }
      } else {
        logger.debug(`⚠️ Course "${osmCourse.name}" not found on golfapi.io`);
        const buttons: any[] = [
          { text: FEEDBACK_COPY.actions.cancel, style: 'cancel' },
        ];

        if (onGpsRoundStart) {
          buttons.push({
            text: 'GPS Round',
            onPress: () => handleOsmGpsRoundPress(osmCourse),
          });
        }

        buttons.push(
          {
            text: FEEDBACK_COPY.actions.uploadScorecard,
            onPress: () => {
              if (onUploadScorecard) {
                onUploadScorecard(osmCourse);
              }
            },
          },
          {
            text: FEEDBACK_COPY.actions.addManually,
            onPress: () => {
              if (onManualCourseEntry) {
                onManualCourseEntry();
              }
            },
          },
        );

        Alert.alert(
          FEEDBACK_COPY.alerts.courseNotInDatabaseTitle,
          `"${osmCourse.name}" doesn't have detailed tee box data.\n\nYou can still start a GPS round, or upload a scorecard to capture tee boxes, yardages, rating, slope, and par.`,
          buttons,
        );
      }
    } catch (err) {
      logger.error('Error fetching course details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load course details');
      
      Alert.alert(
        FEEDBACK_COPY.alerts.errorLoadingCourseTitle,
        FEEDBACK_COPY.alerts.errorLoadingCourseBody,
        [
          { text: FEEDBACK_COPY.actions.ok, style: 'cancel' },
          {
            text: FEEDBACK_COPY.actions.uploadScorecard,
            onPress: () => {
              if (onUploadScorecard) {
                onUploadScorecard(osmCourse);
              }
            },
          },
          {
            text: FEEDBACK_COPY.actions.addManually,
            onPress: () => {
              if (onManualCourseEntry) {
                onManualCourseEntry();
              }
            },
          },
        ]
      );
    } finally {
      setIsLoadingCourse(false);
    }
  };

  /**
   * Render OSM course item (from OpenStreetMap)
   */
  const renderOSMCourseItem = (course: OSMGolfCourse) => (
    <TouchableOpacity
      key={course.id}
      style={styles.courseItem}
      onPress={() => (
        onGpsRoundStart
          ? handleOsmGpsRoundPress(course)
          : handleStartNewSelection(() => handleOSMCourseClick(course))
      )}
    >
      {(() => {
        const mappedCourse = toGolfCourseFromOsm(course);
        return (
          <>
      <View style={styles.courseBody}>
      <View style={styles.courseInfo}>
        <View style={styles.courseHeader}>
          <Text style={styles.courseName} numberOfLines={1} ellipsizeMode="tail">{formatCourseName(course.name)}</Text>
          {isHomeCourse(mappedCourse.name) && (
            <Ionicons name="home" size={16} color="#10B981" />
          )}
          {isCourseFavorite(mappedCourse.id) && (
            <Ionicons name="star" size={16} color="#FBBF24" />
          )}
          {course.distance !== undefined && (
            <View style={styles.distanceBadge}>
              <Ionicons name="location" size={12} color="#10B981" />
              <Text style={styles.distanceText}>{formatDistanceMiles(course.distance)}</Text>
            </View>
          )}
        </View>
        {(course.city || course.state) && (
          <Text style={styles.courseLocation}>
            {[course.city, course.state].filter(Boolean).join(', ')}
          </Text>
        )}
      </View>
      <View style={styles.courseActions}>
        <View style={styles.courseActionIcons}>
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={() => handleToggleHomeCourse(mappedCourse)}
          >
            <Ionicons
              name={isHomeCourse(mappedCourse.name) ? 'home' : 'home-outline'}
              size={20}
              color={isHomeCourse(mappedCourse.name) ? '#10B981' : '#6B7280'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={() => handleToggleFavorite(mappedCourse)}
          >
            <Ionicons
              name={isCourseFavorite(mappedCourse.id) ? 'star' : 'star-outline'}
              size={20}
              color={isCourseFavorite(mappedCourse.id) ? '#FBBF24' : '#6B7280'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.courseActionButtons}>
          {onGpsRoundStart && (
            <TouchableOpacity
              style={styles.gpsStartButton}
              onPress={() => handleOsmGpsRoundPress(course)}
            >
              <Ionicons name="navigate-circle" size={20} color="#10B981" />
              <Text style={styles.gpsStartText}>GPS</Text>
            </TouchableOpacity>
          )}
          {onPlanCourse && (
            <TouchableOpacity
              style={styles.gpsStartButton}
              onPress={() => {
                resolveOsmToGolfApi(course).then((resolved) => {
                  if (resolved?.selected) onPlanCourse(resolved.selected.id, resolved.selected.name, undefined, resolved.selected.latitude, resolved.selected.longitude);
                  else onPlanCourse(course.id, course.name, undefined, course.latitude, course.longitude);
                }).catch(() => {
                  onPlanCourse(course.id, course.name, undefined, course.latitude, course.longitude);
                });
              }}
            >
              <Ionicons name="clipboard-outline" size={20} color="#60A5FA" />
              <Text style={[styles.gpsStartText, { color: '#60A5FA' }]}>Plan</Text>
            </TouchableOpacity>
          )}
          <Ionicons name="chevron-forward" size={24} color="#6B7280" />
        </View>
      </View>
      </View>
          </>
        );
      })()}
    </TouchableOpacity>
  );

  const renderCourseItem = (course: GolfCourse, isFavorite: boolean = false) => {
    const isFavoriteBadge = isFavorite || isCourseFavorite(course.id);
    const isHomeBadge = isHomeCourse(course.name);

    return (
    <TouchableOpacity
      key={course.id}
      style={styles.courseItem}
      onPress={() => handleApiCoursePress(course)}
    >
      <View style={[styles.courseThumbnail, { backgroundColor: getCourseColor(course.name) }]}>
        <Text style={styles.courseThumbnailText}>{getCourseInitials(course.name)}</Text>
      </View>
      <View style={styles.courseBody}>
        <View style={styles.courseInfo}>
          <View style={styles.courseHeader}>
            <Text style={styles.courseName} numberOfLines={1} ellipsizeMode="tail">{formatCourseName(course.name)}</Text>
            {isHomeBadge && (
              <Ionicons name="home" size={16} color="#10B981" />
            )}
            {isFavoriteBadge && (
              <Ionicons name="star" size={16} color="#FBBF24" />
            )}
            {formatDistanceMiles(course.distance) && (
              <View style={styles.distanceBadge}>
                <Ionicons name="location" size={12} color="#10B981" />
                <Text style={styles.distanceText}>{formatDistanceMiles(course.distance)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.courseLocation}>
            {course.city}, {course.state}
          </Text>
          <View style={styles.courseDetails}>
            <Text style={styles.courseDetail}>
              {course.holes} holes | Par {course.par}
            </Text>
            {course.rating && course.slope && (
              <Text style={styles.courseDetail}>
                ? {course.rating.toFixed(1)} / {course.slope}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.courseActions}>
          <View style={styles.courseActionIcons}>
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={() => handleToggleHomeCourse(course)}
            >
              <Ionicons
                name={isHomeCourse(course.name) ? 'home' : 'home-outline'}
                size={20}
                color={isHomeCourse(course.name) ? '#10B981' : '#6B7280'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={() => handleToggleFavorite(course)}
            >
              <Ionicons
                name={isCourseFavorite(course.id) ? 'star' : 'star-outline'}
                size={20}
                color={isCourseFavorite(course.id) ? '#FBBF24' : '#6B7280'}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.courseActionButtons}>
            {onGpsRoundStart && (
              <TouchableOpacity
                style={styles.gpsStartButton}
                onPress={() => handleGpsRoundPress(course)}
              >
                <Ionicons name="navigate-circle" size={20} color="#10B981" />
                <Text style={styles.gpsStartText}>GPS</Text>
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-forward" size={24} color="#6B7280" />
          </View>
        </View>
      </View>
    </TouchableOpacity>
    );
  };

  const renderRecentCourseItem = (course: GolfCourse) => {
    const lastRound = getLastRoundForCourse(course.id);
    const lastTeeName = lastRound?.teeName || lastRound?.stats?.teeBox;
    const isLoadingQuickStart = loadingQuickStartId === course.id;

    return (
      <TouchableOpacity
        key={course.id}
        style={styles.courseItem}
        onPress={() => handleApiCoursePress(course)}
      >
        <View style={[styles.courseThumbnail, { backgroundColor: getCourseColor(course.name) }]}>
          <Text style={styles.courseThumbnailText}>{getCourseInitials(course.name)}</Text>
        </View>
        <View style={styles.courseBody}>
          <View style={styles.courseInfo}>
            <View style={styles.courseHeader}>
              <Text style={styles.courseName} numberOfLines={1} ellipsizeMode="tail">{formatCourseName(course.name)}</Text>
              {isHomeCourse(course.name) && (
                <Ionicons name="home" size={16} color="#10B981" />
              )}
              {formatDistanceMiles(course.distance) && (
                <View style={styles.distanceBadge}>
                  <Ionicons name="location" size={12} color="#10B981" />
                  <Text style={styles.distanceText}>{formatDistanceMiles(course.distance)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.courseLocation}>
              {course.city}, {course.state}
            </Text>
            <View style={styles.courseDetails}>
              <Text style={styles.courseDetail}>
                {course.holes} holes | Par {course.par}
              </Text>
              {lastRound && (
                <Text style={styles.lastPlayedText}>
                  Last: {lastTeeName || 'Tee'} | {formatShortDate(lastRound.date)}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.courseActions}>
            <View style={styles.courseActionIcons}>
              <TouchableOpacity
                style={styles.favoriteButton}
                onPress={() => handleToggleHomeCourse(course)}
              >
                <Ionicons
                  name={isHomeCourse(course.name) ? 'home' : 'home-outline'}
                  size={20}
                  color={isHomeCourse(course.name) ? '#10B981' : '#6B7280'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.favoriteButton}
                onPress={() => handleToggleFavorite(course)}
              >
                <Ionicons
                  name={isCourseFavorite(course.id) ? 'star' : 'star-outline'}
                  size={20}
                  color={isCourseFavorite(course.id) ? '#FBBF24' : '#6B7280'}
                />
              </TouchableOpacity>
              {downloadStatus[course.id] === 'done' ? (
                <View style={styles.favoriteButton}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                </View>
              ) : downloadStatus[course.id] === 'downloading' ? (
                <View style={styles.favoriteButton}>
                  <ActivityIndicator size="small" color="#10B981" />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.favoriteButton}
                  onPress={() => handleDownloadCourse(course)}
                >
                  <Ionicons name="cloud-download-outline" size={20} color="#6B7280" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.courseActionButtons}>
              {onGpsRoundStart && (
                <TouchableOpacity
                  style={styles.gpsStartButton}
                  onPress={() => handleGpsRoundPress(course)}
                >
                  <Ionicons name="navigate-circle" size={20} color="#10B981" />
                  <Text style={styles.gpsStartText}>GPS</Text>
                </TouchableOpacity>
              )}
              {onPlanCourse && (
                <TouchableOpacity
                  style={styles.gpsStartButton}
                  onPress={() => onPlanCourse(course.id, course.name, undefined, course.latitude, course.longitude)}
                >
                  <Ionicons name="clipboard-outline" size={20} color="#60A5FA" />
                  <Text style={[styles.gpsStartText, { color: '#60A5FA' }]}>Plan</Text>
                </TouchableOpacity>
              )}
              {onQuickStart && (
                <TouchableOpacity
                  style={[styles.quickStartButton, isLoadingQuickStart && styles.quickStartButtonDisabled]}
                  onPress={() => handleQuickStartPress(course, lastTeeName)}
                  disabled={isLoadingQuickStart}
                >
                  {isLoadingQuickStart ? (
                    <>
                      <ActivityIndicator size="small" color="#10B981" />
                      <Text style={styles.quickStartLoadingText}>
                        Loading {lastTeeName || 'Tee'}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="play-circle" size={20} color="#10B981" />
                      <Text style={styles.quickStartText}>Play</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              <Ionicons name="chevron-forward" size={24} color="#6B7280" />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  const showingSearchResults = searchQuery.trim().length >= 3 && (osmResults.length > 0 || !!error);
  const showingNearbyResults = !showingSearchResults && osmResults.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#E5E7EB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find Golf Course</Text>
        <View style={{ width: 40 }} />
      </View>
      {offlineSaveNotice && (
        <View style={styles.offlineNotice}>
          <Ionicons name="cloud-done-outline" size={16} color="#10B981" />
          <Text style={styles.offlineNoticeText}>{offlineSaveNotice}</Text>
        </View>
      )}

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="alert-circle" size={18} color="#F59E0B" />
          <Text style={styles.offlineBannerText}>
            Offline mode. Search and nearby courses are off.
          </Text>
        </View>
      )}

      {/* Search Bar & Find Nearby */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search course name"
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={(value) => {
              setSearchQuery(value);
              setSearchAllAvailable(false);
            }}
            onSubmitEditing={() => handleSearch(false)}
            autoCapitalize="words"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setError(null);
              setSearchAllAvailable(false);
            }}>
              <Ionicons name="close-circle" size={20} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.searchButton, (isSearching || isOffline) && styles.searchButtonDisabled]}
          onPress={() => handleSearch(false)}
          disabled={isSearching || isOffline || searchQuery.trim().length < 3}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      <GpsRoundSetupModal
        visible={gpsSetupVisible}
        loading={gpsSetupLoading}
        courseName={gpsSetupCourse?.courseName}
        courseLocation={gpsSetupLocation}
        teeOptions={gpsTeeOptions}
        courseVariants={gpsCourseVariants}
        selectedCourseVariantId={selectedGpsCourseId}
        onSelectCourseVariant={handleSelectGpsCourseVariant}
        routeOptions={gpsRouteOptions}
        selectedRouteId={selectedGpsRouteId}
        routeHoleNumbers={selectedGpsRoute?.holeNumbers || []}
        onSelectRoute={handleSelectGpsRoute}
        selectedTeeName={selectedGpsTee}
        onSelectTee={setSelectedGpsTee}
        startingHole={gpsStartingHole}
        holesWithData={gpsHolesWithData}
        roundLength={gpsRoundLength}
        onSelectRoundLength={setPersistedRoundLength}
        onSelectStartingHole={setGpsStartingHole}
        tournamentMode={gpsTournamentMode}
        onToggleTournamentMode={setGpsTournamentMode}
        reportPromptText={teeSetupReportPrompt}
        onPressReportPrompt={
          teeSetupReportPrompt
            ? () => openReport({
                category: missingYardageTees.length > 0 ? 'missing_tee_yardage' : 'missing_tee',
                source: 'tee_box_setup',
                courseId: selectedGpsCourseId || gpsSetupCourse?.courseId || undefined,
                courseName: gpsSetupCourse?.courseName,
                layoutName: selectedResolvedCourse?.name || selectedGpsRoute?.label || undefined,
                city: selectedResolvedCourse?.city || undefined,
                state: selectedResolvedCourse?.state || undefined,
                teeName: missingYardageTees[0]?.name || null,
                teeColor: missingYardageTees[0]?.color || null,
                teeOptions: gpsTeeOptions.map((tee) => ({
                  name: tee.name,
                  color: tee.color || null,
                })),
              })
            : null
        }
        onClose={handleCloseGpsSetup}
        onConfirm={handleConfirmGpsSetup}
        onPlanCourse={onPlanCourse ? () => {
          handleCloseGpsSetup();
          const cId = selectedGpsCourseId || gpsSetupCourse?.courseId;
          if (cId) onPlanCourse(cId, gpsSetupCourse?.courseName, selectedGpsTee || undefined, selectedResolvedCourse?.latitude, selectedResolvedCourse?.longitude);
        } : undefined}
      />

      <ReportModal
        visible={reportModalVisible}
        context={reportContext}
        onClose={() => {
          setReportModalVisible(false);
          setReportContext(null);
        }}
      />

      {/* Find Nearby Button */}
      <View style={styles.nearbyContainer}>
        <TouchableOpacity
          style={[styles.nearbyButton, (isFindingNearby || isOffline) && styles.nearbyButtonDisabled]}
          onPress={handleFindNearby}
          disabled={isFindingNearby || isOffline}
        >
        {isFindingNearby ? (
          <>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.nearbyButtonText}>Finding courses</Text>
          </>
        ) : (
            <>
              <Ionicons name="location" size={20} color="#10B981" />
              <Text style={styles.nearbyButtonText}>Find Nearby Courses</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {inProgressRound && (
        <View style={styles.resumeCard}>
          <View style={styles.resumeTextGroup}>
            <Text style={styles.resumeTitle}>Resume Round</Text>
            <Text style={styles.resumeCourse}>
              {formatCourseName(inProgressRound.courseName)} · Hole {(inProgressRound.currentHole ?? 0) + 1} of 18
            </Text>
          </View>
          <View style={styles.resumeActions}>
            <TouchableOpacity
              style={styles.resumeSecondary}
              onPress={() => onAbandonRound?.()}
            >
              <Text style={styles.resumeSecondaryText}>Start New</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resumePrimary}
              onPress={() => onResumeRound?.(inProgressRound)}
            >
              <Text style={styles.resumePrimaryText}>Resume Round</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Search hint */}
      {searchQuery.length > 0 && searchQuery.length < 3 && (
        <Text style={styles.hint}>Enter at least 3 characters to search</Text>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color="#EF4444" />
          <View style={{flex: 1}}>
            <Text style={styles.errorText}>{error}</Text>
            {error.includes('No courses found') && searchQuery.trim().length >= 3 ? (
              <TouchableOpacity
                style={styles.reportPromptButton}
                onPress={() => openReport({
                  category: 'missing_course',
                  source: 'course_search',
                  searchQuery: searchQuery.trim(),
                  courseName: searchQuery.trim(),
                })}
              >
                <Text style={styles.reportPromptButtonText}>Can not find your course? Report it.</Text>
              </TouchableOpacity>
            ) : null}
            {searchAllAvailable && (
              <TouchableOpacity style={styles.expandSearchButton} onPress={() => handleSearch(true)}>
                <Text style={styles.expandSearchButtonText}>Search All Results</Text>
              </TouchableOpacity>
            )}
            {error.includes('rate limit') && (
              <Text style={styles.errorHint}>
                Search by name while the quota resets.
              </Text>
            )}
            {error.includes('temporarily unavailable') && (
              <Text style={styles.errorHint}>
                OpenStreetMap is busy. Try again in a moment or use Recent or Favorites.
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Content */}
      <FlatList
        style={styles.list}
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={() => (
          <>
            {/* Search Results */}
            {osmResults.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name={showingSearchResults ? "search" : "location"} size={20} color="#10B981" />
                  <Text style={styles.sectionTitle}>
                    {showingSearchResults ? `Search Results (${osmResults.length})` : `Nearby Courses (${osmResults.length})`}
                  </Text>
                </View>
                {osmResults.map(course => renderOSMCourseItem(course))}
              </View>
            )}

            {/* Favorites */}
            {!showingSearchResults && !showingNearbyResults && favoriteCourses.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="star" size={20} color="#FBBF24" />
                  <Text style={styles.sectionTitle}>Favorites</Text>
                </View>
                {favoriteCourses.map(course => renderCourseItem(course, true))}
              </View>
            )}

            {/* Recent Courses */}
            {!showingSearchResults && !showingNearbyResults && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="time" size={20} color="#10B981" />
                  <Text style={styles.sectionTitle}>Recent Courses</Text>
                </View>
                {recentCourses.length > 0 ? (
                  recentCourses.map(course => renderRecentCourseItem(course))
                ) : (
                  <View style={styles.recentEmpty}>
                    <Text style={styles.recentEmptyTitle}>No recent rounds yet</Text>
                    <Text style={styles.recentEmptyText}>
                      Tap "Find Nearby Courses" to get started.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Can't Find Your Course? */}
            {onManualCourseEntry && (showingSearchResults || showingNearbyResults || error) && (
              <View style={styles.manualEntrySection}>
                <View style={styles.manualEntryDivider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>
                <TouchableOpacity 
                  style={styles.manualEntryButton}
                  onPress={onManualCourseEntry}
                >
                  <Ionicons name="create-outline" size={20} color="#3B82F6" />
                  <Text style={styles.manualEntryButtonText}>Can't find your course?</Text>
                  <Text style={styles.manualEntryButtonSubtext}>Add it manually</Text>
                </TouchableOpacity>
              </View>
            )}
            
          </>
        )}
      />

      {/* Loading Overlay for Course Details */}
      {isLoadingCourse && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading course details</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1419',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#1a2028',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3038',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#FCD34D',
    lineHeight: 18,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2028',
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: '#E5E7EB',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 20,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: '#374151',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nearbyContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  resumeCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  resumeTextGroup: {
    marginBottom: 12,
  },
  resumeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  resumeCourse: {
    fontSize: 15,
    color: '#E5E7EB',
  },
  resumeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  resumeSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  resumeSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  resumePrimary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#10B981',
  },
  resumePrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f1419',
  },
  nearbyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a2028',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#10B981',
    paddingVertical: 12,
  },
  nearbyButtonDisabled: {
    opacity: 0.6,
  },
  nearbyButtonText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#6B7280',
    marginTop: -8,
    marginBottom: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
  },
  errorHint: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
  },
  reportPromptButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  reportPromptButtonText: {
    color: '#64748B',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  list: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
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
    color: '#10B981',
    marginBottom: 12,
  },
  recentEmpty: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 14,
  },
  recentEmptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 6,
  },
  recentEmptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  courseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1a2028',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  offlineNotice: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(16,185,129,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineNoticeText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  courseThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseThumbnailText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  courseBody: {
    flex: 1,
    flexDirection: 'column',
    minWidth: 0,
  },
  courseInfo: {
    flex: 0,
    minWidth: 0,
  },
  courseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  courseActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  courseActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexWrap: 'nowrap',
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'nowrap',
  },
  courseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    flexShrink: 1,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  quickStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  gpsStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  gpsStartText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  quickStartButtonDisabled: {
    opacity: 0.7,
  },
  expandSearchButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  expandSearchButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  quickStartText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  quickStartLoadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  favoriteButton: {
    padding: 6,
  },
  osmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  osmBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  osmNote: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  courseDetailSubtle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  courseLocation: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  courseDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  lastPlayedText: {
    fontSize: 12,
    color: '#10B981',
  },
  courseDetail: {
    fontSize: 13,
    color: '#6B7280',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Manual Entry Fallback
  manualEntrySection: {
    marginTop: 24,
    marginBottom: 24,
  },
  manualEntryDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#374151',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    paddingHorizontal: 16,
  },
  manualEntryButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  manualEntryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  manualEntryButtonSubtext: {
    fontSize: 13,
    color: '#93C5FD',
  },
  manualEntryButtonEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  manualEntryButtonEmptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingBox: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
  },
});
