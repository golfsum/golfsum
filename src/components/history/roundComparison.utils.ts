import type { SavedRound } from '../../types';
import { computeFirStats, computeGirStats, computeScramblingStats } from '../../utils/roundStats';
import { getRoundPar } from './historyUtils';

export type CompareMetricKey = 'score' | 'scoreToPar' | 'fir' | 'gir' | 'putts' | 'updown' | 'playerRating';

export const getRoundPutts = (round: SavedRound): number | null => {
  if (typeof round.stats.putts === 'number' && round.stats.putts > 0) return round.stats.putts;
  if (!round.holes || round.holes.length === 0) return null;
  const puttValues = round.holes
    .map((hole) => hole.putts)
    .filter((putts): putts is number => typeof putts === 'number' && putts > 0);
  if (puttValues.length === 0) return null;
  return puttValues.reduce((sum, putts) => sum + putts, 0);
};

export const getMetricValue = (round: SavedRound, key: CompareMetricKey): number | null => {
  if (key === 'score') return typeof round.score === 'number' ? round.score : null;
  if (key === 'scoreToPar') {
    const parTotal = getRoundPar(round);
    return parTotal === null ? null : round.score - parTotal;
  }
  if (key === 'fir') {
    const fir = computeFirStats(round);
    return fir ? fir.percent : null;
  }
  if (key === 'gir') {
    const gir = computeGirStats(round);
    return gir ? gir.percent : null;
  }
  if (key === 'putts') return getRoundPutts(round);
  if (key === 'updown') {
    const upDown = computeScramblingStats(round);
    return upDown ? upDown.percent : null;
  }
  if (key === 'playerRating') return typeof round.stats.courseRating === 'number' ? round.stats.courseRating : null;
  return null;
};

export const buildAiComparisonSummary = (rounds: SavedRound[]): string => {
  if (rounds.length < 2) return 'Compare individual stats above for details.';
  const baseline = rounds[0];
  const candidates: Array<{ text: string; weight: number }> = [];
  const metrics: Array<{ key: CompareMetricKey; label: string; lowerBetter: boolean }> = [
    { key: 'score', label: 'Score', lowerBetter: true },
    { key: 'scoreToPar', label: 'Score vs Par', lowerBetter: true },
    { key: 'fir', label: 'FIR', lowerBetter: false },
    { key: 'gir', label: 'GIR', lowerBetter: false },
    { key: 'putts', label: 'Putts', lowerBetter: true },
    { key: 'updown', label: 'Up & Down', lowerBetter: false },
  ];

  metrics.forEach((metric) => {
    for (let i = 1; i < rounds.length; i += 1) {
      const current = rounds[i];
      const b = getMetricValue(baseline, metric.key);
      const c = getMetricValue(current, metric.key);
      if (b == null || c == null) continue;
      const diff = c - b;
      if (diff === 0) continue;
      const improved = metric.lowerBetter ? diff < 0 : diff > 0;
      const magnitude = Math.abs(diff);
      const suffix = metric.key === 'fir' || metric.key === 'gir' || metric.key === 'updown' ? 'pt' : '';
      const signed = `${diff > 0 ? '+' : ''}${Math.round(diff)}${suffix}`;
      candidates.push({
        weight: magnitude,
        text: `${improved ? 'Biggest gain' : 'Biggest drop'} was ${metric.label}: R${i + 1} ${Math.round(c)}${suffix ? '%' : ''} vs R1 ${Math.round(b)}${suffix ? '%' : ''} (${signed}).`,
      });
    }
  });

  if (candidates.length === 0) return 'Compare individual stats above for details.';
  candidates.sort((a, b) => b.weight - a.weight);
  const top = candidates[0];
  const second = rounds.length === 2 ? candidates[1] : undefined;
  if (rounds.length === 2 && second) {
    return `${top.text} Secondary change: ${second.text.replace(/^Biggest (gain|drop) was /, '')}`;
  }
  return top.text;
};

