import React from 'react';
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

type GpsTeeOption = {
  name: string;
  color?: string;
  totalYards: number;
};

type Props = {
  visible: boolean;
  loading?: boolean;
  courseName?: string;
  teeOptions: GpsTeeOption[];
  selectedTeeName: string;
  onSelectTee: (teeName: string) => void;
  startingHole: number;
  maxStartingHole: number;
  onSelectStartingHole: (hole: number) => void;
  tournamentMode: boolean;
  onToggleTournamentMode: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function GpsRoundSetupModal({
  visible,
  loading = false,
  courseName,
  teeOptions,
  selectedTeeName,
  onSelectTee,
  startingHole,
  maxStartingHole,
  onSelectStartingHole,
  tournamentMode,
  onToggleTournamentMode,
  onClose,
  onConfirm,
}: Props) {
  const holeChoices = Array.from({ length: Math.max(1, maxStartingHole) }, (_, index) => index + 1);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>GPS Round Setup</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {courseName || 'Choose your tee, start hole, and conditions'}
          </Text>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.loadingText}>Loading GPS tee data…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Starting Hole</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holeRow}>
                {holeChoices.map((hole) => (
                  <TouchableOpacity
                    key={hole}
                    style={[styles.holeChip, startingHole === hole && styles.holeChipActive]}
                    onPress={() => onSelectStartingHole(hole)}
                  >
                    <Text style={[styles.holeChipText, startingHole === hole && styles.holeChipTextActive]}>
                      {hole}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.sectionLabel}>Tee Box</Text>
              <View style={styles.teeList}>
                {teeOptions.map((tee) => {
                  const active = selectedTeeName.toLowerCase() === tee.name.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={tee.name}
                      style={[styles.teeRow, active && styles.teeRowActive]}
                      onPress={() => onSelectTee(tee.name)}
                    >
                      <View style={[styles.teeColor, { backgroundColor: tee.color || '#10B981' }]} />
                      <View style={styles.teeMeta}>
                        <Text style={[styles.teeName, active && styles.teeNameActive]}>{tee.name}</Text>
                        <Text style={styles.teeYardage}>{tee.totalYards > 0 ? `${tee.totalYards} yds` : '--'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.tournamentRow}>
                <View style={styles.tournamentCopy}>
                  <Text style={styles.tournamentTitle}>Tournament</Text>
                  <Text style={styles.tournamentBody}>
                    {tournamentMode
                      ? 'Conditions disabled: wind, humidity, and playing-yardage adjustments stay hidden.'
                      : 'Conditions enabled: wind and playing-yardage adjustments stay on.'}
                  </Text>
                </View>
                <Switch
                  value={tournamentMode}
                  onValueChange={onToggleTournamentMode}
                  trackColor={{ false: '#374151', true: '#10B981' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </>
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={onConfirm}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>Start GPS Round</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 20,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 18,
  },
  sectionLabel: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  holeRow: {
    gap: 8,
    paddingBottom: 4,
    marginBottom: 18,
  },
  holeChip: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holeChipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  holeChipText: {
    color: '#E5E7EB',
    fontWeight: '700',
  },
  holeChipTextActive: {
    color: '#042F21',
  },
  teeList: {
    gap: 10,
    marginBottom: 18,
  },
  teeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  teeRowActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  teeColor: {
    width: 12,
    height: 36,
    borderRadius: 999,
    marginRight: 12,
  },
  teeMeta: {
    flex: 1,
  },
  teeName: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '700',
  },
  teeNameActive: {
    color: '#D1FAE5',
  },
  teeYardage: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  tournamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#111827',
    marginBottom: 20,
  },
  tournamentCopy: {
    flex: 1,
  },
  tournamentTitle: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '700',
  },
  tournamentBody: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  secondaryButtonText: {
    color: '#E5E7EB',
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1.25,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#03251A',
    fontWeight: '800',
  },
});

export default GpsRoundSetupModal;
