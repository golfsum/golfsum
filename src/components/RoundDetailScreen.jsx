import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';
import PlayerRatingDelta from './PlayerRatingDelta';
import HoleReviewModal from './gps/HoleReviewModal';
import { buildCaddieNotes } from '../services/caddieNotes';

function CoachNotes({ round, baselineRounds }) {
  const notes = useMemo(() => buildCaddieNotes(round, baselineRounds || []), [round, baselineRounds]);
  const customNote = typeof round.notes === 'string' && round.notes.trim().length > 0
    ? round.notes.trim()
    : null;
  if (!notes.length && !customNote) return null;
  return (
    <View style={coachStyles.section}>
      <Text style={coachStyles.title}>CADDIE NOTES</Text>
      {notes.map((note) => (
        <View key={note.id} style={coachStyles.row}>
          <View style={coachStyles.bullet} />
          <Text style={coachStyles.body}>{note.text}</Text>
        </View>
      ))}
      {customNote ? (
        <View style={[coachStyles.row, { marginTop: notes.length ? 8 : 0 }]}>
          <View style={[coachStyles.bullet, { backgroundColor: 'rgba(148,163,184,0.5)' }]} />
          <Text style={[coachStyles.body, { color: '#94A3B8', fontStyle: 'italic' }]}>
            {customNote}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const coachStyles = StyleSheet.create({
  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.28)',
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  title: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    marginTop: 7,
  },
  body: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 19,
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────
const formatDate = (date) =>
  date instanceof Date
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    : '';

function getScoreLabel(score, par) {
  const diff = score - par;
  if (diff <= -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double';
  return 'Triple+';
}

function getScoreColor(score, par) {
  const diff = score - par;
  if (diff <= -2) return colors.score.eagle;
  if (diff === -1) return colors.score.birdie;
  if (diff === 0) return colors.score.par;
  if (diff === 1) return colors.score.bogey;
  return colors.score.double;
}

function shouldShowCircle(score, par) {
  return (score - par) <= -1;
}

function getPageTitle(scoreToPar) {
  if (scoreToPar <= -3) return 'Outstanding round';
  if (scoreToPar < 0) return 'Great round';
  if (scoreToPar === 0) return 'Solid round';
  if (scoreToPar <= 5) return 'Good round';
  if (scoreToPar <= 10) return 'Tough day out there';
  return 'That is golf';
}

// ─── Section 1: Round Header ─────────────────────────────────────────
function RoundHeader({ round, scoreToPar, onPlayAgain, onReviewShots }) {
  const scoreColor = scoreToPar < 0 ? '#4CAF7D'
    : scoreToPar > 0 ? colors.score.bogey
    : colors.text.primary;

  const scoreLabel = scoreToPar === 0 ? 'E'
    : scoreToPar > 0 ? `+${scoreToPar}`
    : `${scoreToPar}`;

  const holesLabel = round.roundLength === 'front9' ? 'Front 9'
    : round.roundLength === 'back9' ? 'Back 9'
    : `${round.holeCount || 18} holes`;

  return (
    <View style={styles.headerSection}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerCourseName}>{round.courseName}</Text>
          <Text style={styles.headerMeta}>
            {formatDate(round.date)}  •  {round.teeName || 'Standard'} tees  •  {holesLabel}
            {round.eventTag ? `  •  ${round.eventTag}` : ''}
          </Text>
          {round.weather && (
            <Text style={styles.headerConditions}>
              {round.weather.tempF != null ? `${Math.round(round.weather.tempF)}°F` : ''}
              {round.weather.conditions ? `  ${round.weather.conditions}` : ''}
              {round.weather.windDescription ? `  ${round.weather.windDescription}` : ''}
            </Text>
          )}
        </View>
        <View style={styles.headerScore}>
          <Text style={styles.headerScoreNumber}>{round.score}</Text>
          <Text style={[styles.headerScoreDelta, { color: scoreColor }]}>{scoreLabel}</Text>
        </View>
      </View>
      <View style={styles.headerActions}>
        {onPlayAgain && (
          <TouchableOpacity style={styles.playAgainBtn} onPress={onPlayAgain}>
            <Ionicons name="golf-outline" size={16} color={colors.brand.primary} />
            <Text style={styles.playAgainText}>Play Again</Text>
          </TouchableOpacity>
        )}
        {onReviewShots && (
          <TouchableOpacity style={styles.reviewShotsBtn} onPress={onReviewShots}>
            <Ionicons name="map-outline" size={16} color={colors.brand.primary} />
            <Text style={styles.reviewShotsText}>Round Map</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Section 3: Stats Summary ────────────────────────────────────────
function StatsSummary({ stats, averages }) {
  const hasAverages = averages && averages.roundCount >= 3;

  const statItems = [
    {
      label: 'FIR',
      value: stats.fir != null ? `${stats.fir}%` : '--',
      raw: stats.fir,
      avg: hasAverages ? averages.fir : null,
      suffix: '%',
      lowerIsBetter: false,
    },
    {
      label: 'Putts',
      value: stats.putts != null ? `${stats.putts}` : '--',
      raw: stats.putts,
      avg: hasAverages ? averages.putts : null,
      suffix: '',
      lowerIsBetter: true,
    },
    {
      label: 'GIR',
      value: stats.gir != null ? `${stats.gir}%` : '--',
      raw: stats.gir,
      avg: hasAverages ? averages.gir : null,
      suffix: '%',
      lowerIsBetter: false,
    },
    {
      label: 'Up & Down',
      value: stats.upDown != null ? `${stats.upDown}%` : '--',
      raw: stats.upDown,
      avg: hasAverages ? averages.upDown : null,
      suffix: '%',
      lowerIsBetter: false,
    },
  ];

  return (
    <View style={styles.statsSection}>
      <Text style={styles.sectionTitle}>STATS</Text>
      <View style={styles.statsGrid}>
        {statItems.map((item) => {
          const diff = item.raw != null && item.avg != null ? item.raw - item.avg : null;
          const isBetter = diff != null
            ? (item.lowerIsBetter ? diff < 0 : diff > 0)
            : null;
          const isEqual = diff != null && Math.abs(diff) < 1;

          return (
            <View key={item.label} style={styles.statCard}>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
              {diff != null && (
                <Text style={[
                  styles.statComparison,
                  isEqual ? null : isBetter ? styles.statGreen : styles.statAmber,
                ]}>
                  {isEqual ? `At avg (${Math.round(item.avg)}${item.suffix})`
                    : isBetter ? `Above avg (${Math.round(item.avg)}${item.suffix})`
                    : `Below avg (${Math.round(item.avg)}${item.suffix})`}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Section 4: Scoring Distribution ─────────────────────────────────
function ScoringDistribution({ holes, isNewRound }) {
  const dist = useMemo(() => {
    const d = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
    (holes || []).forEach(h => {
      if (h.score == null) return;
      const diff = h.score - h.par;
      if (diff <= -2) d.eagle++;
      else if (diff === -1) d.birdie++;
      else if (diff === 0) d.par++;
      else if (diff === 1) d.bogey++;
      else d.double++;
    });
    return d;
  }, [holes]);

  const total = dist.eagle + dist.birdie + dist.par + dist.bogey + dist.double;
  if (total === 0) return null;

  const widthAnim = useRef(new Animated.Value(isNewRound ? 0 : 1)).current;
  useEffect(() => {
    if (!isNewRound) return;
    Animated.timing(widthAnim, { toValue: 1, duration: 600, delay: 300, useNativeDriver: false }).start();
  }, [isNewRound, widthAnim]);

  const segments = [
    { key: 'eagle', count: dist.eagle, color: colors.score.eagle, label: 'Eagle' },
    { key: 'birdie', count: dist.birdie, color: colors.score.birdie, label: 'Birdie' },
    { key: 'par', count: dist.par, color: '#FFFFFF', label: 'Par' },
    { key: 'bogey', count: dist.bogey, color: colors.score.bogey, label: 'Bogey' },
    { key: 'double', count: dist.double, color: colors.score.double, label: 'Double+' },
  ].filter(s => s.count > 0);

  return (
    <View style={styles.distSection}>
      <Text style={styles.sectionTitle}>SCORING</Text>
      <Animated.View style={[styles.distBar, { transform: [{ scaleX: widthAnim }] }]}>
        {segments.map(seg => (
          <View
            key={seg.key}
            style={[styles.distSegment, {
              backgroundColor: seg.color,
              flex: seg.count / total,
              opacity: seg.color === '#FFFFFF' ? 0.25 : 0.7,
            }]}
          />
        ))}
      </Animated.View>
      <View style={styles.distLegend}>
        {segments.map(seg => (
          <View key={seg.key} style={styles.distLegendItem}>
            <View style={[styles.distDot, { backgroundColor: seg.color }]} />
            <Text style={styles.distLegendText}>{seg.count} {seg.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Section 5: Full Scorecard ───────────────────────────────────────
function FullScorecard({ holes, onHolePress }) {
  if (!holes || holes.length === 0) return null;

  const front9 = holes.filter(h => h.number <= 9);
  const back9 = holes.filter(h => h.number > 9);

  const sumScore = (arr) => arr.reduce((s, h) => s + (h.score || 0), 0);
  const sumPar = (arr) => arr.reduce((s, h) => s + h.par, 0);
  // Subtotal "to-par" uses only the par of played holes so the OUT / IN / TOT
  // diffs read "E" on a par-scored round instead of −NN when later holes are
  // unplayed.
  const sumPlayedPar = (arr) => arr.reduce((s, h) => s + (h.score != null ? h.par : 0), 0);

  const renderFirDisplay = (hole) => {
    if (hole?.par === 3) return '—';  // FIR not tracked on par 3
    if (hole?.fairwayHit === true) return 'Y';
    if (hole?.fairwayHit === 'left') return 'L';
    if (hole?.fairwayHit === 'right') return 'R';
    if (hole?.fairwayHit === false || hole?.fairwayHit === 'short' || hole?.fairwayHit === 'long') return 'N';
    return '–';
  };
  const renderGirDisplay = (hole) => {
    if (hole?.greenHit === true) return 'Y';
    if (hole?.greenHit === false || hole?.greenHit === 'short' || hole?.greenHit === 'long'
        || hole?.greenHit === 'left' || hole?.greenHit === 'right') return 'N';
    return '–';
  };
  const sumPutts = (arr) => arr.reduce((s, h) => s + (h.putts || 0), 0);

  const renderRow = (hole) => {
    const diff = hole.score != null ? hole.score - hole.par : null;
    const color = hole.score != null ? getScoreColor(hole.score, hole.par) : colors.text.tertiary;
    const circle = hole.score != null && shouldShowCircle(hole.score, hole.par);
    const flagged = hole.flags?.shotCountFlagged || hole.flags?.distanceJumpFlagged;

    return (
      <TouchableOpacity
        key={hole.number}
        style={styles.scRow}
        onPress={() => onHolePress?.(hole.number)}
        activeOpacity={0.7}
      >
        <View style={styles.scCellHole}>
          {flagged && <View style={styles.scFlagDot} />}
          <Text style={styles.scCellText}>{hole.number}</Text>
        </View>
        <View style={styles.scCellPar}>
          <Text style={styles.scCellTextMuted}>{hole.par}</Text>
        </View>
        <View style={styles.scCellHcp}>
          <Text style={styles.scCellTextMuted}>{hole.handicapIndex || ''}</Text>
        </View>
        <View style={styles.scCellScore}>
          {hole.score != null ? (
            circle ? (
              <View style={[styles.scCircle, { backgroundColor: color }]}>
                <Text style={styles.scCircleText}>{hole.score}</Text>
              </View>
            ) : (
              <Text style={[styles.scCellText, { color }]}>{hole.score}</Text>
            )
          ) : (
            <Text style={styles.scCellTextDash}>-</Text>
          )}
        </View>
        <View style={styles.scCellPutts}>
          <Text style={styles.scCellTextMuted}>{hole.putts ?? '-'}</Text>
        </View>
        <View style={styles.scCellFirGir}>
          <Text style={[styles.scCellTextSmall, styles.scFirGirCell]}>{renderFirDisplay(hole)}</Text>
        </View>
        <View style={styles.scCellFirGir}>
          <Text style={[styles.scCellTextSmall, styles.scFirGirCell]}>{renderGirDisplay(hole)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSubtotal = (label, arr) => {
    const s = sumScore(arr);
    const p = sumPar(arr);
    const playedP = sumPlayedPar(arr);
    const diff = s - playedP;
    return (
      <View style={styles.scSubRow} key={label}>
        <View style={styles.scCellHole}><Text style={styles.scSubLabel}>{label}</Text></View>
        <View style={styles.scCellPar}><Text style={styles.scSubValue}>{p}</Text></View>
        <View style={styles.scCellHcp} />
        <View style={styles.scCellScore}><Text style={styles.scSubValue}>{s}</Text></View>
        <View style={styles.scCellPutts}>
          <Text style={[styles.scSubDiff,
            diff > 0 && { color: colors.score.bogey },
            diff < 0 && { color: colors.score.birdie },
          ]}>
            {arr.filter((h) => h.score != null).length > 0
              ? (diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`)
              : ''}
          </Text>
        </View>
        <View style={styles.scCellFirGir} />
        <View style={styles.scCellFirGir} />
      </View>
    );
  };

  return (
    <View style={styles.scSection}>
      <Text style={styles.sectionTitle}>SCORECARD</Text>
      {/* Column headers */}
      <View style={styles.scHeaderRow}>
        <View style={styles.scCellHole}><Text style={styles.scColHeader}>HOLE</Text></View>
        <View style={styles.scCellPar}><Text style={styles.scColHeader}>PAR</Text></View>
        <View style={styles.scCellHcp}><Text style={styles.scColHeader}>HCP</Text></View>
        <View style={styles.scCellScore}><Text style={styles.scColHeader}>SCORE</Text></View>
        <View style={styles.scCellPutts}><Text style={styles.scColHeader}>PUTTS</Text></View>
        <View style={styles.scCellFirGir}><Text style={styles.scColHeader}>FIR</Text></View>
        <View style={styles.scCellFirGir}><Text style={styles.scColHeader}>GIR</Text></View>
      </View>
      {front9.map(renderRow)}
      {front9.length > 0 && renderSubtotal('OUT', front9)}
      {back9.map(renderRow)}
      {back9.length > 0 && renderSubtotal('IN', back9)}
      {holes.length > 9 && renderSubtotal('TOT', holes)}
    </View>
  );
}

// ─── Section 6: Hole Highlights Strip ────────────────────────────────
function HoleHighlightsStrip({ holes, gpsHoleSummaries, holeMapUrls, isNewRound, onHolePress }) {
  const scrollRef = useRef(null);
  const holesWithSnapshots = useMemo(() =>
    (holes || []).filter(h => {
      const summary = (gpsHoleSummaries || []).find(s => s.holeNumber === h.number);
      // Fallback to the round-level `holeMapUrls` map — that's where GPS round
      // saves currently stash snapshots. Without this, HoleHighlightsStrip
      // shows nothing even after resolveHoleMapUrlsForRoundSave succeeds.
      return summary?.mapSnapshotUrl || h.mapSnapshotUrl || holeMapUrls?.[h.number];
    }),
    [holes, gpsHoleSummaries, holeMapUrls]
  );

  useEffect(() => {
    if (isNewRound && scrollRef.current && holesWithSnapshots.length > 2) {
      const timer = setTimeout(() => {
        scrollRef.current?.scrollToOffset({ offset: 120, animated: true });
        setTimeout(() => {
          scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 800);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isNewRound, holesWithSnapshots.length]);

  if (holesWithSnapshots.length === 0 && (!holes || holes.length === 0)) return null;

  const displayHoles = holesWithSnapshots.length > 0 ? holesWithSnapshots : (holes || []).filter(h => h.score != null);
  if (displayHoles.length === 0) return null;

  return (
    <View style={styles.stripSection}>
      <Text style={styles.sectionTitle}>HOLE BY HOLE</Text>
      <FlatList
        ref={scrollRef}
        horizontal
        data={displayHoles}
        keyExtractor={(h) => `hl-${h.number}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: spacing.lg }}
        renderItem={({ item: hole }) => {
          const summary = (gpsHoleSummaries || []).find(s => s.holeNumber === hole.number);
          const snapshotUrl = summary?.mapSnapshotUrl || hole.mapSnapshotUrl || holeMapUrls?.[hole.number];
          const color = hole.score != null ? getScoreColor(hole.score, hole.par) : colors.text.tertiary;

          return (
            <TouchableOpacity
              style={styles.stripCard}
              onPress={() => onHolePress?.(hole.number)}
              activeOpacity={0.85}
            >
              {snapshotUrl ? (
                <Image source={{ uri: snapshotUrl }} style={styles.stripImage} resizeMode="cover" />
              ) : (
                <View style={styles.stripPlaceholder}>
                  <Ionicons name="golf-outline" size={24} color={colors.text.tertiary} />
                </View>
              )}
              {/* Score badge */}
              {hole.score != null && (
                <View style={[styles.stripBadge, { backgroundColor: color }]}>
                  <Text style={styles.stripBadgeText}>{hole.score}</Text>
                </View>
              )}
              {/* Hole label */}
              <View style={styles.stripLabel}>
                <Text style={styles.stripLabelText}>H{hole.number} Par {hole.par}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// ─── Section 7: Club Distance Summary ────────────────────────────────
function ClubDistanceSummary({ gpsShots }) {
  const clubs = useMemo(() => {
    if (!gpsShots || gpsShots.length === 0) return [];
    const map = {};
    gpsShots.forEach(shot => {
      const club = shot.club || 'Unknown';
      if (club.toLowerCase() === 'putter') return;
      if (!map[club]) map[club] = { club, shots: 0, totalYards: 0, qualifying: 0 };
      map[club].shots++;
      if (shot.actualYards != null && shot.actualYards > 0) {
        map[club].totalYards += shot.actualYards;
        map[club].qualifying++;
      }
    });
    return Object.values(map)
      .sort((a, b) => (b.totalYards / (b.qualifying || 1)) - (a.totalYards / (a.qualifying || 1)));
  }, [gpsShots]);

  const hasUpdated = clubs.some(c => c.qualifying >= 2);
  if (!hasUpdated) return null;

  return (
    <View style={styles.clubSection}>
      <Text style={styles.sectionTitle}>CLUBS THIS ROUND</Text>
      {clubs.map(c => {
        const avg = c.qualifying > 0 ? Math.round(c.totalYards / c.qualifying) : null;
        const updated = c.qualifying >= 2;
        return (
          <View key={c.club} style={styles.clubRow}>
            <Text style={styles.clubName}>{c.club}</Text>
            <View style={styles.clubStats}>
              {avg != null && <Text style={styles.clubAvg}>{avg}y avg</Text>}
              <Text style={styles.clubCount}>
                {c.qualifying} shot{c.qualifying === 1 ? '' : 's'} this round
                {!updated ? ' (not enough to update)' : ''}
              </Text>
            </View>
            {updated && (
              <View style={styles.updatedBadge}>
                <Text style={styles.updatedBadgeText}>Updated</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Section 8: Best & Toughest Holes ────────────────────────────────
function BestWorstHoles({ holes, onHolePress }) {
  const scored = (holes || []).filter(h => h.score != null);
  if (scored.length < 9) return null;

  const sorted = [...scored].sort((a, b) => (a.score - a.par) - (b.score - b.par));
  const best = sorted[0];
  const toughest = sorted[sorted.length - 1];
  if (!best || !toughest) return null;

  const renderCard = (hole, title) => {
    const color = getScoreColor(hole.score, hole.par);
    const label = getScoreLabel(hole.score, hole.par);
    return (
      <TouchableOpacity
        style={styles.bwCard}
        onPress={() => onHolePress?.(hole.number)}
        activeOpacity={0.8}
      >
        <Text style={styles.bwTitle}>{title}</Text>
        <Text style={styles.bwHole}>Hole {hole.number}</Text>
        <Text style={styles.bwPar}>Par {hole.par}</Text>
        <View style={[styles.bwBadge, { backgroundColor: color }]}>
          <Text style={styles.bwBadgeText}>{label} ({hole.score})</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.bwSection}>
      <Text style={styles.sectionTitle}>HIGHLIGHTS</Text>
      <View style={styles.bwRow}>
        {renderCard(best, 'Best')}
        {renderCard(toughest, 'Toughest')}
      </View>
    </View>
  );
}

// ─── Main RoundDetailScreen ──────────────────────────────────────────
export default function RoundDetailScreen({
  round,
  onBack,
  onPlayAgain,
  onReviewShots,
  isNewRound = false,
  ratingDelta = null,    // { newRating, oldRating }
  averageStats = null,   // { fir, putts, gir, upDown, roundCount }
  allRounds = [],        // other rounds in history, used as baselines for caddie notes
}) {
  const [reviewHoleNum, setReviewHoleNum] = useState(null);
  const [pageTitle, setPageTitle] = useState(null);
  const titleOpacity = useRef(new Animated.Value(1)).current;

  const holes = round.holes || [];
  const totalPar = holes.reduce((s, h) => s + h.par, 0);
  const scoreToPar = round.score - totalPar;

  // New round: show animated page title then fade to course name
  useEffect(() => {
    if (!isNewRound) return;
    const title = getPageTitle(scoreToPar);
    setPageTitle(title);
    const timer = setTimeout(() => {
      Animated.timing(titleOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setPageTitle(null);
        titleOpacity.setValue(1);
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [isNewRound, scoreToPar, titleOpacity]);

  const stats = round.stats || {};

  // Build hole review data
  const reviewHole = useMemo(() => {
    if (reviewHoleNum == null) return null;
    const hole = holes.find(h => h.number === reviewHoleNum);
    if (!hole) return null;
    const shots = (round.gpsShots || []).filter(s => s.holeNumber === reviewHoleNum);
    const summary = (round.gpsHoleSummaries || []).find(s => s.holeNumber === reviewHoleNum);
    return {
      hole: hole.number,
      par: hole.par,
      hcp: hole.handicapIndex || 0,
      score: hole.score,
      putts: hole.putts ?? summary?.putts ?? 0,
      shots: shots.map((s, i) => ({
        shotNumber: s.shotNumber || i + 1,
        club: s.club || 'Unknown',
        lie: s.lie || null,
        startCoords: s.from ? { lat: s.from.lat, lon: s.from.lon || s.from.lng } : null,
        distanceYards: s.actualYards,
        addedRetrospectively: s.addedRetrospectively || false,
        offCourseFlag: s.offCourseFlag || false,
      })),
      conditions: null,
      playingYardage: null,
      gpsDistance: null,
      windAdj: null,
      tempAdj: null,
      elevAdj: null,
      mapSnapshotUrl: summary?.mapSnapshotUrl || round.holeMapUrls?.[reviewHoleNum] || hole.mapSnapshotUrl || null,
      flags: hole.flags || {},
    };
  }, [reviewHoleNum, holes, round.gpsShots, round.gpsHoleSummaries, round.holeMapUrls]);

  // 24-hour edit window
  const savedAt = round.roundEndedAt || (round.date instanceof Date ? round.date.getTime() : Date.now());
  const isEditable = (Date.now() - savedAt) < 86_400_000;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navBackBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
        </TouchableOpacity>
        <Animated.View style={[styles.navTitleWrap, pageTitle ? { opacity: titleOpacity } : null]}>
          <Text style={styles.navTitle} numberOfLines={1}>
            {pageTitle || round.courseName}
          </Text>
        </Animated.View>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {/* 1. Round Header */}
        <RoundHeader
          round={round}
          scoreToPar={scoreToPar}
          onPlayAgain={onPlayAgain}
          onReviewShots={round.gpsShots?.length > 0 ? onReviewShots : undefined}
        />

        {/* 2. Player Rating Delta */}
        {ratingDelta && (
          <View style={styles.sectionWrap}>
            <PlayerRatingDelta
              newRating={ratingDelta.newRating}
              oldRating={ratingDelta.oldRating}
              isPersonalBest={ratingDelta.isPersonalBest || false}
              isNewRound={isNewRound}
              isBestRecent={ratingDelta.isBestRecent || false}
            />
          </View>
        )}

        {/* 3. Stats Summary */}
        <StatsSummary stats={stats} averages={averageStats} />

        {/* 3.5. Caddie notes — observations + drills from this round's stats,
            with course-baseline comparisons when enough history is present. */}
        <CoachNotes round={round} baselineRounds={allRounds} />

        {/* 4. Scoring Distribution */}
        <ScoringDistribution holes={holes} isNewRound={isNewRound} />

        {/* 5. Full Scorecard */}
        <FullScorecard holes={holes} onHolePress={setReviewHoleNum} />

        {/* Hole Highlights strip removed — per-hole review now happens by
            tapping a row directly in the scorecard section, and the overall
            shot map sits behind the "Round Map" header button. */}

        {/* 7. Club Distance Summary */}
        <ClubDistanceSummary gpsShots={round.gpsShots} />

        {/* 8. Best & Toughest Holes */}
        <BestWorstHoles holes={holes} onHolePress={setReviewHoleNum} />

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      {/* Hole Review Modal */}
      <HoleReviewModal
        visible={reviewHoleNum != null}
        onClose={() => setReviewHoleNum(null)}
        hole={reviewHole}
        courseName={round.courseName}
        isEditable={isEditable}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  // Nav
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: spacing.md,
  },
  navBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleWrap: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  navTitle: {
    ...typography.headingSm,
    color: colors.text.primary,
    textAlign: 'center',
  },
  navSpacer: {
    width: 36,
  },

  scrollBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },

  sectionWrap: {
    marginBottom: spacing.md,
  },

  sectionTitle: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
    letterSpacing: 1,
  },

  // ─── Header ────────────────────────
  headerSection: {
    marginBottom: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing.lg,
  },
  headerCourseName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 28,
  },
  headerMeta: {
    ...typography.bodyMd,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  headerConditions: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  headerScore: {
    alignItems: 'flex-end',
  },
  headerScoreNumber: {
    fontSize: 54,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 58,
    fontVariant: ['tabular-nums'],
  },
  headerScoreDelta: {
    ...typography.headingMd,
    fontVariant: ['tabular-nums'],
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  playAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.brand.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  playAgainText: {
    ...typography.labelMd,
    color: colors.brand.primary,
  },
  reviewShotsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.brand.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  reviewShotsText: {
    ...typography.labelMd,
    color: colors.brand.primary,
  },

  // ─── Stats ─────────────────────────
  statsSection: {
    marginBottom: spacing.xl,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  statValue: {
    ...typography.statSm,
    color: colors.text.primary,
    marginBottom: 2,
  },
  statLabel: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  statComparison: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  statGreen: { color: '#4CAF7D' },
  statAmber: { color: colors.score.bogey },

  // ─── Scoring Distribution ──────────
  distSection: {
    marginBottom: spacing.xl,
  },
  distBar: {
    flexDirection: 'row',
    height: 20,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  distSegment: {
    height: '100%',
  },
  distLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  distLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  distLegendText: {
    ...typography.bodySm,
    color: colors.text.secondary,
  },

  // ─── Scorecard ─────────────────────
  scSection: {
    marginBottom: spacing.xl,
  },
  scHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    marginBottom: spacing.xs,
  },
  scColHeader: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  scRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  scCellHole: { width: 40, flexDirection: 'row', alignItems: 'center' },
  scCellPar: { width: 36, alignItems: 'center' },
  scCellHcp: { width: 32, alignItems: 'center' },
  scCellScore: { width: 48, alignItems: 'center', justifyContent: 'center' },
  // Fixed width (was flex:1) so PUTTS column sits tight against SCORE instead
  // of stretching to absorb all remaining row space — same bug that was in
  // the in-round ScorecardSheet.
  scCellPutts: { width: 44, alignItems: 'center' },
  scCellFirGir: { width: 32, alignItems: 'center' },
  scCellTextSmall: {
    fontSize: 12,
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  scFirGirCell: {
    fontWeight: '600',
  },
  scCellText: {
    ...typography.bodyMd,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  scCellTextMuted: {
    ...typography.bodySm,
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  scCellTextDash: {
    ...typography.bodyMd,
    color: colors.text.tertiary,
  },
  scCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scCircleText: {
    ...typography.labelMd,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  scFlagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.semantic.warning,
    marginRight: 3,
  },
  scSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.sm,
    marginVertical: 2,
  },
  scSubLabel: {
    ...typography.labelMd,
    color: colors.text.secondary,
  },
  scSubValue: {
    ...typography.labelMd,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  scSubDiff: {
    ...typography.labelMd,
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },

  // ─── Hole Highlights Strip ─────────
  stripSection: {
    marginBottom: spacing.xl,
  },
  stripCard: {
    width: 160,
    height: 120,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginRight: spacing.sm,
    backgroundColor: colors.bg.tertiary,
  },
  stripImage: {
    width: '100%',
    height: '100%',
  },
  stripPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  stripBadgeText: {
    ...typography.labelSm,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stripLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  stripLabelText: {
    ...typography.labelSm,
    color: '#FFFFFF',
  },

  // ─── Club Distance ─────────────────
  clubSection: {
    marginBottom: spacing.xl,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  clubName: {
    ...typography.labelLg,
    color: colors.text.primary,
    width: 80,
  },
  clubStats: {
    flex: 1,
  },
  clubAvg: {
    ...typography.bodyMd,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  clubCount: {
    ...typography.bodySm,
    color: colors.text.tertiary,
  },
  updatedBadge: {
    backgroundColor: colors.brand.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  updatedBadgeText: {
    ...typography.labelSm,
    color: colors.brand.primary,
  },

  // ─── Best & Worst ──────────────────
  bwSection: {
    marginBottom: spacing.xl,
  },
  bwRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bwCard: {
    flex: 1,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  bwTitle: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  bwHole: {
    ...typography.headingSm,
    color: colors.text.primary,
  },
  bwPar: {
    ...typography.bodySm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  bwBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  bwBadgeText: {
    ...typography.labelSm,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
