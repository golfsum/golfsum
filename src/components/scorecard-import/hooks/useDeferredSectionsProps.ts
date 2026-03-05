import { useMemo } from 'react';
import type { GolfCourse } from '../../../services/golfCourseApiService';
import type { EditableTeeBox, ImportSection, InputType, ScanState, ScanStep } from '../types';
import type { ScorecardImportStyles } from '../../ScorecardImportScreen.styles';
import type { CardConfigState } from './useImportScanState';

interface Params {
  showDeferredSections: boolean;
  activeSection: ImportSection;
  styles: ScorecardImportStyles;
  isCompletedMode: boolean;
  hasValidRating: boolean;
  roundHoleCount: 9 | 18;
  scanState: ScanState;
  scanProgress: number;
  scanSteps: ScanStep[];
  hasScanWarnings: boolean;
  isProcessing: boolean;
  scanSide: 'front' | 'back';
  cardConfig: CardConfigState;
  imageUri: string | null;
  backImageUri: string | null;
  courseSearchQuery: string;
  courseSearchLoading: boolean;
  showCourseSuggestions: boolean;
  courseSearchResults: GolfCourse[];
  city: string;
  state: string;
  country: string;
  teeBoxes: EditableTeeBox[];
  activeTeeIndex: number;
  pars: string[];
  hcpMen: string[];
  yardageWidths: { hole: number; par: number; hcp: number; yds: number };
  onSelectImage: () => void;
  onTakePhoto: () => void;
  onChangePhoto: () => void;
  onRunOcr: () => void;
  onEnterManual: () => void;
  onReviewStats: () => void;
  onAddBackSide: () => void;
  onTakeBackPhoto: () => void;
  onSetCoverage: (coverage: CardConfigState['coverage']) => void;
  onSetPlayedFull: (playedFull: boolean) => void;
  onSetRoundHoleCount: (value: 9 | 18) => void;
  onAddRating: () => void;
  onCourseSearchChange: (value: string) => void;
  onCourseSearchFocus: () => void;
  onFindNearby: () => void;
  onSelectCourseSuggestion: (course: GolfCourse) => void;
  onCityChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onCountryChange: (value: string) => void;
  onSelectTee: (index: number) => void;
  onAddTee: () => void;
  onRemoveTee: () => void;
  onTeeNameChange: (value: string) => void;
  onOpenNumeric: (field: InputType, value: string, index?: number) => void;
  onYardageLayout: (width: number) => void;
}

export function useDeferredSectionsProps(params: Params) {
  return useMemo(() => ({
    showDeferredSections: params.showDeferredSections,
    activeSection: params.activeSection,
    styles: params.styles,
    isCompletedMode: params.isCompletedMode,
    hasValidRating: params.hasValidRating,
    roundHoleCount: params.roundHoleCount,
    scanState: params.scanState,
    scanProgress: params.scanProgress,
    scanSteps: params.scanSteps,
    hasScanWarnings: params.hasScanWarnings,
    isProcessing: params.isProcessing,
    scanSide: params.scanSide,
    cardConfig: params.cardConfig,
    imageUri: params.imageUri,
    backImageUri: params.backImageUri,
    courseSearchQuery: params.courseSearchQuery,
    courseSearchLoading: params.courseSearchLoading,
    showCourseSuggestions: params.showCourseSuggestions,
    courseSearchResults: params.courseSearchResults,
    city: params.city,
    state: params.state,
    country: params.country,
    teeBoxes: params.teeBoxes,
    activeTeeIndex: params.activeTeeIndex,
    pars: params.pars,
    hcpMen: params.hcpMen,
    yardageWidths: params.yardageWidths,
    onSelectImage: params.onSelectImage,
    onTakePhoto: params.onTakePhoto,
    onChangePhoto: params.onChangePhoto,
    onRunOcr: params.onRunOcr,
    onEnterManual: params.onEnterManual,
    onReviewStats: params.onReviewStats,
    onAddBackSide: params.onAddBackSide,
    onTakeBackPhoto: params.onTakeBackPhoto,
    onSetCoverage: params.onSetCoverage,
    onSetPlayedFull: params.onSetPlayedFull,
    onSetRoundHoleCount: params.onSetRoundHoleCount,
    onAddRating: params.onAddRating,
    onCourseSearchChange: params.onCourseSearchChange,
    onCourseSearchFocus: params.onCourseSearchFocus,
    onFindNearby: params.onFindNearby,
    onSelectCourseSuggestion: params.onSelectCourseSuggestion,
    onCityChange: params.onCityChange,
    onStateChange: params.onStateChange,
    onCountryChange: params.onCountryChange,
    onSelectTee: params.onSelectTee,
    onAddTee: params.onAddTee,
    onRemoveTee: params.onRemoveTee,
    onTeeNameChange: params.onTeeNameChange,
    onOpenNumeric: params.onOpenNumeric,
    onYardageLayout: params.onYardageLayout,
  }), [params]);
}
