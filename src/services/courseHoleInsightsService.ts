import { SavedRound } from '../types';
import { isFairwayHit, isGreenHit } from '../utils/statChecks';
import { formatAsCaddieTip, isGolfNote } from '../utils/holeNoteClassifier';

type MissDirection = 'left' | 'right' | 'short' | 'long';

type HoleAggregate = {
  number: number;
  par: number;
  yardages: number[];
  handicapIndexes: number[];
  scores: number[];
  putts: number[];
  firHits: number;
  firKnown: number;
  girHits: number;
  girKnown: number;
  fairwayMisses: Record<MissDirection, number>;
  greenMisses: Record<MissDirection, number>;
  maxScore: number;
  minScore: number;
};

export type HoleTableRow = {
  number: number;
  par: number;
  yardage: number | null;
  handicapIndex: number | null;
  avgScore: number;
  scoreToPar: number;
  firPct: number | null;
  girPct: number | null;
  avgPutts: number | null;
  sampleSize: number;
  roundsWithFwData: number;
  roundsWithGirData: number;
  fwMissPct: Record<MissDirection, number>;
  girMissPct: Record<MissDirection, number>;
  maxScore: number;
  minScore: number;
};

export type HoleInsight = {
  hole: number;
  title: string;
  body: string;
  action: string;
  playerNote?: string;
  playerNoteDate?: string;
};

export type CourseSummary = {
  roundsPlayed: number;
  roundsWithFwData: number;
  roundsWithGirData: number;
  averageScore: number;
  bestScore: number;
  bestDate: string;
  sinceDate: string;
  lastScore: number;
  trend: number[];
  parTypeText: string;
  puttingText: string;
  ballStrikingText: string;
  ballStrikingAvailable: boolean;
  ballStrikingSampleText?: string;
  worstParType: 'par3' | 'par4' | 'par5' | null;
  worstParTypeText: string | null;
};

export type PreRoundPlan = {
  title: string;
  line1: string;
  line2: string;
  line3: string;
};

export type CourseInsightsBundle = {
  summary: CourseSummary;
  holeRows: HoleTableRow[];
  troubleInsights: HoleInsight[];
  bestInsights: HoleInsight[];
  preRoundPlan: PreRoundPlan;
  singleRoundMode: boolean;
};

type RecentNoteByHole = Record<number, { text: string; roundDate?: string | null } | undefined>;
type ApproachClubEntry = {
  club: string;
  girHit: boolean | null;
  miss: MissDirection | null;
  distance: string | null;
};

const directionArrow: Record<MissDirection, string> = {
  left: '←',
  right: '→',
  short: '↓',
  long: '↑',
};

const fmt1 = (value: number) => value.toFixed(1);
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);

const parseDateLabel = (value: Date | string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const normalizeMiss = (value: unknown): MissDirection | null => {
  if (typeof value !== 'string') return null;
  const v = value.toLowerCase();
  if (v.includes('left')) return 'left';
  if (v.includes('right')) return 'right';
  if (v.includes('short')) return 'short';
  if (v.includes('long')) return 'long';
  return null;
};

const dominant = (counts: Record<MissDirection, number>) => {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (!total) return { direction: null as MissDirection | null, pct: 0 };
  const [direction, count] = (Object.entries(counts) as Array<[MissDirection, number]>)
    .sort((a, b) => b[1] - a[1])[0];
  return { direction, pct: pct(count, total) };
};

const opposite = (dir: MissDirection) => {
  if (dir === 'left') return 'right';
  if (dir === 'right') return 'left';
  if (dir === 'short') return 'long';
  return 'short';
};

const emptyMissRecord = (): Record<MissDirection, number> => ({
  left: 0,
  right: 0,
  short: 0,
  long: 0,
});

const hasAnyMissData = (counts: Record<MissDirection, number>) =>
  Object.values(counts).some(v => v > 0);

type TemplateDef = {
  id: string;
  when: (hole: HoleTableRow) => boolean;
  body: (hole: HoleTableRow) => string;
  action: (hole: HoleTableRow) => string;
};

const troublePar4FallbackPool: TemplateDef[] = [
  {
    id: 'par4_long',
    when: (h) => (h.yardage ?? 0) >= 420,
    body: (h) => `This is one of the longer par 4s on the course (${h.yardage ?? '—'} yards).`,
    action: () => 'Favor position off the tee and a realistic approach target.',
  },
  {
    id: 'par4_short',
    when: (h) => (h.yardage ?? 999) < 380,
    body: (h) => `At ${h.yardage ?? '—'} yards this should be one of the easier par 4s.`,
    action: () => 'Keep it simple off the tee and set up a short-iron approach.',
  },
  {
    id: 'par4_putting',
    when: (h) => (h.avgPutts ?? 0) >= 2.0,
    body: (h) => `Putting is costing strokes here (${fmt1(h.avgPutts ?? 0)} putts avg).`,
    action: () => 'Prioritize speed control and eliminate one three-putt.',
  },
  {
    id: 'par4_hard_hcp',
    when: (h) => (h.handicapIndex ?? 99) <= 4,
    body: (h) => `This is the #${h.handicapIndex ?? '—'} handicap hole, so it's built to be difficult.`,
    action: () => 'Bogey is fine here. Keep doubles off the card.',
  },
  {
    id: 'par4_conservative',
    when: () => true,
    body: () => 'You are giving back about a stroke here most rounds.',
    action: () => 'Center fairway, center green, and avoid hero shots.',
  },
];

const troublePar3FallbackPool: TemplateDef[] = [
  {
    id: 'par3_distance',
    when: () => true,
    body: (h) => {
      const yd = h.yardage ?? 0;
      if (yd >= 180) return `This is a longer par 3 (${h.yardage ?? '—'} yards).`;
      if (yd >= 160) return `This is a mid-range par 3 (${h.yardage ?? '—'} yards).`;
      return `This is a shorter par 3 (${h.yardage ?? '—'} yards).`;
    },
    action: (h) => {
      const yd = h.yardage ?? 0;
      if (yd >= 180) return 'Take enough club and treat middle green as a win.';
      if (yd >= 160) return 'Pick your confident club and make a smooth swing.';
      return 'This is a scoring chance. Pick a target and commit.';
    },
  },
  {
    id: 'par3_putting',
    when: (h) => (h.avgPutts ?? 0) >= 2.0,
    body: (h) => `You're averaging ${fmt1(h.avgPutts ?? 0)} putts here.`,
    action: () => 'Read the green early and commit to your first read.',
  },
  {
    id: 'par3_hard_hcp',
    when: (h) => (h.handicapIndex ?? 99) <= 6,
    body: (h) => `This is one of the harder par 3s (#${h.handicapIndex ?? '—'} handicap).`,
    action: () => 'Take par and move on. Avoid forcing a tucked pin.',
  },
];

const troublePar5FallbackPool: TemplateDef[] = [
  {
    id: 'par5_long_blowup',
    when: (h) => (h.yardage ?? 0) >= 550 && h.avgScore >= 6.0,
    body: (h) => `At ${h.yardage ?? '—'} yards this long par 5 is creating big numbers.`,
    action: () => 'Three smart shots beat forcing a risky second shot.',
  },
  {
    id: 'par5_leaking',
    when: (h) => h.avgScore > 5.0,
    body: () => 'Par 5s should be scoring holes, but this one is leaking strokes.',
    action: () => 'Lay up to your favorite wedge distance and attack from there.',
  },
  {
    id: 'par5_putting',
    when: (h) => (h.avgPutts ?? 0) >= 2.0,
    body: (h) => `You're averaging ${fmt1(h.avgPutts ?? 0)} putts on this par 5.`,
    action: () => 'Finish good holes by lagging first putts close.',
  },
];

const bestPool: TemplateDef[] = [
  {
    id: 'best_par5_birdie',
    when: (h) => h.par === 5 && h.minScore < h.par,
    body: () => "You've made birdie here before and your course management is working.",
    action: () => 'Keep the same layup and wedge plan.',
  },
  {
    id: 'best_par4_birdie',
    when: (h) => h.par === 4 && h.minScore < h.par,
    body: () => "You've birdied this par 4 before and it fits your eye.",
    action: () => 'You know this hole. If you are in the fairway, go at the flag.',
  },
  {
    id: 'best_par3_solid',
    when: (h) => h.par === 3 && h.avgScore <= 3.0,
    body: () => 'You play this par 3 well with good club and green reads.',
    action: () => 'Use the same process and trust it.',
  },
  {
    id: 'best_good_putting',
    when: (h) => (h.avgPutts ?? 9) <= 1.5,
    body: (h) => `Your putting is dialed in here (${fmt1(h.avgPutts ?? 0)} putts avg).`,
    action: () => 'Trust your first line read and commit.',
  },
  {
    id: 'best_way_under',
    when: (h) => h.avgScore <= h.par - 0.5,
    body: () => "You're averaging under par on this hole.",
    action: () => 'This is a green-light scoring hole for you.',
  },
  {
    id: 'best_consistent_par',
    when: (h) => Math.abs(h.avgScore - h.par) <= 0.1,
    body: () => 'You par this hole almost every time.',
    action: () => 'Bank the par with the same game plan.',
  },
  {
    id: 'best_fallback',
    when: () => true,
    body: () => 'Your numbers are solid here.',
    action: () => "Trust the same club off the tee and don't overthink it.",
  },
];

const getHoleYardage = (round: SavedRound, holeNumber: number): number | null => {
  const hole = round.courseSnapshot?.holes?.find(h => h.number === holeNumber);
  if (!hole?.yardage || hole.yardage <= 0) return null;
  return hole.yardage;
};

export const buildCourseHoleInsights = (
  roundsAtCourse: SavedRound[],
  recentNoteByHole: RecentNoteByHole = {}
): CourseInsightsBundle | null => {
  const rounds = roundsAtCourse.filter(r => Number.isFinite(r.score) && r.score > 0);
  if (!rounds.length) return null;

  const byHole = new Map<number, HoleAggregate>();
  const approachClubByHole = new Map<number, ApproachClubEntry[]>();
  rounds.forEach((round) => {
    (round.holes || []).forEach((hole) => {
      if (!hole?.number || !hole?.par || !hole?.score) return;
      const current = byHole.get(hole.number) || {
        number: hole.number,
        par: hole.par,
        yardages: [],
        handicapIndexes: [],
        scores: [],
        putts: [],
        firHits: 0,
        firKnown: 0,
        girHits: 0,
        girKnown: 0,
        fairwayMisses: emptyMissRecord(),
        greenMisses: emptyMissRecord(),
        maxScore: hole.score,
        minScore: hole.score,
      };
      current.par = hole.par;
      current.scores.push(hole.score);
      const holeYardage = getHoleYardage(round, hole.number);
      if (holeYardage) current.yardages.push(holeYardage);
      const hcp = hole.handicapIndex ?? round.courseSnapshot?.holes?.find(h => h.number === hole.number)?.handicapIndex;
      if (hcp && hcp > 0) current.handicapIndexes.push(hcp);
      if (hole.putts && hole.putts > 0) current.putts.push(hole.putts);
      current.maxScore = Math.max(current.maxScore, hole.score);
      current.minScore = Math.min(current.minScore, hole.score);

      if (hole.par >= 4 && hole.fairwayHit !== null && hole.fairwayHit !== undefined) {
        current.firKnown += 1;
        if (isFairwayHit(hole.fairwayHit)) {
          current.firHits += 1;
        } else {
          const miss = normalizeMiss(hole.fairwayHit);
          if (miss) current.fairwayMisses[miss] += 1;
        }
      }

      if (hole.greenHit !== null && hole.greenHit !== undefined) {
        current.girKnown += 1;
        if (isGreenHit(hole.greenHit)) {
          current.girHits += 1;
        } else {
          const miss = normalizeMiss(hole.greenHit);
          if (miss) current.greenMisses[miss] += 1;
        }
      }

      if (hole.approachClub) {
        const approachEntries = approachClubByHole.get(hole.number) || [];
        const girTracked = hole.greenHit !== null && hole.greenHit !== undefined;
        approachEntries.push({
          club: String(hole.approachClub).trim(),
          girHit: girTracked ? isGreenHit(hole.greenHit) : null,
          miss: girTracked && !isGreenHit(hole.greenHit) ? normalizeMiss(hole.greenHit) : null,
          distance: hole.approachDistance || null,
        });
        approachClubByHole.set(hole.number, approachEntries);
      }

      byHole.set(hole.number, current);
    });
  });

  const holeRows: HoleTableRow[] = Array.from(byHole.values())
    .map((agg) => {
      const avgScore = agg.scores.reduce((s, n) => s + n, 0) / agg.scores.length;
      const avgPutts = agg.putts.length ? agg.putts.reduce((s, n) => s + n, 0) / agg.putts.length : null;
      const fwMissTotal = Object.values(agg.fairwayMisses).reduce((s, n) => s + n, 0);
      const girMissTotal = Object.values(agg.greenMisses).reduce((s, n) => s + n, 0);
      const yardage = agg.yardages.length ? Math.round(agg.yardages.reduce((s, n) => s + n, 0) / agg.yardages.length) : null;
      const handicapIndex = agg.handicapIndexes.length
        ? Math.round(agg.handicapIndexes.reduce((s, n) => s + n, 0) / agg.handicapIndexes.length)
        : null;
      return {
        number: agg.number,
        par: agg.par,
        yardage,
        handicapIndex,
        avgScore,
        scoreToPar: avgScore - agg.par,
        firPct: agg.firKnown ? pct(agg.firHits, agg.firKnown) : null,
        girPct: agg.girKnown ? pct(agg.girHits, agg.girKnown) : null,
        avgPutts,
        sampleSize: agg.scores.length,
        roundsWithFwData: agg.firKnown,
        roundsWithGirData: agg.girKnown,
        fwMissPct: fwMissTotal
          ? {
            left: pct(agg.fairwayMisses.left, fwMissTotal),
            right: pct(agg.fairwayMisses.right, fwMissTotal),
            short: pct(agg.fairwayMisses.short, fwMissTotal),
            long: pct(agg.fairwayMisses.long, fwMissTotal),
          }
          : emptyMissRecord(),
        girMissPct: girMissTotal
          ? {
            left: pct(agg.greenMisses.left, girMissTotal),
            right: pct(agg.greenMisses.right, girMissTotal),
            short: pct(agg.greenMisses.short, girMissTotal),
            long: pct(agg.greenMisses.long, girMissTotal),
          }
          : emptyMissRecord(),
        maxScore: agg.maxScore,
        minScore: agg.minScore,
      };
    })
    .sort((a, b) => a.number - b.number);

  const singleRoundMode = rounds.length === 1;
  const roundsByDateDesc = [...rounds].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const roundsByDateAsc = [...rounds].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const avgScore = rounds.reduce((s, r) => s + r.score, 0) / rounds.length;
  const bestRound = roundsByDateAsc.reduce((best, r) => (r.score < best.score ? r : best), roundsByDateAsc[0]);

  const troubleRows = holeRows.filter(h => h.avgScore > h.par + 0.5).sort((a, b) => b.scoreToPar - a.scoreToPar);
  const troubleTop = troubleRows.slice(0, Math.min(5, Math.max(3, troubleRows.length)));

  const bestRows = holeRows.filter(h => h.avgScore <= h.par).sort((a, b) => a.scoreToPar - b.scoreToPar).slice(0, 3);

  const withRecentNote = (holeNumber: number, insight: HoleInsight): HoleInsight => {
    const note = recentNoteByHole[holeNumber];
    if (!note?.text) return insight;
    return {
      ...insight,
      playerNote: note.text,
      playerNoteDate: note.roundDate || undefined,
    };
  };

  const usedTroubleTemplates = new Set<string>();
  const usedBestTemplates = new Set<string>();

  const pickFromPool = (pool: TemplateDef[], hole: HoleTableRow, used: Set<string>): TemplateDef => {
    const candidates = pool.filter(t => t.when(hole) && !used.has(t.id));
    if (candidates.length > 0) {
      used.add(candidates[0].id);
      return candidates[0];
    }
    const fallback = pool.find(t => t.when(hole)) || pool[pool.length - 1];
    used.add(fallback.id);
    return fallback;
  };

  const buildTrouble = (h: HoleTableRow): HoleInsight => {
    const fwDataReady = h.par >= 4 && h.roundsWithFwData >= Math.ceil(h.sampleSize * 0.5);
    const girDataReady = h.roundsWithGirData >= Math.ceil(h.sampleSize * 0.5);
    const fwDom = dominant(h.fwMissPct);
    const girDom = dominant(h.girMissPct);
    const fwMissLeft = h.fwMissPct.left;
    const fwMissRight = h.fwMissPct.right;
    const girMissShort = h.girMissPct.short;
    const girMissLong = h.girMissPct.long;
    const girMissLeft = h.girMissPct.left;
    const girMissRight = h.girMissPct.right;
    const yardageText = h.yardage ? `${h.yardage} yards` : 'yardage unavailable';
    const avg = fmt1(h.avgScore);
    const clubEntries = approachClubByHole.get(h.number) || [];

    const buildClubPatternInsight = (): HoleInsight | null => {
      const tracked = clubEntries.filter(e => e.club);
      if (tracked.length < 3) return null;

      const byClub = tracked.reduce<Record<string, { count: number; girHits: number; missCounts: Record<MissDirection, number> }>>((acc, entry) => {
        if (!acc[entry.club]) {
          acc[entry.club] = { count: 0, girHits: 0, missCounts: emptyMissRecord() };
        }
        acc[entry.club].count += 1;
        if (entry.girHit === true) acc[entry.club].girHits += 1;
        if (entry.girHit === false && entry.miss) acc[entry.club].missCounts[entry.miss] += 1;
        return acc;
      }, {});

      const rankedClubs = Object.entries(byClub)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([club, stat]) => ({
          club,
          count: stat.count,
          girPct: stat.count > 0 ? Math.round((stat.girHits / stat.count) * 100) : 0,
          missDominant: dominant(stat.missCounts),
        }));

      const missTotals = tracked.reduce<Record<MissDirection, number>>((acc, entry) => {
        if (entry.girHit === false && entry.miss) acc[entry.miss] += 1;
        return acc;
      }, emptyMissRecord());
      const overallMiss = dominant(missTotals);

      const clubsWithSameMiss = rankedClubs.filter(c => c.missDominant.direction === overallMiss.direction && c.missDominant.pct >= 50).length;
      if (overallMiss.direction && overallMiss.pct >= 60 && clubsWithSameMiss >= 2) {
        const topClubNames = rankedClubs.slice(0, 2).map(c => c.club).join(' and ');
        return withRecentNote(h.number, {
          hole: h.number,
          title: `Hole ${h.number}, Par ${h.par}, ${yardageText}. Avg ${avg}.`,
          body: `You miss ${overallMiss.direction} here with ${topClubNames}. Pattern is consistent across clubs.`,
          action: `This is more aim/start-line than club choice. Favor ${opposite(overallMiss.direction)}-center.`,
        });
      }

      const historyLine = rankedClubs
        .slice(0, 2)
        .map(c => `${c.club} (${c.count}x, GIR ${c.girPct}%)`)
        .join(', ');
      const missContext = overallMiss.direction && overallMiss.pct >= 50
        ? ` Miss is usually ${overallMiss.direction}.`
        : '';
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number} approach history`,
        body: `You have played this approach ${tracked.length} times: ${historyLine}.${missContext}`,
        action: 'Use this as history and choose based on today’s wind, lie, and pin.',
      });
    };

    if (fwDataReady && fwMissLeft >= 60 && !usedTroubleTemplates.has('fw_miss_left')) {
      usedTroubleTemplates.add('fw_miss_left');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}, ${yardageText}. Avg ${avg}.`,
        body: `You miss the fairway left here ${Math.round(fwMissLeft)}% of the time.`,
        action: 'Aim right-center off the tee and keep your miss in play.',
      });
    }
    if (fwDataReady && fwMissRight >= 60 && !usedTroubleTemplates.has('fw_miss_right')) {
      usedTroubleTemplates.add('fw_miss_right');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}, ${yardageText}. Avg ${avg}.`,
        body: `You miss the fairway right here ${Math.round(fwMissRight)}% of the time.`,
        action: 'Aim left-center and let your natural miss work back.',
      });
    }
    if (fwDataReady && (h.firPct ?? 100) < 30 && fwDom.pct < 60 && !usedTroubleTemplates.has('fw_miss_both')) {
      usedTroubleTemplates.add('fw_miss_both');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}, ${yardageText}. Avg ${avg}.`,
        body: "You're missing fairways both ways here.",
        action: 'Use the club that gets you in the fairway first, then attack from there.',
      });
    }

    if (girDataReady && girMissShort >= 60 && !usedTroubleTemplates.has('gir_short')) {
      usedTroubleTemplates.add('gir_short');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}, ${yardageText}. Avg ${avg}.`,
        body: 'You miss this green short most of the time.',
        action: 'Take one extra club on the approach and favor center-green.',
      });
    }
    if (girDataReady && girMissLong >= 60 && !usedTroubleTemplates.has('gir_long')) {
      usedTroubleTemplates.add('gir_long');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}, ${yardageText}. Avg ${avg}.`,
        body: 'You are going long here too often.',
        action: 'Club down or make a smoother swing to finish pin-high.',
      });
    }
    if (girDataReady && girMissLeft >= 60 && !usedTroubleTemplates.has('gir_left')) {
      usedTroubleTemplates.add('gir_left');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}, ${yardageText}. Avg ${avg}.`,
        body: 'Your miss is left of this green.',
        action: 'Aim right-center and let your pattern move toward the target.',
      });
    }
    if (girDataReady && girMissRight >= 60 && !usedTroubleTemplates.has('gir_right')) {
      usedTroubleTemplates.add('gir_right');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}, ${yardageText}. Avg ${avg}.`,
        body: 'Your miss is right of this green.',
        action: 'Aim left-center and keep your miss on the putting surface side.',
      });
    }

    if ((h.avgPutts ?? 0) > 2.0 && (h.girPct ?? 0) >= 50 && !usedTroubleTemplates.has('putting_on_gir')) {
      usedTroubleTemplates.add('putting_on_gir');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}. Avg ${avg}.`,
        body: `You are hitting the green but averaging ${fmt1(h.avgPutts || 0)} putts.`,
        action: 'Treat this as a lag-putt hole. Get first putt to tap-in range.',
      });
    }
    if ((h.avgPutts ?? 0) > 2.0 && (h.girPct ?? 0) < 50 && !usedTroubleTemplates.has('putting_after_chip')) {
      usedTroubleTemplates.add('putting_after_chip');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}. Avg ${avg}.`,
        body: `You are averaging ${fmt1(h.avgPutts || 0)} putts after missing the green.`,
        action: 'Chip to the fat part of the green and inside 6 feet.',
      });
    }

    const clubPatternInsight = buildClubPatternInsight();
    if (clubPatternInsight) {
      usedTroubleTemplates.add('club_pattern');
      return clubPatternInsight;
    }

    if (h.maxScore >= h.par + 3 && fwDom.pct < 60 && girDom.pct < 60 && !usedTroubleTemplates.has('blowup_hole')) {
      usedTroubleTemplates.add('blowup_hole');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}. Avg ${avg}.`,
        body: `You have had a big number here (${h.maxScore}).`,
        action: 'Play this hole as a safe bogey hole. No hero recovery shots.',
      });
    }

    if (h.par === 3 && girDataReady && (h.girPct ?? 0) === 0 && !usedTroubleTemplates.has('par3_never_hit')) {
      usedTroubleTemplates.add('par3_never_hit');
      const missDir = girDom.direction || 'short';
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par 3, ${yardageText}. Avg ${avg}.`,
        body: `You have not hit this green yet. Miss is mostly ${missDir}.`,
        action: `Aim ${opposite(missDir)}-center and make a smooth committed swing.`,
      });
    }
    if (h.par === 3 && girDataReady && (h.girPct ?? 0) > 0 && h.avgScore > h.par + 0.5 && !usedTroubleTemplates.has('par3_scramble')) {
      usedTroubleTemplates.add('par3_scramble');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par 3, ${yardageText}. Avg ${avg}.`,
        body: 'This par 3 becomes expensive when you miss the green.',
        action: 'Chip to the fat section and leave a makeable first putt.',
      });
    }

    const pool = h.par === 5
      ? troublePar5FallbackPool
      : h.par === 4
        ? troublePar4FallbackPool
        : troublePar3FallbackPool;
    const template = pickFromPool(pool, h, usedTroubleTemplates);
    return withRecentNote(h.number, {
      hole: h.number,
      title: `Hole ${h.number}, Par ${h.par}, ${yardageText}. Avg ${avg}.`,
      body: template.body(h),
      action: template.action(h),
    });
  };

  const buildBest = (h: HoleTableRow): HoleInsight => {
    const avg = fmt1(h.avgScore);
    if ((h.firPct ?? 0) >= 70 && (h.girPct ?? 0) >= 70 && h.par >= 4 && !usedBestTemplates.has('best_full_package')) {
      usedBestTemplates.add('best_full_package');
      return withRecentNote(h.number, {
        hole: h.number,
        title: `Hole ${h.number}, Par ${h.par}. Avg ${avg}.`,
        body: 'You hit both fairway and green here most of the time.',
        action: 'Keep the exact same game plan and trust your target.',
      });
    }
    const template = pickFromPool(bestPool, h, usedBestTemplates);
    return withRecentNote(h.number, {
      hole: h.number,
      title: `Hole ${h.number}, Par ${h.par}. Avg ${avg}.`,
      body: template.body(h),
      action: template.action(h),
    });
  };

  const troubleInsights = troubleTop.map(buildTrouble);
  const bestInsights = bestRows.map(buildBest);

  const parType = {
    par3: holeRows.filter(h => h.par === 3),
    par4: holeRows.filter(h => h.par === 4),
    par5: holeRows.filter(h => h.par === 5),
  };
  const avgParType = {
    par3: parType.par3.length ? parType.par3.reduce((s, h) => s + h.avgScore, 0) / parType.par3.length : 0,
    par4: parType.par4.length ? parType.par4.reduce((s, h) => s + h.avgScore, 0) / parType.par4.length : 0,
    par5: parType.par5.length ? parType.par5.reduce((s, h) => s + h.avgScore, 0) / parType.par5.length : 0,
  };
  const diffParType = {
    par3: avgParType.par3 ? avgParType.par3 - 3 : 0,
    par4: avgParType.par4 ? avgParType.par4 - 4 : 0,
    par5: avgParType.par5 ? avgParType.par5 - 5 : 0,
  };
  const totalStrokeLossByParType = {
    par3: diffParType.par3 * parType.par3.length,
    par4: diffParType.par4 * parType.par4.length,
    par5: diffParType.par5 * parType.par5.length,
  };
  const sortedLoss = (Object.entries(totalStrokeLossByParType) as Array<['par3' | 'par4' | 'par5', number]>)
    .sort((a, b) => b[1] - a[1]);
  const worstParType = sortedLoss[0]?.[0] || null;
  const closeSecond = sortedLoss.length > 1 && Math.abs((sortedLoss[0]?.[1] || 0) - (sortedLoss[1]?.[1] || 0)) <= 0.5
    ? sortedLoss[1]
    : null;

  const puttRounds = rounds.map(r => r.stats?.putts || 0).filter(v => v > 0);
  const avgPuttsAtCourse = puttRounds.length ? puttRounds.reduce((s, n) => s + n, 0) / puttRounds.length : 0;
  const worstPuttHoles = holeRows.filter(h => (h.avgPutts ?? 0) > 2.0).sort((a, b) => (b.avgPutts || 0) - (a.avgPutts || 0)).slice(0, 2).map(h => h.number);
  const bestPuttHoles = holeRows.filter(h => (h.avgPutts ?? 9) < 1.5).sort((a, b) => (a.avgPutts || 9) - (b.avgPutts || 9)).slice(0, 2).map(h => h.number);

  const roundsWithFwData = rounds.filter(r =>
    (r.holes || []).some(h => h.par >= 4 && h.fairwayHit !== null && h.fairwayHit !== undefined)
  ).length;
  const roundsWithGirData = rounds.filter(r =>
    (r.holes || []).some(h => h.greenHit !== null && h.greenHit !== undefined)
  ).length;

  const fwHits = holeRows.reduce((s, h) => s + ((h.firPct !== null ? (h.firPct / 100) * h.roundsWithFwData : 0)), 0);
  const fwKnown = holeRows.reduce((s, h) => s + h.roundsWithFwData, 0);
  const fwPctCourse = fwKnown ? pct(fwHits, fwKnown) : 0;
  const fwMissTotals = holeRows.reduce((acc, h) => ({
    left: acc.left + h.fwMissPct.left,
    right: acc.right + h.fwMissPct.right,
    short: acc.short + h.fwMissPct.short,
    long: acc.long + h.fwMissPct.long,
  }), emptyMissRecord());
  const fwDominant = dominant(fwMissTotals);

  const girHits = holeRows.reduce((s, h) => s + ((h.girPct !== null ? (h.girPct / 100) * h.roundsWithGirData : 0)), 0);
  const girKnown = holeRows.reduce((s, h) => s + h.roundsWithGirData, 0);
  const girPctCourse = girKnown ? pct(girHits, girKnown) : 0;
  const girMissTotals = holeRows.reduce((acc, h) => ({
    left: acc.left + h.girMissPct.left,
    right: acc.right + h.girMissPct.right,
    short: acc.short + h.girMissPct.short,
    long: acc.long + h.girMissPct.long,
  }), emptyMissRecord());
  const girDominant = dominant(girMissTotals);

  const parTypeText = [
    `Par 3s: ${fmt1(avgParType.par3)} avg (${diffParType.par3 >= 0 ? '+' : ''}${fmt1(diffParType.par3)} each, ${fmt1(totalStrokeLossByParType.par3)} total)`,
    `Par 4s: ${fmt1(avgParType.par4)} avg (${diffParType.par4 >= 0 ? '+' : ''}${fmt1(diffParType.par4)} each, ${fmt1(totalStrokeLossByParType.par4)} total)`,
    `Par 5s: ${fmt1(avgParType.par5)} avg (${diffParType.par5 >= 0 ? '+' : ''}${fmt1(diffParType.par5)} each, ${fmt1(totalStrokeLossByParType.par5)} total)`,
  ].join(' · ');

  const puttingText = [
    puttRounds.length ? `You average ${fmt1(avgPuttsAtCourse)} putts here.` : 'Putting data is still limited here.',
    worstPuttHoles.length ? `Worst putting holes: ${worstPuttHoles.join(', ')}.` : '',
    bestPuttHoles.length ? `Best putting holes: ${bestPuttHoles.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  const fwDirText = fwDominant.direction && fwDominant.pct >= 55 ? ` (miss mostly ${fwDominant.direction})` : '';
  const girDirText = girDominant.direction && girDominant.pct >= 40 ? ` (miss mostly ${girDominant.direction})` : '';
  const ballStrikingAvailable = roundsWithFwData > 0 || roundsWithGirData > 0;
  const ballStrikingText = ballStrikingAvailable
    ? `FW: ${fwKnown ? Math.round(fwPctCourse) + '%' : '—'}${fwKnown ? fwDirText : ''}. GIR: ${girKnown ? Math.round(girPctCourse) + '%' : '—'}${girKnown ? girDirText : ''}.`
    : 'No directional data yet. Use Detailed scoring on your next round to see ball striking patterns.';
  const ballStrikingSampleText = roundsWithFwData > 0 || roundsWithGirData > 0
    ? `Based on ${roundsWithFwData}/${rounds.length} round(s) with FW tracking and ${roundsWithGirData}/${rounds.length} with GIR tracking.`
    : undefined;

  const attackHoles = holeRows.filter(h => h.avgScore <= h.par).slice(0, 3).map(h => h.number);
  const troubleList = troubleRows.slice(0, 7).map(h => h.number);

  const weaknessFw = fwKnown ? 100 - fwPctCourse : 0;
  const weaknessGirShort = girDominant.direction === 'short' ? girDominant.pct : 0;
  const weaknessPutting = avgPuttsAtCourse > 0 ? Math.max(0, (avgPuttsAtCourse - 30) * 10) : 0;
  const weakness = [
    { key: 'fw_miss', val: weaknessFw },
    { key: 'gir_miss_short', val: weaknessGirShort },
    { key: 'putting', val: weaknessPutting },
  ].sort((a, b) => b.val - a.val)[0].key;

  const weaknessLine = weakness === 'fw_miss'
    ? 'Swing thought: hit the fairway first.'
    : weakness === 'gir_miss_short'
      ? 'Take one extra club on approaches today.'
      : 'Lag everything inside 3 feet.';

  const preRoundPlan: PreRoundPlan = {
    title: 'Your Game Plan',
    line1: `Last time here you shot ${roundsByDateDesc[0].score}.`,
    line2: `Play safe on holes ${troubleList.length ? troubleList.join(', ') : 'with the highest numbers'}. Go after ${attackHoles.length ? attackHoles.join(', ') : 'your scoring holes'}.`,
    line3: weaknessLine,
  };

  const summary: CourseSummary = {
    roundsPlayed: rounds.length,
    roundsWithFwData,
    roundsWithGirData,
    averageScore: avgScore,
    bestScore: bestRound.score,
    bestDate: parseDateLabel(bestRound.date),
    sinceDate: parseDateLabel(roundsByDateAsc[0].date),
    lastScore: roundsByDateDesc[0].score,
    trend: roundsByDateAsc.map(r => r.score),
    parTypeText,
    puttingText,
    ballStrikingText,
    ballStrikingAvailable,
    ballStrikingSampleText,
    worstParType,
    worstParTypeText: worstParType
      ? closeSecond
        ? `Most strokes lost on ${worstParType.replace('par', 'Par ')}s (${fmt1(sortedLoss[0][1])}) and ${closeSecond[0].replace('par', 'Par ')}s (${fmt1(closeSecond[1])}).`
        : `Most strokes lost on ${worstParType.replace('par', 'Par ')}s (${fmt1(sortedLoss[0][1])} strokes).`
      : null,
  };

  return {
    summary,
    holeRows,
    troubleInsights,
    bestInsights,
    preRoundPlan,
    singleRoundMode,
  };
};

export const formatMissForTable = (row: HoleTableRow, singleRoundMode: boolean) => {
  if (row.roundsWithGirData === 0) {
    return { text: '—', tone: 'neutral' as const };
  }

  const girDominant = dominant(row.girMissPct);
  if ((row.girPct ?? 0) === 100 && row.roundsWithGirData > 0) {
    return { text: '✓', tone: 'good' as const };
  }

  if (!hasAnyMissData(row.girMissPct)) {
    return { text: '—', tone: 'neutral' as const };
  }

  if (!girDominant.direction) {
    return { text: 'Mixed', tone: 'neutral' as const };
  }
  if (singleRoundMode || girDominant.pct >= 60) {
    return {
      text: `${directionArrow[girDominant.direction]} ${girDominant.direction}`,
      tone: girDominant.direction === 'short' ? 'info' as const : 'warn' as const,
    };
  }
  return { text: 'Mixed', tone: 'neutral' as const };
};

export type CaddieBriefSection =
  | 'HISTORY'
  | 'GAME_PLAN'
  | 'HOLE_NOTES'
  | 'COURSE_TENDENCIES'
  | 'CONDITIONS';

export interface CaddieHoleNote {
  holeNumber: number;
  par: number;
  yardage: number | null;
  noteText: string;
  noteDate: string;
  isGolfNote: boolean;
}

export interface CaddieBrief {
  courseId: string;
  courseName: string;
  roundsPlayed: number;
  history: {
    roundsPlayed: number;
    bestScore: number;
    avgScore: number;
    lastScore: number;
    lastDate: string;
    scoreTrend: 'improving' | 'declining' | 'stable';
  };
  gamePlan: {
    attackHoles: number[];
    defendHoles: number[];
    strokeHoles: number[];
    oneLiner: string;
  };
  holeNotes: CaddieHoleNote[];
  tendencies: {
    missDirection: string | null;
    shortMissPct: number | null;
    puttingAvg: number | null;
    worstParType: 3 | 4 | 5 | null;
    tendencyLines: string[];
  };
  availableSections: CaddieBriefSection[];
}

export async function buildCaddieBrief(
  courseId: string,
  courseName: string,
  rounds: SavedRound[],
  playerHandicap: number | null
): Promise<CaddieBrief | null> {
  if (rounds.length === 0) return null;

  const courseRounds = rounds
    .filter((r) => (r.courseId === courseId || r.courseName === courseName) && r.score > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (courseRounds.length === 0) return null;

  const allHoles = courseRounds.flatMap((r) => r.holes ?? []).filter((h) => h.score > 0 && h.par > 0);
  const scores = courseRounds.map((r) => r.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const bestScore = Math.min(...scores);
  const lastScore = scores[0];
  const lastDate = new Date(courseRounds[0].date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const recentWindow = scores.slice(0, Math.min(3, scores.length));
  const priorWindow = scores.slice(3, 6);
  const recentAvg = recentWindow.reduce((a, b) => a + b, 0) / recentWindow.length;
  const priorAvg = priorWindow.length > 0
    ? priorWindow.reduce((a, b) => a + b, 0) / priorWindow.length
    : recentAvg;

  const scoreTrend: CaddieBrief['history']['scoreTrend'] =
    recentAvg < priorAvg - 1
      ? 'improving'
      : recentAvg > priorAvg + 1
        ? 'declining'
        : 'stable';

  const byHole: Record<number, { diffs: number[]; par: number }> = {};
  allHoles.forEach((h) => {
    if (!byHole[h.number]) byHole[h.number] = { diffs: [], par: h.par };
    byHole[h.number].diffs.push(h.score - h.par);
  });

  const holeAvgs = Object.entries(byHole)
    .filter(([, v]) => v.diffs.length >= 2)
    .map(([num, v]) => ({
      number: Number(num),
      par: v.par,
      avg: v.diffs.reduce((a, b) => a + b, 0) / v.diffs.length,
    }))
    .sort((a, b) => a.avg - b.avg);

  const attackHoles = holeAvgs.slice(0, 3).map((h) => h.number).sort((a, b) => a - b);
  const defendHoles = holeAvgs.slice(-3).map((h) => h.number).sort((a, b) => a - b);

  const hdcpInt = playerHandicap != null ? Math.round(playerHandicap) : 18;
  const strokeHoles = allHoles
    .filter((h) => h.handicapIndex != null && h.handicapIndex <= Math.min(hdcpInt, 6))
    .map((h) => h.number)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b)
    .slice(0, 3);

  const oneLinerParts: string[] = [];
  if (attackHoles.length > 0) oneLinerParts.push(`Attack holes ${attackHoles.join(', ')}`);
  if (defendHoles.length > 0) oneLinerParts.push(`defend holes ${defendHoles.join(', ')}`);
  if (strokeHoles.length > 0) oneLinerParts.push(`use your strokes on ${strokeHoles.join(', ')}`);
  const oneLiner = oneLinerParts.join('. ') + (oneLinerParts.length ? '.' : '');

  const { getCourseHoleNotes } = await import('./holeNotesService');
  const rawNotes = await getCourseHoleNotes(courseId);
  const holeNotes: CaddieHoleNote[] = rawNotes
    .filter((n) => isGolfNote(n.text))
    .slice(0, 6)
    .map((n) => {
      const holeData = allHoles.find((h) => h.number === n.holeNumber);
      const snapshot = courseRounds[0]?.courseSnapshot?.holes?.find((h) => h.number === n.holeNumber);
      return {
        holeNumber: n.holeNumber,
        par: holeData?.par ?? snapshot?.par ?? 4,
        yardage: snapshot?.yardage ?? null,
        noteText: formatAsCaddieTip(n.text, n.holeNumber),
        noteDate: n.roundDate ?? '',
        isGolfNote: true,
      };
    })
    .sort((a, b) => a.holeNumber - b.holeNumber);

  const teeHoles = allHoles.filter((h) => h.par >= 4 && h.fairwayHit !== null && h.fairwayHit !== undefined);
  const leftMiss = teeHoles.filter((h) => h.fairwayHit === 'left').length;
  const rightMiss = teeHoles.filter((h) => h.fairwayHit === 'right').length;
  const missDir = teeHoles.length >= 10
    ? leftMiss / teeHoles.length > 0.4
      ? 'left'
      : rightMiss / teeHoles.length > 0.4
        ? 'right'
        : null
    : null;

  const girHoles = allHoles.filter((h) => h.greenHit !== null && h.greenHit !== undefined);
  const shortMisses = girHoles.filter((h) => h.greenHit === 'short').length;
  const depthMisses = girHoles.filter((h) => h.greenHit === 'short' || h.greenHit === 'long').length;
  const shortMissPct = depthMisses >= 6 ? Math.round((shortMisses / depthMisses) * 100) : null;

  const puttRounds = courseRounds.filter((r) => {
    const puttVal = (r.stats as { putts?: number; totalPutts?: number }).putts ?? (r.stats as { totalPutts?: number }).totalPutts;
    return typeof puttVal === 'number' && puttVal > 0;
  });
  const puttingAvg = puttRounds.length >= 2
    ? puttRounds.reduce((sum, r) => {
      const puttVal = (r.stats as { putts?: number; totalPutts?: number }).putts ?? (r.stats as { totalPutts?: number }).totalPutts ?? 0;
      return sum + puttVal;
    }, 0) / puttRounds.length
    : null;

  const tendencyLines: string[] = [];
  if (missDir === 'left') tendencyLines.push('You miss tee shots left here more than usual.');
  if (missDir === 'right') tendencyLines.push('You miss tee shots right here more than usual.');
  if (shortMissPct !== null && shortMissPct >= 60) tendencyLines.push(`${shortMissPct}% of your approach misses here are short. Take one extra club.`);
  if (puttingAvg !== null && puttingAvg > 34) tendencyLines.push(`You average ${puttingAvg.toFixed(1)} putts here. Pace of these greens matters.`);
  if (puttingAvg !== null && puttingAvg < 30) tendencyLines.push(`Your putting at this course is strong (${puttingAvg.toFixed(1)} avg). Trust your reads.`);

  const availableSections: CaddieBriefSection[] = ['HISTORY', 'GAME_PLAN'];
  if (tendencyLines.length > 0) availableSections.push('COURSE_TENDENCIES');
  if (holeNotes.length > 0) availableSections.push('HOLE_NOTES');

  return {
    courseId,
    courseName,
    roundsPlayed: courseRounds.length,
    history: {
      roundsPlayed: courseRounds.length,
      bestScore,
      avgScore: Math.round(avgScore),
      lastScore,
      lastDate,
      scoreTrend,
    },
    gamePlan: { attackHoles, defendHoles, strokeHoles, oneLiner },
    holeNotes,
    tendencies: {
      missDirection: missDir,
      shortMissPct,
      puttingAvg,
      worstParType: null,
      tendencyLines,
    },
    availableSections,
  };
}
