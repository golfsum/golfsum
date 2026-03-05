import type { Dispatch, SetStateAction } from 'react';
import type { UpgradeTrigger } from '../../UpgradeSheet';
import type { ImportScreenLayoutProps } from '../ImportScreenLayout';
import type {
  EditableTeeBox,
  ImportSection,
  InputType,
  LockedFields,
  ReviewState,
  RoundSummary,
  ScanState,
  ScanStep,
} from '../types';
import type { GolfCourse } from '../../../services/golfCourseApiService';
import type { CardConfigState } from './useImportScanState';

export type DirectionalValue = boolean | 'left' | 'right' | 'short' | 'long' | null;

export interface ScorecardImportLayoutModelParams {
  isCompletedMode: boolean;
  isPremium: boolean;
  inTrial: boolean;
  trialRoundsUsed: number;
  trialLimit: number;
  onBack: () => void;
  onNavigateToProfile?: (trigger: UpgradeTrigger) => void;
  lockScalarField: (field: keyof LockedFields) => void;
  lockTeeField: (teeId: string, field: 'name' | 'ratingMen' | 'slopeMen' | 'ratingWomen' | 'slopeWomen') => void;
  setPlayerName: Dispatch<SetStateAction<string>>;
  roundHoleCount: 9 | 18;
  scoreValues?: Array<number | null>;
  scoreSummary?: { filledScores: number; isNineHoleRound: boolean; scoreConfirmed: boolean };
  courseName: string;
  setPlayerNineView: Dispatch<SetStateAction<'front' | 'back'>>;
  setScanSide: Dispatch<SetStateAction<'front' | 'back'>>;
  setShowPlayerNamePicker: Dispatch<SetStateAction<boolean>>;
  setShowAllStatsColumns: Dispatch<SetStateAction<boolean>>;
  goToSection: (section: ImportSection) => void;
  openDatePicker: () => void;
  openNumericEditor: (field: InputType, value: string, index?: number) => void;
  activeTeeIndex: number;
  teeBoxes: EditableTeeBox[];
  setActiveSection: Dispatch<SetStateAction<ImportSection>>;
  setCourseSearchQuery: Dispatch<SetStateAction<string>>;
  setCourseName: Dispatch<SetStateAction<string>>;
  setShowCourseSuggestions: Dispatch<SetStateAction<boolean>>;
  setCity: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<string>>;
  setCountry: Dispatch<SetStateAction<string>>;
  setTeeBoxes: Dispatch<SetStateAction<EditableTeeBox[]>>;
  setActiveTeeIndex: Dispatch<SetStateAction<number>>;
  setYardageColumnWidth: (value: number) => void;
  activeSection: ImportSection;
  playerName: string;
  playerDate: string;
  playerDateDisplay: string;
  playerNameCandidates: string[];
  showPlayerNamePicker: boolean;
  playerNineView: 'front' | 'back';
  focusedHoleIndex: number | null;
  pars: string[];
  hcpMen: string[];
  scores: string[];
  putts: string[];
  fairways: DirectionalValue[];
  greens: DirectionalValue[];
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
  setFocusedHoleIndex: Dispatch<SetStateAction<number | null>>;
  renderArrowValue: (value: DirectionalValue, disabled?: boolean, field?: 'fairway' | 'green') => string;
  showDeferredSections: boolean;
  hasValidRating: boolean;
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
  yardageWidths: { hole: number; par: number; hcp: number; yds: number };
  handleSelectImage: () => void;
  handleTakePhoto: () => void;
  handleChangePhoto: () => void;
  handleRunOCR: () => void;
  handleAddBackSide: () => void;
  handleTakeBackPhoto: () => void;
  handleSetCoverage: (coverage: CardConfigState['coverage']) => void;
  handleSetPlayedFull: (playedFull: boolean) => void;
  handleSetRoundHoleCount: (value: 9 | 18) => void;
  handleFindNearbyCourses: () => void;
  applyCourseSuggestion: (course: GolfCourse) => void;
  reviewState: ReviewState;
  activeTee?: EditableTeeBox | null;
  roundSummary: RoundSummary | null;
  showDatePicker: boolean;
  setShowDatePicker: (visible: boolean) => void;
  tempDate: Date;
  handleDatePicked: (event: { type: string; nativeEvent?: { timestamp?: number } }, date?: Date) => void;
  commitSelectedDate: (selected: Date) => void;
  profilePlayerName: string;
  keypadVisible: boolean;
  keypadField: { index?: number; field: InputType } | null;
  keypadMode: 'chips' | 'keypad';
  keypadValue: string;
  getFlagChipOptions: (field: 'fairway' | 'green') => Array<{ label: string; value: string }>;
  handleChipSelect: (option: number | string) => void;
  cancelKeypad: () => void;
  handleKeypadDigit: (digit: string) => void;
  handleKeypadBackspace: () => void;
  handleKeypadDecimal: () => void;
  handleKeypadNext: () => void;
  handleKeypadPrev: () => void;
  commitKeypadValue: (value: string) => void;
  closeKeypad: () => void;
  sectionTabsRef: ImportScreenLayoutProps['tabsHeaderProps']['sectionTabsRef'];
  sectionTabs: ImportScreenLayoutProps['tabsHeaderProps']['sectionTabs'];
  setSectionTabsWidth: (width: number) => void;
  sectionTabLayouts: ImportScreenLayoutProps['tabsHeaderProps']['sectionTabLayouts'];
  stickySaveBarProps: ImportScreenLayoutProps['stickySaveBarProps'];
}
