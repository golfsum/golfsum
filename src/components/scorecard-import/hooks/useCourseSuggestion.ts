import { useCallback } from 'react';
import { getCourseDetails, type CourseDetails, type GolfCourse, type TeeBox } from '../../../services/golfCourseApiService';
import { logger } from '../../../utils/logger';
import type { EditableTeeBox, LockedFields } from '../types';
import { buildLockedTeeFields } from '../utils';

interface UseCourseSuggestionParams {
  lockedFields: LockedFields;
  lockScalarField: (field: keyof LockedFields) => void;
  setCourseName: React.Dispatch<React.SetStateAction<string>>;
  setCity: React.Dispatch<React.SetStateAction<string>>;
  setState: React.Dispatch<React.SetStateAction<string>>;
  setCountry: React.Dispatch<React.SetStateAction<string>>;
  setCourseSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setShowCourseSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setCourseSearchLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setTeeBoxes: React.Dispatch<React.SetStateAction<EditableTeeBox[]>>;
}

const normalizeTeeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\btees?\b/g, '')
    .replace(/\(women\)/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();

const buildCourseYardages = (tee: TeeBox): number[] =>
  (tee.holes || []).map(hole => hole.yardage);

const computeYardageMatch = (ocrYardages: string[], courseYardages: number[]) => {
  let matches = 0;
  let compared = 0;
  for (let i = 0; i < Math.min(ocrYardages.length, courseYardages.length); i += 1) {
    const ocrValue = parseInt(ocrYardages[i] || '', 10);
    const courseValue = courseYardages[i];
    if (Number.isNaN(ocrValue) || !courseValue) continue;
    compared += 1;
    if (Math.abs(ocrValue - courseValue) <= 12) {
      matches += 1;
    }
  }
  return { matches, compared };
};

const findBestCourseTeeMatch = (
  tee: EditableTeeBox,
  courseTees: TeeBox[]
): { tee: TeeBox; score: number } | null => {
  const normalized = normalizeTeeName(tee.name || '');
  let best: { tee: TeeBox; score: number } | null = null;

  courseTees.forEach(candidate => {
    const candidateName = normalizeTeeName(candidate.name || '');
    if (!candidateName) return;
    let score = 0;
    if (normalized && (candidateName.includes(normalized) || normalized.includes(candidateName))) {
      score += 10;
    }
    const yardages = buildCourseYardages(candidate);
    const match = computeYardageMatch(tee.yardages, yardages);
    if (match.compared >= 6) {
      score += match.matches;
    }
    if (!best || score > best.score) {
      best = { tee: candidate, score };
    }
  });

  return best;
};

export function useCourseSuggestion(params: UseCourseSuggestionParams) {
  const applyCourseSuggestion = useCallback(async (course: GolfCourse) => {
    params.lockScalarField('courseName');
    params.lockScalarField('city');
    params.lockScalarField('state');
    params.lockScalarField('country');
    params.setCourseName(course.name || '');
    params.setCity(course.city || '');
    params.setState(course.state || '');
    params.setCountry(course.country || 'US');
    params.setCourseSearchQuery(course.name || '');
    params.setShowCourseSuggestions(false);
    params.setCourseSearchLoading(true);
    try {
      const courseId = course.id || (course as { course_id?: string }).course_id;
      if (!courseId) return;
      if (typeof courseId === 'string' && courseId.startsWith('osm_')) {
        logger.warn('Course detail lookup skipped for OSM result', { courseId });
        return;
      }
      let details: CourseDetails | null = null;
      try {
        details = await getCourseDetails(courseId);
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
          logger.warn('Course details not found for selected course', { courseId });
          return;
        }
        throw error;
      }
      if (!details) return;

      if (details.name) {
        params.setCourseName(details.name);
        params.setCourseSearchQuery(details.name);
      }
      if (details.city) params.setCity(details.city);
      if (details.state) params.setState(details.state);
      if (details.country) params.setCountry(details.country);

      params.setTeeBoxes(prev => {
        return prev.map(tee => {
          const hasTeeBoxes = !!details?.teeBoxes?.length;
          const match = hasTeeBoxes ? findBestCourseTeeMatch(tee, details.teeBoxes || []) : null;
          if (!match || match.score < 6) {
            const teeLocks = params.lockedFields.tees[tee.id] || buildLockedTeeFields();
            if (!teeLocks.ratingMen || !teeLocks.slopeMen) {
              const next = { ...tee };
              if (!teeLocks.ratingMen && !next.ratingMen && details?.rating) {
                next.ratingMen = details.rating.toFixed(1);
              }
              if (!teeLocks.slopeMen && !next.slopeMen && details?.slope) {
                next.slopeMen = details.slope.toString();
              }
              if (next.ratingMen !== tee.ratingMen || next.slopeMen !== tee.slopeMen) {
                return next;
              }
            }
            return tee;
          }
          const matchedTee = match.tee;
          const teeLocks = params.lockedFields.tees[tee.id] || buildLockedTeeFields();

          const next = { ...tee };

          if (!teeLocks.name && matchedTee.name) {
            next.name = matchedTee.name;
          }

          const ratingMenMissing = !next.ratingMen;
          const slopeMenMissing = !next.slopeMen;
          if (!teeLocks.ratingMen && ratingMenMissing && matchedTee.rating) {
            next.ratingMen = matchedTee.rating.toFixed(1);
          }
          if (!teeLocks.slopeMen && slopeMenMissing && matchedTee.slope) {
            next.slopeMen = matchedTee.slope.toString();
          }
          if (!teeLocks.ratingWomen && !next.ratingWomen && matchedTee.ratingWomen) {
            next.ratingWomen = matchedTee.ratingWomen.toFixed(1);
          }
          if (!teeLocks.slopeWomen && !next.slopeWomen && matchedTee.slopeWomen) {
            next.slopeWomen = matchedTee.slopeWomen.toString();
          }

          if (!teeLocks.ratingMen && !next.ratingMen && details?.rating) {
            next.ratingMen = details.rating.toFixed(1);
          }
          if (!teeLocks.slopeMen && !next.slopeMen && details?.slope) {
            next.slopeMen = details.slope.toString();
          }

          const courseYardages = buildCourseYardages(matchedTee);
          const matchStats = computeYardageMatch(next.yardages, courseYardages);
          const shouldUpdateYardages = matchStats.compared >= 6 && matchStats.matches >= 6;
          if (shouldUpdateYardages) {
            next.yardages = next.yardages.map((current, index) => {
              if (teeLocks.yardages[index]) return current;
              const courseValue = courseYardages[index];
              return courseValue ? courseValue.toString() : current;
            });
          }

          return next;
        });
      });
    } catch (error) {
      logger.warn('Course tee sync failed:', error);
    } finally {
      params.setCourseSearchLoading(false);
    }
  }, [params]);

  return { applyCourseSuggestion };
}

