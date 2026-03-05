/**
 * Round Insights Engine
 *
 * Pure function that generates 2–5 coaching-quality insights from hole-by-hole
 * round data. No side effects, no API calls — easy to unit test.
 *
 * Insight types:
 *   positive  (✅) — things that went well
 *   warning   (⚠️) — areas to watch
 *   critical  (🔴) — clear problem areas costing strokes
 */

import type { RoundHole } from '../types';
import { isFairwayHit, isGreenHit } from '../utils/statChecks';

// ─── Public Types ────────────────────────────────────────────────────────────

export type InsightType = 'positive' | 'warning' | 'critical';

export interface RoundInsight {
  type: InsightType;
  label: string;        // Bold heading, e.g. "Solid putting"
  detail?: string;      // Supporting stat line
  category: InsightCategory;
}

type InsightCategory =
  | 'putting'
  | 'driving'
  | 'approach'
  | 'shortGame'
  | 'parType'
  | 'scoring'
  | 'efficiency';

const CATEGORY_PRIORITY: Record<InsightCategory, number> = {
  putting: 1,
  driving: 2,
  approach: 3,
  shortGame: 4,
  parType: 5,
  scoring: 6,
  efficiency: 7,
};

const TYPE_WEIGHT: Record<InsightType, number> = {
  critical: 3,
  warning: 2,
  positive: 1,
};

// ─── Input Interface ─────────────────────────────────────────────────────────

export interface InsightRoundInput {
  totalScore: number;
  par: number;
  holes: InsightHoleInput[];
}

export interface InsightHoleInput {
  holeNumber: number;
  par: number;
  score: number;
  putts?: number | null;
  fir?: boolean | null;           // null for par 3s or not tracked
  gir?: boolean | null;
  firMissDirection?: 'left' | 'right' | null;
  girMissDirection?: 'left' | 'right' | 'short' | 'long' | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const avg = (arr: number[]) => (arr.length > 0 ? sum(arr) / arr.length : 0);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const pctRaw = (n: number, d: number) => (d > 0 ? n / d : 0);
const fmt1 = (n: number) => Number(n.toFixed(1));

/** Longest consecutive streak of holes matching a predicate. */
function longestStreak(holes: InsightHoleInput[], pred: (h: InsightHoleInput) => boolean): number {
  let max = 0;
  let cur = 0;
  for (const h of holes) {
    if (pred(h)) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

// ─── Normalise from SavedRound ───────────────────────────────────────────────

/**
 * Build an InsightRoundInput from the raw SavedRound-level data that the hook
 * already has available.  This keeps the engine decoupled from SavedRound.
 */
export function buildInsightInput(
  totalScore: number,
  par: number,
  holes: RoundHole[],
): InsightRoundInput {
  const played = holes.filter(h => h.isSaved || (h.score != null && h.score > 0));
  return {
    totalScore,
    par,
    holes: played.map(h => ({
      holeNumber: h.number,
      par: h.par,
      score: h.score,
      putts: h.putts ?? null,
      fir: h.par >= 4
        ? (isFairwayHit(h.fairwayHit) ? true : h.fairwayHit === null || h.fairwayHit === undefined ? null : false)
        : null,
      gir: isGreenHit(h.greenHit) ? true : h.greenHit === null || h.greenHit === undefined ? null : false,
      firMissDirection:
        h.fairwayHit === 'left' ? 'left'
        : h.fairwayHit === 'right' ? 'right'
        : null,
      girMissDirection:
        h.greenHit === 'left' ? 'left'
        : h.greenHit === 'right' ? 'right'
        : h.greenHit === 'short' ? 'short'
        : h.greenHit === 'long' ? 'long'
        : null,
    })),
  };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

interface InternalInsight extends RoundInsight {
  typeWeight: number;
  categoryPriority: number;
}

export function generateRoundInsights(input: InsightRoundInput, handicap?: number | null): RoundInsight[] {
  const { totalScore, par, holes } = input;
  if (holes.length === 0) return [];

  const all: InternalInsight[] = [];

  const push = (type: InsightType, category: InsightCategory, label: string, detail?: string) => {
    all.push({
      type,
      label,
      detail,
      category,
      typeWeight: TYPE_WEIGHT[type],
      categoryPriority: CATEGORY_PRIORITY[category],
    });
  };

  // ── Derived Stats ────────────────────────────────────────────────────────

  const holeCount = holes.length;
  const totalOverPar = totalScore - par;
  const handicapValue = typeof handicap === 'number' ? handicap : null;

  // Nine splits (use actual hole numbers so partial rounds still work)
  const frontNine = holes.filter(h => h.holeNumber <= 9);
  const backNine = holes.filter(h => h.holeNumber >= 10);
  const frontScore = sum(frontNine.map(h => h.score));
  const backScore = sum(backNine.map(h => h.score));

  // Scoring distribution
  const eagles = holes.filter(h => h.score <= h.par - 2).length;
  const birdies = holes.filter(h => h.score === h.par - 1).length;
  const pars = holes.filter(h => h.score === h.par).length;
  const bogeys = holes.filter(h => h.score === h.par + 1).length;
  const doubles = holes.filter(h => h.score >= h.par + 2).length;

  // Putting
  const puttsHoles = holes.filter(h => h.putts != null && h.putts >= 0);
  const hasPuttData = puttsHoles.length > 0;
  const totalPutts = hasPuttData ? sum(puttsHoles.map(h => h.putts!)) : 0;
  const puttsPerHole = hasPuttData ? totalPutts / puttsHoles.length : 0;
  const oneputts = puttsHoles.filter(h => h.putts === 1).length;
  const threeputts = puttsHoles.filter(h => h.putts! >= 3).length;

  // Putts on GIR (birdie putt conversion indicator)
  const girHolesWithPutts = holes.filter(h => h.gir === true && h.putts != null);
  const avgPuttsOnGir = girHolesWithPutts.length > 0
    ? avg(girHolesWithPutts.map(h => h.putts!))
    : null;

  // Fairways (par 3s excluded)
  const fairwayHoles = holes.filter(h => h.par > 3 && h.fir !== null && h.fir !== undefined);
  const hasFirData = fairwayHoles.length > 0;
  const firHit = fairwayHoles.filter(h => h.fir === true).length;
  const firTotal = fairwayHoles.length;
  const firPctVal = pctRaw(firHit, firTotal);
  const firMissLeft = holes.filter(h => h.fir === false && h.firMissDirection === 'left').length;
  const firMissRight = holes.filter(h => h.fir === false && h.firMissDirection === 'right').length;
  // Only trust direction data if there's a mix of directions (not all one way, which signals basic-mode default data)
  const firMisses = firTotal - firHit;
  const hasFirDirectionData = firMisses > 0
    && (firMissLeft + firMissRight) > 0
    && (firMissLeft + firMissRight) < firMisses; // at least some misses have no direction OR there's a mix

  // Greens
  const girHoles = holes.filter(h => h.gir !== null && h.gir !== undefined);
  const hasGirData = girHoles.length > 0;
  const girHit = girHoles.filter(h => h.gir === true).length;
  const girTotal = girHoles.length;
  const girPctVal = pctRaw(girHit, girTotal);
  const girMissLeft = holes.filter(h => h.gir === false && h.girMissDirection === 'left').length;
  const girMissRight = holes.filter(h => h.gir === false && h.girMissDirection === 'right').length;
  const girMissShort = holes.filter(h => h.gir === false && h.girMissDirection === 'short').length;
  const girMisses = girTotal - girHit;
  const hasGirDirectionData = girMisses > 0
    && (girMissLeft + girMissRight + girMissShort) > 0
    && (girMissLeft + girMissRight + girMissShort) < girMisses;

  // Scrambling (missed GIR but still made par or better)
  const missedGirHoles = holes.filter(h => h.gir === false);
  const scrambles = missedGirHoles.filter(h => h.score <= h.par).length;
  const scramblingPct = missedGirHoles.length > 0 ? pctRaw(scrambles, missedGirHoles.length) : null;

  // Par-specific
  const par3s = holes.filter(h => h.par === 3);
  const par4s = holes.filter(h => h.par === 4);
  const par5s = holes.filter(h => h.par === 5);
  const par3Avg = par3s.length > 0 ? avg(par3s.map(h => h.score - h.par)) : null;
  const par4Avg = par4s.length > 0 ? avg(par4s.map(h => h.score - h.par)) : null;
  const par5Avg = par5s.length > 0 ? avg(par5s.map(h => h.score - h.par)) : null;

  // Streaks
  const bogeyFreeStreak = longestStreak(holes, h => h.score <= h.par);
  const scoringStreak = longestStreak(holes, h => h.score < h.par);

  // ── 1. Putting Performance ───────────────────────────────────────────────

  if (hasPuttData) {
    const hotOnePuttThreshold = Math.max(2, Math.round(puttsHoles.length * 0.28));
    const criticalPuttsPerHole = handicapValue === null
      ? 2.0
      : handicapValue <= 10
        ? 1.94
        : handicapValue <= 20
          ? 2.1
          : 2.2;

    if (puttsPerHole <= 1.5) {
      push('positive', 'putting', 'Solid putting',
        `${totalPutts} putts (${fmt1(puttsPerHole)}/hole)`);
    } else if (puttsPerHole <= 1.67 && oneputts >= hotOnePuttThreshold) {
      push('positive', 'putting', 'Hot with the putter',
        `${oneputts} one-putts`);
    }

    if (puttsPerHole >= criticalPuttsPerHole) {
      push('critical', 'putting', 'Putting cost you',
        `${totalPutts} putts (${fmt1(puttsPerHole)}/hole), ${threeputts} three-putts`);
    } else if (threeputts >= 3) {
      push('warning', 'putting', 'Lag putting issue',
        `${threeputts} three-putts. Work on distance control.`);
    }

    if (avgPuttsOnGir !== null && avgPuttsOnGir >= 2.1) {
      push('warning', 'putting', 'Leaving birdie putts out',
        `Averaging ${fmt1(avgPuttsOnGir)} putts when hitting greens`);
    }
  }

  // ── 2. Driving / Fairways ────────────────────────────────────────────────

  if (hasFirData) {
    if (firPctVal >= 0.71) {
      push('positive', 'driving', 'Driving accuracy',
        `${firHit}/${firTotal} fairways (${pct(firHit, firTotal)}%)`);
    }

    if (firPctVal < 0.50) {
      push('critical', 'driving', 'Off the tee struggles',
        `Only ${firHit}/${firTotal} fairways. Consider a more conservative strategy.`);
    }

    if (hasFirDirectionData) {
      if (firMissLeft >= 4 && firMissLeft > firMissRight * 2) {
        push('warning', 'driving', 'Consistent miss left off the tee',
          `${firMissLeft} of ${firMisses} misses went left`);
      } else if (firMissRight >= 4 && firMissRight > firMissLeft * 2) {
        push('warning', 'driving', 'Consistent miss right off the tee',
          `${firMissRight} of ${firMisses} misses went right`);
      }
    }
  }

  // ── 3. Approach / Greens in Regulation ───────────────────────────────────

  if (hasGirData) {
    if (girPctVal >= 0.67) {
      push('positive', 'approach', 'Dialed-in approaches',
        `${girHit}/${girTotal} greens (${pct(girHit, girTotal)}%)`);
    }

    if (girPctVal < 0.50 && hasFirData && firPctVal >= 0.60) {
      push('critical', 'approach', 'Approach game bleeding strokes',
        `Hitting fairways (${pct(firHit, firTotal)}%) but only ${pct(girHit, girTotal)}% GIR. Iron play is the priority.`);
    } else if (girPctVal < 0.39) {
      push('critical', 'approach', 'GIR well below average',
        `${girHit}/${girTotal} greens. Focus on approach distance control.`);
    }

    if (hasGirDirectionData) {
      if (girMissShort >= 4) {
        push('warning', 'approach', 'Clubbing short',
          `${girMissShort} GIR misses were short. Take one more club.`);
      }
      if (girMissLeft >= 4 && girMissLeft > girMissRight * 2) {
        push('warning', 'approach', 'Approaches pulling left',
          `${girMissLeft} GIR misses went left`);
      } else if (girMissRight >= 4 && girMissRight > girMissLeft * 2) {
        push('warning', 'approach', 'Approaches leaking right',
          `${girMissRight} GIR misses went right`);
      }
    }
  }

  // ── 4. Short Game / Scrambling ───────────────────────────────────────────
  // Scrambling = missed GIR but still made par or better. This is the standard
  // golf definition and is derived from GIR + score data — no explicit "up & down"
  // tracking required. Only show when GIR data is present.

  if (hasGirData && scramblingPct !== null && missedGirHoles.length >= 5) {
    if (scramblingPct >= 0.60) {
      push('positive', 'shortGame', 'Short game saving pars',
        `Made par or better on ${scrambles} of ${missedGirHoles.length} missed greens (${pct(scrambles, missedGirHoles.length)}%)`);
    }

    if (scramblingPct < 0.30) {
      push('critical', 'shortGame', 'Short game costing strokes',
        `Only saved par on ${scrambles} of ${missedGirHoles.length} missed greens (${pct(scrambles, missedGirHoles.length)}%).`);
    } else if (scramblingPct < 0.45 && girPctVal < 0.50) {
      push('warning', 'shortGame', 'Missing greens and can\'t recover',
        `${pct(girHit, girTotal)}% GIR with only ${pct(scrambles, missedGirHoles.length)}% scrambling`);
    }
  }

  // ── 5. Par-Type Performance ──────────────────────────────────────────────

  if (par5Avg !== null && par5s.length >= 4) {
    if (par5Avg <= -0.25) {
      push('positive', 'parType', 'Capitalizing on par 5s',
        `Averaging ${fmt1(par5Avg)} vs par on par 5s`);
    } else if (par5Avg >= 0.75) {
      push('warning', 'parType', 'Leaving shots on par 5s',
        `Averaging +${fmt1(par5Avg)} on par 5s. These are birdie opportunities.`);
    }
  }

  if (par3Avg !== null && par3s.length >= 2) {
    if (par3Avg <= 0.0) {
      push('positive', 'parType', 'Par 3 machine',
        `Averaging ${fmt1(par3Avg)} vs par on par 3s`);
    } else if (par3Avg >= 1.0) {
      push('warning', 'parType', 'Par 3 struggles',
        `Averaging +${fmt1(par3Avg)} on par 3s. Mid-iron accuracy needs work.`);
    }
  }

  // ── 6. Scoring Patterns & Momentum ───────────────────────────────────────

  if (frontNine.length > 0 && backNine.length > 0) {
    if (frontScore > backScore + 5) {
      push('positive', 'scoring', 'Strong finish',
        `${frontScore} front / ${backScore} back. Came on strong.`);
    } else if (backScore > frontScore + 5) {
      push('warning', 'scoring', 'Back nine fade',
        `${frontScore} front / ${backScore} back. Lost momentum on the back.`);
    }
  }

  if (holeCount > 0 && (doubles / holeCount) >= 0.11) {
    push('critical', 'scoring', 'Big numbers hurt',
      `${doubles} double bogeys or worse. Eliminating blow-up holes saves ${doubles}+ strokes.`);
  }

  if (doubles === 0 && bogeys <= 3) {
    push('positive', 'scoring', 'Clean card',
      `No doubles and only ${bogeys} bogey${bogeys !== 1 ? 's' : ''}. Solid course management.`);
  }

  if (bogeyFreeStreak >= 7) {
    push('positive', 'scoring', 'Bogey-free run',
      `${bogeyFreeStreak} holes in a row without a bogey`);
  }

  if (scoringStreak >= 3) {
    push('positive', 'scoring', 'Birdie streak',
      `${scoringStreak} under-par holes in a row`);
  }

  if (birdies >= 4) {
    push('positive', 'scoring', 'Birdie machine',
      `${birdies} birdies. Plenty of scoring ability out there.`);
  }

  // ── 7. Efficiency / Conversion ───────────────────────────────────────────

  if (hasGirData && hasPuttData) {
    if (girHit >= 10 && birdies <= 1) {
      push('warning', 'efficiency', 'Hitting greens but not scoring',
        `${girHit} GIR but only ${birdies} birdie${birdies !== 1 ? 's' : ''}. Birdie putt conversion needs work.`);
    }
  }

  if (hasFirData && hasGirData && firPctVal >= 0.70 && girPctVal < 0.50) {
    push('warning', 'efficiency', 'Fairway-to-green disconnect',
      `Hitting ${pct(firHit, firTotal)}% fairways but only ${pct(girHit, girTotal)}% GIR. Approach distances or club selection is the issue.`);
  }

  // ── Selection ────────────────────────────────────────────────────────────

  // Sort: critical first, then warning, then positive. Within same weight,
  // lower category number wins.
  all.sort((a, b) => {
    if (b.typeWeight !== a.typeWeight) return b.typeWeight - a.typeWeight;
    return a.categoryPriority - b.categoryPriority;
  });

  // Deduplicate: max 1 insight per category
  const seen = new Set<InsightCategory>();
  const deduped = all.filter(insight => {
    if (seen.has(insight.category)) return false;
    seen.add(insight.category);
    return true;
  });

  // Return 2–5 insights
  const final = deduped.slice(0, 5);

  // Strip internal fields
  return final.map(({ typeWeight, categoryPriority, ...rest }) => rest);
}
