import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';
import { UI_COPY } from '../../constants/uiCopy';
import type { ScorecardImportStyles } from '../ScorecardImportScreen.styles';

type Directional = boolean | 'left' | 'right' | 'short' | 'long' | null;

interface PlayerStatsSectionProps {
  styles: ScorecardImportStyles;
  playerName: string;
  playerDate: string;
  playerDateDisplay: string;
  playerNameCandidates: string[];
  showNamePicker: () => void;
  onPlayerNameChange: (value: string) => void;
  onDatePress: () => void;
  playerNineView: 'front' | 'back';
  onNineViewChange: (view: 'front' | 'back') => void;
  focusedHoleIndex: number | null;
  pars: string[];
  hcpMen: string[];
  scores: string[];
  putts: string[];
  fairways: Directional[];
  greens: Directional[];
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
  onFocusHole: (index: number) => void;
  renderArrowValue: (value: Directional, disabled?: boolean, field?: 'fairway' | 'green') => string;
  isPremium?: boolean;
  onUpgrade?: () => void;
}

export const PlayerStatsSection: React.FC<PlayerStatsSectionProps> = ({
  styles,
  playerName,
  playerDate,
  playerDateDisplay,
  playerNameCandidates,
  showNamePicker,
  onPlayerNameChange,
  onDatePress,
  playerNineView,
  onNineViewChange,
  focusedHoleIndex,
  pars,
  hcpMen,
  scores,
  putts,
  fairways,
  greens,
  upDowns,
  penalties,
  editedScores,
  editedPutts,
  editedFairways,
  editedGreens,
  editedUpDowns,
  editedPenalties,
  showUpDownColumn,
  showPenaltiesColumn,
  onShowAllStats,
  fairwayEditMode,
  greenEditMode,
  playerNineRange,
  openKeypad,
  onOpenFlagPicker,
  onToggleFlag,
  onToggleUpDown,
  onFocusHole,
  renderArrowValue,
  isPremium = true,
  onUpgrade,
}) => {
  const premiumLocked = !isPremium;
  const showAdvancedColumns = !premiumLocked;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{UI_COPY.scorecardImport.playerStatsTitle}</Text>
        <View style={styles.sectionEditHint}>
          <Ionicons name="pencil-outline" size={14} color={colors.text.secondary} />
          <Text style={styles.sectionHintText}>{UI_COPY.scorecardImport.playerStatsTapToCorrect}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.inputHalf]}
          placeholder={UI_COPY.scorecardImport.playerNamePlaceholder}
          placeholderTextColor={colors.text.tertiary}
          value={playerName}
          keyboardAppearance="dark"
          onChangeText={onPlayerNameChange}
          accessibilityLabel="Player name"
        />
        <TouchableOpacity
          style={[styles.input, styles.inputHalf, styles.dateInput]}
          onPress={onDatePress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Round date ${playerDate || UI_COPY.scorecardImport.reviewChipDateNotSet}`}
          accessibilityHint="Opens date picker"
        >
          <Text style={playerDate ? styles.dateInputText : styles.datePlaceholderText}>
            {playerDate ? playerDateDisplay : UI_COPY.scorecardImport.reviewChipDateFallback}
          </Text>
        </TouchableOpacity>
      </View>
      {playerNameCandidates.length > 1 && (
        <TouchableOpacity
          style={styles.namePickerButton}
          onPress={showNamePicker}
          accessibilityRole="button"
          accessibilityLabel="Pick name from card"
        >
          <Ionicons name="person-circle-outline" size={16} color={colors.brand.primary} />
          <Text style={styles.namePickerButtonText}>{UI_COPY.scorecardImport.chooseNameFromScorecard}</Text>
        </TouchableOpacity>
      )}
      <View style={styles.nineToggle}>
        <TouchableOpacity
          style={[styles.nineButton, playerNineView === 'front' && styles.nineButtonActive]}
          onPress={() => onNineViewChange('front')}
          accessibilityRole="button"
          accessibilityLabel="Show front 9"
          accessibilityState={{ selected: playerNineView === 'front' }}
        >
          <Text style={[styles.nineButtonText, playerNineView === 'front' && styles.nineButtonTextActive]}>
            {UI_COPY.scorecardImport.front9}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.nineButton,
            playerNineView === 'back' && styles.nineButtonActive,
          ]}
          onPress={() => onNineViewChange('back')}
          accessibilityRole="button"
          accessibilityLabel="Show back 9"
          accessibilityState={{ selected: playerNineView === 'back' }}
        >
          <Text style={[
            styles.nineButtonText,
            playerNineView === 'back' && styles.nineButtonTextActive,
          ]}>
            {UI_COPY.scorecardImport.back9}
          </Text>
        </TouchableOpacity>
      </View>
      {focusedHoleIndex !== null && (
        <View style={styles.focusedHoleBanner}>
          <Text style={styles.focusedHoleText}>
            Hole {focusedHoleIndex + 1}
            {pars[focusedHoleIndex] ? ` · Par ${pars[focusedHoleIndex]}` : ''}
            {hcpMen[focusedHoleIndex] ? ` · HCP ${hcpMen[focusedHoleIndex]}` : ''}
          </Text>
        </View>
      )}
      <View style={styles.playerHeader}>
        <Text style={[styles.playerHeaderText, styles.headerHoleCell]}>#</Text>
        <Text style={[styles.playerHeaderText, styles.headerScoreCell]}>{UI_COPY.scorecardImport.headerScr}</Text>
        <Text style={[styles.playerHeaderText, styles.headerScoreCell]}>{UI_COPY.scorecardImport.headerPtt}</Text>
        {showAdvancedColumns && (
          <>
            <Text style={[styles.playerHeaderText, styles.headerStatCell]}>FIR</Text>
            <Text style={[styles.playerHeaderText, styles.headerStatCell]}>GIR</Text>
            {showUpDownColumn && (
              <Text style={[styles.playerHeaderText, styles.headerStatCell]}>U/D</Text>
            )}
            {showPenaltiesColumn && (
              <Text style={[styles.playerHeaderText, styles.headerStatCell]}>{UI_COPY.scorecardImport.headerPen}</Text>
            )}
          </>
        )}
      </View>
      {showAdvancedColumns && (
        <Text style={styles.firPar3HintText}>Par 3 means no fairway here</Text>
      )}
      {Array.from({ length: playerNineRange.end - playerNineRange.start }, (_, offset) => {
        const index = playerNineRange.start + offset;
        const parValue = parseInt(pars[index], 10);
        const firDisabled = parValue === 3;
        const fairwayValue = fairways[index];
        const greenValue = greens[index];
        const upDownValue = upDowns[index];
        const greenMissed = greenValue !== null && greenValue !== true;
        const upDownDisabled = !greenMissed;
        return (
          <View
            key={index + 1}
            style={[
              styles.playerRow,
              focusedHoleIndex === index && styles.playerRowFocused,
            ]}
          >
            <TouchableOpacity
              onPress={() => onFocusHole(index)}
              accessibilityRole="button"
              accessibilityLabel={`Focus hole ${index + 1}`}
            >
              <Text style={[styles.holeNumber, styles.holeCell]}>{index + 1}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.holeInput,
                styles.scoreCell,
                styles.cellEditable,
                editedScores[index] && styles.cellEdited,
              ]}
              onPress={() => openKeypad(index, 'score')}
              accessibilityRole="button"
              accessibilityLabel={`Hole ${index + 1} score`}
            >
              <Text style={styles.holeInputText}>{scores[index] || '—'}</Text>
              {editedScores[index] && <View style={styles.cellEditedDot} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.holeInput,
                styles.scoreCell,
                styles.cellEditable,
                editedPutts[index] && styles.cellEdited,
              ]}
              onPress={() => openKeypad(index, 'putts')}
              accessibilityRole="button"
              accessibilityLabel={`Hole ${index + 1} putts`}
            >
              <Text style={styles.holeInputText}>{putts[index] || '—'}</Text>
              {editedPutts[index] && <View style={styles.cellEditedDot} />}
            </TouchableOpacity>
            {showAdvancedColumns && (
              <>
                <TouchableOpacity
                  style={[
                    styles.flagToggle,
                    styles.statCell,
                    styles.cellEditable,
                    firDisabled && styles.flagToggleDisabled,
                    editedFairways[index] && styles.cellEdited,
                  ]}
                  onPress={() => {
                    if (firDisabled) return;
                    if (fairwayEditMode === 'picker') {
                      onOpenFlagPicker(index, 'fairway');
                      return;
                    }
                    onToggleFlag(index, 'fairway');
                  }}
                  disabled={firDisabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Hole ${index + 1} fairway in regulation`}
                  accessibilityHint={firDisabled ? 'Par 3 holes do not track fairways' : undefined}
                  accessibilityState={{ disabled: firDisabled }}
                >
                  <Text style={styles.flagToggleText}>
                    {renderArrowValue(fairwayValue, firDisabled, 'fairway')}
                  </Text>
                  {editedFairways[index] && <View style={styles.cellEditedDot} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.flagToggle,
                    styles.statCell,
                    styles.cellEditable,
                    editedGreens[index] && styles.cellEdited,
                  ]}
                  onPress={() => {
                    if (greenEditMode === 'picker') {
                      onOpenFlagPicker(index, 'green');
                      return;
                    }
                    onToggleFlag(index, 'green');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Hole ${index + 1} green in regulation`}
                >
                  <Text style={styles.flagToggleText}>
                    {renderArrowValue(greenValue, false, 'green')}
                  </Text>
                  {editedGreens[index] && <View style={styles.cellEditedDot} />}
                </TouchableOpacity>
              </>
            )}
            {showAdvancedColumns && showUpDownColumn && (
              <TouchableOpacity
                style={[
                  styles.flagToggle,
                  styles.statCell,
                  styles.cellEditable,
                  upDownDisabled && styles.flagToggleDisabled,
                  editedUpDowns[index] && styles.cellEdited,
                ]}
                onPress={() => {
                  if (!upDownDisabled) onToggleUpDown(index);
                }}
                disabled={upDownDisabled}
                accessibilityRole="button"
                accessibilityLabel={`Hole ${index + 1} up and down`}
                accessibilityState={{ disabled: upDownDisabled }}
              >
                <Text style={styles.flagToggleText}>
                  {upDownDisabled ? '–' : upDownValue === null ? '—' : upDownValue ? '✓' : '✕'}
                </Text>
                {editedUpDowns[index] && <View style={styles.cellEditedDot} />}
              </TouchableOpacity>
            )}
            {showAdvancedColumns && showPenaltiesColumn && (
              <TouchableOpacity
                style={[
                  styles.holeInput,
                  styles.statCell,
                  styles.cellEditable,
                  editedPenalties[index] && styles.cellEdited,
                ]}
                onPress={() => {
                  openKeypad(index, 'penalties');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Hole ${index + 1} penalties`}
              >
                <Text style={styles.holeInputText}>
                  {penalties[index] || '—'}
                </Text>
                {editedPenalties[index] && <View style={styles.cellEditedDot} />}
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      {showAdvancedColumns && (!showUpDownColumn || !showPenaltiesColumn) ? (
        <TouchableOpacity
          style={styles.showAllStatsButton}
          onPress={onShowAllStats}
          accessibilityRole="button"
          accessibilityLabel="Show all stat columns"
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.text.secondary} />
          <Text style={styles.showAllStatsText}>{UI_COPY.scorecardImport.showAllStats}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.nineTotals}>
        {(() => {
          const scoresSlice = scores.slice(playerNineRange.start, playerNineRange.end).map(value => parseInt(value, 10) || 0);
          const puttsSlice = putts.slice(playerNineRange.start, playerNineRange.end).map(value => parseInt(value, 10) || 0);
          const parsSlice = pars.slice(playerNineRange.start, playerNineRange.end).map(value => parseInt(value, 10) || 0);
          const totalScore = scoresSlice.reduce((sum, value) => sum + value, 0);
          const totalPutts = puttsSlice.reduce((sum, value) => sum + value, 0);
          const totalPar = parsSlice.reduce((sum, value) => sum + value, 0);
          const toPar = totalScore - totalPar;
          return (
            <>
              <Text style={styles.nineTotalsLabel}>{playerNineView === 'front' ? 'OUT' : 'IN'}:</Text>
              <Text style={styles.nineTotalsScore}>{totalScore || '—'}</Text>
              <Text style={styles.nineTotalsToPar}>
                ({toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar})
              </Text>
              <Text style={styles.nineTotalsPutts}>{UI_COPY.scorecardImport.puttsSuffix.replace('{putts}', String(totalPutts || 0))}</Text>
            </>
          );
        })()}
      </View>
      {premiumLocked && onUpgrade && (
        <View style={{ alignSelf: 'center', marginTop: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: '#9CA3AF', fontWeight: '500', marginBottom: 4 }}>
            {UI_COPY.scorecardImport.trackAdvancedWithPro}
          </Text>
          <TouchableOpacity onPress={onUpgrade} accessibilityRole="button">
            <Text style={{ fontSize: 13, color: '#10B981', fontWeight: '700' }}>
              See full stat tracking
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};
