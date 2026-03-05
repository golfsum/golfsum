import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CaddieBrief } from '../services/courseHoleInsightsService';

export const CaddieBriefCard: React.FC<{ brief: CaddieBrief }> = ({ brief }) => {
  const trendLabel =
    brief.history.scoreTrend === 'improving'
      ? 'improving'
      : brief.history.scoreTrend === 'declining'
        ? 'rising'
        : 'steady';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="golf-outline" size={15} color="#60A5FA" />
          <Text style={styles.headerTitle}>Caddie Brief</Text>
        </View>
        <Text style={styles.headerMeta}>{brief.roundsPlayed} rounds here</Text>
      </View>

      <Text style={styles.courseName} numberOfLines={1}>{brief.courseName}</Text>

      <View style={styles.historyBlock}>
        <Text style={styles.historyText}>
          Last: {brief.history.lastScore}. Best: {brief.history.bestScore}. Avg: {brief.history.avgScore}. Trend: {trendLabel}.
        </Text>
      </View>

      <View style={styles.badgesRow}>
        {brief.gamePlan.attackHoles.length > 0 && (
          <View style={[styles.badge, styles.attackBadge]}>
            <Text style={styles.badgeText}>Attack {brief.gamePlan.attackHoles.join(', ')}</Text>
          </View>
        )}
        {brief.gamePlan.defendHoles.length > 0 && (
          <View style={[styles.badge, styles.defendBadge]}>
            <Text style={styles.badgeText}>Defend {brief.gamePlan.defendHoles.join(', ')}</Text>
          </View>
        )}
        {brief.gamePlan.strokeHoles.length > 0 && (
          <View style={[styles.badge, styles.strokeBadge]}>
            <Text style={styles.badgeText}>Strokes {brief.gamePlan.strokeHoles.join(', ')}</Text>
          </View>
        )}
      </View>

      {brief.gamePlan.oneLiner.length > 0 && (
        <Text style={styles.oneLiner}>{brief.gamePlan.oneLiner}</Text>
      )}

      {brief.tendencies.tendencyLines.slice(0, 2).map((line, index) => (
        <Text key={`${line}-${index}`} style={styles.tendencyLine}>→ {line}</Text>
      ))}

      {brief.holeNotes.slice(0, 2).map((note) => (
        <View key={`${note.holeNumber}-${note.noteDate}`} style={styles.noteRow}>
          <Text style={styles.noteText} numberOfLines={2}>
            Hole {note.holeNumber} (Par {note.par}{note.yardage ? `, ${note.yardage} yds` : ''}): {note.noteText}
          </Text>
          {note.noteDate ? <Text style={styles.noteDate}>{note.noteDate}</Text> : null}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    color: '#BFDBFE',
    fontSize: 12,
    fontWeight: '700',
  },
  headerMeta: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  courseName: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  historyBlock: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  historyText: {
    color: '#C7CED7',
    fontSize: 13,
    lineHeight: 18,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  attackBadge: {
    backgroundColor: 'rgba(16,185,129,0.2)',
  },
  defendBadge: {
    backgroundColor: 'rgba(245,158,11,0.2)',
  },
  strokeBadge: {
    backgroundColor: 'rgba(96,165,250,0.2)',
  },
  badgeText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '700',
  },
  oneLiner: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  tendencyLine: {
    color: '#9FB0C4',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  noteRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#253140',
  },
  noteText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
  },
  noteDate: {
    marginTop: 2,
    color: '#6B7280',
    fontSize: 11,
  },
});
