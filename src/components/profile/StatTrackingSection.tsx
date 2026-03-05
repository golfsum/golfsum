import React from 'react';
import { View, Text, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatPreferences, UserProfile } from '../../types';

interface StatTrackingSectionProps {
  expanded: boolean;
  activeStatsCount: number;
  scoringMode: 'basic' | 'advanced';
  resolvedStatPrefs: StatPreferences;
  profileScoringPreferences: UserProfile['scoringPreferences'];
  onToggle: () => void;
  onApplyPreset: (preset: 'all' | 'shots' | 'shortGame' | 'minimal') => void;
  onUpdateStatPreference: (
    updates: Partial<StatPreferences>,
    scoringUpdates?: Partial<UserProfile['scoringPreferences']>
  ) => void;
  onUpdateProfile: (updates: Partial<UserProfile>) => void;
  styles: any;
  isPremium?: boolean;
  onUpgrade?: () => void;
}

export const StatTrackingSection: React.FC<StatTrackingSectionProps> = ({
  expanded,
  activeStatsCount,
  scoringMode,
  resolvedStatPrefs,
  profileScoringPreferences,
  onToggle,
  onApplyPreset,
  onUpdateStatPreference,
  onUpdateProfile,
  styles,
  isPremium = true,
  onUpgrade,
}) => {
  type MarkingStyle = 'arrows' | 'check-x' | 'yes-no';
  const fairwayMarking = profileScoringPreferences?.fairwayMarking ?? 'arrows';
  const greenMarking = profileScoringPreferences?.greenMarking ?? 'arrows';

  const getFairwaySymbolsForMarking = (marking: MarkingStyle) => {
    if (marking === 'check-x') {
      return { hit: '✓', missRight: 'X', missLeft: 'X', notApplicable: '-' };
    }
    if (marking === 'yes-no') {
      return { hit: 'Y', missRight: 'N', missLeft: 'N', notApplicable: '-' };
    }
    return { hit: '✓', missRight: '→', missLeft: '←', notApplicable: '-' };
  };

  const getGreenSymbolsForMarking = (marking: MarkingStyle) => {
    if (marking === 'check-x') {
      return { hit: '✓', missShort: 'X', missLong: 'X', missRight: 'X', missLeft: 'X' };
    }
    if (marking === 'yes-no') {
      return { hit: 'Y', missShort: 'N', missLong: 'N', missRight: 'N', missLeft: 'N' };
    }
    return { hit: '✓', missShort: '↓', missLong: '↑', missRight: '→', missLeft: '←' };
  };

  const updateFairwayMarking = (marking: MarkingStyle) => {
    onUpdateProfile({
      scoringPreferences: {
        ...profileScoringPreferences,
        fairwayMarking: marking,
        fairwaySymbols: getFairwaySymbolsForMarking(marking),
      },
    });
  };

  const updateGreenMarking = (marking: MarkingStyle) => {
    onUpdateProfile({
      scoringPreferences: {
        ...profileScoringPreferences,
        greenMarking: marking,
        greenSymbols: getGreenSymbolsForMarking(marking),
      },
    });
  };

  const markingOptions: Array<{ key: MarkingStyle; label: string; preview: string }> = [
    { key: 'check-x', label: 'Check/X', preview: '✓ / X' },
    { key: 'yes-no', label: 'Y/N', preview: 'Y / N' },
    { key: 'arrows', label: 'Arrows', preview: '✓ / ← →' },
  ];

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
        <View style={styles.headerLeft}>
          <Text style={styles.sectionTitle}>STAT TRACKING</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{activeStatsCount}</Text>
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#6B7280" />
      </TouchableOpacity>
      <Text style={styles.sectionHint}>What you track on your scorecards</Text>
      {scoringMode === 'basic' && !expanded && (
        <Text style={styles.sectionHint}>Tracking: Score, Putts, FIR, GIR</Text>
      )}

      {expanded && scoringMode === 'basic' && (
        <View style={styles.sectionContent}>
          <View style={styles.basicTrackingSummary}>
            <Text style={styles.basicTrackingText}>Tracking: Score, Putts, FIR, GIR</Text>
            <Text style={styles.basicTrackingHint}>Switch to Advanced to customize tracking.</Text>
          </View>
        </View>
      )}

      {expanded && scoringMode === 'advanced' && (
        <View style={styles.prefsContent}>
        <View style={styles.presetContainer}>
          <Text style={styles.sectionLabel}>QUICK PRESETS</Text>
          <View style={styles.presetButtons}>
            <TouchableOpacity style={styles.presetButton} onPress={() => onApplyPreset('all')}>
              <Text style={styles.presetButtonText}>All Stats</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetButton} onPress={() => onApplyPreset('shots')}>
              <Text style={styles.presetButtonText}>Shot Tracking</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetButton} onPress={() => onApplyPreset('shortGame')}>
              <Text style={styles.presetButtonText}>Short Game</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetButton} onPress={() => onApplyPreset('minimal')}>
              <Text style={styles.presetButtonText}>Minimal</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.presetHelpText}>
            Select a preset, then customize individual stats below.
          </Text>
        </View>

        <View style={styles.statInfoRow}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.statInfoText}>Score per hole (required)</Text>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Putts per hole</Text>
          <Switch
            value={resolvedStatPrefs.putts}
            onValueChange={(val) => onUpdateStatPreference(
              { putts: val },
              {
                trackPutts: val,
                trackPuttDistance: val ? (profileScoringPreferences?.trackPuttDistance ?? false) : false,
              }
            )}
            trackColor={{ false: '#2a3038', true: '#10B981' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionLabel}>PUTTING</Text>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, !resolvedStatPrefs.putts && { opacity: 0.5 }]}>
              First Putt Distance
            </Text>
            <Switch
              value={profileScoringPreferences?.trackPuttDistance === true}
              onValueChange={(val) => onUpdateProfile({
                scoringPreferences: {
                  ...profileScoringPreferences,
                  trackPuttDistance: val,
                },
              })}
              trackColor={{ false: '#2a3038', true: '#10B981' }}
              thumbColor="#FFFFFF"
              disabled={!resolvedStatPrefs.putts}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Scorecard Colors</Text>
            <Switch
              value={profileScoringPreferences?.scorecardColorsEnabled !== false}
              onValueChange={(val) => onUpdateProfile({
                scoringPreferences: {
                  ...profileScoringPreferences,
                  scorecardColorsEnabled: val,
                },
              })}
              trackColor={{ false: '#2a3038', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Text style={[styles.toggleLabel, !isPremium && { opacity: 0.5 }]}>
              Fairways (FIR){scoringMode === 'advanced' ? ' - Directional' : ' - Hit/Miss'}
            </Text>
            {!isPremium && (
              <TouchableOpacity onPress={onUpgrade} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                <Ionicons name="lock-closed" size={9} color="#10B981" />
                <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '600' }}>Premium</Text>
              </TouchableOpacity>
            )}
          </View>
          <Switch
            value={resolvedStatPrefs.fir}
            onValueChange={(val) => {
              if (!isPremium) { onUpgrade?.(); return; }
              onUpdateStatPreference({ fir: val }, { trackFairways: val });
            }}
            trackColor={{ false: '#2a3038', true: isPremium ? '#10B981' : '#2a3038' }}
            thumbColor="#FFFFFF"
            disabled={!isPremium}
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Text style={[styles.toggleLabel, !isPremium && { opacity: 0.5 }]}>
              Greens (GIR){scoringMode === 'advanced' ? ' - Directional' : ' - Hit/Miss'}
            </Text>
            {!isPremium && (
              <TouchableOpacity onPress={onUpgrade} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                <Ionicons name="lock-closed" size={9} color="#10B981" />
                <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '600' }}>Premium</Text>
              </TouchableOpacity>
            )}
          </View>
          <Switch
            value={resolvedStatPrefs.gir}
            onValueChange={(val) => {
              if (!isPremium) { onUpgrade?.(); return; }
              onUpdateStatPreference({ gir: val }, { trackGreens: val });
            }}
            trackColor={{ false: '#2a3038', true: isPremium ? '#10B981' : '#2a3038' }}
            thumbColor="#FFFFFF"
            disabled={!isPremium}
          />
        </View>

        {scoringMode === 'advanced' && (
          <>
            <View style={styles.toggleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={[styles.toggleLabel, !isPremium && { opacity: 0.5 }]}>Approach Distance (bucketed)</Text>
                {!isPremium && <Ionicons name="lock-closed" size={9} color="#10B981" />}
              </View>
              <Switch
                value={resolvedStatPrefs.approachDistance}
                onValueChange={(val) => {
                  if (!isPremium) { onUpgrade?.(); return; }
                  onUpdateStatPreference({ approachDistance: val }, { trackApproachDistance: val });
                }}
                trackColor={{ false: '#2a3038', true: isPremium ? '#10B981' : '#2a3038' }}
                thumbColor="#FFFFFF"
                disabled={!isPremium}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={[styles.toggleLabel, !isPremium && { opacity: 0.5 }]}>Club selection per shot</Text>
                {!isPremium && <Ionicons name="lock-closed" size={9} color="#10B981" />}
              </View>
              <Switch
                value={profileScoringPreferences?.trackClubs !== false}
                onValueChange={(val) => {
                  if (!isPremium) { onUpgrade?.(); return; }
                  onUpdateProfile({ scoringPreferences: { ...profileScoringPreferences, trackClubs: val } });
                }}
                trackColor={{ false: '#2a3038', true: isPremium ? '#10B981' : '#2a3038' }}
                thumbColor="#FFFFFF"
                disabled={!isPremium}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={[styles.toggleLabel, !isPremium && { opacity: 0.5 }]}>Up & Down</Text>
                {!isPremium && <Ionicons name="lock-closed" size={9} color="#10B981" />}
              </View>
              <Switch
                value={resolvedStatPrefs.scrambling}
                onValueChange={(val) => {
                  if (!isPremium) { onUpgrade?.(); return; }
                  onUpdateStatPreference({ scrambling: val }, { trackUpDown: val });
                }}
                trackColor={{ false: '#2a3038', true: isPremium ? '#10B981' : '#2a3038' }}
                thumbColor="#FFFFFF"
                disabled={!isPremium}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={[styles.toggleLabel, !isPremium && { opacity: 0.5 }]}>Bunker shots</Text>
                {!isPremium && <Ionicons name="lock-closed" size={9} color="#10B981" />}
              </View>
              <Switch
                value={resolvedStatPrefs.bunkers}
                onValueChange={(val) => {
                  if (!isPremium) { onUpgrade?.(); return; }
                  onUpdateStatPreference({ bunkers: val }, { trackBunkers: val });
                }}
                trackColor={{ false: '#2a3038', true: isPremium ? '#10B981' : '#2a3038' }}
                thumbColor="#FFFFFF"
                disabled={!isPremium}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={[styles.toggleLabel, !isPremium && { opacity: 0.5 }]}>Penalty strokes</Text>
                {!isPremium && <Ionicons name="lock-closed" size={9} color="#10B981" />}
              </View>
              <Switch
                value={resolvedStatPrefs.penalties}
                onValueChange={(val) => {
                  if (!isPremium) { onUpgrade?.(); return; }
                  onUpdateStatPreference({ penalties: val }, { trackPenalties: val });
                }}
                trackColor={{ false: '#2a3038', true: isPremium ? '#10B981' : '#2a3038' }}
                thumbColor="#FFFFFF"
                disabled={!isPremium}
              />
            </View>
          </>
        )}

        {(resolvedStatPrefs.fir || resolvedStatPrefs.gir) && (
          <View style={styles.markingBlock}>
            <Text style={styles.sectionLabel}>MARKINGS</Text>
            {resolvedStatPrefs.fir && (
              <>
                <Text style={styles.toggleLabel}>Fairways (FIR)</Text>
                <View style={styles.markingButtons}>
                  {markingOptions.map(option => {
                    const isActive = fairwayMarking === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={[styles.markingButton, isActive && styles.markingButtonActive]}
                        onPress={() => updateFairwayMarking(option.key)}
                      >
                        <Text style={[styles.markingButtonText, isActive && styles.markingButtonTextActive]}>
                          {option.label}
                        </Text>
                        <Text style={styles.markingPreview}>{option.preview}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            {resolvedStatPrefs.gir && (
              <>
                <Text style={styles.toggleLabel}>Greens (GIR)</Text>
                <View style={styles.markingButtons}>
                  {markingOptions.map(option => {
                    const isActive = greenMarking === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={[styles.markingButton, isActive && styles.markingButtonActive]}
                        onPress={() => updateGreenMarking(option.key)}
                      >
                        <Text style={[styles.markingButtonText, isActive && styles.markingButtonTextActive]}>
                          {option.label}
                        </Text>
                        <Text style={styles.markingPreview}>{option.preview}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            <Text style={styles.markingHint}>Used in scorecard import and manual edits.</Text>
          </View>
        )}

        <View style={styles.statTrackingNote}>
          <Ionicons name="information-circle-outline" size={14} color="#6B7280" />
          <Text style={styles.statTrackingNoteText}>
            GolfSum only shows and analyzes stats you choose to track.
          </Text>
        </View>
        </View>
      )}
    </View>
  );
};
