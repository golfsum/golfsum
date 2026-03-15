import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme/tokens';

function deltaColor(avg) {
  if (avg <= 0) return '#4CAF7D';
  if (avg <= 0.5) return '#A3C26A';
  if (avg <= 1.0) return '#F5A623';
  return '#E05252';
}

function formatDelta(avg) {
  if (avg === null || avg === undefined) return '—';
  const sign = avg > 0 ? '+' : '';
  return `${sign}${avg.toFixed(2)}`;
}

/**
 * Bottom sheet showing per-club scoring history for the current hole.
 * Opened when the player taps the suggested club chip (data_backed state).
 *
 * Props:
 *   visible       boolean
 *   onClose       () => void
 *   holeNumber    number
 *   holePar       number
 *   tees          string
 *   courseName    string
 *   allClubs      Array<{ club, rounds, simpleAvg, weightedAvg, fwPct }>
 *   holeDoc       Raw Firestore hole document (for below-threshold clubs)
 */
export function ClubHistorySheet({
  visible,
  onClose,
  holeNumber,
  holePar,
  tees,
  courseName,
  allClubs = [],
  holeDoc,
}) {
  // Merge eligible clubs (allClubs) with below-threshold clubs from holeDoc
  const belowThreshold = holeDoc?.teeClubHistory
    ? Object.entries(holeDoc.teeClubHistory)
        .filter(([club, data]) => data.rounds < 3)
        .map(([club, data]) => ({
          club,
          rounds: data.rounds,
          simpleAvg: data.rounds > 0 ? data.totalDelta / data.rounds : null,
          weightedAvg: null,
          fwPct: data.rounds > 0 ? Math.round((data.fwHit / data.rounds) * 100) : null,
          belowThreshold: true,
        }))
    : [];

  const rows = [...allClubs.map(c => ({ ...c, belowThreshold: false })), ...belowThreshold];
  const bestClub = allClubs[0]?.club;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>
              Hole {holeNumber} · Club History
            </Text>
            <Text style={styles.headerSub}>
              Par {holePar} · {tees} tees · {rows.length} club{rows.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colClub, styles.tableHeaderText]}>CLUB</Text>
          <Text style={[styles.colAvg, styles.tableHeaderText]}>AVG SCORE</Text>
          <Text style={[styles.colFw, styles.tableHeaderText]}>FW%</Text>
          <Text style={[styles.colRounds, styles.tableHeaderText]}>ROUNDS</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>No club history yet for this hole.</Text>
          ) : (
            rows.map((row, i) => {
              const isBest = row.club === bestClub && !row.belowThreshold;
              return (
                <View
                  key={row.club}
                  style={[
                    styles.row,
                    isBest && styles.rowBest,
                    row.belowThreshold && styles.rowDim,
                    i < rows.length - 1 && styles.rowBorder,
                  ]}
                >
                  <View style={styles.colClub}>
                    <Text style={[styles.clubName, row.belowThreshold && styles.textDim]}>
                      {row.club}
                    </Text>
                    {isBest && (
                      <View style={styles.bestBadge}>
                        <Text style={styles.bestBadgeText}>Best</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.colAvg,
                      styles.avgText,
                      row.belowThreshold ? styles.textDim : { color: deltaColor(row.simpleAvg) },
                    ]}
                  >
                    {row.belowThreshold ? '—' : formatDelta(row.simpleAvg)}
                  </Text>
                  <Text style={[styles.colFw, styles.metaText, row.belowThreshold && styles.textDim]}>
                    {row.fwPct !== null ? `${row.fwPct}%` : '—'}
                  </Text>
                  <View style={styles.colRounds}>
                    <Text style={[styles.metaText, row.belowThreshold && styles.textDim]}>
                      {row.rounds}
                    </Text>
                    {row.belowThreshold && (
                      <Text style={styles.notEnough}>need {3 - row.rounds} more</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Footer */}
        {courseName ? (
          <Text style={styles.footer}>
            Based on your rounds at {courseName} from {tees} tees
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.bg.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.bg.secondary,
  },
  tableHeaderText: {
    color: colors.text.secondary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowBest: {
    backgroundColor: 'rgba(76,175,125,0.08)',
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowDim: {
    opacity: 0.5,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  colClub: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colAvg: {
    flex: 2,
    textAlign: 'center',
  },
  colFw: {
    flex: 1.5,
    textAlign: 'center',
  },
  colRounds: {
    flex: 1.5,
    alignItems: 'center',
  },
  clubName: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  bestBadge: {
    backgroundColor: 'rgba(76,175,125,0.2)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  bestBadgeText: {
    color: '#4CAF7D',
    fontSize: 9,
    fontWeight: '700',
  },
  avgText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  metaText: {
    color: colors.text.secondary,
    fontSize: 13,
    textAlign: 'center',
  },
  textDim: {
    color: colors.text.secondary,
  },
  notEnough: {
    color: colors.text.secondary,
    fontSize: 9,
    marginTop: 1,
    textAlign: 'center',
  },
  empty: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  footer: {
    color: colors.text.secondary,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
});
