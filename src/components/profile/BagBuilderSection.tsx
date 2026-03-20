import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserProfile } from '../../types';
import { ClubYardageModal } from './ClubYardageModal';
import { ClubYardageAnalysis } from '../../services/clubYardageIntelligence';
import { getClubAveragePromptCandidates, getClubAverages, getClubDisplayDistance, normalizeClubKey, syncManualDistancesToGps } from '../../services/clubDistanceService';
import Storage from '../../services/storage';

const CLUB_DISTANCE_PROMPT_KEY = '@GolfSum:ClubDistancePromptDismissedAt';

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
  const [clubAverages, setClubAverages] = useState<Record<string, any>>({});
  const [promptDismissedAt, setPromptDismissedAt] = useState<string | null>(null);

  const distances = profile.clubDistances ?? {};
  const promptCandidates = useMemo(
    () => getClubAveragePromptCandidates(distances, clubAverages),
    [clubAverages, distances]
  );
  const showDistancePrompt = promptCandidates.length > 0 && (
    !promptDismissedAt || (Date.now() - new Date(promptDismissedAt).getTime()) > (30 * 24 * 60 * 60 * 1000)
  );

  useEffect(() => {
    let active = true;
    getClubAverages()
      .then((averages) => {
        if (active) setClubAverages(averages || {});
      })
      .catch(() => {
        if (active) setClubAverages({});
      });
    Storage.getItem(CLUB_DISTANCE_PROMPT_KEY)
      .then((value) => {
        if (active) setPromptDismissedAt(value);
      })
      .catch(() => {
        if (active) setPromptDismissedAt(null);
      });
    return () => {
      active = false;
    };
  }, []);
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

  const dismissDistancePrompt = async () => {
    const nowIso = new Date().toISOString();
    setPromptDismissedAt(nowIso);
    await Storage.setItem(CLUB_DISTANCE_PROMPT_KEY, nowIso);
  };

  const handleSyncManualDistances = async () => {
    const nextProfile = await syncManualDistancesToGps(profile, clubAverages);
    onUpdateProfile(nextProfile);
    await dismissDistancePrompt();
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
    const normalizedClub = normalizeClubKey(club);
    const average = clubAverages[normalizedClub] || null;
    const displayDistance = getClubDisplayDistance(average, typeof yardage === 'number' ? yardage : null);
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
              {displayDistance ? `${displayDistance.yards} yds` : yardage ? `${yardage} yds` : 'Set yds'}
            </Text>
            {displayDistance?.source === 'gps' ? (
              <Text style={chipStyles.detailLabel}>
                {displayDistance.confidence === 'high'
                  ? `GPS avg · ${average?.sampleCount || 0} shots`
                  : `${average?.sampleCount || 0}/10 shots`}
              </Text>
            ) : yardage ? (
              <Text style={chipStyles.detailLabel}>Entered</Text>
            ) : null}
            {average?.gpsAvgCarry ? (
              <Text style={chipStyles.detailLabel}>Carry est. {average.gpsAvgCarry}y</Text>
            ) : null}
            {average?.gpsAvgTotal && yardage && Math.abs(average.gpsAvgTotal - yardage) >= 10 ? (
              <Text style={chipStyles.detailLabel}>Entered {yardage}y</Text>
            ) : null}
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
          {showDistancePrompt ? (
            <View style={chipStyles.promptCard}>
              <Text style={chipStyles.promptTitle}>Your distances have updated</Text>
              <Text style={chipStyles.promptBody}>
                {`${promptCandidates[0].club} GPS average is now ${promptCandidates[0].gpsYards}y, ${promptCandidates[0].diff}y from your entered ${promptCandidates[0].manualYards}y. GPS drives suggestions now.`}
              </Text>
              <View style={chipStyles.promptActions}>
                <TouchableOpacity style={chipStyles.promptBtnPrimary} onPress={handleSyncManualDistances}>
                  <Text style={chipStyles.promptBtnPrimaryText}>Update entries</Text>
                </TouchableOpacity>
                <TouchableOpacity style={chipStyles.promptBtnSecondary} onPress={dismissDistancePrompt}>
                  <Text style={chipStyles.promptBtnSecondaryText}>Keep as is</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
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
  detailLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    marginTop: 1,
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
  promptCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    padding: 12,
    marginBottom: 10,
  },
  promptTitle: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  promptBody: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
  },
  promptActions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  promptBtnPrimary: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promptBtnPrimaryText: {
    color: '#06281E',
    fontSize: 12,
    fontWeight: '700',
  },
  promptBtnSecondary: {
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promptBtnSecondaryText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
});
