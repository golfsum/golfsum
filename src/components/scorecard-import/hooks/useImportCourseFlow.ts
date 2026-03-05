import { useCourseMatching } from './useCourseMatching';
import { useCourseSuggestion } from './useCourseSuggestion';
import type { CourseSeed, EditableTeeBox, LockedFields } from '../types';
import type { GolfCourse } from '../../../services/golfCourseApiService';
import type { Dispatch, SetStateAction } from 'react';

interface Params {
  courseSeed?: CourseSeed;
  courseName: string;
  courseSearchQuery: string;
  showCourseSuggestions: boolean;
  city: string;
  state: string;
  country: string;
  lockedFields: LockedFields;
  lockScalarField: (field: keyof LockedFields) => void;
  setCourseName: Dispatch<SetStateAction<string>>;
  setCity: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<string>>;
  setCountry: Dispatch<SetStateAction<string>>;
  setCourseSearchQuery: Dispatch<SetStateAction<string>>;
  setCourseSearchResults: Dispatch<SetStateAction<GolfCourse[]>>;
  setCourseSearchLoading: Dispatch<SetStateAction<boolean>>;
  setShowCourseSuggestions: Dispatch<SetStateAction<boolean>>;
  setTeeBoxes: Dispatch<SetStateAction<EditableTeeBox[]>>;
}

export function useImportCourseFlow(params: Params) {
  const { handleFindNearbyCourses } = useCourseMatching({
    courseSeed: params.courseSeed,
    courseName: params.courseName,
    courseSearchQuery: params.courseSearchQuery,
    showCourseSuggestions: params.showCourseSuggestions,
    city: params.city,
    state: params.state,
    country: params.country,
    lockedFields: params.lockedFields,
    setCity: params.setCity,
    setState: params.setState,
    setCountry: params.setCountry,
    setCourseSearchQuery: params.setCourseSearchQuery,
    setCourseSearchResults: params.setCourseSearchResults,
    setCourseSearchLoading: params.setCourseSearchLoading,
    setShowCourseSuggestions: params.setShowCourseSuggestions,
  });

  const { applyCourseSuggestion } = useCourseSuggestion({
    lockedFields: params.lockedFields,
    lockScalarField: params.lockScalarField,
    setCourseName: params.setCourseName,
    setCity: params.setCity,
    setState: params.setState,
    setCountry: params.setCountry,
    setCourseSearchQuery: params.setCourseSearchQuery,
    setShowCourseSuggestions: params.setShowCourseSuggestions,
    setCourseSearchLoading: params.setCourseSearchLoading,
    setTeeBoxes: params.setTeeBoxes,
  });

  return { handleFindNearbyCourses, applyCourseSuggestion };
}
