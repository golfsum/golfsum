import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MilestoneEvent } from '../services/milestoneDetector';

export const MilestoneShareCard: React.FC<{ event: MilestoneEvent }> = ({ event }) => (
  <View style={styles.card}>
    <Text style={styles.logo}>GOLFSUM</Text>
    <View style={styles.icon}>
      <Ionicons name="trophy-outline" size={64} color="#10B981" />
    </View>
    <Text style={styles.headline}>{event.headline}</Text>
    <Text style={styles.statLine}>{event.statLine}</Text>
    {event.subStats.length > 0 && (
      <View style={styles.subStatsRow}>
        {event.subStats.map((s, i) => (
          <View key={`${s}-${i}`} style={styles.subStatChip}>
            <Text style={styles.subStatText}>{s}</Text>
          </View>
        ))}
      </View>
    )}
    <Text style={styles.caption}>{event.shareCaption}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0B1220',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 20,
    width: '100%',
  },
  logo: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  icon: {
    alignItems: 'center',
    marginBottom: 10,
  },
  headline: {
    color: '#F8FAFC',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  statLine: {
    color: '#D1D5DB',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  subStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 10,
  },
  subStatChip: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  subStatText: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '700',
  },
  caption: {
    color: '#9CA3AF',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
});
