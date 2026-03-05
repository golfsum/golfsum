import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type FIRResult = 'hit' | 'left' | 'right' | 'short' | 'long' | 'double-left' | 'double-right' | null;
type GIRResult = 'hit' | 'left' | 'right' | 'short' | 'long' | null;

interface StatInputSectionProps {
  par: number;
  viewMode: 'basic' | 'advanced';
  statPreferences: {
    fir: boolean;
    gir: boolean;
    scrambling: boolean;
    bunkers: boolean;
    penalties: boolean;
  };
  fir: FIRResult;
  gir: GIRResult;
  upDown: boolean | null;
  fairwayMissed: boolean;
  greenMissed: boolean;
  actionIconSize: number;
  onSetFir: (value: FIRResult) => void;
  onSetGir: (value: GIRResult) => void;
  onSetUpDown: (value: boolean | null) => void;
  onOpenPenaltySheet: () => void;
  renderDirectionPicker: (
    value: FIRResult | GIRResult,
    onChange: (next: FIRResult | GIRResult) => void
  ) => React.ReactNode;
  penaltyCount: number;
  penaltyStrokeCount: number;
  bunkerCount: number;
  styles: Record<string, any>;
}

export const StatInputSection: React.FC<StatInputSectionProps> = ({
  par,
  viewMode,
  statPreferences,
  fir,
  gir,
  upDown,
  fairwayMissed,
  greenMissed,
  actionIconSize,
  onSetFir,
  onSetGir,
  onSetUpDown,
  onOpenPenaltySheet,
  renderDirectionPicker,
  penaltyCount,
  penaltyStrokeCount,
  bunkerCount,
  styles,
}) => {
  const TOGGLE_ICON_SIZE = 16;
  const showFir = par !== 3 && statPreferences.fir;
  const showPar3FirHint = par === 3 && statPreferences.fir;
  const firStatusLabel = fir === 'hit' ? 'hit' : fir ? `missed ${fir}` : 'not tracked';
  const girStatusLabel = gir === 'hit' ? 'hit' : gir ? `missed ${gir}` : 'not tracked';
  const upDownStatusLabel = upDown === true ? 'saved' : upDown === false ? 'missed' : 'not tracked';
  const penaltyButtonLabel =
    penaltyStrokeCount > 0
      ? `Penalty & Bunker (${penaltyCount})`
      : bunkerCount > 0
        ? `Bunker (${bunkerCount})`
        : 'Add Penalty or Bunker';

  return (
    <>
      {viewMode === 'basic' && (
        <View style={styles.basicStatsSection}>
          {showFir && (
            <View style={styles.basicStatRow}>
              <Text style={styles.basicStatLabel}>Fairway</Text>
              <View style={styles.basicStatButtons}>
                <TouchableOpacity
                  style={[styles.basicStatButton, fir === 'hit' && styles.basicStatButtonHit]}
                  onPress={() => onSetFir(fir === 'hit' ? null : 'hit')}
                  accessibilityRole="button"
                  accessibilityLabel={`Fairway hit. Current fairway status: ${firStatusLabel}`}
                  accessibilityHint="Double tap to toggle fairway hit"
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={TOGGLE_ICON_SIZE}
                    color={fir === 'hit' ? '#10B981' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.basicStatButtonText,
                      fir === 'hit' && styles.basicStatButtonTextActive,
                    ]}
                  >
                    Hit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.basicStatButton, fir && fir !== 'hit' && styles.basicStatButtonMiss]}
                  onPress={() => onSetFir(fir && fir !== 'hit' ? null : 'left')}
                  accessibilityRole="button"
                  accessibilityLabel={`Fairway miss. Current fairway status: ${firStatusLabel}`}
                  accessibilityHint="Double tap to toggle fairway miss"
                >
                  <Ionicons
                    name="close-circle"
                    size={TOGGLE_ICON_SIZE}
                    color={fir && fir !== 'hit' ? '#EF4444' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.basicStatButtonText,
                      fir && fir !== 'hit' && styles.basicStatButtonTextMiss,
                    ]}
                  >
                    Miss
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {statPreferences.gir && (
            <View style={styles.basicStatRow}>
              <Text style={styles.basicStatLabel}>Green</Text>
              <View style={styles.basicStatButtons}>
                <TouchableOpacity
                  style={[styles.basicStatButton, gir === 'hit' && styles.basicStatButtonHit]}
                  onPress={() => onSetGir(gir === 'hit' ? null : 'hit')}
                  accessibilityRole="button"
                  accessibilityLabel={`Green hit. Current green status: ${girStatusLabel}`}
                  accessibilityHint="Double tap to toggle green hit"
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={TOGGLE_ICON_SIZE}
                    color={gir === 'hit' ? '#10B981' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.basicStatButtonText,
                      gir === 'hit' && styles.basicStatButtonTextActive,
                    ]}
                  >
                    Hit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.basicStatButton, gir && gir !== 'hit' && styles.basicStatButtonMiss]}
                  onPress={() => onSetGir(gir && gir !== 'hit' ? null : 'short')}
                  accessibilityRole="button"
                  accessibilityLabel={`Green miss. Current green status: ${girStatusLabel}`}
                  accessibilityHint="Double tap to toggle green miss"
                >
                  <Ionicons
                    name="close-circle"
                    size={TOGGLE_ICON_SIZE}
                    color={gir && gir !== 'hit' ? '#EF4444' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.basicStatButtonText,
                      gir && gir !== 'hit' && styles.basicStatButtonTextMiss,
                    ]}
                  >
                    Miss
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {viewMode === 'advanced' && (
        <View style={styles.shotsRow}>
          {showFir && (
            <View style={styles.shotColumn}>
              <Text style={styles.shotLabel}>Fairway</Text>
              <View style={styles.hitMissRow}>
                <TouchableOpacity
                  style={[styles.hitMissButton, fir === 'hit' && styles.hitMissButtonActive]}
                  onPress={() => onSetFir(fir === 'hit' ? null : 'hit')}
                  accessibilityRole="button"
                  accessibilityLabel={`Fairway hit. Current fairway status: ${firStatusLabel}`}
                  accessibilityHint="Double tap to toggle fairway hit"
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={TOGGLE_ICON_SIZE}
                    color={fir === 'hit' ? '#10B981' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.hitMissButtonText,
                      fir === 'hit' && styles.hitMissButtonTextActive,
                    ]}
                  >
                    Hit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.hitMissButton, fairwayMissed && styles.hitMissButtonMiss]}
                  onPress={() => onSetFir(fairwayMissed ? null : 'left')}
                  accessibilityRole="button"
                  accessibilityLabel={`Fairway miss direction. Current fairway status: ${firStatusLabel}`}
                  accessibilityHint="Double tap to toggle fairway miss and direction picker"
                >
                  <Ionicons
                    name="close-circle"
                    size={TOGGLE_ICON_SIZE}
                    color={fairwayMissed ? '#EF4444' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.hitMissButtonText,
                      fairwayMissed && styles.hitMissButtonTextMiss,
                    ]}
                  >
                    Miss
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={fairwayMissed ? '#EF4444' : '#6B7280'}
                  />
                </TouchableOpacity>
              </View>
              {fairwayMissed && renderDirectionPicker(fir, next => onSetFir(next as FIRResult))}
            </View>
          )}

          {statPreferences.gir && (
            <View style={styles.shotColumn}>
              <Text style={styles.shotLabel}>Green</Text>
              <View style={styles.hitMissRow}>
                <TouchableOpacity
                  style={[styles.hitMissButton, gir === 'hit' && styles.hitMissButtonActive]}
                  onPress={() => onSetGir(gir === 'hit' ? null : 'hit')}
                  accessibilityRole="button"
                  accessibilityLabel={`Green hit. Current green status: ${girStatusLabel}`}
                  accessibilityHint="Double tap to toggle green hit"
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={TOGGLE_ICON_SIZE}
                    color={gir === 'hit' ? '#10B981' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.hitMissButtonText,
                      gir === 'hit' && styles.hitMissButtonTextActive,
                    ]}
                  >
                    Hit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.hitMissButton, greenMissed && styles.hitMissButtonMiss]}
                  onPress={() => onSetGir(greenMissed ? null : 'left')}
                  accessibilityRole="button"
                  accessibilityLabel={`Green miss direction. Current green status: ${girStatusLabel}`}
                  accessibilityHint="Double tap to toggle green miss and direction picker"
                >
                  <Ionicons
                    name="close-circle"
                    size={TOGGLE_ICON_SIZE}
                    color={greenMissed ? '#EF4444' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.hitMissButtonText,
                      greenMissed && styles.hitMissButtonTextMiss,
                    ]}
                  >
                    Miss
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={greenMissed ? '#EF4444' : '#6B7280'}
                  />
                </TouchableOpacity>
              </View>
              {greenMissed && renderDirectionPicker(gir, next => onSetGir(next as GIRResult))}
            </View>
          )}
        </View>
      )}

      {showPar3FirHint && (
        <View style={styles.par3FirHintRow}>
          <Text style={styles.par3FirHintDash}>—</Text>
          <Text style={styles.par3FirHintText}>Par 3s do not track fairways</Text>
        </View>
      )}

      {viewMode === 'advanced' &&
        statPreferences.scrambling &&
        gir !== null &&
        gir !== 'hit' && (
          <View style={styles.scrambleSection}>
            <Text style={styles.scrambleLabel}>Up &amp; Down</Text>
            <View style={styles.scrambleButtons}>
              <TouchableOpacity
                style={[styles.scrambleButton, upDown === true && styles.scrambleButtonActive]}
                onPress={() => onSetUpDown(upDown === true ? null : true)}
                accessibilityRole="button"
                accessibilityLabel={`Up and down saved. Current up and down status: ${upDownStatusLabel}`}
                accessibilityHint="Double tap to toggle up and down saved"
              >
                <Ionicons
                  name="checkmark-circle"
                  size={actionIconSize}
                  color={upDown === true ? '#10B981' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.scrambleButtonText,
                    upDown === true && styles.scrambleButtonTextActive,
                  ]}
                >
                  Saved
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scrambleButton, upDown === false && styles.scrambleButtonMiss]}
                onPress={() => onSetUpDown(upDown === false ? null : false)}
                accessibilityRole="button"
                accessibilityLabel={`Up and down missed. Current up and down status: ${upDownStatusLabel}`}
                accessibilityHint="Double tap to toggle up and down missed"
              >
                <Ionicons
                  name="close-circle"
                  size={actionIconSize}
                  color={upDown === false ? '#EF4444' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.scrambleButtonText,
                    upDown === false && styles.scrambleButtonTextMiss,
                  ]}
                >
                  Missed
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      {(statPreferences.bunkers || statPreferences.penalties) && (
        <TouchableOpacity
          style={styles.addPenaltyButton}
          onPress={onOpenPenaltySheet}
          accessibilityRole="button"
          accessibilityLabel={`Add penalty or bunker. ${penaltyCount} recorded on this hole`}
          accessibilityHint="Opens penalty and bunker options"
        >
          <Ionicons name="add-circle" size={20} color="#10B981" />
          <Text style={styles.addPenaltyButtonText}>{penaltyButtonLabel}</Text>
          {penaltyCount > 0 && (
            <View style={[styles.badge, penaltyStrokeCount > 0 ? styles.badgePenalty : styles.badgeNeutral]}>
              <Text style={styles.badgeText}>{penaltyCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </>
  );
};
