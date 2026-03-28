import React from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SuggestedClubChip from './SuggestedClubChip';
import { YardagePanel } from './YardagePanel';
import { colors, radius } from '../../theme/tokens';
import { getScoreColor } from '../../utils/scoreColors';
import { rs } from '../../utils/responsive';
import { GPS_HUD, GPS_Z } from '../../constants/gpsLayout';
import { formatAccuracy, formatYardage, unitSuffix } from '../../utils/units';

export function GpsRoundHud({
  suggestion,
  holeNumber,
  displayNudge = null,
  showNudgeCard = false,
  nudgeOverlayBottom = 0,
  onPressSuggestion,
  onLongPressSuggestion,
  suggestionActive = false,
  showSuggestionChip = false,
  suggestionChipPickedLabel = null,
  bottomBarHeight,
  yardageBarHeight,
  currentPutts,
  onDecrementPutts,
  onIncrementPutts,
  addShotLabel = 'ADD SHOT',
  onPressAddShot,
  addShotActive = false,
  onPressEditShot = null,
  yardages,
  compactYardage = false,
  bottomInset = 0,
  quietLinks = [],
  gpsQuality = 'good',
  gpsAccuracyMeters = null,
  distanceUnit = 'yards',
  greenTarget = 'center',
  onGreenTargetChange,
  manualMode = false,
  manualYardage = '',
  onManualYardageChange,
  onNextHole,
  isLastHole = false,
  nextHolePulse = false,
  holeScore = null,
  holePar = 4,
  onScorePress,
  isPlacing = false,
  showPlacementInstruction = false,
  placementClub = null,
  placementLie = null,
  placementDistance = null,
  onCancelPlacement,
  onConfirmPlacement,
  onCycleLie,
  onOpenClubPicker,
  placementInstructionText = null,
}) {
  /** Use full device inset — parent uses absolute fill; trimming caused overlap with home indicator. */
  const effectiveBottomInset = Math.max(
    0,
    bottomInset,
    /** Android edge-to-edge: gesture nav sometimes reports 0 — keep controls above system bar. */
    Platform.OS === 'android' ? 12 : 0,
  );

  const barDockBottom = bottomBarHeight + effectiveBottomInset;
  /** Extra band above the dock (placement distance / manual entry); native `yardageBarHeight` is often 0 in layout constants. */
  const yardageBandH = isPlacing
    ? Math.max(yardageBarHeight, 38)
    : manualMode
      ? Math.max(yardageBarHeight, 52)
      : 0;
  const warningBottomOffset = barDockBottom + yardageBandH + (yardageBandH > 0 ? 6 : 4);

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {showNudgeCard && displayNudge ? (
        <View
          style={[
            styles.nudgeCard,
            { bottom: nudgeOverlayBottom },
            displayNudge.tone === 'green'
              ? styles.nudgeCardGreen
              : displayNudge.tone === 'red'
                ? styles.nudgeCardRed
                : styles.nudgeCardAmber,
          ]}
        >
          <View
            style={[
              styles.nudgeAccent,
              displayNudge.tone === 'green'
                ? styles.nudgeAccentGreen
                : displayNudge.tone === 'red'
                  ? styles.nudgeAccentRed
                  : styles.nudgeAccentAmber,
            ]}
          />
          <View style={styles.nudgeCopy}>
            <Text style={styles.nudgeTitle}>{displayNudge.title}</Text>
            <Text style={styles.nudgeBody}>{displayNudge.body}</Text>
            {displayNudge.support ? (
              <Text style={styles.nudgeSupport}>{displayNudge.support}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {quietLinks.length ? (
        <View style={[styles.linkStack, { bottom: barDockBottom + yardageBarHeight + GPS_HUD.FLOAT_GAP }]}>
          {quietLinks.map((link) => (
            <TouchableOpacity key={link.id} onPress={link.onPress} style={styles.linkButton}>
              <Text style={styles.linkText}>{link.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {isPlacing && (
        // NOTE: instructionBanner is shown only while we're waiting for the tap-to-place tap.
        showPlacementInstruction && (
          <View
            style={[
              styles.instructionBanner,
              { bottom: barDockBottom + (isPlacing ? yardageBandH : 0) + GPS_HUD.FLOAT_GAP },
            ]}
          >
            <Text style={styles.instructionText}>{placementInstructionText || 'Tap the map where this shot started'}</Text>
            <TouchableOpacity onPress={onCancelPlacement}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )
      )}

      <View style={[styles.bottomBarWrap, { paddingBottom: effectiveBottomInset, zIndex: GPS_Z.HUD_OVERLAY }]}>
        {isPlacing ? (
          <View style={[styles.bottomActionBar, { height: bottomBarHeight }]}>
            <TouchableOpacity style={styles.placementCancelBtn} onPress={onCancelPlacement}>
              <Ionicons name="close" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.placementLieChip} onPress={onCycleLie}>
              {placementLie?.color && (
                <View style={[styles.placementLieDot, { backgroundColor: placementLie.color }]} />
              )}
              <Text style={[styles.placementLieText, placementLie?.color && { color: placementLie.color }]}>
                {placementLie?.lie || 'Lie'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.placementClubChip} onPress={onOpenClubPicker}>
              <Text style={styles.placementClubText}>{placementClub || 'Club'}</Text>
              <Ionicons name="chevron-down" size={10} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.placementDoneBtn} onPress={onConfirmPlacement}>
              <Ionicons name="checkmark" size={16} color="#0f1419" />
              <Text style={styles.placementDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.bottomActionBar, { height: bottomBarHeight }]}>
            {showSuggestionChip && suggestion ? (
              <TouchableOpacity
                style={[styles.suggestionInlineCard, suggestionActive && styles.suggestedWrapActive]}
                onPress={onPressSuggestion}
                onLongPress={onLongPressSuggestion}
                delayLongPress={380}
                activeOpacity={0.88}
              >
                <SuggestedClubChip
                  suggestion={suggestion}
                  pickedClubLabel={suggestionChipPickedLabel}
                  compact
                />
              </TouchableOpacity>
            ) : null}

            <View style={styles.puttStepper}>
              <TouchableOpacity
                style={[styles.puttStepperButton, currentPutts <= 0 && styles.puttStepperButtonDisabled]}
                onPress={onDecrementPutts}
                disabled={currentPutts <= 0}
              >
                <Text style={[styles.puttStepperButtonText, currentPutts <= 0 && styles.puttStepperButtonTextDisabled]}>-</Text>
              </TouchableOpacity>
              <View style={styles.puttStepperValueWrap}>
                <Text style={styles.puttStepperValue}>{currentPutts}</Text>
                <Text style={styles.puttStepperLabel}>PUTTS</Text>
              </View>
              <TouchableOpacity style={styles.puttStepperButton} onPress={onIncrementPutts}>
                <Text style={styles.puttStepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.shotActionStack}>
              <TouchableOpacity
                style={[styles.addShotButton, addShotActive && styles.addShotButtonActive]}
                onPress={onPressAddShot}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addShotButtonText}>{addShotLabel}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.scoreNextContainer}>
              <TouchableOpacity style={styles.scoreZone} onPress={onScorePress}>
                <Text style={styles.scoreZoneLabel}>SCORE</Text>
                <Text style={[styles.scoreZoneValue, { color: holeScore != null ? getScoreColor(holeScore, holePar) : 'rgba(255,255,255,0.3)' }]}>
                  {holeScore != null ? holeScore : '\u2014'}
                </Text>
              </TouchableOpacity>
              <View style={styles.scoreNextDivider} />
              <TouchableOpacity style={styles.nextZone} onPress={onNextHole}>
                <Text style={[styles.nextZoneText, isLastHole && { color: '#4CAF7D' }]}>
                  {isLastHole ? 'Finish' : 'Next'}
                </Text>
                <Ionicons
                  name={isLastHole ? 'flag-outline' : 'chevron-forward'}
                  size={13}
                  color={isLastHole ? '#4CAF7D' : 'rgba(255,255,255,0.7)'}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {isPlacing ? (
        <View
          style={[
            styles.yardageBarFrame,
            styles.hudBandAboveDock,
            { bottom: barDockBottom, height: yardageBandH },
          ]}
        >
          <View style={styles.placementDistRow}>
            <Text style={styles.placementDistLabel}>TO GREEN</Text>
            <Text style={styles.placementDistValue}>{placementDistance != null ? (distanceUnit === 'meters' ? Math.round(placementDistance * 0.9144) : Math.round(placementDistance)) : '--'}</Text>
            <Text style={styles.placementDistUnit}>{distanceUnit === 'meters' ? 'm' : 'yds'}</Text>
          </View>
        </View>
      ) : (
        <>
          {manualMode ? (
            <View
              style={[
                styles.yardageBarFrame,
                styles.hudBandAboveDock,
                { bottom: barDockBottom, height: yardageBandH },
              ]}
            >
              <View style={styles.manualInputRow}>
                <Text style={styles.manualLabel}>DISTANCE ({distanceUnit === 'meters' ? 'm' : 'yds'})</Text>
                <TextInput
                  style={styles.manualInput}
                  value={manualYardage}
                  onChangeText={onManualYardageChange}
                  keyboardType="number-pad"
                  placeholder="Enter yardage"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  maxLength={4}
                />
                <Text style={styles.manualChip}>MANUAL</Text>
              </View>
            </View>
          ) : null}
          {gpsQuality === 'fair' && gpsAccuracyMeters != null ? (
            <View style={[styles.gpsWarningBand, { bottom: warningBottomOffset }]}>
              <Text style={styles.gpsWarning}>GPS accuracy {formatAccuracy(gpsAccuracyMeters, distanceUnit)}</Text>
            </View>
          ) : gpsQuality === 'poor' ? (
            <View style={[styles.gpsWarningBand, { bottom: warningBottomOffset }]}>
              <Text style={styles.gpsWarning}>GPS accuracy low. Distance may be off.</Text>
            </View>
          ) : gpsQuality === 'none' ? (
            <View style={[styles.gpsWarningBand, { bottom: warningBottomOffset }]}>
              <Text style={styles.gpsWarning}>No GPS signal. Tap for manual mode.</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: GPS_Z.HUD_WRAP,
  },
  nudgeCard: {
    position: 'absolute',
    left: GPS_HUD.NUDGE_HORIZONTAL_INSET,
    right: GPS_HUD.NUDGE_HORIZONTAL_INSET,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingVertical: 10,
    paddingRight: 12,
    zIndex: GPS_Z.HUD_NUDGE_CARD,
  },
  nudgeCardGreen: {
    borderColor: colors.brand.primaryBorder,
  },
  nudgeCardAmber: {
    borderColor: 'rgba(251,191,36,0.28)',
  },
  nudgeCardRed: {
    borderColor: 'rgba(248,113,113,0.28)',
  },
  nudgeAccent: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: 10,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  nudgeAccentGreen: {
    backgroundColor: colors.brand.primary,
  },
  nudgeAccentAmber: {
    backgroundColor: '#FBBF24',
  },
  nudgeAccentRed: {
    backgroundColor: '#F87171',
  },
  nudgeCopy: {
    flex: 1,
  },
  nudgeTitle: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  nudgeBody: {
    color: '#E5E7EB',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  nudgeSupport: {
    color: colors.text.tertiary,
    fontSize: 10,
    marginTop: 4,
  },
  linkStack: {
    position: 'absolute',
    left: GPS_HUD.NUDGE_HORIZONTAL_INSET,
    right: GPS_HUD.NUDGE_HORIZONTAL_INSET,
    alignItems: 'flex-start',
    zIndex: GPS_Z.HUD_LINK_STACK,
    gap: 4,
  },
  linkButton: {
    paddingVertical: 2,
  },
  linkText: {
    color: '#64748B',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  bottomBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
  },
  bottomActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 0,
    paddingTop: 3,
    paddingBottom: 2,
  },
  suggestedWrapActive: {
    backgroundColor: colors.brand.primaryMuted,
    borderColor: colors.brand.primaryBorder,
  },
  suggestionInlineCard: {
    flexShrink: 0,
    borderRadius: radius.md,
    marginRight: 0,
  },
  puttStepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,6,6,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    paddingHorizontal: 3,
    paddingVertical: 0,
    minWidth: 76,
    height: 36,
    overflow: 'hidden',
  },
  puttStepperButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  puttStepperButtonText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  puttStepperButtonDisabled: {
    opacity: 0.35,
  },
  puttStepperButtonTextDisabled: {
    color: 'rgba(255,255,255,0.35)',
  },
  puttStepperValueWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 42,
    paddingHorizontal: 4,
  },
  puttStepperValue: {
    color: colors.text.primary,
    fontSize: rs(18),
    fontWeight: '800',
    lineHeight: rs(18),
  },
  puttStepperLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  scoreNextContainer: {
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(6,6,6,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  scoreZone: {
    width: 48,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRightWidth: 0.5,
    borderRightColor: 'rgba(255,255,255,0.15)',
  },
  scoreZoneLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.5,
  },
  scoreZoneValue: {
    fontSize: rs(17),
    fontWeight: '800',
  },
  scoreNextDivider: {
    width: 0,
  },
  nextZone: {
    paddingHorizontal: 8,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  nextZoneText: {
    fontSize: rs(12),
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  addShotButton: {
    width: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(6,6,6,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(26,200,75,0.38)',
    borderRadius: 10,
    paddingVertical: 0,
    height: 36,
  },
  addShotButtonActive: {
    borderColor: colors.brand.primaryBorder,
    backgroundColor: 'rgba(6,6,6,0.72)',
  },
  addShotButtonText: {
    color: '#3ddb72',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  shotActionStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 2,
  },
  yardageBarFrame: {
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  /** Pinned above the bottom action bar (which is `position: 'absolute'`). In-flow siblings were laying out at the top of the HUD. */
  hudBandAboveDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: GPS_Z.HUD_OVERLAY - 1,
    paddingHorizontal: 10,
  },
  gpsWarningBand: {
    position: 'absolute',
    left: GPS_HUD.INSTRUCTION_BANNER_INSET,
    right: GPS_HUD.INSTRUCTION_BANNER_INSET,
    zIndex: GPS_Z.HUD_OVERLAY - 1,
    alignItems: 'center',
  },
  yardageDetailsWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  gpsWarning: {
    color: '#FBBF24',
    fontSize: 11,
    textAlign: 'center',
    paddingBottom: 4,
  },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: 8,
  },
  manualLabel: {
    color: colors.text.secondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  manualInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  manualChip: {
    color: '#FBBF24',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  instructionBanner: {
    position: 'absolute',
    left: GPS_HUD.INSTRUCTION_BANNER_INSET,
    right: GPS_HUD.INSTRUCTION_BANNER_INSET,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: GPS_Z.HUD_OVERLAY,
  },
  instructionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  cancelText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  // ─── Placement mode ─────────────────────────────────
  placementCancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  placementLieChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  placementLieDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  placementLieText: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  placementClubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  placementClubText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  placementDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.brand.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  placementDoneBtnText: {
    color: '#0f1419',
    fontSize: 12,
    fontWeight: '700',
  },
  placementDistRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  placementDistLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginRight: 4,
  },
  placementDistValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  placementDistUnit: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default GpsRoundHud;
