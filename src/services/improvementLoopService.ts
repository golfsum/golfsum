import { SavedRound } from '../types';

export interface StatPeriod {
  label: string;
  value: number;
  roundCount: number;
}

export interface StatTimeline {
  stat: 'GIR' | 'FIR' | 'PUTTING' | 'SCRAMBLING' | 'SCORE' | 'HANDICAP';
  label: string;
  unit: string;
  direction: 'lower_is_better' | 'higher_is_better';
  periods: StatPeriod[];
  totalDelta: number;
  improvementStrokes: number | null;
  trendSentence: string;
}

export interface ImprovementLoopData {
  timelines: StatTimeline[];
  overallStory: string;
  topImprovement: StatTimeline | null;
  topDecline: StatTimeline | null;
  firstRoundDate: string;
  latestRoundDate: string;
  totalRounds: number;
  hasSufficientData: boolean;
  periodsUsed: number;
  dataQuality: DataQuality;
}

export interface DataQuality {
  /** 0-100 overall completeness of the stat pool used for improvement analysis. */
  completeness: number;
  /** Stats absent from the rounds; prompts user what to track. */
  missingStats: Array<'putts' | 'fir' | 'gir' | 'scrambling'>;
  /** How many rounds contributed to this analysis. */
  roundsContributing: number;
}

function computeDataQuality(rounds: SavedRound[]): DataQuality {
  if (rounds.length === 0) {
    return {
      completeness: 0,
      missingStats: ['putts', 'fir', 'gir', 'scrambling'],
      roundsContributing: 0,
    };
  }

  const missingStats: DataQuality['missingStats'] = [];
  let statScore = 0;

  const roundsWithPutts = rounds.filter((r) => (r.stats?.putts ?? 0) > 0).length;
  const roundsWithFir = rounds.filter((r) => (r.stats?.fairwaysPossible ?? 0) > 0).length;
  const roundsWithGir = rounds.filter((r) => (r.stats?.greensPossible ?? 0) > 0).length;
  const roundsWithScramble = rounds.filter((r) => (r.stats?.upDownAttempts ?? 0) > 0).length;

  const threshold = rounds.length * 0.5;

  if (roundsWithPutts >= threshold) statScore += 25;
  else missingStats.push('putts');

  if (roundsWithFir >= threshold) statScore += 25;
  else missingStats.push('fir');

  if (roundsWithGir >= threshold) statScore += 25;
  else missingStats.push('gir');

  if (roundsWithScramble >= threshold) statScore += 25;
  else missingStats.push('scrambling');

  return {
    completeness: statScore,
    missingStats,
    roundsContributing: rounds.length,
  };
}

export function buildImprovementLoop(rounds: SavedRound[]): ImprovementLoopData {
  const completed = rounds
    .filter((r) => r.score > 0 && !r.isSample)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const dataQuality = computeDataQuality(completed);

  if (completed.length < 5) {
    return {
      timelines: [], overallStory: '', topImprovement: null, topDecline: null,
      firstRoundDate: '', latestRoundDate: '', totalRounds: completed.length,
      hasSufficientData: false, periodsUsed: 0,
      dataQuality,
    };
  }

  const periodSize = completed.length >= 20 ? 6 : completed.length >= 10 ? 5 : completed.length >= 8 ? 4 : 3;
  const minRoundsPerPeriod = completed.length >= 8 ? 3 : 2;
  const periods: SavedRound[][] = [];
  for (let i = 0; i < completed.length; i += periodSize) {
    const slice = completed.slice(i, i + periodSize);
    if (slice.length >= minRoundsPerPeriod) periods.push(slice);
  }

  if (periods.length < 2) {
    return {
      timelines: [], overallStory: '', topImprovement: null, topDecline: null,
      firstRoundDate: '', latestRoundDate: '', totalRounds: completed.length,
      hasSufficientData: false, periodsUsed: 0,
      dataQuality,
    };
  }

  const periodLabel = (rs: SavedRound[]) => {
    const first = new Date(rs[0].date);
    const last = new Date(rs[rs.length - 1].date);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    return first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
      ? fmt(first)
      : `${fmt(first)}-${fmt(last)}`;
  };

  const extractStat = (rs: SavedRound[], fn: (r: SavedRound) => number | null | undefined): number | null => {
    const vals = rs.map(fn).filter((v): v is number => v != null && Number.isFinite(v));
    return vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const buildTimeline = (
    stat: StatTimeline['stat'],
    label: string,
    unit: string,
    direction: StatTimeline['direction'],
    extractor: (r: SavedRound) => number | null | undefined,
    strokesPerUnit: number
  ): StatTimeline | null => {
    const statPeriods: StatPeriod[] = [];
    for (const p of periods) {
      const value = extractStat(p, extractor);
      if (value !== null) statPeriods.push({ label: periodLabel(p), value, roundCount: p.length });
    }
    if (statPeriods.length < 2) return null;

    const first = statPeriods[0].value;
    const last = statPeriods[statPeriods.length - 1].value;
    const delta = last - first;
    const isImprovement = direction === 'higher_is_better' ? delta > 0 : delta < 0;
    const strokesImpact = Math.abs(delta) * strokesPerUnit * (isImprovement ? -1 : 1);
    const absChange = Math.abs(delta);
    const changeStr = unit === '%' ? `${absChange.toFixed(0)}%` : `${absChange.toFixed(1)} ${unit}`;
    const dirStr = isImprovement ? 'improved' : 'declined';
    const strokeStr = Math.abs(strokesImpact) >= 0.3 ? ` (roughly ${Math.abs(strokesImpact).toFixed(1)} strokes per round)` : '';
    const trendSentence = absChange > 0
      ? `${label} ${dirStr} ${changeStr}${strokeStr} from first to latest period.`
      : `${label} has been stable.`;

    return {
      stat,
      label,
      unit,
      direction,
      periods: statPeriods,
      totalDelta: delta,
      improvementStrokes: Math.abs(strokesImpact) >= 0.2 ? strokesImpact : null,
      trendSentence,
    };
  };

  const girTimeline = buildTimeline('GIR', 'Greens in Regulation', '%', 'higher_is_better', (r) => {
    if (r.stats.greens != null && r.stats.greensPossible) return (r.stats.greens / r.stats.greensPossible) * 100;
    return null;
  }, 0.08);

  const firTimeline = buildTimeline('FIR', 'Fairways Hit', '%', 'higher_is_better', (r) => {
    if (r.stats.fairways != null && r.stats.fairwaysPossible) return (r.stats.fairways / r.stats.fairwaysPossible) * 100;
    return null;
  }, 0.04);

  const puttTimeline = buildTimeline('PUTTING', 'Putts per Round', 'putts', 'lower_is_better', (r) => r.stats.putts ?? null, 1.0);

  const scramTimeline = buildTimeline('SCRAMBLING', 'Scrambling', '%', 'higher_is_better', (r) => {
    if (r.stats.upDownMade != null && r.stats.upDownAttempts && r.stats.upDownAttempts > 0) {
      return (r.stats.upDownMade / r.stats.upDownAttempts) * 100;
    }
    return null;
  }, 0.06);

  const scoreTimeline = buildTimeline('SCORE', 'Average Score', 'strokes', 'lower_is_better', (r) => r.score, 1.0);

  const timelines = [scoreTimeline, girTimeline, firTimeline, puttTimeline, scramTimeline]
    .filter((t): t is StatTimeline => t !== null);

  const improved = timelines
    .filter((t) => (t.direction === 'higher_is_better' ? t.totalDelta > 0.5 : t.totalDelta < -0.3))
    .sort((a, b) => Math.abs(b.improvementStrokes ?? 0) - Math.abs(a.improvementStrokes ?? 0));

  const declined = timelines
    .filter((t) => (t.direction === 'higher_is_better' ? t.totalDelta < -0.5 : t.totalDelta > 0.3))
    .sort((a, b) => Math.abs(b.improvementStrokes ?? 0) - Math.abs(a.improvementStrokes ?? 0));

  const topImprovement = improved[0] ?? null;
  const topDecline = declined[0] ?? null;

  const scoreT = scoreTimeline;
  const scoreFirst = scoreT?.periods[0]?.value;
  const scoreLast = scoreT?.periods[scoreT.periods.length - 1]?.value;
  const scoreDelta = scoreFirst != null && scoreLast != null ? Math.round((scoreFirst - scoreLast) * 10) / 10 : null;

  let overallStory = '';
  if (scoreDelta !== null && Math.abs(scoreDelta) >= 1) {
    overallStory += `Your average score has ${scoreDelta > 0 ? 'improved' : 'declined'} ${Math.abs(scoreDelta).toFixed(1)} strokes per round over ${periods.length} tracked periods. `;
  }
  if (topImprovement) overallStory += `${topImprovement.trendSentence} `;
  if (topDecline) overallStory += `${topDecline.label} has slipped and is the area with the most room to recover. `;
  if (!overallStory) overallStory = `${completed.length} rounds tracked. Your stats have been consistent across all periods.`;

  return {
    timelines,
    overallStory: overallStory.trim(),
    topImprovement,
    topDecline,
    firstRoundDate: new Date(completed[0].date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    latestRoundDate: new Date(completed[completed.length - 1].date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    totalRounds: completed.length,
    hasSufficientData: true,
    periodsUsed: periods.length,
    dataQuality,
  };
}
