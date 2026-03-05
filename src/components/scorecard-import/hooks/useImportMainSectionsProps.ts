import { usePlayerStatsPanelProps } from './usePlayerStatsPanelProps';
import { useDeferredSectionsProps } from './useDeferredSectionsProps';
import { buildDeferredSectionsArgs, buildPlayerStatsPanelArgs } from './useImportMainSections.builders';
import type { ScorecardImportStyles } from '../../ScorecardImportScreen.styles';
import type {
  ImportSection,
  InputType,
  LockedFields,
  ScanState,
  ScanStep,
} from '../types';
import type { GolfCourse } from '../../../services/golfCourseApiService';
import type { EditableTeeBox } from '../types';
import type { CardConfigState } from './useImportScanState';

export interface UseImportMainSectionsParams {
  isCompletedMode: boolean;
  activeSection: ImportSection;
  styles: ScorecardImportStyles;
  isPremium: boolean;
  inTrial: boolean;
  playerName: string;
  playerDate: string;
  playerDateDisplay: string;
  playerNameCandidates: string[];
  playerNineView: 'front' | 'back';
  focusedHoleIndex: number | null;
  pars: string[];
  hcpMen: string[];
  scores: string[];
  putts: string[];
  fairways: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  greens: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  upDowns: Array<boolean | null>;
  penalties: string[];
  lockedFields: LockedFields;
  showAllStatsColumns: boolean;
  fairwayEditMode: 'cycle' | 'picker';
  greenEditMode: 'cycle' | 'picker';
  playerNineRange: { start: number; end: number };
  openKeypad: (index: number, field: 'score' | 'putts' | 'penalties') => void;
  openFlagPicker: (index: number, field: 'fairway' | 'green') => void;
  toggleFlag: (index: number, field: 'fairway' | 'green') => void;
  toggleUpDown: (index: number) => void;
  setFocusedHoleIndex: (index: number | null) => void;
  renderArrowValue: (
    value: boolean | 'left' | 'right' | 'short' | 'long' | null,
    disabled?: boolean,
    field?: 'fairway' | 'green'
  ) => string;
  showDeferredSections: boolean;
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
  onUpgradeImport: () => void;
  onShowNamePicker: () => void;
  onPlayerNameChange: (value: string) => void;
  onDatePress: () => void;
  onNineViewChange: (view: 'front' | 'back') => void;
  onShowAllStats: () => void;
}

export function useImportMainSectionsProps(params: UseImportMainSectionsParams) {
  const playerStatsPanelProps = usePlayerStatsPanelProps(buildPlayerStatsPanelArgs(params));

  const deferredSectionsProps = useDeferredSectionsProps(buildDeferredSectionsArgs(params));

  return {
    playerStatsPanelProps,
    deferredSectionsProps,
  };
}
