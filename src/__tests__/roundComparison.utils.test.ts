import { buildAiComparisonSummary, getMetricValue, getRoundPutts } from '../components/history/roundComparison.utils';
import type { SavedRound } from '../types';

function makeRound(overrides: Partial<SavedRound> = {}): SavedRound {
  const base: SavedRound = {
    id: Math.random().toString(36).slice(2),
    date: new Date('2026-01-01'),
    courseName: 'Test Course',
    score: 80,
    stats: { score: 80, putts: 32, fairways: 7, fairwaysPossible: 14, greens: 9, greensPossible: 18 },
    html: '',
    imageUri: '',
    holes: [],
  };
  return { ...base, ...overrides } as SavedRound;
}

describe('roundComparison utils', () => {
  it('getRoundPutts falls back to holes when stats.putts is missing', () => {
    const round = makeRound({
      stats: { score: 84 },
      holes: [
        { number: 1, par: 4, score: 5, putts: 2 },
        { number: 2, par: 4, score: 4, putts: 1 },
      ] as any,
    });
    expect(getRoundPutts(round)).toBe(3);
  });

  it('getMetricValue returns score-to-par when pars are available', () => {
    const round = makeRound({
      score: 75,
      holes: [
        { number: 1, par: 4, score: 4 },
        { number: 2, par: 4, score: 4 },
      ] as any,
    });
    expect(getMetricValue(round, 'scoreToPar')).toBe(67);
  });

  it('buildAiComparisonSummary returns fallback when no meaningful diffs exist', () => {
    const r1 = makeRound({ score: 80, stats: { score: 80, putts: 32 } as any });
    const r2 = makeRound({ score: 80, stats: { score: 80, putts: 32 } as any });
    expect(buildAiComparisonSummary([r1, r2])).toBe('Compare individual stats above for details.');
  });

  it('buildAiComparisonSummary prioritizes the largest statistical change', () => {
    const r1 = makeRound({ score: 80, stats: { score: 80, putts: 32, fairways: 8, fairwaysPossible: 14 } as any });
    const r2 = makeRound({ score: 79, stats: { score: 79, putts: 31, fairways: 2, fairwaysPossible: 14 } as any });
    const summary = buildAiComparisonSummary([r1, r2]);
    expect(summary).toContain('FIR');
    expect(summary).toContain('R2');
  });
});

