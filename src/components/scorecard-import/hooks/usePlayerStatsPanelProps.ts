import { useMemo } from 'react';
import type { PlayerStatsPanelProps } from '../PlayerStatsPanel';
import type { ScorecardImportStyles } from '../../ScorecardImportScreen.styles';

interface Params {
  isCompletedMode: boolean;
  activeSection: 'photo' | 'player' | 'course' | 'yardages';
  styles: ScorecardImportStyles;
  isPremium: boolean;
  inTrial: boolean;
  onUpgrade: () => void;
  playerName: string;
  playerDate: string;
  playerDateDisplay: string;
  playerNameCandidates: string[];
  onShowNamePicker: () => void;
  onPlayerNameChange: (value: string) => void;
  onDatePress: () => void;
  playerNineView: 'front' | 'back';
  onNineViewChange: (view: 'front' | 'back') => void;
  focusedHoleIndex: number | null;
  pars: string[];
  hcpMen: string[];
  scores: string[];
  putts: string[];
  fairways: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  greens: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  upDowns: Array<boolean | null>;
  penalties: string[];
  editedScores: boolean[];
  editedPutts: boolean[];
  editedFairways: boolean[];
  editedGreens: boolean[];
  editedUpDowns: boolean[];
  editedPenalties: boolean[];
  showAllStatsColumns: boolean;
  onShowAllStats: () => void;
  fairwayEditMode: 'cycle' | 'picker';
  greenEditMode: 'cycle' | 'picker';
  playerNineRange: { start: number; end: number };
  openKeypad: (index: number, field: 'score' | 'putts' | 'penalties') => void;
  onOpenFlagPicker: (index: number, field: 'fairway' | 'green') => void;
  onToggleFlag: (index: number, field: 'fairway' | 'green') => void;
  onToggleUpDown: (index: number) => void;
  onFocusHole: (index: number | null) => void;
  renderArrowValue: (
    value: boolean | 'left' | 'right' | 'short' | 'long' | null,
    disabled?: boolean,
    field?: 'fairway' | 'green'
  ) => string;
}

export function usePlayerStatsPanelProps(params: Params): PlayerStatsPanelProps {
  return useMemo(() => ({
    isVisible: params.isCompletedMode && params.activeSection === 'player',
    styles: params.styles,
    isPremium: params.isPremium || params.inTrial,
    onUpgrade: params.onUpgrade,
    playerName: params.playerName,
    playerDate: params.playerDate,
    playerDateDisplay: params.playerDateDisplay,
    playerNameCandidates: params.playerNameCandidates,
    onShowNamePicker: params.onShowNamePicker,
    onPlayerNameChange: params.onPlayerNameChange,
    onDatePress: params.onDatePress,
    playerNineView: params.playerNineView,
    onNineViewChange: params.onNineViewChange,
    focusedHoleIndex: params.focusedHoleIndex,
    pars: params.pars,
    hcpMen: params.hcpMen,
    scores: params.scores,
    putts: params.putts,
    fairways: params.fairways,
    greens: params.greens,
    upDowns: params.upDowns,
    penalties: params.penalties,
    editedScores: params.editedScores,
    editedPutts: params.editedPutts,
    editedFairways: params.editedFairways,
    editedGreens: params.editedGreens,
    editedUpDowns: params.editedUpDowns,
    editedPenalties: params.editedPenalties,
    showUpDownColumn: params.showAllStatsColumns || params.upDowns.some(value => value !== null),
    showPenaltiesColumn: params.showAllStatsColumns || params.penalties.some(value => (value || '').trim() !== ''),
    onShowAllStats: params.onShowAllStats,
    fairwayEditMode: params.fairwayEditMode,
    greenEditMode: params.greenEditMode,
    playerNineRange: params.playerNineRange,
    openKeypad: params.openKeypad,
    onOpenFlagPicker: params.onOpenFlagPicker,
    onToggleFlag: params.onToggleFlag,
    onToggleUpDown: params.onToggleUpDown,
    onFocusHole: params.onFocusHole,
    renderArrowValue: params.renderArrowValue,
  }), [params]);
}
