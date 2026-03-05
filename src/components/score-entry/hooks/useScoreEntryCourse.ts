import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import {
  addToFavorites,
  getCourseDetails,
  isFavorite as isCourseFavorite,
  removeFromFavorites,
  type CourseDetails,
  type TeeBox,
} from '../../../services/golfCourseApiService';
import { getElevationFeet } from '../../../services/weatherService';
import Storage from '../../../services/storage';
import { logger } from '../../../utils/logger';

interface UseScoreEntryCourseOptions {
  courseId: string;
  courseOverride?: CourseDetails;
  onBack: () => void;
  onDefaultTeeBox?: (teeBox: TeeBox) => void;
  onShowTeeSelection?: (visible: boolean) => void;
}

interface UseScoreEntryCourseResult {
  course: CourseDetails | null;
  isLoading: boolean;
  isFavorite: boolean;
  courseElevationFt: number | null;
  setCourseElevationFt: (value: number | null) => void;
  reloadCourse: () => Promise<void>;
  toggleFavorite: () => Promise<void>;
}

export const useScoreEntryCourse = ({
  courseId,
  courseOverride,
  onBack,
  onDefaultTeeBox,
  onShowTeeSelection,
}: UseScoreEntryCourseOptions): UseScoreEntryCourseResult => {
  const [course, setCourse] = useState<CourseDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [courseElevationFt, setCourseElevationFt] = useState<number | null>(null);

  const loadCourseData = async () => {
    try {
      setIsLoading(true);
      const courseData = await getCourseDetails(courseId);

      if (!courseData.teeBoxes || courseData.teeBoxes.length === 0) {
        throw new Error('Course has no tee box data');
      }

      setCourse(courseData);
      try {
        const savedDefault = await Storage.getItem(`@GolfSum:defaultTee:${courseData.id}`);
        if (savedDefault) {
          const { teeName } = JSON.parse(savedDefault) as { teeName?: string };
          if (teeName) {
            const defaultTee = courseData.teeBoxes.find(tee => tee.name === teeName);
            if (defaultTee) {
              onDefaultTeeBox?.(defaultTee);
            }
          }
        }
      } catch (error) {
        logger.warn('Failed to load default tee box:', error);
      }

      // Note: getCourseDetails now automatically saves to Firebase community catalog

      if (courseData.latitude !== undefined && courseData.longitude !== undefined) {
        const elevationFt = await getElevationFeet(courseData.latitude, courseData.longitude);
        if (elevationFt !== null) {
          setCourseElevationFt(elevationFt);
        }
      }

      const favStatus = await isCourseFavorite(courseId);
      setIsFavorite(favStatus);

      onShowTeeSelection?.(true);
    } catch (error) {
      logger.error('Error loading course:', error);
      Alert.alert('Error', 'Failed to load course data. Please try again.');
      onBack();
    } finally {
      setIsLoading(false);
    }
  };

  const reloadCourse = async () => {
    await loadCourseData();
  };

  const toggleFavorite = async () => {
    if (!course) return;

    try {
      if (isFavorite) {
        await removeFromFavorites(courseId);
        setIsFavorite(false);
      } else {
        await addToFavorites({
          id: course.id,
          name: course.name,
          city: course.city,
          state: course.state,
          country: course.country,
          holes: course.holes,
          par: course.par,
          rating: course.rating,
          slope: course.slope,
          yardage: course.yardage,
        });
        setIsFavorite(true);
      }
    } catch (error) {
      logger.error('Error toggling favorite:', error);
    }
  };

  useEffect(() => {
    if (courseOverride) {
      setCourse(courseOverride);
      onShowTeeSelection?.(true);
      setIsLoading(false);
      if (courseOverride.latitude !== undefined && courseOverride.longitude !== undefined) {
        getElevationFeet(courseOverride.latitude, courseOverride.longitude)
          .then(elevationFt => {
            if (elevationFt !== null) {
              setCourseElevationFt(elevationFt);
            }
          })
          .catch(() => undefined);
      }
    } else {
      loadCourseData();
    }
  }, [courseId, courseOverride]);

  return {
    course,
    isLoading,
    isFavorite,
    courseElevationFt,
    setCourseElevationFt,
    reloadCourse,
    toggleFavorite,
  };
};
