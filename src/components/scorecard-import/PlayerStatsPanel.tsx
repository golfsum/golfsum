import React from 'react';
import { PlayerStatsSection } from './PlayerStatsSection';
import type { ScorecardImportStyles } from '../ScorecardImportScreen.styles';

export interface PlayerStatsPanelProps {
  isVisible: boolean;
  styles: ScorecardImportStyles;
  isPremium: boolean;
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
  showUpDownColumn: boolean;
  showPenaltiesColumn: boolean;
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

export const PlayerStatsPanel: React.FC<PlayerStatsPanelProps> = (props) => {
  if (!props.isVisible) return null;

  return (
    <PlayerStatsSection
      styles={props.styles}
      isPremium={props.isPremium}
      onUpgrade={props.onUpgrade}
      playerName={props.playerName}
      playerDate={props.playerDate}
      playerDateDisplay={props.playerDateDisplay}
      playerNameCandidates={props.playerNameCandidates}
      showNamePicker={props.onShowNamePicker}
      onPlayerNameChange={props.onPlayerNameChange}
      onDatePress={props.onDatePress}
      playerNineView={props.playerNineView}
      onNineViewChange={props.onNineViewChange}
      focusedHoleIndex={props.focusedHoleIndex}
      pars={props.pars}
      hcpMen={props.hcpMen}
      scores={props.scores}
      putts={props.putts}
      fairways={props.fairways}
      greens={props.greens}
      upDowns={props.upDowns}
      penalties={props.penalties}
      editedScores={props.editedScores}
      editedPutts={props.editedPutts}
      editedFairways={props.editedFairways}
      editedGreens={props.editedGreens}
      editedUpDowns={props.editedUpDowns}
      editedPenalties={props.editedPenalties}
      showUpDownColumn={props.showUpDownColumn}
      showPenaltiesColumn={props.showPenaltiesColumn}
      onShowAllStats={props.onShowAllStats}
      fairwayEditMode={props.fairwayEditMode}
      greenEditMode={props.greenEditMode}
      playerNineRange={props.playerNineRange}
      openKeypad={props.openKeypad}
      onOpenFlagPicker={props.onOpenFlagPicker}
      onToggleFlag={props.onToggleFlag}
      onToggleUpDown={props.onToggleUpDown}
      onFocusHole={props.onFocusHole}
      renderArrowValue={props.renderArrowValue}
    />
  );
};
