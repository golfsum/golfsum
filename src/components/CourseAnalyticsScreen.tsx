import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SavedRound } from '../types';
import { getRounds } from '../services/roundsService';
import { formatCourseName } from '../utils/courseName';
import { Sparkline } from './Sparkline';
import { colors, spacing, typography, radius } from '../theme/tokens';
import { buildCourseHoleInsights, formatMissForTable } from '../services/courseHoleInsightsService';
import { deleteHoleNote, getCourseHoleNotes, saveHoleNote, type HoleNote } from '../services/holeNotesService';
import { EMPTY_STATE_COPY } from '../constants/emptyStateCopy';

interface CourseAnalyticsScreenProps {
  courseName: string;
  onBack: () => void;
  onSelectRound?: (round: SavedRound) => void;
}

const normalizeCourseName = (name: string) => name.trim().toLowerCase();

const percentTone = (value: number | null, good: number, warn: number) => {
  if (value === null) return styles.metricNeutral;
  if (value >= good) return styles.metricGood;
  if (value < warn) return styles.metricBad;
  return styles.metricWarn;
};

const puttTone = (value: number | null) => {
  if (value === null) return styles.metricNeutral;
  if (value <= 1.5) return styles.metricGood;
  if (value > 2.0) return styles.metricBad;
  return styles.metricWarn;
};

export const CourseAnalyticsScreen: React.FC<CourseAnalyticsScreenProps> = ({
  courseName,
  onBack,
  onSelectRound,
}) => {
  const [courseRounds, setCourseRounds] = useState<SavedRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<'number' | 'difficulty'>('number');
  const [holeNotesByHole, setHoleNotesByHole] = useState<Record<number, HoleNote[]>>({});
  const [expandedHoleNote, setExpandedHoleNote] = useState<number | null>(null);
  const [noteDraftByHole, setNoteDraftByHole] = useState<Record<number, string>>({});

  useEffect(() => {
    const loadRounds = async () => {
      setLoading(true);
      try {
        const allRounds = await getRounds();
        const target = normalizeCourseName(courseName);
        const filtered = allRounds.filter(round => normalizeCourseName(round.courseName || '') === target);
        setCourseRounds(filtered);
      } finally {
        setLoading(false);
      }
    };
    loadRounds();
  }, [courseName]);

  const effectiveCourseId = useMemo(() => {
    const withCourseId = courseRounds.find(r => !!r.courseId)?.courseId;
    if (withCourseId) return withCourseId;
    return normalizeCourseName(courseName);
  }, [courseName, courseRounds]);

  useEffect(() => {
    let alive = true;
    const loadNotes = async () => {
      try {
        const notes = await getCourseHoleNotes(effectiveCourseId);
        if (!alive) return;
        const grouped: Record<number, HoleNote[]> = {};
        notes.forEach(note => {
          if (!grouped[note.holeNumber]) grouped[note.holeNumber] = [];
          grouped[note.holeNumber].push(note);
        });
        setHoleNotesByHole(grouped);
      } catch {
        if (alive) setHoleNotesByHole({});
      }
    };
    loadNotes();
    return () => {
      alive = false;
    };
  }, [effectiveCourseId]);

  const recentNoteByHole = useMemo(() => {
    const out: Record<number, { text: string; roundDate?: string | null }> = {};
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
    Object.entries(holeNotesByHole).forEach(([holeStr, notes]) => {
      const recent = (notes || []).find(note => new Date(note.createdAt).getTime() >= cutoff);
      if (recent) {
        out[Number(holeStr)] = { text: recent.text, roundDate: recent.roundDate };
      }
    });
    return out;
  }, [holeNotesByHole]);

  const insights = useMemo(
    () => buildCourseHoleInsights(courseRounds, recentNoteByHole),
    [courseRounds, recentNoteByHole]
  );

  const holeRows = useMemo(() => {
    if (!insights) return [];
    const rows = [...insights.holeRows];
    if (sortMode === 'difficulty') {
      return rows.sort((a, b) => b.scoreToPar - a.scoreToPar);
    }
    return rows.sort((a, b) => a.number - b.number);
  }, [insights, sortMode]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingState}>
          <Ionicons name="analytics-outline" size={40} color={colors.text.tertiary} />
          <Text style={styles.loadingText}>Loading course stats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!insights) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Course Stats</Text>
          </View>
          <View style={styles.emptyState}>
            <Ionicons name="golf-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.emptyTitle}>{EMPTY_STATE_COPY.titles.noRoundsHereYet}</Text>
            <Text style={styles.emptyText}>
              Play or import a round at {formatCourseName(courseName)} to unlock hole insights.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const formattedCourseName = formatCourseName(courseName);

  const saveNoteForHole = async (holeNumber: number) => {
    const draft = (noteDraftByHole[holeNumber] || '').trim();
    if (!draft) return;
    await saveHoleNote({
      courseId: effectiveCourseId,
      holeNumber,
      text: draft,
      roundId: null,
      roundDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
    const notes = await getCourseHoleNotes(effectiveCourseId);
    const grouped: Record<number, HoleNote[]> = {};
    notes.forEach(note => {
      if (!grouped[note.holeNumber]) grouped[note.holeNumber] = [];
      grouped[note.holeNumber].push(note);
    });
    setHoleNotesByHole(grouped);
    setNoteDraftByHole(prev => ({ ...prev, [holeNumber]: '' }));
    setExpandedHoleNote(holeNumber);
  };

  const deleteNoteForHole = async (holeNumber: number, noteId: string) => {
    await deleteHoleNote(noteId);
    const next = (holeNotesByHole[holeNumber] || []).filter(n => n.id !== noteId);
    setHoleNotesByHole(prev => ({ ...prev, [holeNumber]: next }));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Course Stats</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryCard}>
            <Text style={styles.courseName}>{formattedCourseName}</Text>
            <Text style={styles.summaryMeta}>{insights.summary.roundsPlayed} rounds · Since {insights.summary.sinceDate}</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryBlock}>
                <Text style={styles.summaryLabel}>Average Score</Text>
                <Text style={styles.summaryValue}>{insights.summary.averageScore.toFixed(1)}</Text>
              </View>
              <View style={styles.summaryBlock}>
                <Text style={styles.summaryLabel}>Best Round</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (!onSelectRound) return;
                    const best = courseRounds.find(r => r.score === insights.summary.bestScore);
                    if (best) onSelectRound(best);
                  }}
                  disabled={!onSelectRound}
                >
                  <Text style={styles.summaryValue}>{insights.summary.bestScore}</Text>
                  <Text style={styles.summarySubValue}>on {insights.summary.bestDate}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.sparklineCard}>
              <Text style={styles.sparklineTitle}>Scoring Trend</Text>
              <Sparkline values={insights.summary.trend} height={52} />
            </View>
          </View>

          <View style={styles.planCard}>
            <Text style={styles.planTitle}>{insights.preRoundPlan.title}</Text>
            <Text style={styles.planLine}>{insights.preRoundPlan.line1}</Text>
            <Text style={styles.planLine}>{insights.preRoundPlan.line2}</Text>
            <Text style={styles.planLine}>{insights.preRoundPlan.line3}</Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Scoring by Par Type</Text>
            <Text style={styles.sectionBody}>{insights.summary.parTypeText}</Text>
            {insights.summary.worstParTypeText && (
              <Text style={styles.sectionAccent}>{insights.summary.worstParTypeText}</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Putting at This Course</Text>
            <Text style={styles.sectionBody}>{insights.summary.puttingText}</Text>
          </View>

          {insights.summary.ballStrikingAvailable ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Ball Striking Snapshot</Text>
              <Text style={styles.sectionBody}>{insights.summary.ballStrikingText}</Text>
              {!!insights.summary.ballStrikingSampleText && (
                <Text style={styles.sectionSubtle}>{insights.summary.ballStrikingSampleText}</Text>
              )}
            </View>
          ) : (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Ball Striking Snapshot</Text>
              <Text style={styles.sectionBody}>{insights.summary.ballStrikingText}</Text>
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Hole-by-Hole Breakdown</Text>
            <TouchableOpacity
              style={styles.sortToggle}
              onPress={() => setSortMode(prev => (prev === 'number' ? 'difficulty' : 'number'))}
            >
              <Ionicons name="swap-vertical" size={14} color={colors.text.secondary} />
              <Text style={styles.sortToggleText}>{sortMode === 'number' ? 'Sort by difficulty' : 'Sort by hole'}</Text>
            </TouchableOpacity>
          </View>

          {insights.singleRoundMode && (
            <Text style={styles.singleRoundNote}>Single-round data: percentages are directional only.</Text>
          )}

          <View style={styles.holeHeaderRow}>
            <Text style={styles.holeHeader}>Hole</Text>
            <Text style={styles.holeHeader}>Par</Text>
            <Text style={styles.holeHeader}>Avg</Text>
            <Text style={styles.holeHeader}>+/−</Text>
            <Text style={styles.holeHeader}>FIR</Text>
            <Text style={styles.holeHeader}>GIR</Text>
            <Text style={styles.holeHeader}>Putts</Text>
            <Text style={styles.holeHeaderWide}>Miss</Text>
          </View>

          {holeRows.map((row) => {
            const miss = formatMissForTable(row, insights.singleRoundMode);
            const scoreLabel = row.scoreToPar >= 0 ? `+${row.scoreToPar.toFixed(1)}` : row.scoreToPar.toFixed(1);
            const notesForHole = holeNotesByHole[row.number] || [];
            const noteExpanded = expandedHoleNote === row.number;
            return (
              <View key={`hole-${row.number}`}>
                <TouchableOpacity
                  style={styles.holeRow}
                  onPress={() => setExpandedHoleNote(noteExpanded ? null : row.number)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.holeCell}>{row.number}</Text>
                  <Text style={styles.holeCell}>{row.par}</Text>
                  <Text style={styles.holeCell}>{row.avgScore.toFixed(1)}</Text>
                  <Text style={[styles.holeCell, row.scoreToPar > 0 ? styles.metricBad : styles.metricGood]}>{scoreLabel}</Text>
                  <Text style={[styles.holeCell, percentTone(row.firPct, 60, 30)]}>{row.par === 3 ? '—' : row.firPct !== null ? `${Math.round(row.firPct)}%` : '—'}</Text>
                  <Text style={[styles.holeCell, percentTone(row.girPct, 50, 20)]}>{row.girPct !== null ? `${Math.round(row.girPct)}%` : '—'}</Text>
                  <Text style={[styles.holeCell, puttTone(row.avgPutts)]}>{row.avgPutts !== null ? row.avgPutts.toFixed(1) : '—'}</Text>
                  <View style={styles.holeCellWideWrap}>
                    <Text style={[styles.holeCellWide, miss.tone === 'good' ? styles.metricGood : miss.tone === 'warn' ? styles.metricWarn : miss.tone === 'info' ? styles.metricInfo : styles.metricNeutral]}>{miss.text}</Text>
                    {notesForHole.length > 0 && <Ionicons name="create-outline" size={12} color={colors.text.secondary} />}
                  </View>
                </TouchableOpacity>
                {noteExpanded && (
                  <View style={styles.holeNotesPanel}>
                    {notesForHole.length > 0 ? (
                      notesForHole.map(note => (
                        <View key={note.id} style={styles.holeNoteRow}>
                          <Text style={styles.holeNoteText}>
                            <Text style={styles.holeNoteDate}>{note.roundDate || '—'}: </Text>
                            {note.text}
                          </Text>
                          <TouchableOpacity onPress={() => deleteNoteForHole(row.number, note.id)}>
                            <Ionicons name="close" size={14} color={colors.text.secondary} />
                          </TouchableOpacity>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.holeNoteEmpty}>No notes yet.</Text>
                    )}
                    <View style={styles.holeNoteComposer}>
                      <TextInput
                        style={styles.holeNoteInput}
                        placeholder="Add note for this hole..."
                        placeholderTextColor={colors.text.tertiary}
                        value={noteDraftByHole[row.number] || ''}
                        onChangeText={(value) => setNoteDraftByHole(prev => ({ ...prev, [row.number]: value }))}
                        maxLength={200}
                      />
                      <TouchableOpacity style={styles.holeNoteSaveBtn} onPress={() => saveNoteForHole(row.number)}>
                        <Text style={styles.holeNoteSaveBtnText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Trouble Holes</Text>
            {insights.troubleInsights.length === 0 && (
              <Text style={styles.sectionBody}>No clear trouble holes yet. Keep tracking to tighten patterns.</Text>
            )}
            {insights.troubleInsights.map((item) => (
              <View key={`trouble-${item.hole}`} style={styles.insightBlock}>
                <Text style={styles.insightTitle}>{item.title}</Text>
                <Text style={styles.insightBody}>{item.body}</Text>
                {!!item.playerNote && (
                  <Text style={styles.insightNote}>
                    Your note{item.playerNoteDate ? ` (${item.playerNoteDate})` : ''}: {item.playerNote}
                  </Text>
                )}
                <Text style={styles.insightAction}>{item.action}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Best Holes</Text>
            {insights.bestInsights.length === 0 && (
              <Text style={styles.sectionBody}>No best-hole pattern yet. More rounds will sharpen this view.</Text>
            )}
            {insights.bestInsights.map((item) => (
              <View key={`best-${item.hole}`} style={styles.insightBlock}>
                <Text style={styles.insightTitle}>{item.title}</Text>
                <Text style={styles.insightBody}>{item.body}</Text>
                {!!item.playerNote && (
                  <Text style={styles.insightNote}>
                    Your note{item.playerNoteDate ? ` (${item.playerNoteDate})` : ''}: {item.playerNote}
                  </Text>
                )}
                <Text style={styles.insightAction}>{item.action}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, backgroundColor: colors.bg.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.bg.elevated,
  },
  backButton: { padding: 6, marginRight: spacing.sm },
  headerTitle: { ...typography.bodyLg, color: colors.text.primary, fontWeight: '600' },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  summaryCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    marginBottom: spacing.lg,
  },
  courseName: { ...typography.displaySm, color: colors.text.primary, marginBottom: spacing.xs },
  summaryMeta: { ...typography.bodySm, color: colors.text.secondary, marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  summaryBlock: { flex: 1 },
  summaryLabel: { ...typography.bodySm, color: colors.text.secondary },
  summaryValue: { fontSize: 28, fontWeight: '700', color: colors.brand.primary },
  summarySubValue: { ...typography.bodySm, color: colors.text.tertiary },
  sparklineCard: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.bg.elevated },
  sparklineTitle: { ...typography.bodySm, color: colors.text.secondary, marginBottom: spacing.xs },

  planCard: {
    backgroundColor: colors.brand.primaryMuted,
    borderColor: colors.brand.primaryBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  planTitle: { ...typography.headingSm, color: colors.text.primary, marginBottom: spacing.xs },
  planLine: { ...typography.bodySm, color: colors.text.primary, marginBottom: 2 },

  sectionHeaderRow: { marginBottom: spacing.sm },
  sectionCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    marginBottom: spacing.lg,
  },
  sectionTitle: { ...typography.bodyMd, color: colors.text.primary, fontWeight: '600', marginBottom: spacing.xs },
  sectionBody: { ...typography.bodySm, color: colors.text.secondary },
  sectionSubtle: { ...typography.bodySm, color: colors.text.tertiary, marginTop: spacing.xs },
  sectionAccent: { ...typography.bodySm, color: colors.brand.primary, marginTop: spacing.xs, fontWeight: '600' },

  sortToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortToggleText: { ...typography.bodySm, color: colors.text.secondary },
  singleRoundNote: { ...typography.bodySm, color: colors.semantic.info, marginBottom: spacing.sm },

  holeHeaderRow: { flexDirection: 'row', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.bg.elevated },
  holeHeader: { width: 40, fontSize: 11, color: colors.text.secondary, fontWeight: '600' },
  holeHeaderWide: { flex: 1, fontSize: 11, color: colors.text.secondary, fontWeight: '600' },
  holeRow: { flexDirection: 'row', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.bg.tertiary },
  holeCell: { width: 40, fontSize: 12, color: colors.text.primary },
  holeCellWide: { flex: 1, fontSize: 12, color: colors.text.primary },
  holeCellWideWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  holeNotesPanel: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    borderTopWidth: 0,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  holeNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingVertical: 4,
  },
  holeNoteText: { ...typography.bodySm, color: colors.text.secondary, flex: 1 },
  holeNoteDate: { color: colors.text.tertiary, fontWeight: '600' },
  holeNoteEmpty: { ...typography.bodySm, color: colors.text.tertiary, marginBottom: spacing.xs },
  holeNoteComposer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  holeNoteInput: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    backgroundColor: colors.bg.primary,
    color: colors.text.primary,
    paddingHorizontal: spacing.sm,
    ...typography.bodySm,
  },
  holeNoteSaveBtn: {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holeNoteSaveBtnText: { ...typography.bodySm, color: colors.text.primary, fontWeight: '600' },

  metricGood: { color: colors.semantic.success },
  metricWarn: { color: colors.semantic.warning },
  metricBad: { color: colors.semantic.error },
  metricInfo: { color: colors.semantic.info },
  metricNeutral: { color: colors.text.secondary },

  insightBlock: { marginTop: spacing.md },
  insightTitle: { ...typography.bodySm, color: colors.text.primary, fontWeight: '600' },
  insightBody: { ...typography.bodySm, color: colors.text.secondary, marginTop: 2 },
  insightNote: {
    ...typography.bodySm,
    color: colors.text.secondary,
    marginTop: 4,
    fontStyle: 'italic',
    borderLeftWidth: 2,
    borderLeftColor: colors.bg.elevated,
    paddingLeft: spacing.xs,
  },
  insightAction: { ...typography.bodySm, color: colors.brand.primary, marginTop: 4, fontWeight: '600' },

  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.bodySm, color: colors.text.tertiary },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  emptyTitle: { ...typography.bodyMd, color: colors.text.primary, fontWeight: '600' },
  emptyText: { ...typography.bodySm, color: colors.text.secondary, textAlign: 'center' },
});
