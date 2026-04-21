import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HoleSelectorBar } from './HoleSelectorBar';

type GpsTeeOption = {
  name: string;
  color?: string;
  totalYards: number;
};

type GpsRouteOption = {
  id: string;
  label: string;
  holeNumbers: number[];
  holeCount: number;
};

type GpsCourseVariantOption = {
  id: string;
  label: string;
  subtitle?: string;
};

type RoundLength = '18' | 'front9' | 'back9';

type Props = {
  visible: boolean;
  loading?: boolean;
  courseName?: string;
  courseLocation?: string;
  teeOptions: GpsTeeOption[];
  courseVariants?: GpsCourseVariantOption[];
  selectedCourseVariantId?: string | null;
  onSelectCourseVariant?: (courseId: string) => void;
  routeOptions?: GpsRouteOption[];
  selectedRouteId?: string | null;
  routeHoleNumbers?: number[];
  onSelectRoute?: (routeId: string) => void;
  selectedTeeName: string;
  onSelectTee: (teeName: string) => void;
  /** Optional: the tee the user played most recently at this course. Renders a
   *  "Last played" tag beside that tee so it's recognisable even when the
   *  default selection has already moved on. */
  lastPlayedTeeName?: string | null;
  startingHole: number;
  holesWithData?: number[];
  roundLength: RoundLength;
  onSelectRoundLength: (value: RoundLength) => void;
  onSelectStartingHole: (hole: number) => void;
  tournamentMode: boolean;
  onToggleTournamentMode: (value: boolean) => void;
  reportPromptText?: string | null;
  onPressReportPrompt?: (() => void) | null;
  onClose: () => void;
  onConfirm: () => void;
  onPlanCourse?: () => void;
};

type Step = 1 | 2 | 3;
type LayoutChoice = {
  id: string;
  label: string;
  subtitle?: string;
  holeCount?: number;
  totalYards?: number;
  kind: 'course' | 'route';
};

const ROUND_LENGTH_OPTIONS: Array<{ key: RoundLength; label: string }> = [
  { key: '18', label: '18 Holes' },
  { key: 'front9', label: 'Front 9' },
  { key: 'back9', label: 'Back 9' },
];

const TEE_COLORS: Record<string, string> = {
  black: '#1A1A1A',
  blue: '#60A5FA',
  white: '#F8FAFC',
  silver: '#94A3B8',
  gold: '#F6C90E',
  yellow: '#FBBF24',
  copper: '#D97706',
  topaz: '#F59E0B',
  red: '#F87171',
  green: '#4CAF7D',
  orange: '#FB923C',
  bronze: '#B7791F',
  gray: '#9CA3AF',
  grey: '#9CA3AF',
};

function normalizeToken(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function isCombinationTeeName(name?: string) {
  return /[\/+]/.test(String(name || ''));
}

function categorizeTees(tees: GpsTeeOption[]) {
  const standard = tees.filter((tee) => !isCombinationTeeName(tee.name));
  const combination = tees.filter((tee) => isCombinationTeeName(tee.name));
  return { standard, combination };
}

function getTeePillColors(teeName?: string, fallbackColor?: string) {
  const parts = String(teeName || '')
    .toLowerCase()
    .split(/[\/+]/)
    .map((part) => normalizeToken(part))
    .filter(Boolean);

  if (parts.length <= 1) {
    const color = TEE_COLORS[parts[0] || ''] || fallbackColor || '#888888';
    return { type: 'standard' as const, color };
  }

  return {
    type: 'combination' as const,
    colorA: TEE_COLORS[parts[0]] || fallbackColor || '#888888',
    colorB: TEE_COLORS[parts[1]] || fallbackColor || '#888888',
  };
}

function formatYards(totalYards?: number) {
  if (!Number.isFinite(totalYards) || Number(totalYards) <= 0) return '--';
  return `${Number(totalYards).toLocaleString()} yds`;
}

function TeePill({
  teeName,
  color,
  compact = false,
}: {
  teeName?: string;
  color?: string;
  compact?: boolean;
}) {
  const pill = getTeePillColors(teeName, color);

  return (
    <View style={[styles.teePill, compact && styles.teePillCompact]}>
      {pill.type === 'standard' ? (
        <View style={[styles.teePillSingle, { backgroundColor: pill.color }]} />
      ) : (
        <>
          <View style={[styles.teePillSlice, { backgroundColor: pill.colorA }]} />
          <View style={styles.teePillDivider} />
          <View style={[styles.teePillSlice, { backgroundColor: pill.colorB }]} />
        </>
      )}
    </View>
  );
}

function StepIndicator({
  totalSteps,
  activeIndex,
}: {
  totalSteps: number;
  activeIndex: number;
}) {
  return (
    <View style={styles.stepPills}>
      {Array.from({ length: totalSteps }, (_, index) => {
        const state =
          index < activeIndex ? 'completed' : index === activeIndex ? 'active' : 'future';
        return (
          <View
            key={`step-${index}`}
            style={[
              styles.stepPill,
              state === 'active' && styles.stepPillActive,
              state === 'completed' && styles.stepPillCompleted,
            ]}
          />
        );
      })}
    </View>
  );
}

function SummaryBar({
  hasLayoutStep,
  layoutLabel,
  teeLabel,
  teeYards,
  teeColor,
  onEditLayout,
  onEditTee,
}: {
  hasLayoutStep: boolean;
  layoutLabel?: string;
  teeLabel?: string;
  teeYards?: number;
  teeColor?: string;
  onEditLayout: () => void;
  onEditTee: () => void;
}) {
  return (
    <View style={styles.summaryBar}>
      {hasLayoutStep && layoutLabel ? (
        <TouchableOpacity style={styles.summaryChip} onPress={onEditLayout}>
          <Ionicons name="chevron-back" size={13} color="#A7F3D0" />
          <Text style={styles.summaryText} numberOfLines={1}>
            {layoutLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.summaryChip} onPress={onEditTee}>
        <Ionicons name="chevron-back" size={13} color="#A7F3D0" />
        <TeePill teeName={teeLabel} color={teeColor} compact />
        <Text style={styles.summaryText} numberOfLines={1}>
          {teeLabel || 'Select tee'} · {formatYards(teeYards)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function GpsRoundSetupModal({
  visible,
  loading = false,
  courseName,
  courseLocation,
  teeOptions,
  courseVariants = [],
  selectedCourseVariantId,
  onSelectCourseVariant,
  routeOptions = [],
  selectedRouteId,
  routeHoleNumbers = [],
  onSelectRoute,
  selectedTeeName,
  onSelectTee,
  lastPlayedTeeName,
  startingHole,
  holesWithData = [],
  roundLength,
  onSelectRoundLength,
  onSelectStartingHole,
  tournamentMode,
  onToggleTournamentMode,
  reportPromptText = null,
  onPressReportPrompt = null,
  onClose,
  onConfirm,
  onPlanCourse,
}: Props) {
  const [currentStep, setCurrentStep] = useState<Step>(2);
  const [showCombinationTees, setShowCombinationTees] = useState(false);

  const { standard: standardTees, combination: combinationTees } = useMemo(
    () => categorizeTees(teeOptions),
    [teeOptions]
  );

  const selectedTee = useMemo(
    () =>
      teeOptions.find(
        (tee) => tee.name.trim().toLowerCase() === selectedTeeName.trim().toLowerCase()
      ) || null,
    [selectedTeeName, teeOptions]
  );

  const routeLayoutChoices = useMemo<LayoutChoice[]>(
    () =>
      routeOptions.map((route) => ({
        id: route.id,
        label: route.label,
        subtitle: `${route.holeCount} holes`,
        holeCount: route.holeCount,
        kind: 'route',
      })),
    [routeOptions]
  );

  const courseLayoutChoices = useMemo<LayoutChoice[]>(
    () =>
      courseVariants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        subtitle: variant.subtitle,
        kind: 'course',
      })),
    [courseVariants]
  );

  const layoutChoices = courseLayoutChoices.length > 1 ? courseLayoutChoices : routeLayoutChoices;
  const hasLayoutStep = layoutChoices.length > 1;
  const totalSteps = hasLayoutStep ? 3 : 2;
  const activeStepIndex = hasLayoutStep ? currentStep - 1 : currentStep - 2;
  const selectedLayoutChoice = useMemo(() => {
    if (courseLayoutChoices.length > 1) {
      return (
        courseLayoutChoices.find((choice) => choice.id === selectedCourseVariantId) || null
      );
    }

    if (routeLayoutChoices.length > 1) {
      return routeLayoutChoices.find((choice) => choice.id === selectedRouteId) || null;
    }

    return null;
  }, [courseLayoutChoices, routeLayoutChoices, selectedCourseVariantId, selectedRouteId]);

  const holeNumbers = useMemo(() => {
    if (routeHoleNumbers.length > 0) return routeHoleNumbers;
    if (roundLength === 'front9') return Array.from({ length: 9 }, (_, index) => index + 1);
    if (roundLength === 'back9') return Array.from({ length: 9 }, (_, index) => index + 10);
    return Array.from({ length: 18 }, (_, index) => index + 1);
  }, [routeHoleNumbers, roundLength]);

  const isRoundLengthLocked = routeHoleNumbers.length > 0 && routeOptions.length > 0;

  useEffect(() => {
    if (!visible) return;
    setCurrentStep(hasLayoutStep ? 1 : 2);
    setShowCombinationTees(false);
  }, [visible, hasLayoutStep, selectedCourseVariantId, selectedRouteId]);

  const handleSelectLayout = (choice: LayoutChoice) => {
    if (choice.kind === 'course') {
      onSelectCourseVariant?.(choice.id);
      return;
    }
    onSelectRoute?.(choice.id);
  };

  const handleBack = () => {
    if (currentStep === 3) {
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (hasLayoutStep) {
        setCurrentStep(1);
        return;
      }
      onClose();
      return;
    }

    onClose();
  };

  const handleNext = () => {
    if (currentStep === 1) {
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      setCurrentStep(3);
    }
  };

  const isLayoutReady = !hasLayoutStep || !!selectedLayoutChoice;
  const isTeeReady = teeOptions.length === 0 || !!selectedTee;
  const currentStepTitle =
    currentStep === 1 ? 'Course Layout' : currentStep === 2 ? 'Tee Box' : 'Round Options';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.kicker}>GPS Round Setup</Text>
                <Text style={styles.courseName} numberOfLines={1}>
                  {courseName || 'Golf Course'}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {currentStepTitle}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={18} color="#DCE6F4" />
              </TouchableOpacity>
            </View>

            <View style={styles.headerMetaRow}>
              <Text style={styles.locationText} numberOfLines={1}>
                {courseLocation || ''}
              </Text>
              <View style={styles.stepIndicatorWrap}>
                <Text style={styles.stepCountText}>
                  Step {activeStepIndex + 1} of {totalSteps}
                </Text>
                <StepIndicator totalSteps={totalSteps} activeIndex={activeStepIndex} />
              </View>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#4CAF7D" />
              <Text style={styles.loadingText}>Loading tee data</Text>
            </View>
          ) : (
            <>
              {currentStep === 1 ? (
                <View style={styles.stepBody}>
                  <Text style={styles.sectionIntro}>Pick the layout.</Text>
                  <ScrollView
                    style={styles.scrollRegion}
                    contentContainerStyle={styles.scrollRegionContent}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                  >
                    {layoutChoices.map((choice) => {
                      const active =
                        choice.kind === 'course'
                          ? choice.id === selectedCourseVariantId
                          : choice.id === selectedRouteId;
                      return (
                        <TouchableOpacity
                          key={choice.id}
                          style={[styles.layoutCard, active && styles.layoutCardActive]}
                          onPress={() => handleSelectLayout(choice)}
                        >
                          <Text style={[styles.layoutTitle, active && styles.layoutTitleActive]}>
                            {choice.label}
                          </Text>
                          <Text style={styles.layoutSubtitle}>
                            {choice.subtitle ||
                              `${choice.holeCount || 18} holes · ${formatYards(choice.totalYards)}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {currentStep === 2 ? (
                <View style={styles.stepBody}>
                  <Text style={styles.sectionIntro}>Pick your tee.</Text>
                  <ScrollView
                    style={styles.scrollRegion}
                    contentContainerStyle={styles.scrollRegionContent}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                  >
                    {standardTees.map((tee) => {
                      const nameLower = tee.name.trim().toLowerCase();
                      const active = nameLower === selectedTeeName.trim().toLowerCase();
                      const isLastPlayed = !!lastPlayedTeeName
                        && nameLower === lastPlayedTeeName.trim().toLowerCase();
                      return (
                        <TouchableOpacity
                          key={tee.name}
                          style={[styles.teeCard, active && styles.teeCardActive]}
                          onPress={() => onSelectTee(tee.name)}
                        >
                          <TeePill teeName={tee.name} color={tee.color} />
                          <View style={styles.teeCopy}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.teeTitle, active && styles.teeTitleActive]}>
                                {tee.name}
                              </Text>
                              {isLastPlayed ? (
                                <View style={styles.lastPlayedTag}>
                                  <Text style={styles.lastPlayedTagText}>Last played</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.teeSubtitle}>{formatYards(tee.totalYards)}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {combinationTees.length > 0 ? (
                      <>
                        <TouchableOpacity
                          style={styles.moreOptionsButton}
                          onPress={() => setShowCombinationTees((current) => !current)}
                        >
                          <Text style={styles.moreOptionsText}>
                            More tee options ({combinationTees.length})
                          </Text>
                          <Ionicons
                            name={showCombinationTees ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color="#A7F3D0"
                          />
                        </TouchableOpacity>

                        {showCombinationTees
                          ? combinationTees.map((tee) => {
                              const active =
                                tee.name.trim().toLowerCase() ===
                                selectedTeeName.trim().toLowerCase();
                              return (
                                <TouchableOpacity
                                  key={tee.name}
                                  style={[styles.teeCard, active && styles.teeCardActive]}
                                  onPress={() => onSelectTee(tee.name)}
                                >
                                  <TeePill teeName={tee.name} color={tee.color} />
                                  <View style={styles.teeCopy}>
                                    <Text
                                      style={[styles.teeTitle, active && styles.teeTitleActive]}
                                    >
                                      {tee.name}
                                    </Text>
                                    <Text style={styles.teeSubtitle}>
                                      {formatYards(tee.totalYards)}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })
                          : null}
                      </>
                    ) : null}

                    {teeOptions.length === 0 ? (
                      <View style={styles.emptyCard}>
                        <Text style={styles.emptyCardTitle}>No tee data here yet</Text>
                        <Text style={styles.emptyCardBody}>
                          Start the round anyway. Some yardages may be missing.
                        </Text>
                      </View>
                    ) : null}

                    {reportPromptText && onPressReportPrompt ? (
                      <TouchableOpacity style={styles.reportPromptWrap} onPress={onPressReportPrompt}>
                        <Text style={styles.reportPromptText}>{reportPromptText}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </ScrollView>
                </View>
              ) : null}

              {currentStep === 3 ? (
                <View style={styles.optionsBody}>
                  <SummaryBar
                    hasLayoutStep={hasLayoutStep}
                    layoutLabel={selectedLayoutChoice?.label}
                    teeLabel={selectedTee?.name}
                    teeYards={selectedTee?.totalYards}
                    teeColor={selectedTee?.color}
                    onEditLayout={() => hasLayoutStep && setCurrentStep(1)}
                    onEditTee={() => setCurrentStep(2)}
                  />

                  <View style={styles.optionsSection}>
                    <Text style={styles.optionsLabel}>Round Length</Text>
                    <View style={styles.segmentedWrap}>
                      {ROUND_LENGTH_OPTIONS.map((option) => {
                        const active = option.key === roundLength;
                        return (
                          <TouchableOpacity
                            key={option.key}
                            style={[
                              styles.segmentButton,
                              active && styles.segmentButtonActive,
                              isRoundLengthLocked && styles.segmentButtonLocked,
                            ]}
                            onPress={() => !isRoundLengthLocked && onSelectRoundLength(option.key)}
                            disabled={isRoundLengthLocked}
                          >
                            <Text
                              style={[
                                styles.segmentText,
                                active && styles.segmentTextActive,
                                isRoundLengthLocked && styles.segmentTextLocked,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.optionsSection}>
                    <Text style={styles.optionsLabel}>Starting Hole</Text>
                    <HoleSelectorBar
                      holeNumbers={holeNumbers}
                      selectedHole={startingHole}
                      onSelect={onSelectStartingHole}
                      holesWithData={holesWithData}
                      contentContainerStyle={styles.holeSelectorContent}
                    />
                  </View>

                  <View style={styles.tournamentRow}>
                    <View style={styles.tournamentCopy}>
                      <Text style={styles.tournamentTitle}>Tournament Mode</Text>
                      <Text style={styles.tournamentBody}>
                        Wind and yardage adjustments stay on during the round.
                      </Text>
                    </View>
                    <Switch
                      value={tournamentMode}
                      onValueChange={onToggleTournamentMode}
                      trackColor={{ false: '#334155', true: '#4CAF7D' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
              ) : null}
            </>
          )}

          {!loading ? (
            <View style={styles.footer}>
              {currentStep === 3 ? (
                <View style={{ width: '100%' }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={styles.secondaryButton} onPress={handleBack}>
                      <Text style={styles.secondaryButtonText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryButton, !isTeeReady && styles.primaryButtonDisabled]}
                      onPress={onConfirm}
                      disabled={!isTeeReady}
                    >
                      <Text style={styles.primaryButtonText}>Start GPS Round</Text>
                    </TouchableOpacity>
                  </View>
                  {onPlanCourse && (
                    <TouchableOpacity onPress={onPlanCourse} style={{ alignSelf: 'center', marginTop: 10 }}>
                      <Text style={{ color: '#60A5FA', fontSize: 13, fontWeight: '500' }}>Plan this round first</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <>
                  <TouchableOpacity style={styles.secondaryButton} onPress={handleBack}>
                    <Text style={styles.secondaryButtonText}>
                      {currentStep === 1 || !hasLayoutStep ? 'Cancel' : 'Back'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      ((currentStep === 1 && !isLayoutReady) ||
                        (currentStep === 2 && !isTeeReady)) &&
                        styles.primaryButtonDisabled,
                    ]}
                    onPress={handleNext}
                    disabled={(currentStep === 1 && !isLayoutReady) || (currentStep === 2 && !isTeeReady)}
                  >
                    <Text style={styles.primaryButtonText}>Next</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export default GpsRoundSetupModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    minHeight: 560,
    maxHeight: 760,
    borderRadius: 22,
    backgroundColor: '#182233',
    borderWidth: 1,
    borderColor: '#243041',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
  },
  header: {
    marginBottom: 14,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  courseName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: '#A7F3D0',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#314256',
    backgroundColor: '#132031',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  locationText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 12,
  },
  stepIndicatorWrap: {
    alignItems: 'flex-end',
    gap: 6,
  },
  stepCountText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stepPills: {
    flexDirection: 'row',
    gap: 6,
  },
  stepPill: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: 'transparent',
  },
  stepPillActive: {
    backgroundColor: '#4CAF7D',
    borderColor: '#4CAF7D',
  },
  stepPillCompleted: {
    backgroundColor: '#64748B',
    borderColor: '#64748B',
  },
  loadingWrap: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  stepBody: {
    flex: 1,
    minHeight: 0,
  },
  sectionIntro: {
    color: '#9FB0C7',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  scrollRegion: {
    flex: 1,
    minHeight: 0,
  },
  scrollRegionContent: {
    paddingBottom: 8,
    gap: 10,
  },
  layoutCard: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#263244',
    backgroundColor: '#1A2332',
    paddingHorizontal: 14,
    paddingVertical: 13,
    justifyContent: 'center',
  },
  layoutCardActive: {
    borderColor: '#4CAF7D',
    backgroundColor: 'rgba(76, 175, 125, 0.12)',
  },
  layoutTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  layoutTitleActive: {
    color: '#FFFFFF',
  },
  layoutSubtitle: {
    color: '#8EA0B6',
    fontSize: 13,
    marginTop: 4,
  },
  teeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#263244',
    backgroundColor: '#1A2332',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  teeCardActive: {
    borderColor: '#4CAF7D',
    backgroundColor: 'rgba(76, 175, 125, 0.12)',
  },
  teePill: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    marginRight: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  teePillCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 8,
  },
  teePillSingle: {
    flex: 1,
  },
  teePillSlice: {
    flex: 1,
  },
  teePillDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  teeCopy: {
    flex: 1,
  },
  teeTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  teeTitleActive: {
    color: '#FFFFFF',
  },
  lastPlayedTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.45)',
  },
  lastPlayedTagText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  teeSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 3,
  },
  moreOptionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#132031',
    borderWidth: 1,
    borderColor: '#233247',
  },
  moreOptionsText: {
    color: '#A7F3D0',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#132031',
    borderWidth: 1,
    borderColor: '#233247',
  },
  emptyCardTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyCardBody: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
  },
  reportPromptWrap: {
    paddingTop: 2,
  },
  reportPromptText: {
    color: '#64748B',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  optionsBody: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryBar: {
    gap: 8,
  },
  summaryChip: {
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#132031',
    borderWidth: 1,
    borderColor: '#233247',
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  optionsSection: {
    gap: 8,
  },
  optionsLabel: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  segmentedWrap: {
    flexDirection: 'row',
    backgroundColor: '#0F1923',
    borderRadius: 11,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentButtonActive: {
    backgroundColor: '#4CAF7D',
  },
  segmentButtonLocked: {
    opacity: 0.85,
  },
  segmentText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  segmentTextLocked: {
    color: '#CBD5E1',
  },
  holeSelectorContent: {
    paddingBottom: 2,
  },
  tournamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#233247',
    backgroundColor: '#132031',
  },
  tournamentCopy: {
    flex: 1,
  },
  tournamentTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  tournamentBody: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#243041',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1.35,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#03251A',
    fontSize: 14,
    fontWeight: '800',
  },
});
