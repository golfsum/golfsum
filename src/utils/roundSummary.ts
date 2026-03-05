import { SavedRound } from '../types';
import { getRoundStatPreferences } from './statPreferences';
import { computeFirStats, computeGirStats, computeScramblingStats } from './roundStats';

const BANNED_WORDS = ['solid', 'nice', 'pretty good', 'overall'];
const MAX_SUMMARY_LENGTH = 120;
const MIN_BASELINE_ROUNDS: Record<MetricKey, number> = {
  putts: 2,
  fir: 3,
  gir: 3,
  scrambling: 3,
};

type MetricKey = 'putts' | 'fir' | 'gir' | 'scrambling';

interface Metric {
  key: MetricKey;
  label: string;
  valueText: string;
  value: number;
  higherIsBetter: boolean;
  detail?: string;
  baseline?: number;
  deltaPct?: number;
}

function hasBannedWords(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some(word => lower.includes(word));
}

function formatDelta(deltaPct: number): string {
  const abs = Math.abs(Math.round(deltaPct));
  return deltaPct >= 0 ? `${abs}% better than avg` : `${abs}% below avg`;
}

function pickSummary(candidates: string[]): string {
  const trimmedCandidates = candidates.map(candidate => candidate.trim());
  return trimmedCandidates.find(candidate => candidate.length <= MAX_SUMMARY_LENGTH)
    || trimmedCandidates[trimmedCandidates.length - 1];
}

function computeBaseline(
  rounds: SavedRound[],
  roundId: string | undefined,
  key: MetricKey
): number | null {
  const candidates = rounds.filter(r => r.id !== roundId);
  const statPrefs = candidates.map(r => ({ round: r, prefs: getRoundStatPreferences(r) }));

  if (key === 'putts') {
    const values = statPrefs
      .filter(r => r.prefs.putts && r.round.stats.putts && (r.round.holes?.length || r.round.holeCount))
      .map(r => {
        const holes = r.round.holes?.length || r.round.holeCount || 18;
        return (r.round.stats.putts || 0) / holes;
      });
    if (values.length < MIN_BASELINE_ROUNDS.putts) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  if (key === 'fir') {
    const values = statPrefs
      .filter(r => r.prefs.fir && r.round.stats.fairwaysPossible && r.round.stats.fairwaysPossible > 0)
      .map(r => ((r.round.stats.fairways || 0) / (r.round.stats.fairwaysPossible || 1)) * 100);
    if (values.length < MIN_BASELINE_ROUNDS.fir) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  if (key === 'gir') {
    const values = statPrefs
      .filter(r => r.prefs.gir && r.round.stats.greensPossible && r.round.stats.greensPossible > 0)
      .map(r => ((r.round.stats.greens || 0) / (r.round.stats.greensPossible || 1)) * 100);
    if (values.length < MIN_BASELINE_ROUNDS.gir) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  if (key === 'scrambling') {
    const values = statPrefs
      .filter(r => r.prefs.scrambling && r.round.stats.upDownAttempts && r.round.stats.upDownAttempts > 0)
      .map(r => ((r.round.stats.upDownMade || 0) / (r.round.stats.upDownAttempts || 1)) * 100);
    if (values.length < MIN_BASELINE_ROUNDS.scrambling) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  return null;
}

export function buildRoundSummaryText(round: SavedRound, baselineRounds?: SavedRound[]): string {
  const prefs = getRoundStatPreferences(round);
  const holesPlayed = round.holes?.filter(h => h.score !== undefined && h.score !== null)?.length
    || round.holeCount
    || round.holes?.length
    || 18;

  const metrics: Metric[] = [];
  const baselinePool = baselineRounds || [];

  if (prefs.putts && round.stats.putts && holesPlayed > 0) {
    const avgPutts = round.stats.putts / holesPlayed;
    const baseline = baselinePool.length ? computeBaseline(baselinePool, round.id, 'putts') : null;
    const deltaPct = baseline ? ((baseline - avgPutts) / baseline) * 100 : undefined;
    metrics.push({
      key: 'putts',
      label: 'Putting',
      valueText: `${avgPutts.toFixed(1)} putts/hole`,
      value: avgPutts,
      higherIsBetter: false,
      baseline: baseline ?? undefined,
      deltaPct,
    });
  }

  const firAttempts = round.holes?.filter(h => h.par >= 4 && h.fairwayHit !== undefined && h.fairwayHit !== null) || [];
  const firStats = prefs.fir ? computeFirStats(round) : null;
  if (prefs.fir && firStats && firAttempts.length > 0) {
    const missCounts = [
      { dir: 'left', count: firAttempts.filter(h => h.fairwayHit === 'left').length },
      { dir: 'right', count: firAttempts.filter(h => h.fairwayHit === 'right').length },
      { dir: 'short', count: firAttempts.filter(h => h.fairwayHit === 'short').length },
      { dir: 'long', count: firAttempts.filter(h => h.fairwayHit === 'long').length },
    ];
    const topMiss = missCounts.sort((a, b) => b.count - a.count)[0];
    const hitPct = firStats.percent;
    const missPct = topMiss.count > 0 ? Math.round((topMiss.count / firAttempts.length) * 100) : 0;
    const baseline = baselinePool.length ? computeBaseline(baselinePool, round.id, 'fir') : null;
    const deltaPct = baseline ? hitPct - baseline : undefined;
    metrics.push({
      key: 'fir',
      label: 'Driving accuracy',
      valueText: `${hitPct}% fairways`,
      value: hitPct,
      higherIsBetter: true,
      detail: topMiss.count > 0 ? `most misses ${topMiss.dir} (${missPct}%)` : undefined,
      baseline: baseline ?? undefined,
      deltaPct,
    });
  }

  const girStats = prefs.gir ? computeGirStats(round) : null;
  if (prefs.gir && girStats) {
    const girPct = girStats.percent;
    const baseline = baselinePool.length ? computeBaseline(baselinePool, round.id, 'gir') : null;
    const deltaPct = baseline ? girPct - baseline : undefined;
    metrics.push({
      key: 'gir',
      label: 'GIR rate',
      valueText: `${girPct}% GIR`,
      value: girPct,
      higherIsBetter: true,
      baseline: baseline ?? undefined,
      deltaPct,
    });
  }

  const scramblingStats = prefs.scrambling ? computeScramblingStats(round) : null;
  if (prefs.scrambling && scramblingStats) {
    const scramblePct = scramblingStats.percent;
    const baseline = baselinePool.length ? computeBaseline(baselinePool, round.id, 'scrambling') : null;
    const deltaPct = baseline ? scramblePct - baseline : undefined;
    metrics.push({
      key: 'scrambling',
      label: 'Scrambling',
      valueText: `${scramblePct}% saves`,
      value: scramblePct,
      higherIsBetter: true,
      baseline: baseline ?? undefined,
      deltaPct,
    });
  }

  if (metrics.length === 0) {
    return 'Score tracked, but limited stat data prevents deeper performance insights.';
  }

  const hasBaseline = metrics.some(m => m.baseline !== undefined && m.baseline !== null);

  const getMetricScore = (metric: Metric): number => {
    if (metric.deltaPct !== undefined) return Math.abs(metric.deltaPct);
    return metric.higherIsBetter ? metric.value : -metric.value;
  };

  const mainMetric = metrics.reduce((best, current) => {
    if (!best) return current;
    return getMetricScore(current) > getMetricScore(best) ? current : best;
  }, null as Metric | null);

  if (!mainMetric) {
    return 'Score tracked, but limited stat data prevents deeper performance insights.';
  }

  const contextParts: string[] = [];
  if (round.holeCount && round.holeCount < 18) {
    contextParts.push(`partial round (${round.holeCount} holes)`);
  } else if (round.isIncomplete) {
    contextParts.push('partial round');
  }
  const contextText = contextParts.length ? ` ${contextParts.join(' ')}` : '';

  let summary = '';
  if (!hasBaseline || mainMetric.deltaPct === undefined) {
    summary = `${mainMetric.label} (${mainMetric.valueText}).${contextText}`;
  } else {
    const deltaText = formatDelta(mainMetric.deltaPct);
    summary = `${mainMetric.label} (${mainMetric.valueText}), ${deltaText}.${contextText}`;
  }

  if (hasBannedWords(summary)) {
    summary = summary.replace(/solid|nice|pretty good|overall/gi, '').replace(/\s+/g, ' ').trim();
  }

  if (!/\d/.test(summary)) {
    return 'Score tracked, but limited stat data prevents deeper performance insights.';
  }

  return summary;
}
