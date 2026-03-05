/**
 * WHS (World Handicap System) Calculations — Unit Tests
 *
 * These tests verify USGA-compliant handicap math:
 *   - Score Differential formula
 *   - Course Handicap
 *   - Net Double Bogey adjustment
 *   - Handicap Index calculation (20+ rounds, fallback table, edge cases)
 *   - Incomplete round eligibility (2024 WHS minimums)
 *   - 9-hole round handling
 */

import {
  calculateScoreDifferential,
  calculateCourseHandicap,
  calculateNetDoubleBogey,
  applyNetDoubleBogeyAdjustment,
  calculateHandicapIndex,
  isRoundAcceptableForHandicap,
  meetsWHSMinimum,
  getWHSMinimumHoles,
  processIncompleteRound,
  process9HoleRound,
  calculateNetPar,
} from '../services/whsCalculations';
import type { SavedRound, RoundHole } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal acceptable SavedRound for testing */
function makeRound(overrides: Partial<SavedRound> = {}): SavedRound {
  return {
    id: `round-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date(),
    courseName: 'Test Course',
    score: 85,
    html: '',
    imageUri: '',
    holeCount: 18,
    plannedHoles: 18,
    stats: {
      score: 85,
      courseRating: 72.0,
      slopeRating: 125,
    },
    isAcceptableForHandicap: true,
    ...overrides,
  };
}

/** Create a basic RoundHole */
function makeHole(number: number, par: number, score: number, extra: Partial<RoundHole> = {}): RoundHole {
  return { number, par, score, isSaved: true, ...extra };
}

// ─── Score Differential ───────────────────────────────────────────────────────

describe('calculateScoreDifferential', () => {
  test('standard WHS formula: ((AGS - CR) × 113) / SR', () => {
    // 85 on a 72.0/125 course → ((85 - 72) × 113) / 125 = 11.7 (rounded)
    const result = calculateScoreDifferential(85, 72.0, 125);
    expect(result).toBe(11.8); // (13 * 113) / 125 = 11.752 → 11.8
  });

  test('returns null for zero slope', () => {
    expect(calculateScoreDifferential(80, 70, 0)).toBeNull();
  });

  test('returns null for missing inputs', () => {
    expect(calculateScoreDifferential(0, 72, 125)).toBeNull();
    expect(calculateScoreDifferential(85, 0, 125)).toBeNull();
  });

  test('correctly handles under-par rounds', () => {
    // 68 on 72.0/130 → ((68-72) × 113) / 130 = -3.5 (rounded)
    const result = calculateScoreDifferential(68, 72.0, 130);
    expect(result).toBe(-3.5); // (-4 * 113) / 130 = -3.477 → -3.5
  });

  test('rounds to exactly 1 decimal place', () => {
    // 90 on 71.5/128 → ((90-71.5) × 113) / 128 = 16.336… → 16.3
    const result = calculateScoreDifferential(90, 71.5, 128);
    expect(result).toBe(16.3);
  });

  test('standard slope 113 produces simple differential', () => {
    // On standard slope, differential = AGS - CR
    const result = calculateScoreDifferential(80, 72.0, 113);
    expect(result).toBe(8.0);
  });
});

// ─── Course Handicap ──────────────────────────────────────────────────────────

describe('calculateCourseHandicap', () => {
  test('formula: HI × (SR / 113)', () => {
    // 15.0 × (125 / 113) = 16.59 → 17
    expect(calculateCourseHandicap(15.0, 125)).toBe(17);
  });

  test('standard slope returns same number', () => {
    expect(calculateCourseHandicap(10.0, 113)).toBe(10);
  });

  test('handles zero handicap', () => {
    expect(calculateCourseHandicap(0, 130)).toBe(0);
  });

  test('handles negative (plus) handicap', () => {
    const result = calculateCourseHandicap(-2.0, 140);
    expect(result).toBe(-2); // -2 × (140/113) = -2.478 → -2
  });
});

// ─── Net Double Bogey ─────────────────────────────────────────────────────────

describe('calculateNetDoubleBogey', () => {
  test('par 4, no strokes received → NDB = par + 2 = 6', () => {
    // Course handicap 0 → baseStrokes 0, extraStrokes 0
    expect(calculateNetDoubleBogey(4, 1, 0)).toBe(6);
  });

  test('par 4, 1 stroke received → NDB = 7', () => {
    // Course handicap 18 → 1 stroke per hole
    expect(calculateNetDoubleBogey(4, 1, 18)).toBe(7);
  });

  test('par 3, 2 strokes received → NDB = 7', () => {
    // Course handicap 36 → 2 strokes per hole
    expect(calculateNetDoubleBogey(3, 1, 36)).toBe(7);
  });

  test('extra strokes distributed to lower handicap holes first', () => {
    // Course handicap 5 → base 0, extra 5 → holes 1-5 get +1
    expect(calculateNetDoubleBogey(4, 3, 5)).toBe(7); // hole 3 ≤ 5, gets extra
    expect(calculateNetDoubleBogey(4, 6, 5)).toBe(6); // hole 6 > 5, no extra
  });
});

describe('applyNetDoubleBogeyAdjustment', () => {
  test('caps scores at NDB', () => {
    const holes: RoundHole[] = [
      makeHole(1, 4, 10, { handicapIndex: 1 }),  // Way over NDB
      makeHole(2, 4, 4, { handicapIndex: 2 }),    // Under NDB (no change)
      makeHole(3, 3, 3, { handicapIndex: 3 }),    // Par (no change)
    ];

    const { adjustedHoles, adjustedGrossScore } = applyNetDoubleBogeyAdjustment(holes, 0);
    
    // NDB for par 4 with 0 course handicap = 6
    expect(adjustedHoles[0].adjustedScore).toBe(6); // Capped from 10 to 6
    expect(adjustedHoles[1].adjustedScore).toBeUndefined(); // No adjustment needed
    expect(adjustedGrossScore).toBe(6 + 4 + 3); // 13
  });

  test('does not adjust scores at or below NDB', () => {
    const holes: RoundHole[] = [
      makeHole(1, 4, 5, { handicapIndex: 1 }),
      makeHole(2, 4, 6, { handicapIndex: 2 }),
    ];
    
    const { adjustedHoles } = applyNetDoubleBogeyAdjustment(holes, 0);
    expect(adjustedHoles[0].adjustedScore).toBeUndefined();
    expect(adjustedHoles[1].adjustedScore).toBeUndefined();
  });
});

// ─── Handicap Index ───────────────────────────────────────────────────────────

describe('calculateHandicapIndex', () => {
  test('returns null with fewer than 3 rounds', () => {
    expect(calculateHandicapIndex([])).toBeNull();
    expect(calculateHandicapIndex([makeRound()])).toBeNull();
    expect(calculateHandicapIndex([makeRound(), makeRound()])).toBeNull();
  });

  test('3 rounds uses best 1 differential', () => {
    const rounds = [
      makeRound({ score: 80, stats: { score: 80, courseRating: 72, slopeRating: 113 } }),
      makeRound({ score: 85, stats: { score: 85, courseRating: 72, slopeRating: 113 } }),
      makeRound({ score: 90, stats: { score: 90, courseRating: 72, slopeRating: 113 } }),
    ];
    const index = calculateHandicapIndex(rounds);
    // Best diff = 8.0, fallback adjustment = -2.0 → (6.0 × 0.96) = 5.76 → truncates to 5.7
    expect(index).toBe(5.7);
  });

  test('4 rounds applies -1.0 fallback adjustment', () => {
    const rounds = [
      makeRound({ score: 80, stats: { score: 80, courseRating: 72, slopeRating: 113 } }),
      makeRound({ score: 85, stats: { score: 85, courseRating: 72, slopeRating: 113 } }),
      makeRound({ score: 90, stats: { score: 90, courseRating: 72, slopeRating: 113 } }),
      makeRound({ score: 92, stats: { score: 92, courseRating: 72, slopeRating: 113 } }),
    ];
    const index = calculateHandicapIndex(rounds);
    // Best diff = 8.0, adjustment -1.0 => 7.0 * 0.96 = 6.72 -> 6.7
    expect(index).toBe(6.7);
  });

  test('6 rounds uses best 2 with -1.0 fallback adjustment', () => {
    const rounds = [
      makeRound({ score: 80, stats: { score: 80, courseRating: 72, slopeRating: 113 } }), // 8
      makeRound({ score: 81, stats: { score: 81, courseRating: 72, slopeRating: 113 } }), // 9
      makeRound({ score: 86, stats: { score: 86, courseRating: 72, slopeRating: 113 } }),
      makeRound({ score: 88, stats: { score: 88, courseRating: 72, slopeRating: 113 } }),
      makeRound({ score: 90, stats: { score: 90, courseRating: 72, slopeRating: 113 } }),
      makeRound({ score: 92, stats: { score: 92, courseRating: 72, slopeRating: 113 } }),
    ];
    const index = calculateHandicapIndex(rounds);
    // Best two diffs avg = 8.5, adjustment -1.0 => 7.5 * 0.96 = 7.2
    expect(index).toBe(7.2);
  });

  test('20+ rounds uses best 8 of last 20', () => {
    // Create 20 rounds with differentials 0..19 (score 72..91 on standard slope)
    const rounds: SavedRound[] = [];
    for (let i = 0; i < 20; i++) {
      rounds.push(
        makeRound({
          date: new Date(2025, 0, 20 - i), // Newest first
          score: 72 + i,
          stats: { score: 72 + i, courseRating: 72, slopeRating: 113 },
        })
      );
    }
    const index = calculateHandicapIndex(rounds);
    // Best 8 diffs: 0,1,2,3,4,5,6,7 → avg = 3.5 → 3.5 × 0.96 = 3.36 → truncates to 3.3
    expect(index).toBe(3.3);
  });

  test('returns null if rounds lack course rating', () => {
    const rounds = [
      makeRound({ stats: { score: 80 } }),
      makeRound({ stats: { score: 85 } }),
      makeRound({ stats: { score: 90 } }),
    ];
    expect(calculateHandicapIndex(rounds)).toBeNull();
  });

  test('applies 0.96 multiplier', () => {
    // Single-diff scenario: 5 rounds → best 1
    const rounds = Array.from({ length: 5 }, (_, i) =>
      makeRound({
        score: 82 + i,
        stats: { score: 82 + i, courseRating: 72, slopeRating: 113 },
      })
    );
    const index = calculateHandicapIndex(rounds);
    // Best diff = 82-72 = 10.0 → 10.0 × 0.96 = 9.6
    expect(index).toBe(9.6);
  });
});

// ─── Round Acceptability ──────────────────────────────────────────────────────

describe('isRoundAcceptableForHandicap', () => {
  test('acceptable round with rating, slope, and score', () => {
    const round = makeRound();
    expect(isRoundAcceptableForHandicap(round)).toBe(true);
  });

  test('not acceptable without course rating', () => {
    const round = makeRound({ stats: { score: 85, slopeRating: 125 } });
    expect(isRoundAcceptableForHandicap(round)).toBe(false);
  });

  test('not acceptable without slope rating', () => {
    const round = makeRound({ stats: { score: 85, courseRating: 72 } });
    expect(isRoundAcceptableForHandicap(round)).toBe(false);
  });

  test('not acceptable with zero score', () => {
    const round = makeRound({ score: 0 });
    expect(isRoundAcceptableForHandicap(round)).toBe(false);
  });

  test('incomplete round with 10 holes on 18-hole course is acceptable', () => {
    const round = makeRound({ holeCount: 10, plannedHoles: 18 });
    expect(isRoundAcceptableForHandicap(round)).toBe(true);
  });

  test('incomplete round with 9 holes on 18-hole course is NOT acceptable', () => {
    const round = makeRound({ holeCount: 9, plannedHoles: 18 });
    expect(isRoundAcceptableForHandicap(round)).toBe(false);
  });

  test('9-hole round with all 9 holes is acceptable', () => {
    const round = makeRound({ isNineHoleRound: true, holeCount: 9, plannedHoles: 9 });
    expect(isRoundAcceptableForHandicap(round)).toBe(true);
  });
});

// ─── WHS Minimum Holes ───────────────────────────────────────────────────────

describe('meetsWHSMinimum', () => {
  test('18-hole course: 10+ holes meets minimum', () => {
    expect(meetsWHSMinimum(10, 18)).toBe(true);
    expect(meetsWHSMinimum(18, 18)).toBe(true);
  });

  test('18-hole course: <10 holes fails', () => {
    expect(meetsWHSMinimum(9, 18)).toBe(false);
    expect(meetsWHSMinimum(5, 18)).toBe(false);
    expect(meetsWHSMinimum(0, 18)).toBe(false);
  });

  test('9-hole course: all 9 required', () => {
    expect(meetsWHSMinimum(9, 9)).toBe(true);
    expect(meetsWHSMinimum(8, 9)).toBe(false);
  });
});

describe('getWHSMinimumHoles', () => {
  test('18-hole → 10', () => expect(getWHSMinimumHoles(18)).toBe(10));
  test('9-hole → 9', () => expect(getWHSMinimumHoles(9)).toBe(9));
});

// ─── Incomplete Round Processing ──────────────────────────────────────────────

describe('processIncompleteRound', () => {
  test('ineligible round returns correct status message', () => {
    const holes = Array.from({ length: 5 }, (_, i) => makeHole(i + 1, 4, 5));
    const result = processIncompleteRound(holes, 5, 18, 10);
    
    expect(result.isEligible).toBe(false);
    expect(result.handicapStatus).toContain('Played 5 of 18 holes');
    expect(result.handicapStatus).toContain('Minimum 10 required');
  });

  test('eligible incomplete round fills missing holes with Net Par', () => {
    // 12 holes played on 18-hole course
    const holes: RoundHole[] = [];
    for (let i = 0; i < 18; i++) {
      if (i < 12) {
        holes.push(makeHole(i + 1, 4, 5));
      } else {
        holes.push(makeHole(i + 1, 4, 0)); // Missing
      }
    }
    
    const result = processIncompleteRound(holes, 12, 18, 10);
    expect(result.isEligible).toBe(true);
    expect(result.handicapStatus).toContain('Eligible with Net Par');
  });
});

// ─── 9-Hole Round Processing ──────────────────────────────────────────────────

describe('process9HoleRound', () => {
  test('intentional 9-hole round needs pairing', () => {
    const result = process9HoleRound([], true);
    expect(result.isNineHoleRound).toBe(true);
    expect(result.needsPairing).toBe(true);
    expect(result.handicapStatus).toContain('pairing');
  });

  test('unintentional 9-hole round reports incomplete', () => {
    const result = process9HoleRound([], false);
    expect(result.isNineHoleRound).toBe(true);
    expect(result.handicapStatus).toContain('Incomplete');
  });
});

// ─── Net Par ──────────────────────────────────────────────────────────────────

describe('calculateNetPar', () => {
  test('Net Par = Par + Handicap Strokes', () => {
    expect(calculateNetPar(4, 1)).toBe(5);
    expect(calculateNetPar(3, 0)).toBe(3);
    expect(calculateNetPar(5, 2)).toBe(7);
  });
});
