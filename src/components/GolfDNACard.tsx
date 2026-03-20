import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import { GolfDNA } from '../services/golfDnaService';

const DNA_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  ACCURATE: 'checkmark-circle-outline',
  AGGRESSIVE: 'flame-outline',
  GRINDER: 'construct-outline',
  INCONSISTENT: 'shuffle-outline',
  SCRAMBLER: 'golf-outline',
  PUTTER: 'radio-button-on-outline',
  BOTH: 'star-outline',
  DEVELOPING: 'trending-up-outline',
  EXPLOSIVE: 'thunderstorm-outline',
  STREAKY: 'pulse-outline',
  CONSISTENT: 'remove-outline',
  GRINDING: 'layers-outline',
  CONSERVATIVE: 'shield-outline',
  SITUATIONAL: 'compass-outline',
  AGGRESSIVE_CM: 'rocket-outline',
  ERRATIC: 'shuffle-outline',
};

export const GolfDNACard: React.FC<{ dna: GolfDNA; lastUpdated: string; onRefresh?: () => void }> = ({ dna, lastUpdated, onRefresh }) => {
  const shotRef = useRef<ViewShot>(null);

  const handleShare = async () => {
    const uri = await shotRef.current?.capture?.();
    if (!uri) return;
    await Share.share({ url: uri, message: 'My Golf DNA from GolfSum' });
  };

  if (!dna.hasSufficientData) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Your Golf DNA</Text>
        <Text style={styles.subtle}>5 rounds here shows your profile.</Text>
      </View>
    );
  }

  const items = [
    { key: dna.ballStriking, label: dna.ballStrikingLabel, desc: dna.ballStrikingDesc },
    { key: dna.shortGame, label: dna.shortGameLabel, desc: dna.shortGameDesc },
    { key: dna.courseManagement === 'AGGRESSIVE' ? 'AGGRESSIVE_CM' : dna.courseManagement, label: dna.courseManagementLabel, desc: dna.courseManagementDesc },
    { key: dna.volatility, label: dna.volatilityLabel, desc: dna.volatilityDesc },
  ];

  return (
    <View style={styles.wrap}>
      <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Your Golf DNA</Text>
            <Text style={styles.subtle}>{dna.roundsAnalyzed} rounds</Text>
          </View>
          <View style={styles.grid}>
            {items.map((item) => (
              <View key={item.label} style={styles.cell}>
                <Ionicons name={DNA_ICONS[item.key] ?? 'ellipse-outline'} size={16} color="#10B981" />
                <Text style={styles.cellLabel}>{item.label}</Text>
                <Text style={styles.cellDesc}>{item.desc}</Text>
              </View>
            ))}
          </View>
          <View style={styles.footer}>
            <Text style={styles.subtle}>Best {dna.bestScore ?? '—'}{dna.bestScoreCourse ? ` at ${dna.bestScoreCourse}` : ''}</Text>
            <Text style={styles.subtle}>Most birdies: {dna.mostBirdiesRound ?? '—'}</Text>
            <Text style={styles.subtle}>Lowest differential: {dna.lowestHandicap != null ? dna.lowestHandicap.toFixed(1) : '—'}</Text>
          </View>
        </View>
      </ViewShot>
      <View style={styles.actions}>
        <Text style={styles.lastUpdated}>Last updated: {lastUpdated}</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={14} color="#D1D5DB" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
          {onRefresh && (
            <TouchableOpacity style={styles.actionBtn} onPress={onRefresh}>
              <Ionicons name="refresh-outline" size={14} color="#D1D5DB" />
              <Text style={styles.actionText}>Refresh</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: {
    backgroundColor: '#131A23',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    padding: 14,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { color: '#F9FAFB', fontSize: 16, fontWeight: '700' },
  subtle: { color: '#9CA3AF', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '48%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10 },
  cellLabel: { color: '#E5E7EB', fontSize: 12, fontWeight: '700', marginTop: 4 },
  cellDesc: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },
  footer: { marginTop: 10, gap: 3 },
  actions: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#1F2937' },
  actionText: { color: '#D1D5DB', fontSize: 12, fontWeight: '600' },
  lastUpdated: { color: '#6B7280', fontSize: 11 },
});
