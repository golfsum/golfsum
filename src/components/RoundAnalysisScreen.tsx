import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { SavedRound } from '../types';
import {
  buildRoundAnalysis,
  formatDelta,
  formatScoreDelta,
  getClubMeta,
  getScoreColor,
  type AnalysisTab,
  type DoglegType,
  type GroupCard,
} from '../services/roundAnalysisService';

interface Props {
  round: SavedRound;
  onBack: () => void;
}

const TAB_LABELS: Array<{ key: AnalysisTab; label: string }> = [
  { key: 'coaching', label: 'Coaching' },
  { key: 'holes', label: 'Holes' },
  { key: 'averages', label: 'Averages' },
  { key: 'dispersion', label: 'Disp.' },
];

const toneColor = (tone: 'green' | 'amber' | 'red' | 'white') => {
  if (tone === 'green') return '#4CAF7D';
  if (tone === 'amber') return '#FBBF24';
  if (tone === 'red') return '#F87171';
  return '#FFFFFF';
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);

const shotBadge = (dogleg: DoglegType) => {
  if (dogleg === 'right') return '->';
  if (dogleg === 'left') return '<-';
  return '--';
};

export function RoundAnalysisScreen({ round, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('coaching');
  const [holesMode, setHolesMode] = useState<'par' | 'dogleg'>('par');
  const [expandedClub, setExpandedClub] = useState<string | null>(null);
  const [selectedDispersionClub, setSelectedDispersionClub] = useState<string | null>(null);

  const analysis = useMemo(() => buildRoundAnalysis(round), [round]);
  const selectedDispersion = useMemo(() => {
    if (!analysis.dispersionClubs.length) return null;
    return analysis.dispersionClubs.find((club) => club.club === selectedDispersionClub) ?? analysis.dispersionClubs[0];
  }, [analysis.dispersionClubs, selectedDispersionClub]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navButton} onPress={onBack}>
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.78)" />
          </TouchableOpacity>
          <View style={styles.navCopy}>
            <Text style={styles.courseName} numberOfLines={1}>{round.courseName}</Text>
            <Text style={styles.navSub}>
              {formatDate(round.date)}
              {analysis.playTimeLabel ? ` • ${analysis.playTimeLabel}` : ''}
            </Text>
          </View>
          <View style={styles.scoreBadge}>
            <Text style={[styles.scoreBadgeText, { color: analysis.scoreToPar > 0 ? '#F87171' : analysis.scoreToPar < 0 ? '#4CAF7D' : '#FFFFFF' }]}>
              {analysis.scoreToPar > 0 ? `+${analysis.scoreToPar}` : analysis.scoreToPar < 0 ? `${analysis.scoreToPar}` : 'E'}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scoreStrip}>
            {analysis.scoreCells.map((cell) => (
              <View key={cell.number} style={[styles.scoreCell, { backgroundColor: getScoreColor(cell.delta) }]}>
                <Text style={styles.scoreCellHole}>{cell.number}</Text>
                <Text style={styles.scoreCellDelta}>{formatScoreDelta(cell.delta)}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.tabBar}>
            {TAB_LABELS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabPill, activeTab === tab.key ? styles.tabPillActive : null]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'coaching' ? (
            <CoachingTab analysis={analysis} />
          ) : null}

          {activeTab === 'holes' ? (
            <HolesTab analysis={analysis} holesMode={holesMode} onSetHolesMode={setHolesMode} />
          ) : null}

          {activeTab === 'averages' ? (
            <AveragesTab analysis={analysis} expandedClub={expandedClub} onSetExpandedClub={setExpandedClub} />
          ) : null}

          {activeTab === 'dispersion' ? (
            <DispersionTab
              analysis={analysis}
              selectedDispersionClub={selectedDispersionClub}
              onSetSelectedDispersionClub={setSelectedDispersionClub}
              selectedDispersion={selectedDispersion}
            />
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function CoachingTab({ analysis }: { analysis: ReturnType<typeof buildRoundAnalysis> }) {
  return (
    <>
      <View style={styles.overviewGrid}>
        {analysis.overviewCells.map((cell) => (
          <View key={cell.label} style={styles.overviewCell}>
            <Text style={styles.overviewLabel}>{cell.label}</Text>
            <Text style={[styles.overviewValue, { color: toneColor(cell.tone) }]}>{cell.value}</Text>
          </View>
        ))}
      </View>

      {analysis.strengthCard ? <InsightCard {...analysis.strengthCard} heading="Strength" /> : null}
      {analysis.focusCard ? <InsightCard {...analysis.focusCard} heading="Focus Area" /> : null}
      {analysis.shapeStrengthCard ? <InsightCard {...analysis.shapeStrengthCard} heading="Shape Strength" /> : null}
      {analysis.shapeFocusCard ? <InsightCard {...analysis.shapeFocusCard} heading="Shape Focus" /> : null}

      <SectionTitle title="Pattern Insights" />
      {analysis.patternInsights.length ? (
        analysis.patternInsights.map((insight) => (
          <InsightListRow key={`${insight.badge}-${insight.title}`} {...insight} />
        ))
      ) : (
        <EmptyCard message="No strong scoring pattern fired from this round yet." />
      )}
    </>
  );
}

function HolesTab({
  analysis,
  holesMode,
  onSetHolesMode,
}: {
  analysis: ReturnType<typeof buildRoundAnalysis>;
  holesMode: 'par' | 'dogleg';
  onSetHolesMode: (value: 'par' | 'dogleg') => void;
}) {
  const groups = holesMode === 'par' ? analysis.parGroups : analysis.doglegGroups.filter((group) => group.holeCount > 0);
  return (
    <>
      <View style={styles.subToggle}>
        <TouchableOpacity
          style={[styles.subTogglePill, holesMode === 'par' ? styles.subTogglePillActive : null]}
          onPress={() => onSetHolesMode('par')}
        >
          <Text style={[styles.subToggleText, holesMode === 'par' ? styles.subToggleTextActive : null]}>By Par</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTogglePill, holesMode === 'dogleg' ? styles.subTogglePillActive : null]}
          onPress={() => onSetHolesMode('dogleg')}
        >
          <Text style={[styles.subToggleText, holesMode === 'dogleg' ? styles.subToggleTextActive : null]}>By Dogleg</Text>
        </TouchableOpacity>
      </View>
      {groups.map((group) => (
        <GroupCardView key={group.key} group={group} mode={holesMode} />
      ))}
    </>
  );
}

function AveragesTab({
  analysis,
  expandedClub,
  onSetExpandedClub,
}: {
  analysis: ReturnType<typeof buildRoundAnalysis>;
  expandedClub: string | null;
  onSetExpandedClub: (value: string | null) => void;
}) {
  return (
    <>
      <SectionTitle title="Shots By Lie" />
      {analysis.lieSummaries.length ? (
        <View style={styles.lieWrap}>
          {analysis.lieSummaries.map((lie) => (
            <View key={lie.lie} style={[styles.liePill, { borderColor: `${lie.color}66`, backgroundColor: `${lie.color}15` }]}>
              <Text style={[styles.liePillText, { color: lie.color }]}>{lie.lie}</Text>
              <Text style={styles.liePillCount}>{lie.count}</Text>
            </View>
          ))}
        </View>
      ) : (
        <EmptyCard message="This round does not have lie-tagged shot data yet." />
      )}

      <SectionTitle title="Club Averages" />
      {analysis.clubAverageRows.length ? (
        analysis.clubAverageRows.map((row) => {
          const meta = getClubMeta(row.club);
          const expanded = expandedClub === row.club;
          return (
            <View key={row.club} style={styles.clubCard}>
              <TouchableOpacity style={styles.clubRow} onPress={() => onSetExpandedClub(expanded ? null : row.club)}>
                <View style={styles.clubRowLeft}>
                  <View style={[styles.clubColor, { backgroundColor: meta.color }]} />
                  <View>
                    <Text style={styles.clubName}>{row.clubLabel}</Text>
                    <Text style={styles.clubMeta}>{row.count} shot{row.count === 1 ? '' : 's'}</Text>
                  </View>
                </View>
                <View style={styles.clubStats}>
                  <StatBlock label="GPS" value={row.gpsAvg !== null ? `${Math.round(row.gpsAvg)}y` : '—'} />
                  <StatBlock label="PLAYING" value={row.playingAvg !== null ? `${Math.round(row.playingAvg)}y` : '—'} highlight />
                </View>
              </TouchableOpacity>
              {expanded ? row.byLie.map((lieRow) => (
                <View key={`${row.club}-${lieRow.lie}`} style={styles.clubLieRow}>
                  <View style={styles.clubLieLeft}>
                    <View style={[styles.lieDot, { backgroundColor: lieRow.color }]} />
                    <Text style={[styles.clubLieLabel, { color: lieRow.color }]}>{lieRow.lie}</Text>
                  </View>
                  <Text style={styles.clubLieValue}>{lieRow.gpsAvg !== null ? `${Math.round(lieRow.gpsAvg)}y` : '—'}</Text>
                  <Text style={styles.clubLieValue}>{lieRow.playingAvg !== null ? `${Math.round(lieRow.playingAvg)}y` : '—'}</Text>
                  <Text style={[styles.clubLieDelta, lieRow.deltaVsFairway !== null ? { color: lieRow.deltaVsFairway <= 0 ? '#4CAF7D' : '#F87171' } : null]}>
                    {lieRow.deltaVsFairway !== null ? `${lieRow.deltaVsFairway > 0 ? '+' : ''}${lieRow.deltaVsFairway}` : '—'}
                  </Text>
                </View>
              )) : null}
            </View>
          );
        })
      ) : (
        <EmptyCard message="Club averages need shot-level distance data from the round log." />
      )}

      <SectionTitle title="Tee Shot Tendencies" />
      <View style={styles.tendencyCard}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${analysis.teeShotTendency.fairwayPct ?? 0}%` }]} />
        </View>
        <View style={styles.tendencyRow}>
          <Text style={styles.tendencyMain}>
            Fairways {analysis.teeShotTendency.fairwayPct !== null ? `${analysis.teeShotTendency.fairwayPct}%` : '—'}
          </Text>
          <Text style={styles.tendencySub}>
            L {analysis.teeShotTendency.leftCount} · R {analysis.teeShotTendency.rightCount}
          </Text>
        </View>
        {analysis.teeShotTendency.label ? <Text style={styles.tendencyFlag}>{analysis.teeShotTendency.label}</Text> : null}
      </View>
    </>
  );
}

function DispersionTab({
  analysis,
  selectedDispersionClub,
  onSetSelectedDispersionClub,
  selectedDispersion,
}: {
  analysis: ReturnType<typeof buildRoundAnalysis>;
  selectedDispersionClub: string | null;
  onSetSelectedDispersionClub: (value: string | null) => void;
  selectedDispersion: ReturnType<typeof buildRoundAnalysis>['dispersionClubs'][number] | null;
}) {
  if (!analysis.dispersionClubs.length) {
    return <EmptyCard message="Dispersion needs at least three GPS-tagged shots with map coordinates for a club." />;
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dispersionTabs}>
        {analysis.dispersionClubs.map((club) => (
          <TouchableOpacity
            key={club.club}
            style={[
              styles.dispersionChip,
              selectedDispersionClub === club.club || (!selectedDispersionClub && selectedDispersion?.club === club.club)
                ? { borderColor: club.color, backgroundColor: `${club.color}15` }
                : null,
            ]}
            onPress={() => onSetSelectedDispersionClub(club.club)}
          >
            <Text style={[styles.dispersionChipText, selectedDispersion?.club === club.club ? { color: club.color } : null]}>{club.clubLabel}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selectedDispersion ? (
        <>
          <View style={styles.scatterCard}>
            <View style={styles.scatterMap}>
              <View style={styles.outerEllipse} />
              <View style={styles.innerEllipse} />
              <View style={styles.flagPole} />
              <View style={styles.flagHead} />
              <View style={styles.centerCrossH} />
              <View style={styles.centerCrossV} />
              <Text style={styles.quadrantTop}>LONG</Text>
              <Text style={styles.quadrantBottom}>SHORT</Text>
              <Text style={styles.quadrantLeft}>LEFT</Text>
              <Text style={styles.quadrantRight}>RIGHT</Text>
              {selectedDispersion.points.map((point, index) => (
                <View
                  key={`${selectedDispersion.club}-${index}`}
                  style={[
                    styles.scatterDot,
                    { backgroundColor: selectedDispersion.color, left: 90 + point.x, top: 90 + point.y },
                  ]}
                />
              ))}
              {selectedDispersion.centroid ? (
                <View
                  style={[
                    styles.centroidRing,
                    {
                      borderColor: `${selectedDispersion.color}AA`,
                      left: 84 + selectedDispersion.centroid.x,
                      top: 84 + selectedDispersion.centroid.y,
                    },
                  ]}
                />
              ) : null}
            </View>
          </View>

          <View style={styles.dispersionStats}>
            <StatCell label="AVG MISS" value={selectedDispersion.missLabel} color={selectedDispersion.color} />
            <StatCell label="SPREAD" value={selectedDispersion.spread !== null ? `±${selectedDispersion.spread}y` : '—'} />
            <StatCell label="SHOTS" value={`${selectedDispersion.shots.length}`} />
          </View>

          <View style={styles.patternCard}>
            <Text style={styles.patternTitle}>Pattern</Text>
            <Text style={styles.patternBody}>{selectedDispersion.note}</Text>
          </View>
        </>
      ) : null}
    </>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function EmptyCard({ message }: { message: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function InsightCard({
  heading,
  badge,
  title,
  tone,
  note,
}: {
  heading: string;
  badge: string;
  title: string;
  tone: 'green' | 'amber' | 'red';
  note: string;
}) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightHeader}>
        <Text style={styles.insightEyebrow}>{heading}</Text>
      </View>
      <View style={styles.insightMain}>
        <View style={[styles.insightBadge, { backgroundColor: `${toneColor(tone)}20`, borderColor: `${toneColor(tone)}55` }]}>
          <Text style={[styles.insightBadgeText, { color: toneColor(tone) }]}>{badge}</Text>
        </View>
        <View style={styles.insightCopy}>
          <Text style={[styles.insightTitle, { color: toneColor(tone) }]}>{title}</Text>
          <Text style={styles.insightNote}>{note}</Text>
        </View>
      </View>
    </View>
  );
}

function InsightListRow({
  badge,
  title,
  tone,
  note,
}: {
  badge: string;
  title: string;
  tone: 'green' | 'amber' | 'red';
  note: string;
}) {
  return (
    <View style={styles.listInsightRow}>
      <View style={[styles.listInsightBadge, { backgroundColor: `${toneColor(tone)}20`, borderColor: `${toneColor(tone)}55` }]}>
        <Text style={[styles.listInsightBadgeText, { color: toneColor(tone) }]}>{badge}</Text>
      </View>
      <View style={styles.listInsightCopy}>
        <Text style={[styles.listInsightTitle, { color: toneColor(tone) }]}>{title}</Text>
        <Text style={styles.listInsightNote}>{note}</Text>
      </View>
    </View>
  );
}

function GroupCardView({ group, mode }: { group: GroupCard; mode: 'par' | 'dogleg' }) {
  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <View style={styles.groupHeaderLeft}>
          <View style={[styles.groupBadge, { borderColor: `${toneColor(group.tone)}44`, backgroundColor: `${toneColor(group.tone)}18` }]}>
            <Text style={[styles.groupBadgeText, { color: toneColor(group.tone) }]}>
              {mode === 'par' ? group.label.replace('Par ', 'P') : shotBadge(group.key as DoglegType)}
            </Text>
          </View>
          <View>
            <Text style={styles.groupLabel}>{group.label}</Text>
            <Text style={styles.groupSub}>{group.holeCount} hole{group.holeCount === 1 ? '' : 's'}</Text>
          </View>
        </View>
        <Text style={[styles.groupValue, { color: toneColor(group.tone) }]}>{formatDelta(group.avgDelta)}</Text>
      </View>

      <View style={styles.distributionRow}>
        {group.holes.map((hole) => (
          <View key={`${group.key}-${hole.number}`} style={[styles.distributionDot, { backgroundColor: getScoreColor(hole.delta) }]}>
            <Text style={styles.distributionDotText}>{formatScoreDelta(hole.delta)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.miniGrid}>
        <MiniCell label="Birdies" value={`${group.birdies}`} />
        <MiniCell label="Pars" value={`${group.pars}`} />
        <MiniCell label="Over" value={`${group.overPar}`} />
      </View>

      {mode === 'par' && group.fairwayTotal > 0 ? (
        <View style={styles.groupFairwayRow}>
          <Text style={styles.groupFairwayLabel}>Fairway %</Text>
          <Text style={styles.groupFairwayValue}>{Math.round((group.fairwayHitCount / group.fairwayTotal) * 100)}%</Text>
        </View>
      ) : null}

      <View style={styles.holeChipWrap}>
        {group.holes.map((hole) => (
          <View key={`hole-chip-${group.key}-${hole.number}`} style={styles.holeChip}>
            <Text style={styles.holeChipLabel}>H{hole.number}</Text>
            <Text style={[styles.holeChipValue, { color: toneColor(hole.delta > 1 ? 'red' : hole.delta > 0 ? 'amber' : hole.delta < 0 ? 'green' : 'white') }]}>
              {formatScoreDelta(hole.delta)}
            </Text>
          </View>
        ))}
      </View>

      {group.coachingNote ? (
        <Text style={[styles.groupNote, { color: (group.avgDelta ?? 0) > 0.5 ? '#F87171' : '#4CAF7D' }]}>{group.coachingNote}</Text>
      ) : null}
    </View>
  );
}

function StatBlock({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[styles.statBlock, highlight ? styles.statBlockHighlight : null]}>
      <Text style={styles.statBlockLabel}>{label}</Text>
      <Text style={[styles.statBlockValue, highlight ? styles.statBlockValueHighlight : null]}>{value}</Text>
    </View>
  );
}

function MiniCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniCell}>
      <Text style={styles.miniCellLabel}>{label}</Text>
      <Text style={styles.miniCellValue}>{value}</Text>
    </View>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statCellLabel}>{label}</Text>
      <Text style={[styles.statCellValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050505' },
  container: { flex: 1, backgroundColor: '#050505' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 28 },
  navBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  navButton: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  navCopy: { flex: 1, minWidth: 0 },
  courseName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  navSub: { color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 2 },
  scoreBadge: {
    minWidth: 54, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center',
  },
  scoreBadgeText: { fontSize: 14, fontWeight: '800' },
  scoreStrip: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 8 },
  scoreCell: { width: 46, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  scoreCellHole: { color: 'rgba(255,255,255,0.58)', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  scoreCellDelta: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  tabBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tabPill: {
    flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  tabPillActive: { backgroundColor: '#4CAF7D18', borderColor: '#4CAF7D66' },
  tabText: { color: 'rgba(255,255,255,0.42)', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#4CAF7D' },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginTop: 6 },
  overviewCell: {
    width: '31%', minWidth: 104, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 12,
  },
  overviewLabel: { color: 'rgba(255,255,255,0.34)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  overviewValue: { marginTop: 8, fontSize: 20, fontWeight: '800' },
  sectionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', paddingHorizontal: 16, marginTop: 18, marginBottom: 10 },
  insightCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  insightHeader: { marginBottom: 10 },
  insightEyebrow: { color: 'rgba(255,255,255,0.32)', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  insightMain: { flexDirection: 'row', gap: 12 },
  insightBadge: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  insightBadgeText: { fontSize: 14, fontWeight: '800' },
  insightCopy: { flex: 1 },
  insightTitle: { fontSize: 15, fontWeight: '700' },
  insightNote: { marginTop: 6, color: 'rgba(255,255,255,0.66)', fontSize: 13, lineHeight: 19 },
  listInsightRow: {
    marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 12, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', gap: 12,
  },
  listInsightBadge: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  listInsightBadgeText: { fontSize: 12, fontWeight: '800' },
  listInsightCopy: { flex: 1 },
  listInsightTitle: { fontSize: 13, fontWeight: '700' },
  listInsightNote: { marginTop: 4, color: 'rgba(255,255,255,0.62)', fontSize: 12, lineHeight: 18 },
  subToggle: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 8 },
  subTogglePill: {
    flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  subTogglePillActive: { backgroundColor: '#4CAF7D18', borderColor: '#4CAF7D66' },
  subToggleText: { color: 'rgba(255,255,255,0.42)', fontSize: 12, fontWeight: '700' },
  subToggleTextActive: { color: '#4CAF7D' },
  groupCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupBadge: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  groupBadgeText: { fontSize: 12, fontWeight: '800' },
  groupLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  groupSub: { color: 'rgba(255,255,255,0.34)', fontSize: 11, marginTop: 2 },
  groupValue: { fontSize: 22, fontWeight: '800' },
  distributionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  distributionDot: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  distributionDotText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  miniGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  miniCell: { flex: 1, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.03)', paddingVertical: 10, alignItems: 'center' },
  miniCellLabel: { color: 'rgba(255,255,255,0.34)', fontSize: 10 },
  miniCellValue: { marginTop: 4, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  groupFairwayRow: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' },
  groupFairwayLabel: { color: 'rgba(255,255,255,0.34)', fontSize: 12 },
  groupFairwayValue: { color: '#4CAF7D', fontSize: 12, fontWeight: '700' },
  holeChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  holeChip: {
    flexDirection: 'row', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  holeChipLabel: { color: 'rgba(255,255,255,0.42)', fontSize: 11, fontWeight: '700' },
  holeChipValue: { fontSize: 11, fontWeight: '800' },
  groupNote: { marginTop: 14, fontSize: 12, lineHeight: 18 },
  lieWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  liePill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  liePillText: { fontSize: 12, fontWeight: '700' },
  liePillCount: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' },
  clubCard: {
    marginHorizontal: 16, marginBottom: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden',
  },
  clubRow: { paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  clubRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  clubColor: { width: 10, height: 38, borderRadius: 6 },
  clubName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  clubMeta: { color: 'rgba(255,255,255,0.34)', fontSize: 11, marginTop: 3 },
  clubStats: { flexDirection: 'row', gap: 8 },
  statBlock: { minWidth: 66, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
  statBlockHighlight: { backgroundColor: '#4CAF7D18' },
  statBlockLabel: { color: 'rgba(255,255,255,0.34)', fontSize: 10, fontWeight: '700' },
  statBlockValue: { marginTop: 4, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  statBlockValueHighlight: { color: '#4CAF7D' },
  clubLieRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', gap: 8,
  },
  clubLieLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lieDot: { width: 6, height: 6, borderRadius: 3 },
  clubLieLabel: { fontSize: 12, fontWeight: '700' },
  clubLieValue: { width: 56, color: '#FFFFFF', fontSize: 12, textAlign: 'right' },
  clubLieDelta: { width: 40, fontSize: 12, fontWeight: '700', textAlign: 'right', color: 'rgba(255,255,255,0.36)' },
  tendencyCard: {
    marginHorizontal: 16, borderRadius: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#4CAF7D' },
  tendencyRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' },
  tendencyMain: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  tendencySub: { color: 'rgba(255,255,255,0.42)', fontSize: 12 },
  tendencyFlag: { marginTop: 10, color: '#FBBF24', fontSize: 12, fontWeight: '700' },
  dispersionTabs: { paddingHorizontal: 16, gap: 8 },
  dispersionChip: {
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12, paddingVertical: 7,
  },
  dispersionChipText: { color: 'rgba(255,255,255,0.52)', fontSize: 12, fontWeight: '700' },
  scatterCard: {
    marginHorizontal: 16, marginTop: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 16, alignItems: 'center',
  },
  scatterMap: { width: 220, height: 220, position: 'relative' },
  outerEllipse: {
    position: 'absolute', left: 10, top: 30, width: 200, height: 150, borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderStyle: 'dashed',
  },
  innerEllipse: { position: 'absolute', left: 25, top: 42, width: 170, height: 126, borderRadius: 85, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  flagPole: { position: 'absolute', left: 109, top: 32, width: 2, height: 28, backgroundColor: 'rgba(255,255,255,0.85)' },
  flagHead: {
    position: 'absolute', left: 110, top: 32, width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 6, borderLeftWidth: 11,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#F87171',
  },
  centerCrossH: { position: 'absolute', left: 103, top: 102, width: 14, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  centerCrossV: { position: 'absolute', left: 110, top: 95, width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.45)' },
  quadrantTop: { position: 'absolute', top: 8, left: 92, color: 'rgba(255,255,255,0.28)', fontSize: 10, fontWeight: '700' },
  quadrantBottom: { position: 'absolute', bottom: 8, left: 88, color: 'rgba(255,255,255,0.28)', fontSize: 10, fontWeight: '700' },
  quadrantLeft: { position: 'absolute', top: 100, left: 0, color: 'rgba(255,255,255,0.28)', fontSize: 10, fontWeight: '700' },
  quadrantRight: { position: 'absolute', top: 100, right: 0, color: 'rgba(255,255,255,0.28)', fontSize: 10, fontWeight: '700' },
  scatterDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, marginLeft: -4, marginTop: -4 },
  centroidRing: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', marginLeft: -10, marginTop: -10 },
  dispersionStats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  statCell: {
    flex: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12, alignItems: 'center',
  },
  statCellLabel: { color: 'rgba(255,255,255,0.34)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  statCellValue: { marginTop: 6, color: '#FFFFFF', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  patternCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  patternTitle: { color: 'rgba(255,255,255,0.34)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  patternBody: { marginTop: 8, color: 'rgba(255,255,255,0.68)', fontSize: 13, lineHeight: 19 },
  emptyCard: {
    marginHorizontal: 16, borderRadius: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 19 },
});
