import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { EditableTeeBox, ImportSection } from '../types';
import { buildDefaultTeeBox } from '../utils';

interface Params {
  isCompletedMode: boolean;
  roundHoleCount: 9 | 18;
  activeTeeIndex: number;
  teeBoxes: EditableTeeBox[];
  setActiveSection: (section: ImportSection) => void;
  setCourseSearchQuery: (value: string) => void;
  setCourseName: (value: string) => void;
  setShowCourseSuggestions: (value: boolean) => void;
  setCity: (value: string) => void;
  setState: (value: string) => void;
  setCountry: (value: string) => void;
  setTeeBoxes: Dispatch<SetStateAction<EditableTeeBox[]>>;
  setActiveTeeIndex: Dispatch<SetStateAction<number>>;
  setYardageColumnWidth: (value: number) => void;
  lockScalarField: (field: 'courseName' | 'city' | 'state' | 'country') => void;
  lockTeeField: (teeId: string, field: 'name' | 'ratingMen' | 'slopeMen' | 'ratingWomen' | 'slopeWomen') => void;
  yardageDividerWidth: number;
  yardageColumnGap: number;
}

export function useDeferredHandlers(params: Params) {
  const onEnterManual = useCallback(() => {
    params.setActiveSection(params.isCompletedMode ? 'player' : 'course');
  }, [params]);

  const onReviewStats = useCallback(() => {
    params.setActiveSection('player');
  }, [params]);

  const onAddRating = useCallback(() => {
    params.setActiveSection('course');
  }, [params]);

  const onCourseSearchChange = useCallback((value: string) => {
    params.lockScalarField('courseName');
    params.setCourseSearchQuery(value);
    params.setCourseName(value);
  }, [params]);

  const onCourseSearchFocus = useCallback(() => {
    params.setShowCourseSuggestions(true);
  }, [params]);

  const onCityChange = useCallback((value: string) => {
    params.lockScalarField('city');
    params.setCity(value);
  }, [params]);

  const onStateChange = useCallback((value: string) => {
    params.lockScalarField('state');
    params.setState(value);
  }, [params]);

  const onCountryChange = useCallback((value: string) => {
    params.lockScalarField('country');
    params.setCountry(value);
  }, [params]);

  const onAddTee = useCallback(() => {
    params.setTeeBoxes(prev => [...prev, buildDefaultTeeBox('New tees')]);
    params.setActiveTeeIndex(params.teeBoxes.length);
  }, [params]);

  const onRemoveTee = useCallback(() => {
    params.setTeeBoxes(prev => prev.filter((_, index) => index !== params.activeTeeIndex));
    params.setActiveTeeIndex(prev => Math.max(0, prev - 1));
  }, [params]);

  const onTeeNameChange = useCallback((value: string) => {
    const teeId = params.teeBoxes[params.activeTeeIndex]?.id;
    if (teeId) params.lockTeeField(teeId, 'name');
    params.setTeeBoxes(prev => {
      const next = [...prev];
      const tee = { ...next[params.activeTeeIndex], name: value };
      next[params.activeTeeIndex] = tee;
      return next;
    });
  }, [params]);

  const onYardageLayout = useCallback((width: number) => {
    if (!width) return;
    if (params.roundHoleCount === 18) {
      const columnWidth = Math.floor((width - params.yardageDividerWidth - params.yardageColumnGap) / 2);
      params.setYardageColumnWidth(columnWidth);
      return;
    }
    params.setYardageColumnWidth(Math.floor(width));
  }, [params]);

  return {
    onEnterManual,
    onReviewStats,
    onAddRating,
    onCourseSearchChange,
    onCourseSearchFocus,
    onCityChange,
    onStateChange,
    onCountryChange,
    onAddTee,
    onRemoveTee,
    onTeeNameChange,
    onYardageLayout,
  };
}
