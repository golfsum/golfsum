import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SavedRound } from '../../types';
import { formatCourseName } from '../../utils/courseName';

type ShareCardSize = 'story' | 'square';

interface ShareRoundCardProps {
  round: SavedRound;
  size: ShareCardSize;
}

const DNA_COLORS = {
  eagle: '#10B981',
  birdie: '#34D399',
  par: '#4B5563',
  bogey: '#F59E0B',
  double: '#EF4444',
  worse: '#7F1D1D',
};

const formatScoreToPar = (diff: number) => {
  if (diff === 0) return 'E';
  if (diff > 0) return `+${diff}`;
  return `${diff}`;
};

const getRoundParTotal = (round: SavedRound): number | null => {
  const statsAny = round.stats as { totalPar?: number; coursePar?: number };
  if (typeof statsAny.totalPar === 'number' && statsAny.totalPar > 0) return statsAny.totalPar;
  if (typeof statsAny.coursePar === 'number' && statsAny.coursePar > 0) return statsAny.coursePar;
  const playedSet = round.holesPlayed?.length ? new Set(round.holesPlayed) : null;
  if (round.holes && round.holes.length > 0) {
    const relevant = playedSet ? round.holes.filter((h) => playedSet.has(h.number)) : round.holes;
    const total = relevant.reduce((sum, hole) => sum + (hole.par || 0), 0);
    if (total > 0) return total;
  }
  return null;
};

function getDnaColor(score: number, par: number): string {
  const diff = score - par;
  if (diff <= -2) return DNA_COLORS.eagle;
  if (diff === -1) return DNA_COLORS.birdie;
  if (diff === 0) return DNA_COLORS.par;
  if (diff === 1) return DNA_COLORS.bogey;
  if (diff === 2) return DNA_COLORS.double;
  return DNA_COLORS.worse;
}

function buildRoundRead(round: SavedRound): string {
  const holes = round.holes?.filter((h) => h.score > 0 && h.par > 0) ?? [];
  const birdies = holes.filter((h) => h.score < h.par).length;
  const doubles = holes.filter((h) => h.score >= h.par + 2).length;
  const pars = holes.filter((h) => h.score === h.par).length;
  const girHoles = holes.filter((h) => h.greenHit !== null && h.greenHit !== undefined);
  const girHits = girHoles.filter((h) => h.greenHit === true).length;
  const girRate = girHoles.length > 0 ? girHits / girHoles.length : null;
  const totalPutts = (round.stats as { putts?: number; totalPutts?: number }).putts
    ?? (round.stats as { totalPutts?: number }).totalPutts
    ?? null;

  if (birdies >= 4) return `${birdies} birdies. Best scoring round in a while.`;
  if (doubles === 0 && birdies >= 2) return `Clean round. ${birdies} birdies, zero doubles.`;
  if (doubles === 0 && birdies === 0) return 'Steady round. No doubles, no birdies. Consistent.';
  if (doubles >= 4) return `${doubles} doubles. The damage control is where this one got away.`;
  if (doubles === 0) return `${birdies > 0 ? `${birdies} birdie${birdies > 1 ? 's' : ''}` : 'No birdies'}, zero doubles. The floor held.`;
  if (girRate !== null && girRate >= 0.55) return `${Math.round(girRate * 100)}% greens. Ball striking was there today.`;
  if (totalPutts !== null && totalPutts <= 28) return `${totalPutts} putts. The flat stick saved this round.`;
  if (birdies > 0 && doubles > 0) return `${birdies} birdie${birdies > 1 ? 's' : ''}, ${doubles} double${doubles > 1 ? 's' : ''}. Streaky round.`;
  return `${pars} pars. Steady round.`;
}

export const ShareRoundCard: React.FC<ShareRoundCardProps> = ({ round, size }) => {
  const layout = size === 'story'
    ? { width: 1080, height: 1920, scoreSize: 180, titleSize: 48, metaSize: 28, statSize: 36 }
    : { width: 1080, height: 1080, scoreSize: 140, titleSize: 40, metaSize: 24, statSize: 32 };

  const stats = useMemo(() => {
    const scoreToPar = getRoundParTotal(round);
    const diff = scoreToPar !== null ? round.score - scoreToPar : null;
    const firPct = round.stats.fairwaysPossible
      ? Math.round(((round.stats.fairways || 0) / round.stats.fairwaysPossible) * 100)
      : null;
    const girPct = round.stats.greensPossible
      ? Math.round(((round.stats.greens || 0) / round.stats.greensPossible) * 100)
      : null;
    const putts = (round.stats as { putts?: number; totalPutts?: number }).putts
      ?? (round.stats as { totalPutts?: number }).totalPutts
      ?? null;
    const date = new Date(round.date);
    const formattedDate = Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return {
      diffLabel: diff !== null ? formatScoreToPar(diff) : '',
      firPct,
      girPct,
      putts,
      formattedDate,
      roundRead: buildRoundRead(round),
      dnaHoles: (round.holes ?? []).filter((h) => h.score > 0 && h.par > 0).slice(0, 18),
    };
  }, [round]);

  const row1 = stats.dnaHoles.slice(0, 9);
  const row2 = stats.dnaHoles.slice(9, 18);

  return (
    <View style={[styles.container, { width: layout.width, height: layout.height }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.logoText, { fontSize: layout.metaSize }]}>GolfSum</Text>
        <View style={styles.logoDot} />
      </View>

      <View style={styles.courseBlock}>
        <Text style={[styles.courseName, { fontSize: layout.titleSize }]} numberOfLines={2}>
          {formatCourseName(round.courseName) || 'Unknown Course'}
        </Text>
        <Text style={[styles.metaText, { fontSize: layout.metaSize }]}>
          {round.teeName || round.stats?.teeBox || 'White'} Tees · {stats.formattedDate}
        </Text>
      </View>

      <View style={styles.scoreBlock}>
        <Text style={[styles.scoreValue, { fontSize: layout.scoreSize }]}>{round.score}</Text>
        {stats.diffLabel.length > 0 && (
          <Text style={[styles.scoreSub, { fontSize: layout.metaSize }]}>{stats.diffLabel} to par</Text>
        )}
      </View>

      <View style={styles.dnaStripWrap}>
        <View style={styles.dnaStrip}>
          {row1.map((h) => (
            <View key={`dna-${h.number}`} style={[styles.dnaDot, { backgroundColor: getDnaColor(h.score, h.par) }]} />
          ))}
        </View>
        {row2.length > 0 && (
          <View style={styles.dnaStrip}>
            {row2.map((h) => (
              <View key={`dna-b-${h.number}`} style={[styles.dnaDot, { backgroundColor: getDnaColor(h.score, h.par) }]} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.highlight}>
        <Text style={[styles.highlightText, { fontSize: layout.metaSize }]}>{stats.roundRead}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { fontSize: layout.statSize }]}>{stats.firPct !== null ? `${stats.firPct}%` : '—'}</Text>
          <Text style={[styles.statLabel, { fontSize: layout.metaSize }]}>FIR</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { fontSize: layout.statSize }]}>{stats.girPct !== null ? `${stats.girPct}%` : '—'}</Text>
          <Text style={[styles.statLabel, { fontSize: layout.metaSize }]}>GIR</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { fontSize: layout.statSize }]}>{stats.putts !== null ? stats.putts : '—'}</Text>
          <Text style={[styles.statLabel, { fontSize: layout.metaSize }]}>Putts</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { fontSize: layout.metaSize }]}>Capture. Analyze. Improve.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0B1220',
    padding: 80,
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoText: {
    fontWeight: '700',
    color: '#E5E7EB',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  logoDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
  },
  courseBlock: {
    marginTop: 30,
  },
  courseName: {
    fontWeight: '700',
    color: '#F8FAFC',
  },
  metaText: {
    color: '#9CA3AF',
    marginTop: 12,
  },
  scoreBlock: {
    alignItems: 'center',
    marginVertical: 30,
  },
  scoreValue: {
    fontWeight: '800',
    color: '#10B981',
  },
  scoreSub: {
    marginTop: 12,
    color: '#CBD5F5',
    fontWeight: '600',
  },
  dnaStripWrap: {
    gap: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  dnaStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  dnaDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  highlight: {
    marginTop: 24,
    alignItems: 'center',
  },
  highlightText: {
    color: '#E2E8F0',
    fontWeight: '600',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 18,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    marginHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
  },
  statValue: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  statLabel: {
    color: '#9CA3AF',
    marginTop: 8,
  },
  footer: {
    alignItems: 'center',
    marginTop: 30,
  },
  footerText: {
    color: '#64748B',
    letterSpacing: 1,
  },
});
