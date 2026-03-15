import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BagItem, MASTER_CLUB_BAG, UserProfile } from '../../types';
import { ClubYardageModal } from './ClubYardageModal';
import { ClubYardageAnalysis } from '../../services/clubYardageIntelligence';
import { saveClubBag } from '../../services/userService';

interface BagBuilderSectionProps {
  expanded: boolean;
  clubsCountLabel: string;
  profile: UserProfile;
  onToggle: () => void;
  onUpdateProfile: (updates: Partial<UserProfile>) => void;
  onToggleClub: (category: 'woods' | 'hybrids' | 'irons' | 'wedges', club: string) => void;
  styles: any;
  yardageAnalysis?: ClubYardageAnalysis | null;
}

/** Merge profile.clubBag with MASTER_CLUB_BAG so new clubs always appear. */
function resolveClubBag(profile: UserProfile): BagItem[] {
  const saved = profile.clubBag;
  if (Array.isArray(saved) && saved.length > 0) {
    // Add any master clubs not yet in saved bag (new clubs added to master)
    const savedKeys = new Set(saved.map((i) => i.club));
    const extras = MASTER_CLUB_BAG.filter((m) => !savedKeys.has(m.club));
    return [...saved, ...extras];
  }
  return [...MASTER_CLUB_BAG];
}

export const BagBuilderSection: React.FC<BagBuilderSectionProps> = ({
  expanded,
  clubsCountLabel,
  profile,
  onToggle,
  onUpdateProfile,
  onToggleClub,
  styles,
  yardageAnalysis,
}) => {
  const [yardageModalClub, setYardageModalClub] = useState<string | null>(null);
  const [clubBag, setClubBag] = useState<BagItem[]>(() => resolveClubBag(profile));
  const [savedToast, setSavedToast] = useState(false);

  const persistBag = (next: BagItem[]) => {
    setClubBag(next);
    onUpdateProfile({ clubBag: next });
    saveClubBag(next).catch(() => {});
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1500);
  };

  const handleToggleBagItem = (club: string) => {
    const next = clubBag.map((item) =>
      item.club === club ? { ...item, enabled: !item.enabled } : item
    );
    persistBag(next);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...clubBag];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    persistBag(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= clubBag.length - 1) return;
    const next = [...clubBag];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    persistBag(next);
  };

  const handleReset = () => {
    persistBag([...MASTER_CLUB_BAG]);
  };

  const enabledCount = clubBag.filter((i) => i.enabled).length;

  const distances = profile.clubDistances ?? {};
  const activeClubCount =
    (profile.bag?.driver ? 1 : 0) +
    (profile.bag?.putter ? 1 : 0) +
    (profile.bag?.woods?.length ?? 0) +
    (profile.bag?.hybrids?.length ?? 0) +
    (profile.bag?.irons?.length ?? 0) +
    (profile.bag?.wedges?.length ?? 0);
  const atLimit = activeClubCount >= 14;

  const isClubActive = (
    club: string,
    category?: 'woods' | 'hybrids' | 'irons' | 'wedges'
  ): boolean => {
    if (club === 'Driver') return !!profile.bag?.driver;
    if (club === 'Putter') return !!profile.bag?.putter;
    if (category) return profile.bag?.[category]?.includes(club) ?? false;
    return false;
  };

  const handleClubPress = (
    club: string,
    category?: 'woods' | 'hybrids' | 'irons' | 'wedges'
  ) => {
    const active = isClubActive(club, category);
    if (!active && atLimit) return;
    if (!active) {
      if (club === 'Driver') {
        onUpdateProfile({ bag: { ...profile.bag, driver: true } });
      } else if (club === 'Putter') {
        onUpdateProfile({ bag: { ...profile.bag, putter: true } });
      } else if (category) {
        onToggleClub(category, club);
      }
      return;
    }

    if (club === 'Driver') {
      onUpdateProfile({ bag: { ...profile.bag, driver: false } });
    } else if (club === 'Putter') {
      onUpdateProfile({ bag: { ...profile.bag, putter: false } });
    } else if (category) {
      onToggleClub(category, club);
    }

    if (distances[club] !== undefined) {
      const updated = { ...distances };
      delete updated[club];
      onUpdateProfile({ clubDistances: updated });
    }
  };

  const handleClubLongPress = (
    club: string,
    category?: 'woods' | 'hybrids' | 'irons' | 'wedges'
  ) => {
    const active = isClubActive(club, category);
    if (!active) return;
    if (club === 'Putter') return;
    setYardageModalClub(club);
  };

  const handleYardageSave = (club: string, yardage: number | undefined) => {
    const updated = { ...distances };
    if (yardage === undefined) {
      delete updated[club];
    } else {
      updated[club] = yardage;
    }
    onUpdateProfile({ clubDistances: updated });
    setYardageModalClub(null);
  };

  const isClubFlagged = (club: string): boolean => {
    if (!yardageAnalysis?.primaryFinding) return false;
    const finding = yardageAnalysis.primaryFinding;
    return (
      finding.club === club &&
      (finding.type === 'UNDERCLUBBING' || finding.type === 'BETWEEN_CLUBS_HESITATION')
    );
  };

  const renderClubChip = (
    club: string,
    category?: 'woods' | 'hybrids' | 'irons' | 'wedges'
  ) => {
    const active = isClubActive(club, category);
    const yardage = distances[club];
    const showYardage = active && club !== 'Putter';

    return (
      <TouchableOpacity
        key={club}
        style={[chipStyles.clubChip, active && chipStyles.clubChipActive, showYardage && chipStyles.clubChipWithYardage]}
        onPress={() => handleClubPress(club, category)}
        onLongPress={() => handleClubLongPress(club, category)}
        delayLongPress={500}
        disabled={!active && atLimit}
      >
        <Text style={[chipStyles.clubChipText, active && chipStyles.clubChipTextActive]}>{club}</Text>
        {showYardage && (
          <View style={chipStyles.yardageWrap}>
            <Text style={chipStyles.yardageLabel}>
              {yardage ? `${yardage} yds` : 'Set yds'}
            </Text>
            {yardage && isClubFlagged(club) ? <View style={chipStyles.verifyDot} /> : null}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const yardageCount = Object.keys(distances).length;
  const hintText =
    yardageCount > 0
      ? `${clubsCountLabel} · ${yardageCount} with yardages`
      : clubsCountLabel;

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
        <View>
          <Text style={styles.sectionTitle}>MY GOLF BAG</Text>
          <Text style={styles.sectionHint}>{hintText}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#6B7280" />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.bagContent}>
          <View style={chipStyles.metaRow}>
            <Text style={chipStyles.countPill}>{activeClubCount}/14 clubs</Text>
            {atLimit && <Text style={chipStyles.limitText}>Rules limit reached</Text>}
          </View>
          <Text style={chipStyles.interactionHint}>
            Tap to toggle · Hold active club to set range
          </Text>

          <Text style={styles.clubCategory}>WOODS</Text>
          <View style={styles.clubRow}>{renderClubChip('Driver')}</View>

          <Text style={styles.clubCategory}>FAIRWAY WOODS</Text>
          <View style={styles.clubRow}>
            {['3W', '4W', '5W', '7W', '9W'].map((club) => renderClubChip(club, 'woods'))}
          </View>

          <Text style={styles.clubCategory}>HYBRIDS</Text>
          <View style={styles.clubRow}>
            {['2H', '3H', '4H', '5H', '6H'].map((club) => renderClubChip(club, 'hybrids'))}
          </View>

          <Text style={styles.clubCategory}>IRONS</Text>
          <View style={styles.clubRow}>
            {['3i', '4i', '5i', '6i', '7i', '8i', '9i'].map((club) =>
              renderClubChip(club, 'irons')
            )}
          </View>

          <Text style={styles.clubCategory}>WEDGES</Text>
          <View style={styles.clubRow}>
            {['PW', 'AW', 'GW', 'SW', 'LW'].map((club) => renderClubChip(club, 'wedges'))}
          </View>

          <Text style={styles.clubCategory}>PUTTER</Text>
          <View style={styles.clubRow}>{renderClubChip('Putter')}</View>

          {/* Ordered bag for GPS club row */}
          <View style={bagStyles.divider} />
          <View style={bagStyles.orderedHeader}>
            <View>
              <Text style={bagStyles.orderedTitle}>GPS CLUB ORDER</Text>
              <Text style={bagStyles.orderedSub}>
                {enabledCount}/14 selected · shown in this order during GPS rounds
              </Text>
            </View>
            {savedToast && <Text style={bagStyles.savedToast}>Saved ✓</Text>}
          </View>

          {clubBag.map((item, index) => (
            <View key={item.club} style={bagStyles.row}>
              <View style={[bagStyles.colorDot, { backgroundColor: item.color }]} />
              <Text style={[bagStyles.clubLabel, !item.enabled && bagStyles.clubLabelDim]}>
                {item.label}
              </Text>
              <View style={bagStyles.rowRight}>
                <Switch
                  value={item.enabled}
                  onValueChange={() => handleToggleBagItem(item.club)}
                  thumbColor={item.enabled ? item.color : '#6B7280'}
                  trackColor={{ false: '#374151', true: `${item.color}44` }}
                  style={bagStyles.switch}
                />
                <TouchableOpacity
                  onPress={() => handleMoveUp(index)}
                  disabled={index === 0}
                  style={bagStyles.reorderBtn}
                >
                  <Ionicons name="chevron-up" size={16} color={index === 0 ? '#374151' : '#9CA3AF'} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleMoveDown(index)}
                  disabled={index === clubBag.length - 1}
                  style={bagStyles.reorderBtn}
                >
                  <Ionicons name="chevron-down" size={16} color={index === clubBag.length - 1 ? '#374151' : '#9CA3AF'} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity onPress={handleReset} style={bagStyles.resetBtn}>
            <Text style={bagStyles.resetText}>Reset to default bag</Text>
          </TouchableOpacity>
        </View>
      )}

      <ClubYardageModal
        visible={yardageModalClub !== null}
        clubName={yardageModalClub ?? ''}
        currentYardage={yardageModalClub ? distances[yardageModalClub] : undefined}
        onSave={handleYardageSave}
        onClose={() => setYardageModalClub(null)}
      />
    </View>
  );
};

const bagStyles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: '#1f2937',
    marginVertical: 16,
  },
  orderedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  orderedTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  orderedSub: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 2,
  },
  savedToast: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
    flexShrink: 0,
  },
  clubLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  clubLabelDim: {
    color: '#4B5563',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  switch: {
    marginRight: 4,
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  reorderBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  resetText: {
    fontSize: 12,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
});

const chipStyles = StyleSheet.create({
  clubChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    minHeight: 44,
    justifyContent: 'center',
  },
  clubChipActive: {
    backgroundColor: 'rgba(16,185,129,0.14)',
    borderColor: '#10B981',
  },
  clubChipWithYardage: {
    alignItems: 'center',
    paddingBottom: 6,
    paddingTop: 8,
  },
  clubChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  clubChipTextActive: {
    color: '#E5E7EB',
  },
  yardageLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#10B981',
    marginTop: 2,
  },
  yardageWrap: {
    alignItems: 'center',
  },
  verifyDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    backgroundColor: '#F59E0B',
    marginTop: 2,
    alignSelf: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  countPill: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    backgroundColor: '#111827',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  limitText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '700',
  },
  interactionHint: {
    fontSize: 11,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 8,
  },
});
