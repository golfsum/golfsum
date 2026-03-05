/**
 * analyticsCalculations.test.ts
 *
 * Tests calculateBenchmarkDelta, calculateScoringBreakdown, analyzeClubUsage
 * Drop into src/__tests__/analyticsCalculations.test.ts
 */

jest.mock('../services/firebase', () => ({
  db: null,
  isFirebaseEnabled: false,
  auth: { currentUser: null },
}));
jest.mock('../utils/logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import {
  calculateBenchmarkDelta,
  calculateScoringBreakdown,
  analyzeClubUsage,
} from '../services/analyticsService';
import type { SavedRound } from '../types';

// -- Factory ------------------------------------------------------------------

function makeRound(overrides: {
  score?: number;
  fairways?: number;
  fairwaysPossible?: number;
  greens?: number;
  greensPossible?: number;
  putts?: number;
  upDownMade?: number;
  upDownAttempts?: number;
  holes?: Partial<{ number: number; par: number; score: number; teeClub: string; approachClub: string; fairwayHit: boolean | null; greenHit: boolean | null }>[];
} = {}): SavedRound {
  return {
    id: Math.random().toString(36).slice(2),
    courseId: 'test-course',
    courseName: 'Test Golf Club',
    date: new Date().toISOString(),
    roundSource: 'manual',
    entryMode: 'advanced',
    score: overrides.score ?? 85,
    holeCount: 18,
    stats: {
      score: overrides.score ?? 85,
      ...(overrides.fairways !== undefined && { fairways: overrides.fairways }),
      ...(overrides.fairwaysPossible !== undefined && { fairwaysPossible: overrides.fairwaysPossible }),
      ...(overrides.greens !== undefined && { greens: overrides.greens }),
      ...(overrides.greensPossible !== undefined && { greensPossible: overrides.greensPossible }),
      ...(overrides.putts !== undefined && { putts: overrides.putts }),
      ...(overrides.upDownMade !== undefined && { upDownMade: overrides.upDownMade }),
      ...(overrides.upDownAttempts !== undefined && { upDownAttempts: overrides.upDownAttempts }),
    },
    holes: (overrides.holes ?? []).map(h => ({
      number: h.number ?? 1,
      par: h.par ?? 4,
      score: h.score ?? 4,
      teeClub: h.teeClub,
      approachClub: h.approachClub,
      fairwayHit: h.fairwayHit !== undefined ? h.fairwayHit : null,
      greenHit: h.greenHit !== undefined ? h.greenHit : null,
    })),
    isAcceptableForHandicap: true,
  } as unknown as SavedRound;
}

// -- calculateBenchmarkDelta ---------------------------------------------------

describe('calculateBenchmarkDelta()', () => {
  it('returns all zeros for empty rounds', () => {
    const result = calculateBenchmarkDelta([]);
    expect(result).toEqual({ offTheTee: 0, approach: 0, aroundGreen: 0, putting: 0, total: 0 });
  });

  it('returns numeric values for a single complete round', () => {
    const round = makeRound({ fairways: 8, fairwaysPossible: 14, greens: 6, greensPossible: 18, putts: 32, upDownMade: 3, upDownAttempts: 7 });
    const result = calculateBenchmarkDelta([round], 10);
    expect(typeof result.offTheTee).toBe('number');
    expect(typeof result.approach).toBe('number');
    expect(typeof result.aroundGreen).toBe('number');
    expect(typeof result.putting).toBe('number');
    expect(typeof result.total).toBe('number');
  });

  it('clamps offTheTee to [-2.5, 2.5]', () => {
    const round = makeRound({ fairways: 0, fairwaysPossible: 14, greens: 0, greensPossible: 18, putts: 40 });
    const result = calculateBenchmarkDelta([round], 0);
    expect(result.offTheTee).toBeGreaterThanOrEqual(-2.5);
    expect(result.offTheTee).toBeLessThanOrEqual(2.5);
  });

  it('clamps approach to [-3.0, 3.0]', () => {
    const round = makeRound({ greens: 18, greensPossible: 18 });
    const result = calculateBenchmarkDelta([round], 36);
    expect(result.approach).toBeGreaterThanOrEqual(-3.0);
    expect(result.approach).toBeLessThanOrEqual(3.0);
  });

  it('clamps total to [-8, +8]', () => {
    const perfect = makeRound({ fairways: 14, fairwaysPossible: 14, greens: 18, greensPossible: 18, putts: 18, upDownMade: 10, upDownAttempts: 10 });
    const terrible = makeRound({ fairways: 0, fairwaysPossible: 14, greens: 0, greensPossible: 18, putts: 45, upDownMade: 0, upDownAttempts: 12 });
    expect(calculateBenchmarkDelta([perfect], 36).total).toBeLessThanOrEqual(8);
    expect(calculateBenchmarkDelta([terrible], 0).total).toBeGreaterThanOrEqual(-8);
  });

  it('total is rounded to 1 decimal place', () => {
    const round = makeRound({ fairways: 7, fairwaysPossible: 14, greens: 9, greensPossible: 18, putts: 33 });
    const result = calculateBenchmarkDelta([round]);
    const decimals = (result.total.toString().split('.')[1] ?? '').length;
    expect(decimals).toBeLessThanOrEqual(1);
  });

  it('improves delta with better stats', () => {
    const avg = makeRound({ fairways: 7, fairwaysPossible: 14, greens: 6, greensPossible: 18, putts: 33 });
    const good = makeRound({ fairways: 12, fairwaysPossible: 14, greens: 12, greensPossible: 18, putts: 29 });
    const avgResult = calculateBenchmarkDelta([avg], 10);
    const goodResult = calculateBenchmarkDelta([good], 10);
    expect(goodResult.total).toBeGreaterThan(avgResult.total);
  });
});

// -- calculateScoringBreakdown -------------------------------------------------

describe('calculateScoringBreakdown()', () => {
  it('returns zero counts for empty rounds', () => {
    const result = calculateScoringBreakdown([]);
    expect(result.par3.count).toBe(0);
    expect(result.par4.count).toBe(0);
    expect(result.par5.count).toBe(0);
  });

  it('correctly counts par 3, 4, and 5 holes', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 3, score: 3 },
        { number: 2, par: 4, score: 5 },
        { number: 3, par: 5, score: 6 },
        { number: 4, par: 4, score: 4 },
        { number: 5, par: 3, score: 4 },
      ],
    });
    const result = calculateScoringBreakdown([round]);
    expect(result.par3.count).toBe(2);
    expect(result.par4.count).toBe(2);
    expect(result.par5.count).toBe(1);
  });

  it('calculates correct avg score per par type', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, score: 4 },
        { number: 2, par: 4, score: 6 },
        { number: 3, par: 3, score: 3 },
      ],
    });
    const result = calculateScoringBreakdown([round]);
    expect(result.par4.avg).toBeCloseTo(5.0, 1);
    expect(result.par3.avg).toBeCloseTo(3.0, 1);
  });

  it('calculates vsPar correctly (avg - par)', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, score: 5 },
        { number: 2, par: 4, score: 5 },
      ],
    });
    const result = calculateScoringBreakdown([round]);
    expect(result.par4.vsPar).toBeCloseTo(1.0, 1);
  });

  it('aggregates holes across multiple rounds', () => {
    const r1 = makeRound({ holes: [{ number: 1, par: 4, score: 4 }] });
    const r2 = makeRound({ holes: [{ number: 1, par: 4, score: 6 }] });
    const result = calculateScoringBreakdown([r1, r2]);
    expect(result.par4.count).toBe(2);
    expect(result.par4.avg).toBeCloseTo(5.0, 1);
  });
});

// -- analyzeClubUsage ----------------------------------------------------------

describe('analyzeClubUsage()', () => {
  it('returns empty array when no rounds have club data', () => {
    const round = makeRound({ holes: [{ number: 1, par: 4, score: 4 }] });
    expect(analyzeClubUsage([round])).toEqual([]);
  });

  it('returns empty array for empty rounds', () => {
    expect(analyzeClubUsage([])).toEqual([]);
  });

  it('aggregates tee club usage across holes', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, score: 4, teeClub: 'Driver', fairwayHit: true },
        { number: 2, par: 4, score: 5, teeClub: 'Driver', fairwayHit: false },
        { number: 3, par: 4, score: 4, teeClub: '3 Wood', fairwayHit: true },
      ],
    });
    const result = analyzeClubUsage([round]);
    const driver = result.find(c => c.club === 'Driver');
    const threeWood = result.find(c => c.club === '3 Wood');
    expect(driver?.usageCount).toBe(2);
    expect(threeWood?.usageCount).toBe(1);
  });

  it('returns clubs sorted by usage count descending', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, score: 4, teeClub: 'Driver' },
        { number: 2, par: 4, score: 4, teeClub: 'Driver' },
        { number: 3, par: 4, score: 4, teeClub: '3 Wood' },
      ],
    });
    const result = analyzeClubUsage([round]);
    expect(result[0].club).toBe('Driver');
  });

  it('calculates successRate for par 4+ tee clubs with FIR data', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, score: 4, teeClub: 'Driver', fairwayHit: true },
        { number: 2, par: 4, score: 5, teeClub: 'Driver', fairwayHit: false },
        { number: 3, par: 4, score: 4, teeClub: 'Driver', fairwayHit: true },
      ],
    });
    const result = analyzeClubUsage([round]);
    const driver = result.find(c => c.club === 'Driver');
    expect(driver?.successRate).toBeCloseTo(2 / 3, 2);
  });

  it('successRate is undefined when no tracking data', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, score: 4, teeClub: 'Driver', fairwayHit: null },
      ],
    });
    const result = analyzeClubUsage([round]);
    const driver = result.find(c => c.club === 'Driver');
    expect(driver?.successRate).toBeUndefined();
  });

  it('tracks approach clubs separately from tee clubs', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, score: 4, teeClub: 'Driver', approachClub: '7 Iron', greenHit: true },
        { number: 2, par: 4, score: 5, teeClub: 'Driver', approachClub: '8 Iron', greenHit: false },
      ],
    });
    const result = analyzeClubUsage([round]);
    const clubs = result.map(c => c.club);
    expect(clubs).toContain('Driver');
    expect(clubs).toContain('7 Iron');
    expect(clubs).toContain('8 Iron');
  });

  it('ignores null/empty club names', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, score: 4, teeClub: '', approachClub: undefined },
        { number: 2, par: 4, score: 4, teeClub: 'Driver' },
      ],
    });
    const result = analyzeClubUsage([round]);
    expect(result.every(c => c.club.trim().length > 0)).toBe(true);
  });
});
