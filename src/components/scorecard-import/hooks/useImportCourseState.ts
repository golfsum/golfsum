import { useState } from 'react';
import type { GolfCourse } from '../../../services/golfCourseApiService';
import type { CourseSeed, EditableTeeBox } from '../types';
import { buildDefaultArray, buildDefaultTeeBox } from '../utils';

interface Params {
  courseSeed?: CourseSeed;
}

export function useImportCourseState(params: Params) {
  const [courseName, setCourseName] = useState(params.courseSeed?.name || '');
  const [city, setCity] = useState(params.courseSeed?.city || '');
  const [state, setState] = useState(params.courseSeed?.state || '');
  const [country, setCountry] = useState(params.courseSeed?.country || 'US');
  const [teeBoxes, setTeeBoxes] = useState<EditableTeeBox[]>([
    buildDefaultTeeBox('White tees'),
  ]);
  const [activeTeeIndex, setActiveTeeIndex] = useState(0);
  const [pars, setPars] = useState<string[]>(buildDefaultArray());
  const [hcpMen, setHcpMen] = useState<string[]>(buildDefaultArray());
  const [hcpWomen, setHcpWomen] = useState<string[]>(buildDefaultArray());
  const [courseSearchQuery, setCourseSearchQuery] = useState(params.courseSeed?.name || '');
  const [courseSearchResults, setCourseSearchResults] = useState<GolfCourse[]>([]);
  const [courseSearchLoading, setCourseSearchLoading] = useState(false);
  const [showCourseSuggestions, setShowCourseSuggestions] = useState(false);
  const [yardageColumnWidth, setYardageColumnWidth] = useState<number | null>(null);

  return {
    courseName,
    setCourseName,
    city,
    setCity,
    state,
    setState,
    country,
    setCountry,
    teeBoxes,
    setTeeBoxes,
    activeTeeIndex,
    setActiveTeeIndex,
    pars,
    setPars,
    hcpMen,
    setHcpMen,
    hcpWomen,
    setHcpWomen,
    courseSearchQuery,
    setCourseSearchQuery,
    courseSearchResults,
    setCourseSearchResults,
    courseSearchLoading,
    setCourseSearchLoading,
    showCourseSuggestions,
    setShowCourseSuggestions,
    yardageColumnWidth,
    setYardageColumnWidth,
  };
}

