import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import { searchCourses, searchCoursesByLocation } from '../../../services/golfCourseApiService';
import { searchGolfCoursesNearby } from '../../../services/openStreetMapService';
import { logger } from '../../../utils/logger';
import { FEEDBACK_COPY } from '../../../constants/feedbackCopy';
import type { CourseSeed, LockedFields } from '../types';
import type { GolfCourse } from '../../../services/golfCourseApiService';

interface UseCourseMatchingParams {
  courseSeed?: CourseSeed;
  courseName: string;
  courseSearchQuery: string;
  showCourseSuggestions: boolean;
  city: string;
  state: string;
  country: string;
  lockedFields: LockedFields;
  setCity: React.Dispatch<React.SetStateAction<string>>;
  setState: React.Dispatch<React.SetStateAction<string>>;
  setCountry: React.Dispatch<React.SetStateAction<string>>;
  setCourseSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setCourseSearchResults: React.Dispatch<React.SetStateAction<GolfCourse[]>>;
  setCourseSearchLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCourseSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useCourseMatching(params: UseCourseMatchingParams) {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    params.courseSeed?.latitude && params.courseSeed?.longitude
      ? { latitude: params.courseSeed.latitude, longitude: params.courseSeed.longitude }
      : null
  );
  const [locationLookupDone, setLocationLookupDone] = useState(false);

  useEffect(() => {
    if (locationLookupDone) return;
    let isMounted = true;

    const loadLocation = async () => {
      try {
        if (Platform.OS === 'web') {
          setLocationLookupDone(true);
          return;
        }
        if (userLocation) {
          setLocationLookupDone(true);
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationLookupDone(true);
          return;
        }
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!isMounted) return;
        const coords = { latitude: current.coords.latitude, longitude: current.coords.longitude };
        setUserLocation(coords);

        if (!params.lockedFields.city || !params.lockedFields.state || !params.lockedFields.country) {
          const [geocode] = await Location.reverseGeocodeAsync(coords);
          if (!isMounted || !geocode) return;
          if (!params.lockedFields.city && !params.city && geocode.city) {
            params.setCity(geocode.city);
          }
          if (!params.lockedFields.state && !params.state && (geocode.region || geocode.subregion)) {
            params.setState(geocode.region || geocode.subregion || '');
          }
          if (!params.lockedFields.country && !params.country && geocode.country) {
            params.setCountry(geocode.country);
          }
        }
      } catch (error) {
        logger.warn('Location lookup failed:', error);
      } finally {
        if (isMounted) setLocationLookupDone(true);
      }
    };

    loadLocation();
    return () => {
      isMounted = false;
    };
  }, [
    locationLookupDone,
    userLocation,
    params.lockedFields.city,
    params.lockedFields.state,
    params.lockedFields.country,
    params.city,
    params.state,
    params.country,
    params.setCity,
    params.setState,
    params.setCountry,
  ]);

  useEffect(() => {
    let isMounted = true;
    const trimmed = params.courseSearchQuery.trim();
    if (trimmed.length < 2) {
      params.setCourseSearchResults([]);
      return;
    }
    params.setCourseSearchLoading(true);
    searchCourses(trimmed)
      .then(results => {
        if (!isMounted) return;
        params.setCourseSearchResults(results.slice(0, 6));
        params.setShowCourseSuggestions(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) params.setCourseSearchLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [
    params.courseSearchQuery,
    params.setCourseSearchLoading,
    params.setCourseSearchResults,
    params.setShowCourseSuggestions,
  ]);

  useEffect(() => {
    if (params.courseName && params.courseName !== params.courseSearchQuery && !params.showCourseSuggestions) {
      params.setCourseSearchQuery(params.courseName);
    }
  }, [params.courseName, params.courseSearchQuery, params.showCourseSuggestions, params.setCourseSearchQuery]);

  const handleFindNearbyCourses = useCallback(async () => {
    params.setCourseSearchLoading(true);
    try {
      let latitude = userLocation?.latitude;
      let longitude = userLocation?.longitude;

      if (!latitude || !longitude) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(FEEDBACK_COPY.alerts.locationNeededTitle, FEEDBACK_COPY.alerts.locationEnableBody);
          return;
        }
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = location.coords.latitude;
        longitude = location.coords.longitude;
        setUserLocation({ latitude, longitude });
      }

      if (latitude && longitude) {
        try {
          const osmCourses = await searchGolfCoursesNearby(latitude, longitude, 25);
          const mapped = osmCourses.map(course => ({
            id: `osm-${course.id}`,
            name: course.name,
            city: course.city || '',
            state: course.state || '',
            country: course.country || 'US',
            holes: 18,
            par: 72,
            latitude: course.latitude,
            longitude: course.longitude,
            distance: course.distance,
          } as GolfCourse));
          if (mapped.length > 0) {
            params.setCourseSearchResults(mapped.slice(0, 6));
            params.setShowCourseSuggestions(true);
            return;
          }
        } catch (error) {
          logger.warn('OSM nearby lookup failed:', error);
        }
      }

      const queryCity = params.city || params.courseSeed?.city;
      const queryState = params.state || params.courseSeed?.state;
      if (!queryCity || !queryState) {
        Alert.alert(FEEDBACK_COPY.alerts.locationNeededTitle, FEEDBACK_COPY.alerts.locationEnterCityStateBody);
        return;
      }
      const results = await searchCoursesByLocation(latitude || 0, longitude || 0, queryCity, queryState);
      params.setCourseSearchResults(results.slice(0, 6));
      params.setShowCourseSuggestions(true);
    } finally {
      params.setCourseSearchLoading(false);
    }
  }, [
    params,
    userLocation?.latitude,
    userLocation?.longitude,
  ]);

  return {
    handleFindNearbyCourses,
  };
}

