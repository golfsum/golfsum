import { applyGpsHoleSummaries } from '../components/score-entry/scoreEntryUtils';
import type { GpsHoleSummary } from '../types';

describe('applyGpsHoleSummaries', () => {
  test('prefills putts and first-putt distance onto matching holes only', () => {
    const holes = [
      { hole: 1, putts: null, firstPuttDistance: null },
      { hole: 2, putts: 2, firstPuttDistance: 18 },
      { hole: 3, putts: null, firstPuttDistance: null },
    ] as Array<{ hole: number; putts: number | null; firstPuttDistance: number | null }>;

    const summaries: GpsHoleSummary[] = [
      { holeNumber: 1, putts: 3, firstPuttDistance: 24, pinLocation: 'front' },
      { holeNumber: 3, putts: 1, firstPuttDistance: 6, pinLocation: 'back' },
    ];

    const result = applyGpsHoleSummaries(holes as never, summaries) as typeof holes;

    expect(result[0]).toMatchObject({ hole: 1, putts: 3, firstPuttDistance: 24 });
    expect(result[1]).toMatchObject({ hole: 2, putts: 2, firstPuttDistance: 18 });
    expect(result[2]).toMatchObject({ hole: 3, putts: 1, firstPuttDistance: 6 });
  });
});
