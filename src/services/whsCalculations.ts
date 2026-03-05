/**
 * Legacy calculation service kept for backwards compatibility.
 * Internally this now computes GolfSum Player Rating values.
 */

import { SavedRound, RoundHole } from '../types';
import { logger } from '../utils/logger';
import {
  applyParPlusTwoAdjustment,
  applyRatingCaps,
  calculatePlayerRating,
  calculateRoundRating,
  getBestRatingInLast12Months,
  getRoundCoursePar,
  isRoundRatingEligible,
  truncateToOneDecimal,
} from './playerRatingService';

// ============================================================================
// WHS CONSTANTS
// ============================================================================

const WHS_FALLBACK_TABLE: Record<number, { diffsUsed: number; adjustment: number }> = {
  3: { diffsUsed: 1, adjustment: -2.0 },
  4: { diffsUsed: 1, adjustment: -1.0 },
  5: { diffsUsed: 1, adjustment: 0 },
  6: { diffsUsed: 2, adjustment: -1.0 },
  7: { diffsUsed: 2, adjustment: 0 },
  8: { diffsUsed: 2, adjustment: 0 },
  9: { diffsUsed: 3, adjustment: 0 },
  10: { diffsUsed: 3, adjustment: 0 },
  11: { diffsUsed: 3, adjustment: 0 },
  12: { diffsUsed: 4, adjustment: 0 },
  13: { diffsUsed: 4, adjustment: 0 },
  14: { diffsUsed: 4, adjustment: 0 },
  15: { diffsUsed: 5, adjustment: 0 },
  16: { diffsUsed: 5, adjustment: 0 },
  17: { diffsUsed: 6, adjustment: 0 },
  18: { diffsUsed: 6, adjustment: 0 },
  19: { diffsUsed: 7, adjustment: 0 }
  // At 20 rounds, calculation switches to standard best-8-of-20 path.
  // No fallback entry for 20 by design.
};

type DifferentialCandidate = {
  differential: number;
  roundIds: string[];
  date: Date;
};

function buildDifferentialCandidates(rounds: SavedRound[]): DifferentialCandidate[] {
  const acceptableRounds = rounds
    .filter((r) => isRoundRatingEligible(r))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const nineHoleRounds = acceptableRounds.filter(r => r.isNineHoleRound || r.holeCount === 9);
  const fullRounds = acceptableRounds.filter(r => !(r.isNineHoleRound || r.holeCount === 9));

  const candidates: DifferentialCandidate[] = [];

  fullRounds.forEach(round => {
    const adjustedScore = round.adjustedGrossScore ?? round.score;
    const coursePar = getRoundCoursePar(round);
    if (!coursePar) return;
    const differential = calculateScoreDifferential(adjustedScore, coursePar, 113);
    if (differential !== null) {
      candidates.push({ differential, roundIds: [round.id], date: new Date(round.date) });
    }
  });

  // Pair newest-first so if odd count exists, the oldest is orphaned.
  // Unpaired nine-hole rounds are excluded until a matching nine is available.
  const orderedNine = [...nineHoleRounds].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  for (let i = 0; i + 1 < orderedNine.length; i += 2) {
    const first = orderedNine[i];
    const second = orderedNine[i + 1];
    const firstPar = getRoundCoursePar(first);
    const secondPar = getRoundCoursePar(second);
    if (!firstPar || !secondPar) {
      continue;
    }
    const combinedAdjusted = (first.adjustedGrossScore ?? first.score) + (second.adjustedGrossScore ?? second.score);
    const differential = calculateScoreDifferential(combinedAdjusted, firstPar + secondPar, 113);
    if (differential !== null) {
      candidates.push({
        differential,
        roundIds: [first.id, second.id],
        date: new Date(Math.max(new Date(first.date).getTime(), new Date(second.date).getTime())),
      });
    }
  }

  return candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// ============================================================================
// SCORE DIFFERENTIAL
// ============================================================================

/**
 * Calculate Score Differential per WHS formula
 * Formula: ((Adjusted Gross Score − Course Rating) × 113) / Slope Rating
 * 
 * @param adjustedGrossScore - Score after Net Double Bogey adjustment
 * @param courseRating - Course Rating from tee played
 * @param slopeRating - Slope Rating from tee played
 * @returns Score Differential rounded to 1 decimal place, or null if data missing
 */
export function calculateScoreDifferential(
  adjustedGrossScore: number,
  coursePar: number,
  _legacySlopeRating: number
): number | null {
  if (!Number.isFinite(adjustedGrossScore) || !Number.isFinite(coursePar) || coursePar <= 0) {
    return null;
  }
  return calculateRoundRating(adjustedGrossScore, coursePar);
}

export function applyHandicapCap(
  proposedIndex: number,
  lowHandicapIndex: number
): number {
  return applyRatingCaps(proposedIndex, lowHandicapIndex);
}

export function getLowHandicapIndex(
  rounds: SavedRound[],
  referenceDate: Date = new Date()
): number | null {
  return getBestRatingInLast12Months(rounds, referenceDate);
}

// ============================================================================
// NET DOUBLE BOGEY (NDB) ADJUSTMENT
// ============================================================================

/**
 * Calculate Course Handicap for NDB adjustment
 * Formula: Handicap Index × (Slope Rating / 113)
 * 
 * @param handicapIndex - Player's Handicap Index
 * @param slopeRating - Slope Rating from tee played
 * @returns Course Handicap rounded to nearest whole number
 */
export function calculateCourseHandicap(
  handicapIndex: number,
  _slopeRating: number
): number {
  return Math.round(handicapIndex);
}

/**
 * Calculate Net Double Bogey for a hole
 * Max Hole Score = Par + 2 + Strokes Received on Hole
 * 
 * @param par - Par for the hole
 * @param handicapStroke - Stroke index for the hole (1-18)
 * @param courseHandicap - Player's Course Handicap for this round
 * @returns Maximum score for this hole (Net Double Bogey)
 */
export function calculateNetDoubleBogey(
  par: number,
  handicapStroke: number,
  courseHandicap: number
): number {
  // Calculate strokes received on this hole
  const baseStrokes = Math.floor(courseHandicap / 18);
  const extraStrokes = courseHandicap % 18;
  const strokesReceived = baseStrokes + (handicapStroke <= extraStrokes ? 1 : 0);
  
  return par + 2 + strokesReceived;
}

/**
 * Apply Net Double Bogey adjustment to a round
 * Adjusts hole scores that exceed NDB
 * 
 * @param holes - Array of hole data
 * @param courseHandicap - Player's Course Handicap for this round
 * @returns Adjusted holes and total adjusted gross score
 */
export function applyNetDoubleBogeyAdjustment(
  holes: RoundHole[],
  _courseHandicap: number
): { adjustedHoles: RoundHole[]; adjustedGrossScore: number } {
  return applyParPlusTwoAdjustment(holes);
}

// ============================================================================
// HANDICAP INDEX CALCULATION
// ============================================================================

/**
 * Calculate Handicap Index per WHS rules
 * - 20+ rounds: Average of best 8 of last 20
 * - 3-19 rounds: Use fallback table
 * - <3 rounds: Cannot calculate
 * 
 * @param rounds - All acceptable rounds (sorted newest first)
 * @returns Handicap Index or null if insufficient rounds
 */
export function calculateHandicapIndex(rounds: SavedRound[]): number | null {
  const candidates = buildDifferentialCandidates(rounds);
  const ratings = candidates.map((r) => r.differential).reverse();
  const raw = calculatePlayerRating(ratings);
  if (raw === null) return null;
  const bestRating = getLowHandicapIndex(rounds);
  return bestRating !== null ? applyHandicapCap(raw, bestRating) : raw;
}

/**
 * Get detailed explanation of Handicap Index calculation
 * For auditability and transparency
 * 
 * @param rounds - All acceptable rounds
 * @returns Explanation object with calculation details
 */
export function getHandicapCalculationDetails(rounds: SavedRound[]): {
  handicapIndex: number | null;
  acceptableRoundsCount: number;
  diffsUsed: number;
  adjustment: number;
  bestDifferentials: number[];
  roundIdsUsed: string[]; // NEW: Track which rounds were used
  reason: string;
  pendingNineHoleCount: number;
} {
  const acceptableRounds = rounds.filter((r) => isRoundRatingEligible(r));
  const nineHoleRounds = acceptableRounds.filter(r => r.isNineHoleRound || r.holeCount === 9);
  const pendingNineHoleCount = nineHoleRounds.length % 2;
  const candidates = buildDifferentialCandidates(rounds);
  
  if (candidates.length < 3) {
    return {
      handicapIndex: null,
      acceptableRoundsCount: candidates.length,
      diffsUsed: 0,
      adjustment: 0,
      bestDifferentials: [],
      roundIdsUsed: [],
      reason: `Insufficient rounds (minimum 3 required, have ${candidates.length})`,
      pendingNineHoleCount,
    };
  }
  
  const allDifferentials = candidates.map((r) => r.differential);
  
  if (candidates.length >= 20) {
    const last20Rounds = candidates.slice(0, 20);
    const last20 = last20Rounds.map(r => r.differential);
    const sorted = [...last20].sort((a, b) => a - b);
    const best8 = sorted.slice(0, 8);
    const average = best8.reduce((sum, d) => sum + d, 0) / 8;
    const rawIndex = truncateToOneDecimal(average);
    const lowHI = getLowHandicapIndex(rounds);
    const capped = lowHI !== null ? applyHandicapCap(rawIndex, lowHI) : rawIndex;
    const index = capped;

    const sortedWithIndices = last20Rounds
      .map((r, i) => ({ r, i, diff: r.differential }))
      .sort((a, b) => a.diff - b.diff);
    const best8Entries = sortedWithIndices.slice(0, 8);
    const roundIdsUsed = best8Entries.flatMap(entry => entry.r.roundIds);
    
    return {
      handicapIndex: index,
      acceptableRoundsCount: candidates.length,
      diffsUsed: 8,
      adjustment: 0,
      bestDifferentials: best8,
      roundIdsUsed,
      reason: 'Standard rating: Best 8 of last 20 rounds',
      pendingNineHoleCount,
    };
  } else {
    const count = candidates.length;
    const fallback = WHS_FALLBACK_TABLE[count]!;
    const sorted = [...allDifferentials].sort((a, b) => a - b);
    const bestN = sorted.slice(0, fallback.diffsUsed);
    const average = bestN.reduce((sum, d) => sum + d, 0) / bestN.length;
    const rawIndex = truncateToOneDecimal(average + fallback.adjustment);
    const lowHI = getLowHandicapIndex(rounds);
    const capped = lowHI !== null ? applyHandicapCap(rawIndex, lowHI) : rawIndex;
    const index = capped;

    const sortedWithIndices = candidates
      .map((r, i) => ({ r, i, diff: r.differential }))
      .sort((a, b) => a.diff - b.diff);
    const bestNEntries = sortedWithIndices.slice(0, fallback.diffsUsed);
    const roundIdsUsed = bestNEntries.flatMap(entry => entry.r.roundIds);
    
    return {
      handicapIndex: index,
      acceptableRoundsCount: count,
      diffsUsed: fallback.diffsUsed,
      adjustment: fallback.adjustment,
      bestDifferentials: bestN,
      roundIdsUsed,
      reason: `Early Rating: ${count} rounds, using best ${fallback.diffsUsed} with ${fallback.adjustment} adjustment`,
      pendingNineHoleCount,
    };
  }
}

// ============================================================================
// ROUND ACCEPTABILITY
// ============================================================================

/**
 * Check if a round is acceptable for handicap per WHS rules
 * 
 * @param round - Round to check
 * @returns true if acceptable, false otherwise
 */
export function isRoundAcceptableForHandicap(round: SavedRound): boolean {
  return isRoundRatingEligible(round);
}

/**
 * Update a round with WHS calculations
 * Calculates differential and adjusted score
 * 
 * @param round - Round to update
 * @param handicapIndex - Current handicap index (for NDB)
 * @returns Updated round with WHS data
 */
export function updateRoundWithWHSCalculations(
  round: SavedRound,
  _handicapIndex: number | null
): SavedRound {
  const isAcceptable = isRoundAcceptableForHandicap(round);
  
  if (!isAcceptable) {
    return {
      ...round,
      isAcceptableForHandicap: false,
      differential: undefined,
      adjustedGrossScore: undefined
    };
  }
  
  // Calculate Course Handicap for NDB
  let adjustedGrossScore = round.score;
  
  if (round.holes && round.holes.length > 0) {
    const { adjustedGrossScore: ndbScore, adjustedHoles } = applyNetDoubleBogeyAdjustment(round.holes, 0);
    adjustedGrossScore = ndbScore;
    
    // Update round with adjusted holes
    round = { ...round, holes: adjustedHoles };
  }
  
  // Skip differential for 9-hole rounds until paired
  const coursePar = getRoundCoursePar(round);
  const differential = round.isNineHoleRound || !coursePar
    ? null
    : calculateScoreDifferential(
        adjustedGrossScore,
        coursePar,
        113
      );
  
  return {
    ...round,
    isAcceptableForHandicap: true,
    differential: differential ?? undefined,
    adjustedGrossScore: adjustedGrossScore !== round.score ? adjustedGrossScore : undefined
  };
}

// ============================================================================
// INCOMPLETE ROUND HANDLING (WHS-COMPLIANT)
// ============================================================================

/**
 * Determine if an incomplete round meets WHS minimum requirements
 * 
 * 2024 USGA Rules of Handicapping:
 * - 18-hole course: Minimum 10 holes completed
 * - 9-hole course: All 9 holes required
 * - Fewer than 10 holes on 18-hole course: NOT acceptable
 * 
 * @param holesCompleted - Number of holes with scores entered
 * @param plannedHoles - Originally intended holes (9 or 18)
 * @returns true if round meets WHS minimums
 */
export function meetsWHSMinimum(holesCompleted: number, plannedHoles: number): boolean {
  if (plannedHoles <= 9) {
    return holesCompleted >= 9;
  }
  return holesCompleted >= 18;
}

/**
 * Get the minimum holes required for handicap posting
 * @param plannedHoles - Originally intended holes (9 or 18)
 * @returns Minimum holes required
 */
export function getWHSMinimumHoles(plannedHoles: number): number {
  return plannedHoles <= 9 ? 9 : 18;
}

/**
 * Calculate Net Par for a missing hole (WHS method)
 * Net Par = Par + Handicap Strokes for that hole
 * 
 * @param par - Hole par
 * @param handicapStrokes - Course handicap strokes received on this hole
 * @returns Net Par for the hole
 */
export function calculateNetPar(par: number, handicapStrokes: number): number {
  return par + handicapStrokes;
}

/**
 * Process incomplete round with WHS-compliant missing hole adjustment
 * 
 * For missing holes:
 * - Score = Par + Handicap Strokes for that hole
 * - These scores are ONLY used for handicap calculations
 * - They are NEVER shown as gross scores
 * - They are NEVER editable by user
 * 
 * @param holes - Holes with data entered
 * @param lastCompletedHole - Last hole number with data
 * @param plannedHoles - Total holes intended (9 or 18)
 * @param courseHandicap - Player's course handicap
 * @returns Updated holes array with adjusted missing holes
 */
export function processIncompleteRound(
  holes: RoundHole[],
  lastCompletedHole: number,
  plannedHoles: number,
  courseHandicap: number
): { holes: RoundHole[]; isEligible: boolean; handicapStatus: string } {
  const holesCompleted = holes.filter(h => h.isSaved || (h.score !== undefined && h.score > 0)).length;
  const minimumRequired = getWHSMinimumHoles(plannedHoles);
  
  // Check WHS minimums (2024 rules)
  const isEligible = meetsWHSMinimum(holesCompleted, plannedHoles);
  
  if (!isEligible) {
    return {
      holes,
      isEligible: false,
      handicapStatus: `Played ${holesCompleted} of ${plannedHoles} holes. Minimum ${minimumRequired} required for rating.`
    };
  }

  // Respect the originally planned hole count instead of inferring from holes completed.
  const effectivePlanned = plannedHoles <= 9 ? 9 : 18;
  
  // Calculate handicap strokes per hole (simple distribution)
  // In a full implementation, this would use the hole handicap/stroke index
  const strokesPerHole = Math.floor(courseHandicap / effectivePlanned);
  const remainingStrokes = courseHandicap % effectivePlanned;
  
  // Fill missing holes with Net Par
  const completedHoles = [...holes];
  for (let i = lastCompletedHole; i < effectivePlanned; i++) {
    const hole = holes[i];
    if (!hole || !hole.score || hole.score === 0) {
      // Calculate strokes for this hole
      const holeHandicapStrokes = strokesPerHole + (i < remainingStrokes ? 1 : 0);
      const netPar = calculateNetPar(hole?.par || 4, holeHandicapStrokes);
      
      // Mark as adjusted
      completedHoles[i] = {
        ...hole,
        number: i + 1,
        par: hole?.par || 4,
        score: netPar,
        adjustedScore: netPar,
        putts: undefined, // No stats for missing holes
        fairwayHit: null,
        greenHit: null,
      };
    }
  }
  
  const missingHoles = effectivePlanned - holesCompleted;
  return {
    holes: completedHoles,
    isEligible: true,
    handicapStatus: `Played ${holesCompleted} of ${plannedHoles} holes. Eligible with baseline fill for ${missingHoles} unplayed hole${missingHoles !== 1 ? 's' : ''}.`
  };
}

/**
 * Handle 9-hole round completion
 * 
 * @param holes - 9 holes with data
 * @param isIntentional - User selected "Only playing 9" vs early end
 * @returns Round metadata for 9-hole round
 */
export function process9HoleRound(holes: RoundHole[], isIntentional: boolean): {
  isNineHoleRound: boolean;
  needsPairing: boolean;
  handicapStatus: string;
} {
  return {
    isNineHoleRound: true,
    needsPairing: true,
    handicapStatus: isIntentional 
      ? 'Pending pairing. This 9-hole round will be paired with another 9-hole round for rating.'
      : 'Incomplete round. Only 9 holes completed.'
  };
}
