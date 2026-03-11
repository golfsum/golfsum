import React, { useState, useEffect } from 'react';
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
import { formatCourseName } from '../utils/courseName';
import * as Location from 'expo-location';
import {
  searchCourses,
  searchCoursesWithFallback,
  searchCoursesByLocation,
  calculateDistance,
  getRecentCourses,
  getFavoriteCourses,
  addToFavorites,
  removeFromFavorites,
  getCourseDetails,
  GolfCourse,
  CourseDetails,
} from '../services/golfCourseApiService';
import { getRounds } from '../services/roundsService';
import {
  searchGolfCoursesNearby,
  searchGolfCoursesByName,
  OSMGolfCourse,
} from '../services/openStreetMapService';
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

const PROFILE_STORAGE_KEY = '@GolfSum:UserProfile';

interface CourseSearchScreenProps {
  onCourseSelected: (courseId: string) => void;
  onGpsRoundStart?: (
    courseId: string,
    courseName?: string,
    settings?: { teeName?: string; startingHole?: number; tournamentMode?: boolean }
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
  const [searchResults, setSearchResults] = useState<GolfCourse[]>([]);
  const [nearbyCourses, setNearbyCourses] = useState<GolfCourse[]>([]);
  const [osmResults, setOsmResults] = useState<OSMGolfCourse[]>([]); // OSM discovery results
  const [recentCourses, setRecentCourses] = useState<GolfCourse[]>([]);
  const [favoriteCourses, setFavoriteCourses] = useState<GolfCourse[]>([]);
  const [rounds, setRounds] = useState<SavedRound[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFindingNearby, setIsFindingNearby] = useState(false);
  const [isLoadingCourse, setIsLoadingCourse] = useState(false); // Loading course details
  const [loadingQuickStartId, setLoadingQuickStartId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [offlineSaveNotice, setOfflineSaveNotice] = useState<string | null>(null);
  const [homeCourseName, setHomeCourseName] = useState<string>('');
  const [gpsSetupVisible, setGpsSetupVisible] = useState(false);
  const [gpsSetupLoading, setGpsSetupLoading] = useState(false);
  const [gpsSetupCourse, setGpsSetupCourse] = useState<{ courseId: string; courseName?: string } | null>(null);
  const [gpsTeeOptions, setGpsTeeOptions] = useState<Array<{ name: string; color?: string; totalYards: number }>>([]);
  const [selectedGpsTee, setSelectedGpsTee] = useState('');
  const [gpsStartingHole, setGpsStartingHole] = useState(1);
  const [gpsHoleCount, setGpsHoleCount] = useState(18);
  const [gpsTournamentMode, setGpsTournamentMode] = useState(false);

  useEffect(() => {
    loadRecentAndFavorites();
    loadHomeCourse();
  }, []);

  useEffect(() => {
    if (!offlineSaveNotice) return;
    const t = setTimeout(() => setOfflineSaveNotice(null), 2200);
    return () => clearTimeout(t);
  }, [offlineSaveNotice]);

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
          text: FEEDBACK_COPY.actions.continue,
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

  const proceedWithCourseSelection = async (courseId: string) => {
    const courseDetails = await getCourseDetails(courseId);
    if (onCommunityCourseSelected) {
      onCommunityCourseSelected(courseDetails);
    } else {
      onCourseSelected(courseDetails.id);
    }
  };

  const handleApiCoursePress = (courseId: string) => {
    handleStartNewSelection(async () => {
      setIsLoadingCourse(true);
      setError(null);
      try {
        await proceedWithCourseSelection(courseId);
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
                  onUploadScorecard();
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
    });
  };

  const handleGpsRoundPress = (course: GolfCourse) => {
    if (!onGpsRoundStart) return;
    handleStartNewSelection(async () => {
      setGpsSetupVisible(true);
      setGpsSetupLoading(true);
      setGpsSetupCourse({ courseId: course.id, courseName: course.name });
      setGpsStartingHole(1);
      setGpsTournamentMode(false);
      setGpsTeeOptions([]);
      setSelectedGpsTee('');

      try {
        const setup = await loadGpsRoundSetup(course.id);
        const defaultTee = setup.teeOptions[0]?.name || 'Blue';
        setGpsTeeOptions(setup.teeOptions);
        setSelectedGpsTee(defaultTee);
        setGpsHoleCount(setup.holeCount || 18);
      } catch (err) {
        setGpsSetupVisible(false);
        logger.error('Error loading GPS round setup:', err);
        Alert.alert('GPS Setup', err instanceof Error ? err.message : 'Unable to load tee box data.');
      } finally {
        setGpsSetupLoading(false);
      }
    });
  };

  const getMockGpsRoute = (courseName?: string) => {
    const normalized = (courseName || '').trim().toLowerCase();
    if (normalized.includes('pebble beach')) {
      return {
        courseId: '141520658891108829',
        courseName: 'Pebble Beach Golf Links',
      };
    }
    return null;
  };

  const handleOsmGpsRoundPress = (course: OSMGolfCourse) => {
    if (!onGpsRoundStart) return;
    const mockRoute = getMockGpsRoute(course.name);
    if (!mockRoute) {
      Alert.alert('GPS Preview', 'GPS preview is only mocked for Pebble Beach right now.');
      return;
    }
    handleStartNewSelection(async () => {
      setGpsSetupVisible(true);
      setGpsSetupLoading(true);
      setGpsSetupCourse({ courseId: mockRoute.courseId, courseName: mockRoute.courseName });
      setGpsStartingHole(1);
      setGpsTournamentMode(false);
      setGpsTeeOptions([]);
      setSelectedGpsTee('');

      try {
        const setup = await loadGpsRoundSetup(mockRoute.courseId);
        const defaultTee = setup.teeOptions[0]?.name || 'Blue';
        setGpsTeeOptions(setup.teeOptions);
        setSelectedGpsTee(defaultTee);
        setGpsHoleCount(setup.holeCount || 18);
      } catch (err) {
        setGpsSetupVisible(false);
        logger.error('Error loading GPS preview setup:', err);
        Alert.alert('GPS Setup', err instanceof Error ? err.message : 'Unable to load tee box data.');
      } finally {
        setGpsSetupLoading(false);
      }
    });
  };

  const handleCloseGpsSetup = () => {
    setGpsSetupVisible(false);
    setGpsSetupLoading(false);
    setGpsSetupCourse(null);
    setGpsTeeOptions([]);
    setSelectedGpsTee('');
    setGpsStartingHole(1);
    setGpsHoleCount(18);
    setGpsTournamentMode(false);
  };

  const handleConfirmGpsSetup = () => {
    if (!gpsSetupCourse || !onGpsRoundStart) return;
    onGpsRoundStart(gpsSetupCourse.courseId, gpsSetupCourse.courseName, {
      teeName: selectedGpsTee || undefined,
      startingHole: gpsStartingHole,
      tournamentMode: gpsTournamentMode,
    });
    handleCloseGpsSetup();
  };

  const handleQuickStartPress = (course: GolfCourse, lastTeeName?: string) => {
    if (!onQuickStart) return;
    handleStartNewSelection(async () => {
      setLoadingQuickStartId(course.id);
      try {
        try {
          await getCourseDetails(course.id);
          setOfflineSaveNotice(`Saved "${course.name}" for offline use`);
        } catch (prefetchError) {
          logger.warn('Quick Start prefetch failed:', prefetchError);
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

  const handleSearch = async () => {
    if (isOffline) {
      Alert.alert(FEEDBACK_COPY.alerts.offlineModeTitle, FEEDBACK_COPY.alerts.offlineCourseSearchBody);
      return;
    }
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);
    setNearbyCourses([]); // Clear nearby results when searching
    setOsmResults([]); // Clear OSM results

    try {
      logger.debug(`🔍 Searching OSM for: "${searchQuery}"`);
      
      // Try OpenStreetMap first (free, no rate limits)
      try {
        const osmCourses = await searchGolfCoursesByName(
          searchQuery,
          userLocation?.latitude,
          userLocation?.longitude
        );
        
        logger.debug(`✅ Found ${osmCourses.length} courses from OSM`);
        
        if (osmCourses.length === 0) {
          logger.debug('⚠️ No OSM results, falling back to GolfCourseAPI...');
          // Fallback to GolfCourseAPI
          const apiResults = await searchCourses(searchQuery);
          if (apiResults.length > 0) {
            setSearchResults(apiResults);
            logger.debug(`✅ Found ${apiResults.length} courses from GolfCourseAPI`);
          } else {
            setError('No courses found. Try a different search term or browse nearby courses.');
          }
        } else {
          setOsmResults(osmCourses);
        }
      } catch (osmError) {
        logger.error('OSM search failed:', osmError);
        logger.debug('⚠️ OSM unavailable, falling back to GolfCourseAPI...');
        
        // Show brief message that we're trying alternative method
        setError('Searching using alternative method...');
        
        // Fallback to GolfCourseAPI
        const apiResults = await searchCourses(searchQuery);
        if (apiResults.length > 0) {
          setSearchResults(apiResults);
          setError(null); // Clear error message
          logger.debug(`✅ Found ${apiResults.length} courses from GolfCourseAPI (fallback)`);
        } else {
          throw new Error('No courses found. Try a different search term.');
        }
      }
    } catch (err) {
      logger.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setOsmResults([]);
      setSearchResults([]);
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
    setSearchResults([]); // Clear search results
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
                    'Please click the location icon (🔒) in your browser\'s address bar and allow location access for this site.';
                  break;
                case error.POSITION_UNAVAILABLE:
                  errorMessage = 'Location information is unavailable. Please check your device location settings.';
                  break;
                case error.TIMEOUT:
                  errorMessage = 'Location request timed out. Please try again.';
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
          setError('Location permission denied. Please enable location services in settings.');
          Alert.alert(
            'Location Permission Required',
            'Please enable location services in your device settings to find nearby courses.',
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

      // Try OpenStreetMap first (free, no rate limits)
      logger.debug('🔍 Searching OSM for nearby golf courses within 25 miles...');
      
      try {
        const osmCourses = await searchGolfCoursesNearby(latitude, longitude, 25);
        
        logger.debug(`✅ Found ${osmCourses.length} courses from OSM`);
        
        if (osmCourses.length === 0) {
          setError('No courses found nearby. Try searching by name.');
          Alert.alert(
            'No Courses Found',
            'We couldn\'t find any golf courses within 25 miles.\n\nTry:\n• Search by name (e.g., "Tucson")\n• Expand your search area',
            [{ text: 'OK' }]
          );
        } else {
          setOsmResults(osmCourses);
          logger.debug(`✅ Showing ${osmCourses.length} nearby courses from OSM`);
        }
      } catch (osmError) {
        logger.error('OSM nearby search failed:', osmError);
        logger.debug('⚠️ OSM unavailable, falling back to search by location name');
        
        // Show brief message that we're trying alternative method
        setError('Finding nearby courses using alternative method...');
        
        // Fallback: Get location name and search GolfCourseAPI
        try {
          const [geocode] = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (geocode) {
            const city = geocode.city || geocode.subregion || '';
            const state = geocode.region || '';
            
            if (city && state) {
              logger.debug(`🔍 Searching GolfCourseAPI for: ${city}, ${state}`);
              const apiResults = await searchCoursesByLocation(latitude, longitude, city, state);
              
              if (apiResults.length > 0) {
                setNearbyCourses(apiResults);
                setError(null); // Clear error message
                logger.debug(`✅ Found ${apiResults.length} courses from GolfCourseAPI (fallback)`);
              } else {
                setError('No courses found nearby. Try searching by name.');
              }
            } else {
              throw new Error('Unable to determine location');
            }
          } else {
            throw new Error('Unable to geocode location');
          }
        } catch (fallbackError) {
          logger.error('Fallback search also failed:', fallbackError);
          setError('Unable to find nearby courses. Please try searching by name instead.');
        }
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
          errorMessage + '\n\nPlease try searching by name instead.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsFindingNearby(false);
    }
  };

  /**
   * Handle clicking an OSM course - query GolfCourseAPI for full details
   * Uses smart search with name simplification to match OSM names to API names
   */
  const handleOSMCourseClick = async (osmCourse: OSMGolfCourse) => {
    setIsLoadingCourse(true);
    setError(null);

    try {
      logger.debug(`🔍 Fetching details for: "${osmCourse.name}" from GolfCourseAPI...`);
      
      // Smart search: tries multiple name variants (full name, stripped suffixes, etc.)
      const apiResults = await searchCoursesWithFallback(
        osmCourse.name,
        osmCourse.latitude,
        osmCourse.longitude
      );
      
      if (apiResults.length > 0) {
        // Found matching course in API
        const bestMatch = apiResults[0]; // Take the closest/best match
        logger.debug(`✅ Found course in API: "${bestMatch.name}" (id: ${bestMatch.id})`);
        
        // Fetch full details, save to catalog/cache, then navigate
        await proceedWithCourseSelection(bestMatch.id);
      } else {
        // Not found in API - show manual entry option
      logger.debug(`⚠️ Course "${osmCourse.name}" not found in GolfCourseAPI after trying all variants`);
        
        Alert.alert(
          FEEDBACK_COPY.alerts.courseNotInDatabaseTitle,
          `"${osmCourse.name}" was found on OpenStreetMap but doesn't have detailed tee box data.\n\nUpload a scorecard to capture tee boxes, yardages, rating, slope, and par.`,
          [
            { text: FEEDBACK_COPY.actions.cancel, style: 'cancel' },
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
      onPress={() => handleStartNewSelection(() => handleOSMCourseClick(course))}
    >
      <View style={styles.courseBody}>
      <View style={styles.courseInfo}>
        <View style={styles.courseHeader}>
          <Text style={styles.courseName}>{formatCourseName(course.name)}</Text>
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
      {onGpsRoundStart && getMockGpsRoute(course.name) && (
        <TouchableOpacity
          style={styles.gpsStartButton}
          onPress={() => handleOsmGpsRoundPress(course)}
        >
          <Ionicons name="navigate-circle" size={20} color="#10B981" />
          <Text style={styles.gpsStartText}>GPS</Text>
        </TouchableOpacity>
      )}
      <Ionicons name="chevron-forward" size={24} color="#6B7280" />
      </View>
    </TouchableOpacity>
  );

  const renderCourseItem = (course: GolfCourse, isFavorite: boolean = false) => {
    const isFavoriteBadge = isFavorite || isCourseFavorite(course.id);
    const isHomeBadge = isHomeCourse(course.name);

    return (
    <TouchableOpacity
      key={course.id}
      style={styles.courseItem}
      onPress={() => handleApiCoursePress(course.id)}
    >
      <View style={[styles.courseThumbnail, { backgroundColor: getCourseColor(course.name) }]}>
        <Text style={styles.courseThumbnailText}>{getCourseInitials(course.name)}</Text>
      </View>
      <View style={styles.courseBody}>
        <View style={styles.courseInfo}>
          <View style={styles.courseHeader}>
            <Text style={styles.courseName}>{formatCourseName(course.name)}</Text>
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
        onPress={() => handleApiCoursePress(course.id)}
      >
        <View style={[styles.courseThumbnail, { backgroundColor: getCourseColor(course.name) }]}>
          <Text style={styles.courseThumbnailText}>{getCourseInitials(course.name)}</Text>
        </View>
        <View style={styles.courseBody}>
          <View style={styles.courseInfo}>
            <View style={styles.courseHeader}>
              <Text style={styles.courseName}>{formatCourseName(course.name)}</Text>
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
          {onGpsRoundStart && (
            <TouchableOpacity
              style={styles.gpsStartButton}
              onPress={() => handleGpsRoundPress(course)}
            >
              <Ionicons name="navigate-circle" size={20} color="#10B981" />
              <Text style={styles.gpsStartText}>GPS</Text>
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
                    Loading {lastTeeName || 'Tee'}...
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
      </TouchableOpacity>
    );
  };
  const showingSearchResults = searchQuery.trim().length >= 3 && (searchResults.length > 0 || osmResults.length > 0 || error);
  const showingNearbyResults = nearbyCourses.length > 0 || osmResults.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
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
            Offline mode: search and nearby courses are disabled.
          </Text>
        </View>
      )}

      {/* Search Bar & Find Nearby */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search course name..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            autoCapitalize="words"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setSearchResults([]);
              setError(null);
            }}>
              <Ionicons name="close-circle" size={20} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.searchButton, (isSearching || isOffline) && styles.searchButtonDisabled]}
          onPress={handleSearch}
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
        teeOptions={gpsTeeOptions}
        selectedTeeName={selectedGpsTee}
        onSelectTee={setSelectedGpsTee}
        startingHole={gpsStartingHole}
        maxStartingHole={gpsHoleCount}
        onSelectStartingHole={setGpsStartingHole}
        tournamentMode={gpsTournamentMode}
        onToggleTournamentMode={setGpsTournamentMode}
        onClose={handleCloseGpsSetup}
        onConfirm={handleConfirmGpsSetup}
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
              <Text style={styles.nearbyButtonText}>Finding courses...</Text>
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
              <Text style={styles.resumePrimaryText}>Continue</Text>
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
            {error.includes('rate limit') && (
              <Text style={styles.errorHint}>
                💡 Use search by name while waiting for quota reset
              </Text>
            )}
            {error.includes('temporarily unavailable') && (
              <Text style={styles.errorHint}>
                💡 OpenStreetMap servers are busy. Try again in a moment or use Recent/Favorites.
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
            {/* Search Results (GolfCourseAPI fallback) */}
            {showingSearchResults && searchResults.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Search Results ({searchResults.length})</Text>
                {searchResults.map(course => renderCourseItem(course))}
              </View>
            )}

            {/* Search Results (Primary - from search or nearby) */}
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

            {/* Nearby Courses (GolfCourseAPI fallback) */}
            {nearbyCourses.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="location" size={20} color="#10B981" />
                  <Text style={styles.sectionTitle}>Nearby Courses ({nearbyCourses.length})</Text>
                </View>
                {nearbyCourses.map(course => renderCourseItem(course))}
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
                      Tap "Find Nearby Courses" above to get started.
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
            <Text style={styles.loadingText}>Loading course details...</Text>
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
    paddingVertical: 12,
    backgroundColor: '#1a2028',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3038',
  },
  backButton: {
    padding: 4,
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
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  courseInfo: {
    flex: 1,
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  courseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  gpsStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 8,
  },
  gpsStartText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  quickStartButtonDisabled: {
    opacity: 0.7,
  },
  quickStartText: {
    fontSize: 13,
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
    marginRight: 4,
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
