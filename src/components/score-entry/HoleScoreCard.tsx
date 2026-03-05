import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { HoleHeaderRow } from './HoleHeaderRow';
import { ScoreInputSection } from './ScoreInputSection';
import { StatInputSection } from './StatInputSection';
import { FIRResult, GIRResult, HoleScore, StatPreferences } from './types';
import { formatPuttDistance, getPuttDistanceUnitLabel, parsePuttDistanceToFeet, type DistanceUnit } from '../../utils/distance';

interface HoleScoreCardProps {
  hole: HoleScore;
  currentHole: number;
  totalHoles: number;
  isFirstHole: boolean;
  isLastHole: boolean;
  viewMode: 'basic' | 'advanced';
  statPreferences: StatPreferences;
  trackClubs: boolean;
  trackPuttDistance: boolean;
  distanceUnit: DistanceUnit;
  scorecardColorsEnabled?: boolean;
  shotDetailsExpanded: boolean;
  onToggleShotDetails: () => void;
  onPrev: () => void;
  onNext: () => void;
  changeScore: (index: number, delta: number) => void;
  changePutts: (index: number, delta: number) => void;
  penaltyStrokes: number;
  setPuttDistance: (index: number, value: number | null) => void;
  setFIR: (index: number, value: FIRResult) => void;
  setGIR: (index: number, value: GIRResult) => void;
  setUpDown: (index: number, value: boolean | null) => void;
  onOpenTeeClubPicker: () => void;
  onOpenApproachClubPicker: () => void;
  onOpenApproachDistancePicker: () => void;
  onOpenPenaltySheet: () => void;
  renderDirectionPicker: (
    value: FIRResult | GIRResult,
    onChange: (next: FIRResult | GIRResult) => void
  ) => React.ReactNode;
  fairwayMissed: boolean;
  greenMissed: boolean;
  actionIconSize: number;
  styles: any;
  CollapsibleSection: React.ComponentType<{
    title: string;
    subtitle?: string;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    styles: any;
  }>;
}

export const HoleScoreCard: React.FC<HoleScoreCardProps> = ({
  hole,
  currentHole,
  totalHoles,
  isFirstHole,
  isLastHole,
  viewMode,
  statPreferences,
  trackClubs,
  trackPuttDistance,
  distanceUnit,
  scorecardColorsEnabled = true,
  shotDetailsExpanded,
  onToggleShotDetails,
  onPrev,
  onNext,
  changeScore,
  changePutts,
  penaltyStrokes,
  setPuttDistance,
  setFIR,
  setGIR,
  setUpDown,
  onOpenTeeClubPicker,
  onOpenApproachClubPicker,
  onOpenApproachDistancePicker,
  onOpenPenaltySheet,
  renderDirectionPicker,
  fairwayMissed,
  greenMissed,
  actionIconSize,
  styles,
  CollapsibleSection,
}) => {
  const firstPuttInputRef = useRef<TextInput>(null);
  const isPar3 = hole.par === 3;
  const bunkerCount = (hole.fairwayBunker ? 1 : 0) + (hole.greenSideBunker ? 1 : 0);
  const penaltyCount = bunkerCount + (hole.hazardOrDrop ? 1 : 0) + (hole.dropShot ? 1 : 0) + (hole.outOfBounds ? 1 : 0);
  const penaltyStrokeCount = (hole.hazardOrDrop ? 1 : 0) + (hole.outOfBounds ? 1 : 0);
  const puttDistanceLabel = getPuttDistanceUnitLabel(distanceUnit);
  const puttDistanceDisplay = hole.firstPuttDistance !== null && hole.firstPuttDistance !== undefined
    ? String(formatPuttDistance(hole.firstPuttDistance, distanceUnit))
    : '';

  return (
    <View style={styles.holeCard}>
      <View style={styles.holeInfoTop}>
        <HoleHeaderRow
          holeNumber={hole.hole}
          par={hole.par}
          yardage={hole.yardage}
          handicap={hole.handicap}
          distanceUnit={distanceUnit}
          isPrevDisabled={isFirstHole}
          isNextDisabled={isLastHole}
          onPrev={onPrev}
          onNext={onNext}
          styles={styles}
        />
      </View>

      <ScoreInputSection
        score={hole.score}
        par={hole.par}
        putts={hole.putts}
        greenHit={hole.gir === 'hit'}
        penaltyStrokes={penaltyStrokes}
        showPutts={statPreferences.putts}
        scorecardColorsEnabled={scorecardColorsEnabled}
        onScoreChange={(delta) => changeScore(currentHole, delta)}
        onPuttsChange={(delta) => changePutts(currentHole, delta)}
        styles={styles}
      />

      <StatInputSection
        par={hole.par}
        viewMode={viewMode}
        statPreferences={statPreferences}
        fir={hole.fir as any}
        gir={hole.gir as any}
        upDown={hole.upDown}
        fairwayMissed={fairwayMissed}
        greenMissed={greenMissed}
        actionIconSize={actionIconSize}
        onSetFir={(value) => setFIR(currentHole, value as any)}
        onSetGir={(value) => setGIR(currentHole, value as any)}
        onSetUpDown={(value) => setUpDown(currentHole, value)}
        onOpenPenaltySheet={onOpenPenaltySheet}
        renderDirectionPicker={renderDirectionPicker as any}
        penaltyCount={penaltyCount}
        penaltyStrokeCount={penaltyStrokeCount}
        bunkerCount={bunkerCount}
        styles={styles}
      />

      {viewMode === 'advanced' && (trackClubs || statPreferences.approachDistance || trackPuttDistance) && (
        <CollapsibleSection
          title="Shot Details"
          subtitle={
            hole.teeClub ||
            (!isPar3 && hole.approachClub) ||
            (!isPar3 && hole.approachDistance) ||
            (trackPuttDistance && hole.firstPuttDistance != null)
              ? [
                  hole.teeClub,
                  !isPar3 ? hole.approachClub : null,
                  !isPar3 ? hole.approachDistance || null : null,
                  trackPuttDistance && hole.firstPuttDistance != null
                    ? `Putt ${formatPuttDistance(hole.firstPuttDistance, distanceUnit)} ${puttDistanceLabel}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' | ')
              : 'Tap to add details'
          }
          expanded={shotDetailsExpanded}
          onToggle={onToggleShotDetails}
          styles={styles}
        >
          <View style={styles.compactRow}>
            {trackClubs && (
              <TouchableOpacity
                style={styles.compactField}
                onPress={onOpenTeeClubPicker}
                accessibilityRole="button"
                accessibilityLabel={`Tee club, ${hole.teeClub || 'not set'}`}
                accessibilityHint="Opens tee club picker"
              >
                <Text style={styles.microLabel}>{hole.par === 3 ? 'Club' : 'Tee'}</Text>
                <Text style={[styles.compactValue, !hole.teeClub && styles.compactValuePlaceholder]}>{hole.teeClub || 'e.g. Driver'}</Text>
              </TouchableOpacity>
            )}
            {trackClubs && !isPar3 && (
              <TouchableOpacity
                style={styles.compactField}
                onPress={onOpenApproachClubPicker}
                accessibilityRole="button"
                accessibilityLabel={`Approach club, ${hole.approachClub || 'not set'}`}
                accessibilityHint="Opens approach club picker"
              >
                <Text style={styles.microLabel}>Approach</Text>
                <Text style={[styles.compactValue, !hole.approachClub && styles.compactValuePlaceholder]}>{hole.approachClub || 'e.g. 7 Iron'}</Text>
              </TouchableOpacity>
            )}
            {statPreferences.approachDistance && !isPar3 && (
              <TouchableOpacity
                style={styles.compactField}
                onPress={onOpenApproachDistancePicker}
                accessibilityRole="button"
                accessibilityLabel={`Approach distance, ${hole.approachDistance ? `${hole.approachDistance} yards` : 'not set'}`}
                accessibilityHint="Opens approach distance picker"
              >
                <Text style={styles.microLabel}>Distance</Text>
                <Text style={[styles.compactValue, !hole.approachDistance && styles.compactValuePlaceholder]}>
                  {hole.approachDistance || 'e.g. 150-200'}
                </Text>
              </TouchableOpacity>
            )}
            {trackPuttDistance && (
              <TouchableOpacity
                style={styles.compactField}
                onPress={() => firstPuttInputRef.current?.focus()}
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={`First putt distance in ${puttDistanceLabel}, ${puttDistanceDisplay || 'not set'}`}
              >
                <Text style={styles.microLabel}>First Putt ({puttDistanceLabel})</Text>
                <TextInput
                  ref={firstPuttInputRef}
                  value={puttDistanceDisplay}
                  onChangeText={(text) => {
                    const digits = text.replace(/[^0-9]/g, '');
                    if (!digits) {
                      setPuttDistance(currentHole, null);
                      return;
                    }
                    const parsed = parseInt(digits, 10);
                    if (Number.isNaN(parsed)) return;
                    setPuttDistance(currentHole, parsePuttDistanceToFeet(parsed, distanceUnit));
                  }}
                  placeholder="—"
                  keyboardType="numeric"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.compactValue, { minHeight: 28, paddingVertical: 4 }]}
                  accessibilityLabel={`First putt distance in ${puttDistanceLabel}`}
                />
              </TouchableOpacity>
            )}
          </View>
        </CollapsibleSection>
      )}
    </View>
  );
};
