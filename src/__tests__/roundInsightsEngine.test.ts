/**
 * Round Insights Engine — Unit Tests
 *
 * Tests the pure-function insight generator:
 *   - Category-specific rules fire correctly
 *   - Prioritization: critical > warning > positive
 *   - Deduplication: max 1 per category
 *   - Output capped at 2-5 insights
 *   - Edge cases: empty rounds, partial data, null stats
 */

import {
  generateRoundInsights,
  type InsightRoundInput,
  type InsightHoleInput,
  type RoundInsight,
} from '../services/roundInsightsEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHole(
  holeNumber: number,
  par: number,
  score: number,
  extra: Partial<InsightHoleInput> = {},
): InsightHoleInput {
  return { holeNumber, par, score, ...extra };
}

/** Build a standard 18-hole par-72 round */
function makeRound(scores: number[], pars?: number[], extras?: Partial<InsightHoleInput>[]): InsightRoundInput {
  const defaultPars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]; // Par 72
  const holePars = pars ?? defaultPars.slice(0, scores.length);
  const totalPar = holePars.reduce((s, p) => s + p, 0);
  const totalScore = scores.reduce((s, sc) => s + sc, 0);

  return {
    totalScore,
    par: totalPar,
    holes: scores.map((s, i) => makeHole(i + 1, holePars[i], s, extras?.[i])),
  };
}

// ─── Basic Behavior ───────────────────────────────────────────────────────────

describe('generateRoundInsights — basics', () => {
  test('returns empty array for empty holes', () => {
    expect(generateRoundInsights({ totalScore: 0, par: 72, holes: [] })).toEqual([]);
  });

  test('returns between 0 and 5 insights', () => {
    const input = makeRound(
      [4, 5, 3, 6, 4, 5, 3, 4, 6, 5, 4, 3, 6, 5, 4, 3, 4, 5],
      undefined,
      Array.from({ length: 18 }, () => ({ putts: 2, fir: true, gir: true })),
    );
    const insights = generateRoundInsights(input);
    expect(insights.length).toBeGreaterThanOrEqual(0);
    expect(insights.length).toBeLessThanOrEqual(5);
  });

  test('max 1 insight per category', () => {
    const input = makeRound(
      [4, 5, 3, 6, 4, 5, 3, 4, 6, 5, 4, 3, 6, 5, 4, 3, 4, 5],
      undefined,
      Array.from({ length: 18 }, () => ({ putts: 3, fir: false, gir: false })),
    );
    const insights = generateRoundInsights(input);
    const categories = insights.map(i => i.category);
    expect(new Set(categories).size).toBe(categories.length);
  });
});

// ─── Putting Insights ─────────────────────────────────────────────────────────

describe('putting insights', () => {
  test('critical: high putts per hole (≥2.0)', () => {
    // 18 holes × 3 putts = 54 putts → 3.0/hole
    const extras = Array.from({ length: 18 }, () => ({ putts: 3 }));
    const input = makeRound([5, 5, 4, 6, 5, 5, 4, 5, 6, 5, 5, 4, 6, 5, 5, 4, 5, 6], undefined, extras);
    const insights = generateRoundInsights(input);
    
    const puttInsight = insights.find(i => i.category === 'putting');
    expect(puttInsight).toBeDefined();
    expect(puttInsight!.type).toBe('critical');
    expect(puttInsight!.label).toContain('Putting cost');
  });

  test('positive: low putts per hole (≤1.5)', () => {
    // Alternate 1 and 2 putts → 1.5/hole
    const extras = Array.from({ length: 18 }, (_, i) => ({ putts: i % 2 === 0 ? 1 : 2 }));
    const input = makeRound([4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5], undefined, extras);
    const insights = generateRoundInsights(input);
    
    const puttInsight = insights.find(i => i.category === 'putting');
    expect(puttInsight).toBeDefined();
    expect(puttInsight!.type).toBe('positive');
  });
});

// ─── Driving Insights ─────────────────────────────────────────────────────────

describe('driving insights', () => {
  test('positive: high FIR (≥71%)', () => {
    // 14 par-4/5 holes, all fairways hit
    const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const extras = pars.map(p => (p >= 4 ? { fir: true as boolean | null } : { fir: null as boolean | null }));
    const input = makeRound([4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5], pars, extras);
    const insights = generateRoundInsights(input);
    
    const drivingInsight = insights.find(i => i.category === 'driving');
    expect(drivingInsight).toBeDefined();
    expect(drivingInsight!.type).toBe('positive');
  });

  test('critical: low FIR (<50%)', () => {
    const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const extras = pars.map((p, i) =>
      p >= 4
        ? { fir: (i < 4 ? true : false) as boolean | null } // Only first 4 of 14 hit
        : { fir: null as boolean | null },
    );
    const input = makeRound([5, 5, 3, 6, 5, 5, 3, 5, 6, 5, 5, 3, 6, 5, 5, 3, 5, 6], pars, extras);
    const insights = generateRoundInsights(input);
    
    const drivingInsight = insights.find(i => i.category === 'driving');
    expect(drivingInsight).toBeDefined();
    expect(drivingInsight!.type).toBe('critical');
  });

  test('directional miss insight NOT shown without diverse miss directions', () => {
    const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    // All misses are "left" (basic-mode default) — should NOT trigger directional insight
    const extras = pars.map(p =>
      p >= 4
        ? { fir: false as boolean | null, firMissDirection: 'left' as 'left' | 'right' | null }
        : { fir: null as boolean | null },
    );
    const input = makeRound([5, 5, 3, 6, 5, 5, 3, 5, 6, 5, 5, 3, 6, 5, 5, 3, 5, 6], pars, extras);
    const insights = generateRoundInsights(input);
    
    const drivingInsight = insights.find(
      i => i.category === 'driving' && i.label.toLowerCase().includes('miss'),
    );
    // Should NOT find a directional miss insight when all misses are the same direction
    expect(drivingInsight).toBeUndefined();
  });
});

// ─── Scoring Pattern Insights ─────────────────────────────────────────────────

describe('scoring insights', () => {
  test('critical: doubles detected', () => {
    // Scores: all par except 2 double-bogeys
    const scores = [4, 4, 3, 5, 4, 6, 3, 6, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const input = makeRound(scores);
    const insights = generateRoundInsights(input);
    
    const scoringInsight = insights.find(
      i => i.category === 'scoring' && i.type === 'critical',
    );
    expect(scoringInsight).toBeDefined();
    expect(scoringInsight!.label).toContain('Big numbers');
  });

  test('positive: clean card with no doubles', () => {
    // All pars
    const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const input = makeRound(pars);
    const insights = generateRoundInsights(input);
    
    const cleanCard = insights.find(i => i.label === 'Clean card');
    expect(cleanCard).toBeDefined();
    expect(cleanCard!.type).toBe('positive');
  });
});

// ─── Scrambling Insights ──────────────────────────────────────────────────────

describe('scrambling insights', () => {
  test('positive: high scrambling (≥60%)', () => {
    // 6 missed GIR, 4 of them still made par → 66%
    const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const extras = pars.map((p, i) => {
      if (i < 6) return { gir: false as boolean | null, putts: 2 };
      return { gir: true as boolean | null, putts: 2 };
    });
    // First 4 missed-GIR holes make par, last 2 bogey
    const scores = [4, 4, 3, 5, 5, 5, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const input = makeRound(scores, pars, extras);
    const insights = generateRoundInsights(input);
    
    const scrambleInsight = insights.find(i => i.category === 'shortGame');
    expect(scrambleInsight).toBeDefined();
    expect(scrambleInsight!.type).toBe('positive');
  });

  test('not shown with fewer than 3 missed GIR holes', () => {
    const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    // Only 2 missed GIR holes
    const extras = pars.map((_, i) => ({
      gir: (i < 2 ? false : true) as boolean | null,
      putts: 2,
    }));
    const scores = [5, 5, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const input = makeRound(scores, pars, extras);
    const insights = generateRoundInsights(input);
    
    const scrambleInsight = insights.find(i => i.category === 'shortGame');
    expect(scrambleInsight).toBeUndefined();
  });
});

// ─── Prioritization ───────────────────────────────────────────────────────────

describe('insight prioritization', () => {
  test('critical insights appear before warnings and positives', () => {
    // Create a round that triggers both critical and positive insights
    const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const extras = pars.map(() => ({
      putts: 3,    // critical: high putts
      fir: true as boolean | null, // positive: hitting fairways
      gir: true as boolean | null, // positive: hitting greens
    }));
    const scores = [5, 5, 4, 6, 5, 5, 4, 5, 6, 5, 5, 4, 6, 5, 5, 4, 5, 6];
    const input = makeRound(scores, pars, extras);
    const insights = generateRoundInsights(input);
    
    if (insights.length >= 2) {
      const typeOrder = insights.map(i => i.type);
      const critIdx = typeOrder.indexOf('critical');
      const posIdx = typeOrder.indexOf('positive');
      if (critIdx >= 0 && posIdx >= 0) {
        expect(critIdx).toBeLessThan(posIdx);
      }
    }
  });
});

// ─── Partial / Edge Cases ─────────────────────────────────────────────────────

describe('edge cases', () => {
  test('works with only 1 hole', () => {
    const input: InsightRoundInput = {
      totalScore: 5,
      par: 4,
      holes: [makeHole(1, 4, 5, { putts: 2 })],
    };
    const insights = generateRoundInsights(input);
    // Should not crash, may return 0 insights
    expect(Array.isArray(insights)).toBe(true);
  });

  test('works without putt data', () => {
    const scores = [4, 5, 3, 6, 4, 5, 3, 4, 6, 5, 4, 3, 6, 5, 4, 3, 4, 5];
    const input = makeRound(scores);
    // No putts, no FIR, no GIR — should still produce scoring insights
    const insights = generateRoundInsights(input);
    expect(insights.length).toBeGreaterThan(0);
  });

  test('null putts/fir/gir are handled gracefully', () => {
    const input: InsightRoundInput = {
      totalScore: 80,
      par: 72,
      holes: Array.from({ length: 18 }, (_, i) =>
        makeHole(i + 1, 4, 4 + (i < 8 ? 1 : 0), {
          putts: null,
          fir: null,
          gir: null,
        }),
      ),
    };
    const insights = generateRoundInsights(input);
    expect(Array.isArray(insights)).toBe(true);
    // Should not crash or produce NaN-based insights
    insights.forEach(i => {
      expect(i.label).not.toContain('NaN');
      if (i.detail) expect(i.detail).not.toContain('NaN');
    });
  });
});
