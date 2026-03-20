/**
 * Insight Generation Service
 *
 * Extracted from analyticsCalculations.ts for maintainability.
 * Generates insights with proper gating and confidence scoring.
 */

import {
  SavedRound,
  Insight,
  InsightType,
  InsightConfidence,
  INSIGHT_THRESHOLDS,
} from '../types';
import { isRoundStatEnabled } from '../utils/statPreferences';
import { getExpectedFairways, getExpectedGIR, getExpectedPutts } from '../utils/averagesAnalytics';
import { generateCoachingInsights } from './coachingInsights';
import { isFairwayHit as _isFairwayHit, isGreenHit as _isGreenHit } from '../utils/statChecks';
import { resolveHandicap } from '../utils/handicap';

function formatExpectedRange(
  range: { min: number; max: number },
  unit: '%' | '' = '',
  decimals: number = 0
): string {
  const formatValue = (value: number) => value.toFixed(decimals);
  return `${formatValue(range.min)}-${formatValue(range.max)}${unit}`;
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

/**
 * Generates insights with proper gating and confidence scoring
 */
type HandicapBand = 'ELITE' | 'LOW' | 'MID' | 'HIGH' | 'BEGINNER';

function getHandicapBand(handicap?: number | null): HandicapBand {
  if (handicap === null || handicap === undefined) return 'MID';
  if (handicap <= 5) return 'ELITE';
  if (handicap <= 10) return 'LOW';
  if (handicap <= 15) return 'MID';
  if (handicap <= 20) return 'HIGH';
  return 'BEGINNER';
}

function tuneActionable(insightId: string, base: string, handicap?: number | null): string {
  const band = getHandicapBand(handicap);
  switch (insightId) {
    case 'cm-aggressive-targeting-penalty':
      return band === 'BEGINNER'
        ? 'Keep the ball in play first; avoid hazards at all costs.'
        : band === 'HIGH'
          ? 'Choose the widest fairway line to avoid penalties.'
          : band === 'MID'
            ? 'Play to the fat side to keep the ball in play.'
            : band === 'LOW'
              ? 'Pick a conservative target and commit to start line.'
              : 'Narrow targets only when the miss is safe; prioritize start line.';
    case 'so-double-plus-frequency':
      return band === 'BEGINNER'
        ? 'If in trouble, chip back to the fairway first.'
        : band === 'HIGH'
          ? 'After trouble, play the safe shot and move on.'
          : band === 'MID'
            ? 'Take medicine early to stop doubles.'
            : band === 'LOW'
              ? 'Take the smart recovery to avoid compounding errors.'
              : 'Reset after trouble and take the simplest recovery line.';
    case 'sg-low-scrambling':
      return band === 'BEGINNER'
        ? 'Just get it on the green and avoid short‑siding.'
        : band === 'HIGH'
          ? 'Get the ball on the green first; distance control next.'
          : band === 'MID'
            ? 'Keep chips simple to avoid leaving long putts.'
            : band === 'LOW'
              ? 'Choose safer landing zones to leave makeable putts.'
              : 'Aim for conservative landing spots to protect one‑putt chances.';
    case 'a-par3-gir-deficiency':
      return band === 'BEGINNER'
        ? 'Get it on the green; middle is always safe.'
        : band === 'HIGH'
          ? 'Take more club and aim middle.'
          : band === 'MID'
            ? 'Aim center‑green to avoid big misses.'
            : band === 'LOW'
              ? 'Play to the middle and accept longer putts.'
              : 'Center‑green targets on par‑3s protect scoring.';
    default:
      return base;
  }
}

const getAggregatedPercent = (
  rounds: SavedRound[],
  getHits: (round: SavedRound) => number | undefined,
  getAttempts: (round: SavedRound) => number | undefined
): { percent: number; hits: number; attempts: number } | null => {
  let hits = 0;
  let attempts = 0;

  rounds.forEach(round => {
    const attemptCount = getAttempts(round);
    if (!attemptCount || attemptCount <= 0) return;
    attempts += attemptCount;
    hits += getHits(round) || 0;
  });

  if (attempts === 0) return null;
  return {
    percent: (hits / attempts) * 100,
    hits,
    attempts,
  };
};

export function generateInsights(
  rounds: SavedRound[],
  userHandicap?: number | null,
  clubDistances: Record<string, number> = {}
): Insight[] {
  const insights: Insight[] = [];
  const orderedRounds = [...rounds].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const totalRounds = orderedRounds.length;

  const getRoundParTotal = (round: SavedRound): number | null => {
    const statsAny = round.stats as { totalPar?: number; coursePar?: number };
    if (typeof statsAny.totalPar === 'number' && statsAny.totalPar > 0) {
      return statsAny.totalPar;
    }
    if (typeof statsAny.coursePar === 'number' && statsAny.coursePar > 0) {
      return statsAny.coursePar;
    }
    // For incomplete rounds with holesPlayed, only sum par for played holes
    const playedSet = round.holesPlayed?.length ? new Set(round.holesPlayed) : null;
    if (round.holes && round.holes.length > 0) {
      const relevantHoles = playedSet ? round.holes.filter(h => playedSet.has(h.number)) : round.holes;
      const total = relevantHoles.reduce((sum, hole) => sum + (hole.par || 0), 0);
      if (total > 0) return total;
    }
    if (round.courseSnapshot?.holes && round.courseSnapshot.holes.length > 0) {
      const relevantHoles = playedSet
        ? round.courseSnapshot.holes.filter(h => playedSet.has(h.number))
        : round.courseSnapshot.holes;
      const total = relevantHoles.reduce((sum, hole) => sum + (hole.par || 0), 0);
      if (total > 0) return total;
    }
    return null;
  };

  const getScoreToPar = (round: SavedRound): number | null => {
    const parTotal = getRoundParTotal(round);
    if (parTotal === null) return null;
    return round.score - parTotal;
  };

  const formatScoreToPar = (diff: number): string => {
    if (diff === 0) return 'E';
    if (diff > 0) return `+${diff}`;
    return `${diff}`;
  };

  const getHoleYardage = (round: SavedRound, holeNumber?: number | null): number | null => {
    if (!holeNumber || !round.courseSnapshot?.holes) return null;
    const match = round.courseSnapshot.holes.find(hole => hole.number === holeNumber);
    return typeof match?.yardage === 'number' ? match.yardage : null;
  };

  const isHitValue = _isFairwayHit;
  const isGreenHit = _isGreenHit;
  const getRoundHoleCount = (round: SavedRound): number => (
    round.holeCount || round.holesPlayed?.length || round.holes?.length || 18
  );

  const allHoles = orderedRounds.flatMap(round =>
    (round.holes || []).map(hole => ({ hole, round }))
  );

  // Gate: Minimum 3 rounds for any insights
  if (totalRounds < INSIGHT_THRESHOLDS.LIGHT_TREND) {
    return [];
  }

  const latestRound = totalRounds > 0 ? orderedRounds[orderedRounds.length - 1] : null;
  const priorRounds = totalRounds > 1 ? orderedRounds.slice(0, -1) : [];
  let birdies = 0;
  let pars = 0;
  let girChances = 0;

  // Calculate recent trends (last 5 rounds)
  const recentRounds = orderedRounds.slice(-Math.min(5, totalRounds));
  const olderRounds = totalRounds > 5 ? orderedRounds.slice(0, -5) : [];

  // === SCORING TREND (3+ rounds) ===
  if (totalRounds >= INSIGHT_THRESHOLDS.LIGHT_TREND) {
    const scoringValues = orderedRounds.map(round => {
      const scoreToPar = getScoreToPar(round);
      return {
        round,
        scoreToPar,
        value: scoreToPar ?? round.score,
      };
    });
    const avgScore = scoringValues.reduce((sum, entry) => sum + entry.value, 0) / scoringValues.length;
    const bestEntry = scoringValues.reduce((best, current) => (
      current.value < best.value ? current : best
    ));
    const latestEntry = scoringValues[scoringValues.length - 1];
    const priorEntries = scoringValues.slice(0, -1);
    const priorBestValue = priorEntries.length > 0
      ? Math.min(...priorEntries.map(entry => entry.value))
      : null;
    const latestBestLabel = latestEntry.scoreToPar !== null
      ? `${formatScoreToPar(latestEntry.value)} (${latestEntry.round.score})`
      : `${latestEntry.round.score}`;
    
    // Recent improvement
    if (recentRounds.length >= 3) {
      const recentScores = recentRounds.map(round => {
        const scoreToPar = getScoreToPar(round);
        return scoreToPar ?? round.score;
      });
      const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
      
      if (olderRounds.length >= 2) {
        const olderScores = olderRounds.map(round => {
          const scoreToPar = getScoreToPar(round);
          return scoreToPar ?? round.score;
        });
        const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
        
        if (recentAvg < olderAvg - 2) {
          insights.push({
            id: 'scoring-improving',
            type: InsightType.TREND,
            confidence: InsightConfidence.MEDIUM,
            title: 'Scoring Trend',
            description: `Your recent rounds are ${Math.round(olderAvg - recentAvg)} strokes better on average`,
            actionable: 'Keep up the momentum; consistency is building',
            minimumRounds: INSIGHT_THRESHOLDS.LIGHT_TREND,
            priority: 1,
            dismissible: true
          });
        }
      }
    }
    
    // Best score callout (always show for 3+ rounds if recent)
    if (latestEntry && priorBestValue !== null && totalRounds >= 3) {
      if (latestEntry.value < priorBestValue) {
        insights.push({
          id: 'best-score-recent',
          type: InsightType.TREND,
          confidence: InsightConfidence.HIGH,
          title: 'New Personal Best',
          description: `Best round: ${latestBestLabel}`,
          minimumRounds: INSIGHT_THRESHOLDS.LIGHT_TREND,
          priority: 0,
          dismissible: true
        });
      } else if (latestEntry.value === priorBestValue) {
        insights.push({
          id: 'best-score-tied',
          type: InsightType.TREND,
          confidence: InsightConfidence.MEDIUM,
          title: 'Personal Best (Tied)',
          description: `Matched your best: ${latestBestLabel}`,
          minimumRounds: INSIGHT_THRESHOLDS.LIGHT_TREND,
          priority: 2,
          dismissible: true
        });
      }
    }
  }

  // === PUTTING FOCUS (5+ rounds) ===
  if (totalRounds >= INSIGHT_THRESHOLDS.FOCUS_INSIGHT) {
    const roundsWithPutts = rounds.filter(r =>
      isRoundStatEnabled(r, 'putts') && r.stats.putts && r.stats.putts > 0
    );
    
    if (roundsWithPutts.length >= 5) {
      const handicapIndex = resolveHandicap(userHandicap ?? undefined);
      const expectedPutts = getExpectedPutts(handicapIndex);
      const expectedPuttsText = formatExpectedRange(expectedPutts, '', 0);
      const handicapLabel = userHandicap !== undefined && userHandicap !== null
        ? `${Math.round(userHandicap)}`
        : 'mid-handicap';
      const avgPutts = roundsWithPutts.reduce((sum, r) => {
        const holes = getRoundHoleCount(r);
        const normalized = holes > 0 ? (r.stats.putts || 0) * (18 / holes) : 0;
        return sum + normalized;
      }, 0) / roundsWithPutts.length;
      
      // Putting opportunity
      if (avgPutts > 34) {
        insights.push({
          id: 'putting-opportunity',
          type: InsightType.WEEKLY_FOCUS,
          confidence: InsightConfidence.MEDIUM,
          title: 'Putting Opportunity',
          description: `Averaging ${avgPutts.toFixed(1)} putts per round`,
          actionable: `Avg ${avgPutts.toFixed(1)} vs expected ${expectedPuttsText} for a ${handicapLabel} player. Better lag speed lowers scores.`,
          minimumRounds: INSIGHT_THRESHOLDS.FOCUS_INSIGHT,
          priority: 1,
          dismissible: false
        });
      } else if (avgPutts < 32) {
        insights.push({
          id: 'putting-strength',
          type: InsightType.TREND,
          confidence: InsightConfidence.MEDIUM,
          title: 'Putting Strength',
          description: `Your ${avgPutts.toFixed(1)} putts/round is a reliable strength`,
          minimumRounds: INSIGHT_THRESHOLDS.FOCUS_INSIGHT,
          priority: 2,
          dismissible: true
        });
      }
      
      // Putting trend (improvement)
      const recentPutts = recentRounds
        .filter(r => isRoundStatEnabled(r, 'putts') && r.stats.putts)
        .map(r => r.stats.putts || 0);
      const olderPutts = olderRounds
        .filter(r => isRoundStatEnabled(r, 'putts') && r.stats.putts)
        .map(r => r.stats.putts || 0);
      
      if (recentPutts.length >= 3 && olderPutts.length >= 3) {
        const recentAvg = recentPutts.reduce((a, b) => a + b, 0) / recentPutts.length;
        const olderAvg = olderPutts.reduce((a, b) => a + b, 0) / olderPutts.length;
        
        if (recentAvg < olderAvg - 2) {
          insights.push({
            id: 'putting-improving',
            type: InsightType.TREND,
            confidence: InsightConfidence.MEDIUM,
            title: 'Putting Progress',
            description: `Down ${(olderAvg - recentAvg).toFixed(1)} putts/round recently`,
            minimumRounds: INSIGHT_THRESHOLDS.FOCUS_INSIGHT,
            priority: 1,
            dismissible: true
          });
        }
      }
    }
  }

  // === DRIVING OPPORTUNITY (5+ rounds) ===
  if (totalRounds >= INSIGHT_THRESHOLDS.FOCUS_INSIGHT) {
    const roundsWithFIR = rounds.filter(r =>
      isRoundStatEnabled(r, 'fir') &&
      r.stats.fairways !== undefined &&
      r.stats.fairwaysPossible !== undefined &&
      r.stats.fairwaysPossible > 0
    );

    if (roundsWithFIR.length >= 5) {
      const handicapIndex = resolveHandicap(userHandicap ?? undefined);
      const expectedFIR = getExpectedFairways(handicapIndex);
      const expectedFIRText = formatExpectedRange(expectedFIR, '%', 0);
      const handicapLabel = userHandicap !== undefined && userHandicap !== null
        ? `${Math.round(userHandicap)}`
        : 'mid-handicap';
      const aggregatedFir = getAggregatedPercent(
        roundsWithFIR,
        round => round.stats.fairways,
        round => round.stats.fairwaysPossible
      );
      const avgFIR = aggregatedFir ? aggregatedFir.percent : 0;

      if (avgFIR < expectedFIR.min) {
        insights.push({
          id: 'tee-club-accuracy',
          type: InsightType.WEEKLY_FOCUS,
          confidence: InsightConfidence.MEDIUM,
          title: 'Off-the-Tee Opportunity',
          description: `Averaging ${avgFIR.toFixed(0)}% fairways hit`,
          actionable: `Avg ${avgFIR.toFixed(0)}% vs expected ${expectedFIRText} for a ${handicapLabel} player. More fairways lower scores.`,
          minimumRounds: INSIGHT_THRESHOLDS.FOCUS_INSIGHT,
          priority: 2,
          dismissible: false
        });
      }
    }
  }

  // === GIR OPPORTUNITY (5+ rounds) ===
  if (totalRounds >= INSIGHT_THRESHOLDS.FOCUS_INSIGHT) {
    const roundsWithGIR = rounds.filter(r =>
      isRoundStatEnabled(r, 'gir') &&
      r.stats.greens !== undefined &&
      r.stats.greensPossible !== undefined &&
      r.stats.greensPossible > 0
    );
    
    if (roundsWithGIR.length >= 5) {
      const handicapIndex = resolveHandicap(userHandicap ?? undefined);
      const expectedGIR = getExpectedGIR(handicapIndex);
      const expectedGIRText = formatExpectedRange(expectedGIR, '%', 0);
      const handicapLabel = userHandicap !== undefined && userHandicap !== null
        ? `${Math.round(userHandicap)}`
        : 'mid-handicap';
      const aggregatedGir = getAggregatedPercent(
        roundsWithGIR,
        round => round.stats.greens,
        round => round.stats.greensPossible
      );
      const avgGIR = aggregatedGir ? aggregatedGir.percent : 0;
      
      if (avgGIR < 40) {
        insights.push({
          id: 'gir-opportunity',
          type: InsightType.WEEKLY_FOCUS,
          confidence: InsightConfidence.MEDIUM,
          title: 'Approach Opportunity',
          description: `${avgGIR.toFixed(0)}% greens in regulation`,
          actionable: `Avg ${avgGIR.toFixed(0)}% vs expected ${expectedGIRText} for a ${handicapLabel} player. More greens lower scores.`,
          minimumRounds: INSIGHT_THRESHOLDS.FOCUS_INSIGHT,
          priority: 2,
          dismissible: false
        });
      }
    }
  }

  // === CONSISTENCY OPPORTUNITY (5+ rounds) ===
  if (totalRounds >= INSIGHT_THRESHOLDS.FOCUS_INSIGHT) {
    const scores = orderedRounds.map(r => r.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev > 6) {
      insights.push({
        id: 'consistency-opportunity',
        type: InsightType.WEEKLY_FOCUS,
        confidence: InsightConfidence.MEDIUM,
        title: 'Consistency Opportunity',
        description: `Your scores are swinging by ${stdDev.toFixed(1)} shots, and big numbers are driving it`,
        actionable: 'Aim for safe targets and play to the middle to reduce doubles',
        minimumRounds: INSIGHT_THRESHOLDS.FOCUS_INSIGHT,
        priority: 3,
        dismissible: false
      });
    }
  }

  // === SCORING OUTCOMES (Bogeys / Doubles / Par-5) ===
  const roundsWithHoles = rounds.filter(r => r.holes && r.holes.length > 0);
  if (roundsWithHoles.length >= 3) {
    let bogeys = 0;
    let doubles = 0;
    let par5OverParTotal = 0;
    let par5Rounds = 0;

    roundsWithHoles.forEach(round => {
      let roundBogeys = 0;
      let roundDoubles = 0;
      let par5Total = 0;
      let par5Count = 0;

      round.holes?.forEach(hole => {
        if (!hole.par || !hole.score) return;
        if (hole.score === hole.par + 1) roundBogeys += 1;
        if (hole.score >= hole.par + 2) roundDoubles += 1;
        if (hole.par === 5) {
          par5Total += hole.score - hole.par;
          par5Count += 1;
        }
      });

      bogeys += roundBogeys;
      doubles += roundDoubles;
      if (par5Count > 0) {
        par5OverParTotal += par5Total;
        par5Rounds += 1;
      }
    });

    const bogeysPerRound = bogeys / roundsWithHoles.length;
    const doublesPerRound = doubles / roundsWithHoles.length;
    if (bogeysPerRound >= 6) {
      insights.push({
        id: 'so-high-bogey-rate',
        type: InsightType.WEEKLY_FOCUS,
        confidence: InsightConfidence.MEDIUM,
        title: 'Bogey Rate',
        description: `Averaging ${bogeysPerRound.toFixed(1)} bogeys/round, adding ~${bogeysPerRound.toFixed(1)} strokes`,
        actionable: 'Favor center‑green targets to keep bogeys from turning into doubles',
        minimumRounds: 3,
        priority: 2,
        dismissible: false
      });
    }

    if (doublesPerRound >= 2) {
      const strokeImpact = (doublesPerRound * 2).toFixed(1);
      insights.push({
        id: 'so-double-plus-frequency',
        type: InsightType.WEEKLY_FOCUS,
        confidence: InsightConfidence.MEDIUM,
        title: 'Double+ Frequency',
        description: `Averaging ${doublesPerRound.toFixed(1)} doubles+/round, costing ~${strokeImpact} strokes`,
        actionable: tuneActionable('so-double-plus-frequency', 'Take the safe shot after trouble to stop big‑number chains', userHandicap),
        minimumRounds: 3,
        priority: 1,
        dismissible: false
      });
    }

    if (par5Rounds > 0) {
      const par5OverParAvg = par5OverParTotal / par5Rounds;
      if (par5OverParAvg >= 0.6) {
        insights.push({
          id: 'so-par5-gap',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Par‑5 Scoring Gap',
          description: `Par‑5s are ${par5OverParAvg.toFixed(1)} over par per round, costing ~${par5OverParAvg.toFixed(1)} strokes`,
          actionable: 'Lay up to a favorite yardage to improve birdie looks',
          minimumRounds: 3,
          priority: 3,
          dismissible: true
        });
      }
    }
  }

  // === POSITIVE REINFORCEMENT (10% improvement vs baseline) ===
  if (recentRounds.length >= 3 && olderRounds.length >= 3) {
    const recentFirAgg = getAggregatedPercent(
      recentRounds.filter(r => isRoundStatEnabled(r, 'fir')),
      round => round.stats.fairways,
      round => round.stats.fairwaysPossible
    );
    const olderFirAgg = getAggregatedPercent(
      olderRounds.filter(r => isRoundStatEnabled(r, 'fir')),
      round => round.stats.fairways,
      round => round.stats.fairwaysPossible
    );
    if (recentFirAgg && olderFirAgg && recentFirAgg.attempts >= 3 && olderFirAgg.attempts >= 3) {
      const recentAvg = recentFirAgg.percent;
      const olderAvg = olderFirAgg.percent;
      if ((recentAvg - olderAvg) >= 10) {
        insights.push({
          id: 'pr-driving-improved',
          type: InsightType.TREND,
          confidence: InsightConfidence.MEDIUM,
          title: 'Driving Improvement',
          description: `Fairways improved from ${olderAvg.toFixed(0)}% to ${recentAvg.toFixed(0)}%`,
          actionable: 'Maintain the same target bias that’s keeping the ball in play',
          minimumRounds: 3,
          priority: 3,
          dismissible: true
        });
      }
    }

    const recentGirAgg = getAggregatedPercent(
      recentRounds.filter(r => isRoundStatEnabled(r, 'gir')),
      round => round.stats.greens,
      round => round.stats.greensPossible
    );
    const olderGirAgg = getAggregatedPercent(
      olderRounds.filter(r => isRoundStatEnabled(r, 'gir')),
      round => round.stats.greens,
      round => round.stats.greensPossible
    );
    if (recentGirAgg && olderGirAgg && recentGirAgg.attempts >= 3 && olderGirAgg.attempts >= 3) {
      const recentAvg = recentGirAgg.percent;
      const olderAvg = olderGirAgg.percent;
      if ((recentAvg - olderAvg) >= 10) {
        insights.push({
          id: 'pr-gir-improved',
          type: InsightType.TREND,
          confidence: InsightConfidence.MEDIUM,
          title: 'GIR Improvement',
          description: `Greens in regulation improved from ${olderAvg.toFixed(0)}% to ${recentAvg.toFixed(0)}%`,
          actionable: 'Keep playing to your best approach distance windows',
          minimumRounds: 3,
          priority: 3,
          dismissible: true
        });
      }
    }
  }

  // === PERSONAL BESTS (latest round only) ===
  if (latestRound) {
    const priorBestValues = priorRounds.map(round => {
      const scoreToPar = getScoreToPar(round);
      return scoreToPar ?? round.score;
    });
    const bestValue = priorBestValues.length > 0 ? Math.min(...priorBestValues) : null;
    const latestScoreToPar = getScoreToPar(latestRound);
    const latestValue = latestScoreToPar ?? latestRound.score;
    const latestLabel = latestScoreToPar !== null
      ? `${formatScoreToPar(latestValue)} (${latestRound.score})`
      : `${latestRound.score}`;

    if (bestValue !== null && latestValue < bestValue) {
      insights.push({
        id: 'pb-lowest-score',
        type: InsightType.TREND,
        confidence: InsightConfidence.HIGH,
        title: 'Lowest Score',
        description: `${latestLabel} is a new personal best`,
        actionable: 'Lock in the same pre-shot routine that produced this round',
        minimumRounds: 3,
        priority: 0,
        dismissible: true
      });
    }
  }

  // === SHORT GAME & SCRAMBLING ===
  const roundsWithScrambling = rounds.filter(r =>
    isRoundStatEnabled(r, 'scrambling') &&
    r.stats.upDownAttempts !== undefined &&
    r.stats.upDownAttempts > 0
  );
  if (roundsWithScrambling.length >= 3) {
    const aggregatedScramble = getAggregatedPercent(
      roundsWithScrambling,
      round => round.stats.upDownMade,
      round => round.stats.upDownAttempts
    );
    const avgScramble = aggregatedScramble ? aggregatedScramble.percent : 0;

    const recentScrambleRounds = recentRounds.filter(r =>
      isRoundStatEnabled(r, 'scrambling') &&
      r.stats.upDownAttempts !== undefined &&
      r.stats.upDownAttempts > 0
    );
    const aggregatedRecentScramble = getAggregatedPercent(
      recentScrambleRounds,
      round => round.stats.upDownMade,
      round => round.stats.upDownAttempts
    );
    const recentScramble = aggregatedRecentScramble
      ? aggregatedRecentScramble.percent
      : avgScramble;

    if (avgScramble < 40) {
      const strokesCost = ((40 - recentScramble) / 20);
      insights.push({
        id: 'sg-low-scrambling',
        type: InsightType.WEEKLY_FOCUS,
        confidence: InsightConfidence.MEDIUM,
        title: 'Up & Down Rate',
        description: `Recent: ${recentScramble.toFixed(0)}% (vs ${avgScramble.toFixed(0)}% typical). Costing ~${strokesCost.toFixed(1)} strokes per round.`,
        actionable: tuneActionable('sg-low-scrambling', 'Play to safer landing zones to leave simple chips and one-putts', userHandicap),
        minimumRounds: 3,
        priority: 2,
        dismissible: false
      });
    } else if (avgScramble >= 55) {
      insights.push({
        id: 'sg-scrambling-strength',
        type: InsightType.TREND,
        confidence: InsightConfidence.MEDIUM,
        title: 'Up & Down Strength',
        description: `Up & down rate is ${avgScramble.toFixed(0)}% across recent rounds`,
        actionable: 'Keep prioritizing conservative chips to inside-10-ft targets',
        minimumRounds: 3,
        priority: 4,
        dismissible: true
      });
    }
  }

  const roundsWithBunkers = rounds.filter(r => r.holes && r.holes.length > 0);
  if (roundsWithBunkers.length >= 3) {
    let bunkerAttempts = 0;
    let bunkerFails = 0;
    roundsWithBunkers.forEach(round => {
      round.holes?.forEach(hole => {
        if (!hole.par || !hole.score) return;
        if (hole.greenSideBunker) {
          bunkerAttempts += 1;
          if (hole.upDown === false || hole.score > hole.par) bunkerFails += 1;
        }
      });
    });

    if (bunkerAttempts >= 5) {
      const failRate = bunkerFails / bunkerAttempts;
      if (failRate >= 0.6) {
        insights.push({
          id: 'sg-bunker-inefficiency',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Bunker Inefficiency',
          description: `Failed ${Math.round(failRate * 100)}% of greenside bunker shots (${bunkerFails}/${bunkerAttempts})`,
          actionable: 'Pick a safe landing spot and focus on solid contact',
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      }
    }
  }

  // === APPROACH PLAY (Par‑3 GIR + Distance Gap) ===
  const roundsWithApproachDistance = rounds.filter(r =>
    isRoundStatEnabled(r, 'gir') && r.holes && r.holes.length > 0
  );
  if (roundsWithApproachDistance.length >= 3) {
    let par3Hits = 0;
    let par3Attempts = 0;
    const distanceBuckets = new Map<string, { attempts: number; hits: number }>();

    roundsWithApproachDistance.forEach(round => {
      round.holes?.forEach(hole => {
        if (hole.par === 3 && hole.greenHit !== undefined && hole.greenHit !== null) {
          par3Attempts += 1;
          if (isGreenHit(hole.greenHit)) par3Hits += 1;
        }
        if (hole.approachDistance && hole.greenHit !== undefined && hole.greenHit !== null) {
          const stats = distanceBuckets.get(hole.approachDistance) || { attempts: 0, hits: 0 };
          stats.attempts += 1;
          if (isGreenHit(hole.greenHit)) stats.hits += 1;
          distanceBuckets.set(hole.approachDistance, stats);
        }
      });
    });

    if (par3Attempts >= 6) {
      const par3Pct = Math.round((par3Hits / par3Attempts) * 100);
      if (par3Pct < 30) {
        insights.push({
          id: 'a-par3-gir-deficiency',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Par‑3 GIR Gap',
          description: `Par‑3 GIR is ${par3Pct}% (${par3Hits}/${par3Attempts}), leaving too many long pars`,
          actionable: tuneActionable('a-par3-gir-deficiency', 'Aim center‑green on par‑3s to take miss‑side out of play', userHandicap),
          minimumRounds: 3,
          priority: 3,
          dismissible: true
        });
      }
    }

    const bucketEntries = [...distanceBuckets.entries()].filter(([, stats]) => stats.attempts >= 5);
    if (bucketEntries.length >= 2) {
      const sortedByRate = bucketEntries
        .map(([bucket, stats]) => ({ bucket, rate: stats.hits / stats.attempts }))
        .sort((a, b) => a.rate - b.rate);
      const worst = sortedByRate[0];
      const best = sortedByRate[sortedByRate.length - 1];
      const gap = Math.round((best.rate - worst.rate) * 100);
      if (gap >= 15) {
        insights.push({
          id: 'a-approach-distance-gap',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Approach Distance Gap',
          description: `${worst.bucket} yds is your lowest GIR range; ${best.bucket} yds is strongest (+${gap}%)`,
          actionable: 'Plan for the stronger distance when laying up or clubbing into par‑4s',
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      }
    }
  }

  // Approach strength
  const roundsWithGir = rounds.filter(r => isRoundStatEnabled(r, 'gir') && r.stats.greensPossible);
  if (roundsWithGir.length >= 3) {
    const aggregatedGir = getAggregatedPercent(
      roundsWithGir,
      round => round.stats.greens,
      round => round.stats.greensPossible
    );
    const avgGir = aggregatedGir ? aggregatedGir.percent : 0;
    if (avgGir >= 55) {
      insights.push({
        id: 'a-approach-strength',
        type: InsightType.TREND,
        confidence: InsightConfidence.MEDIUM,
        title: 'Approach Strength',
        description: `Averaging ${avgGir.toFixed(0)}% GIR across recent rounds`,
        actionable: tuneActionable('a-approach-strength', 'Keep playing to the center of greens to protect this strength', userHandicap),
        minimumRounds: 3,
        priority: 4,
        dismissible: true
      });
    }
  }

  // Par‑5 GIR inefficiency
  if (roundsWithHoles.length >= 3) {
    let par5GirHit = 0;
    let par5GirAttempts = 0;
    roundsWithHoles.forEach(round => {
      round.holes?.forEach(hole => {
        if (hole.par === 5 && hole.greenHit !== undefined && hole.greenHit !== null) {
          par5GirAttempts += 1;
          if (isGreenHit(hole.greenHit)) par5GirHit += 1;
        }
      });
    });
    if (par5GirAttempts >= 6) {
      const par5GirPct = Math.round((par5GirHit / par5GirAttempts) * 100);
      if (par5GirPct < 30) {
        insights.push({
          id: 'a-par5-gir-inefficiency',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Par‑5 Approach Inefficiency',
          description: `Par‑5 GIR is ${par5GirPct}% (${par5GirHit}/${par5GirAttempts})`,
          actionable: tuneActionable('a-par5-gir-inefficiency', 'Lay up to a favorite yardage to improve third‑shot GIR', userHandicap),
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      }
    }
  }

  // Consistency improvement (positive reinforcement)
  if (recentRounds.length >= 3 && olderRounds.length >= 3) {
    const recentScores = recentRounds.map(r => r.score);
    const olderScores = olderRounds.map(r => r.score);
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
    const recentVar = recentScores.reduce((sum, s) => sum + Math.pow(s - recentAvg, 2), 0) / recentScores.length;
    const olderVar = olderScores.reduce((sum, s) => sum + Math.pow(s - olderAvg, 2), 0) / olderScores.length;
    const recentStd = Math.sqrt(recentVar);
    const olderStd = Math.sqrt(olderVar);
    if (olderStd > 0 && ((olderStd - recentStd) / olderStd) >= 0.1) {
      insights.push({
        id: 'c-consistency-improved',
        type: InsightType.TREND,
        confidence: InsightConfidence.MEDIUM,
        title: 'Consistency Improved',
        description: `Your score swings are down ${(100 * (olderStd - recentStd) / olderStd).toFixed(0)}% over recent rounds`,
        actionable: tuneActionable('c-consistency-improved', 'Maintain the same conservative decision‑making under pressure', userHandicap),
        minimumRounds: 3,
        priority: 4,
        dismissible: true
      });
    }
  }

  // === COURSE MANAGEMENT (Par‑5 Decision Errors / Smart Management) ===
  if (roundsWithHoles.length >= 3) {
    let par5AggressiveErrors = 0;
    let par5Attempts = 0;
    roundsWithHoles.forEach(round => {
      round.holes?.forEach(hole => {
        if (hole.par === 5 && hole.score) {
          par5Attempts += 1;
          if (hole.score >= hole.par + 2) par5AggressiveErrors += 1;
        }
      });
    });
    if (par5Attempts >= 6) {
      const errorRate = par5AggressiveErrors / par5Attempts;
      if (errorRate >= 0.4) {
        insights.push({
          id: 'cm-par5-decision-errors',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Par‑5 Decision Errors',
          description: `${Math.round(errorRate * 100)}% of par‑5s end in double+, costing ~${(par5AggressiveErrors * 0.5 / roundsWithHoles.length).toFixed(1)} strokes`,
          actionable: tuneActionable('cm-par5-decision-errors', 'Lay up to your best wedge yardage when trouble is in play', userHandicap),
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      }
    }

    // Smart management (positive)
    const bigNumberRate = roundsWithHoles.reduce((sum, round) => {
      const bigs = round.holes?.filter(h => h.par && h.score && h.score >= h.par + 2).length || 0;
      return sum + bigs;
    }, 0) / (roundsWithHoles.length * 18);
    if (bigNumberRate <= 0.08) {
      insights.push({
        id: 'cm-smart-management',
        type: InsightType.TREND,
        confidence: InsightConfidence.MEDIUM,
        title: 'Smart Management',
        description: `Big numbers stayed under ${Math.round(bigNumberRate * 100)}% of holes`,
        actionable: tuneActionable('cm-smart-management', 'Keep choosing conservative targets when the miss is penal', userHandicap),
        minimumRounds: 3,
        priority: 4,
        dismissible: true
      });
    }
  }

  // === COURSE MANAGEMENT (Penalties + Compounding Errors) ===
  if (roundsWithHoles.length >= 3) {
    let penaltyStrokes = 0;
    let penaltyRounds = 0;
    let compoundingErrors = 0;
    let totalRoundsWithHoles = 0;

    roundsWithHoles.forEach(round => {
      if (round.penalties !== undefined) {
        penaltyStrokes += round.penalties || 0;
        penaltyRounds += 1;
      }
      totalRoundsWithHoles += 1;

      const holes = round.holes || [];
      let inTrouble = false;
      holes.forEach(hole => {
        if (!hole.par || !hole.score) return;
        const isBigNumber = hole.score >= hole.par + 2;
        if (isBigNumber && inTrouble) compoundingErrors += 1;
        inTrouble = isBigNumber;
      });
    });

    if (penaltyRounds >= 3) {
      const penaltiesPerRound = penaltyStrokes / penaltyRounds;
      if (penaltiesPerRound >= 2) {
        insights.push({
          id: 'cm-aggressive-targeting-penalty',
          type: InsightType.WEEKLY_FOCUS,
          confidence: InsightConfidence.MEDIUM,
          title: 'Penalty Avoidance',
          description: `Averaging ${penaltiesPerRound.toFixed(1)} penalty strokes/round, costing ~${penaltiesPerRound.toFixed(1)} strokes`,
          actionable: tuneActionable('cm-aggressive-targeting-penalty', 'Favor safer targets when trouble is in play to keep doubles off the card', userHandicap),
          minimumRounds: 3,
          priority: 1,
          dismissible: false
        });
      }
    }

    if (totalRoundsWithHoles >= 3 && compoundingErrors >= 2) {
      insights.push({
        id: 'cm-compounding-errors',
        type: InsightType.SUPPORTING,
        confidence: InsightConfidence.MEDIUM,
        title: 'Compounding Errors',
        description: `${compoundingErrors} back‑to‑back big numbers across recent rounds`,
        actionable: tuneActionable('cm-compounding-errors', 'After a penalty, reset and play a conservative recovery shot', userHandicap),
        minimumRounds: 3,
        priority: 3,
        dismissible: true
      });
    }
  }

  // === SCORING OUTCOMES (Birdie Conversion / Opportunities) ===
  if (roundsWithHoles.length >= 3) {
    roundsWithHoles.forEach(round => {
      round.holes?.forEach(hole => {
        if (!hole.par || !hole.score) return;
        if (hole.score === hole.par - 1) birdies += 1;
        if (hole.score === hole.par) pars += 1;
        if (isGreenHit(hole.greenHit)) girChances += 1;
      });
    });

    const roundsCount = roundsWithHoles.length;
    const birdieRate = girChances > 0 ? (birdies / girChances) : 0;
    if (girChances >= 10) {
      if (birdieRate < 0.12) {
        insights.push({
          id: 'so-birdie-conversion-inefficiency',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Birdie Conversion',
          description: `Birdie rate is ${(birdieRate * 100).toFixed(0)}% on GIR looks`,
          actionable: tuneActionable('so-birdie-conversion-inefficiency', 'Focus on first‑putt proximity to convert more birdie chances', userHandicap),
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      }
    }

    if (pars / Math.max(1, roundsCount * 18) >= 0.55 && girChances >= 10 && birdieRate < 0.08) {
      insights.push({
        id: 'so-missed-scoring-opportunities',
        type: InsightType.SUPPORTING,
        confidence: InsightConfidence.MEDIUM,
        title: 'Scoring Opportunities',
        description: `Par rate is ${Math.round((pars / (roundsCount * 18)) * 100)}% with limited birdie conversion`,
        actionable: 'Aim for aggressive lines when you have a clear GIR look',
        minimumRounds: 3,
        priority: 4,
        dismissible: true
      });
    }
  }

  // === PAR TYPE SCORING GAPS ===
  if (roundsWithHoles.length >= 3) {
    let par3OverParTotal = 0;
    let par3Holes = 0;
    let par4OverParTotal = 0;
    let par4Holes = 0;

    roundsWithHoles.forEach(round => {
      round.holes?.forEach(hole => {
        if (!hole.par || !hole.score) return;
        if (hole.par === 3) {
          par3OverParTotal += hole.score - hole.par;
          par3Holes += 1;
        }
        if (hole.par === 4) {
          par4OverParTotal += hole.score - hole.par;
          par4Holes += 1;
        }
      });
    });

    if (par3Holes >= 6) {
      const par3OverParAvg = par3OverParTotal / par3Holes;
      if (par3OverParAvg >= 0.6) {
        insights.push({
          id: 'so-par3-gap',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Par-3 Scoring Gap',
          description: `Par-3s are ${par3OverParAvg.toFixed(1)} over par per hole, costing ~${(par3OverParAvg * 4).toFixed(1)} strokes per round`,
          actionable: 'Favor center-green targets and commit to a full club on par-3s',
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      }
    }

    if (par4Holes >= 9) {
      const par4OverParAvg = par4OverParTotal / par4Holes;
      if (par4OverParAvg >= 0.5) {
        insights.push({
          id: 'so-par4-gap',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Par-4 Scoring Gap',
          description: `Par-4s are ${par4OverParAvg.toFixed(1)} over par per hole, costing ~${(par4OverParAvg * 10).toFixed(1)} strokes per round`,
          actionable: 'Prioritize fairway position on par-4s to set up GIR chances',
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      }
    }
  }

  // === MILESTONES (Best FIR/GIR/Putts/Scrambling) ===
  if (latestRound && priorRounds.length >= 2) {
    const priorFir = priorRounds
      .filter(r => r.stats.fairwaysPossible)
      .map(r => (r.stats.fairways || 0) / (r.stats.fairwaysPossible || 1) * 100);
    const latestFir = latestRound.stats.fairwaysPossible
      ? (latestRound.stats.fairways || 0) / (latestRound.stats.fairwaysPossible || 1) * 100
      : null;
    if (latestFir !== null && priorFir.length > 0 && latestFir > Math.max(...priorFir)) {
      insights.push({
        id: 'pb-best-fir',
        type: InsightType.TREND,
        confidence: InsightConfidence.MEDIUM,
        title: 'Best FIR',
        description: `Fairways hit reached ${Math.round(latestFir)}%, a new personal best`,
        actionable: 'Stick to the same tee shot strategy that produced this round',
        minimumRounds: 3,
        priority: 1,
        dismissible: true
      });
    }

    const priorGir = priorRounds
      .filter(r => r.stats.greensPossible)
      .map(r => (r.stats.greens || 0) / (r.stats.greensPossible || 1) * 100);
    const latestGir = latestRound.stats.greensPossible
      ? (latestRound.stats.greens || 0) / (latestRound.stats.greensPossible || 1) * 100
      : null;
    if (latestGir !== null && priorGir.length > 0 && latestGir > Math.max(...priorGir)) {
      insights.push({
        id: 'pb-best-gir',
        type: InsightType.TREND,
        confidence: InsightConfidence.MEDIUM,
        title: 'Best GIR',
        description: `GIR reached ${Math.round(latestGir)}%, a new personal best`,
        actionable: 'Keep leaning on your strongest approach distances',
        minimumRounds: 3,
        priority: 1,
        dismissible: true
      });
    }

    if (latestRound.stats.putts && priorRounds.some(r => r.stats.putts)) {
      const priorPutts = priorRounds
        .filter(r => r.stats.putts)
        .map(r => r.stats.putts || 0);
      if (priorPutts.length > 0 && latestRound.stats.putts < Math.min(...priorPutts)) {
        insights.push({
          id: 'pb-best-putts',
          type: InsightType.TREND,
          confidence: InsightConfidence.MEDIUM,
          title: 'Best Putting Round',
          description: `${latestRound.stats.putts} putts, a new personal best`,
          actionable: 'Repeat the same green‑reading routine next round',
          minimumRounds: 3,
          priority: 1,
          dismissible: true
        });
      }
    }

    if (latestRound.stats.upDownAttempts && priorRounds.some(r => r.stats.upDownAttempts)) {
      const latestScramble = (latestRound.stats.upDownMade || 0) / (latestRound.stats.upDownAttempts || 1);
      const priorScramble = priorRounds
        .filter(r => r.stats.upDownAttempts)
        .map(r => (r.stats.upDownMade || 0) / (r.stats.upDownAttempts || 1));
      if (priorScramble.length > 0 && latestScramble > Math.max(...priorScramble)) {
        insights.push({
          id: 'pb-best-scrambling',
          type: InsightType.TREND,
          confidence: InsightConfidence.MEDIUM,
          title: 'Best Up & Down',
          description: `${Math.round(latestScramble * 100)}% up-and-down in a single round - personal best`,
          actionable: 'Keep targeting safe landing spots around the green',
          minimumRounds: 3,
          priority: 1,
          dismissible: true
        });
      }
    }

    // First round under par target (PB‑6)
    const coursePar = getRoundParTotal(latestRound) ?? 72;
    const hi = resolveHandicap(userHandicap ?? undefined);
    const rawTarget = Math.round(coursePar + hi * 0.9);
    const targetScore = Math.max(coursePar - 2, Math.min(coursePar + 36, rawTarget));
    const priorUnderTarget = priorRounds.some(r => r.score <= targetScore);
    if (!priorUnderTarget && latestRound.score <= targetScore) {
      insights.push({
        id: 'pb-first-under-target',
        type: InsightType.TREND,
        confidence: InsightConfidence.HIGH,
        title: 'First Round Under',
        description: `${latestRound.score} is your first round under ${targetScore}`,
        actionable: 'Keep the same routines that produced this breakthrough',
        minimumRounds: 3,
        priority: 1,
        dismissible: true
      });
    }
  }

  // === ROUND PACING (Front vs Back) ===
  if (roundsWithHoles.length >= 3) {
    let totalFront = 0;
    let totalBack = 0;
    let count = 0;

    roundsWithHoles.forEach(round => {
      const front = round.holes?.filter(h => h.number <= 9 && h.score) || [];
      const back = round.holes?.filter(h => h.number >= 10 && h.score) || [];
      if (front.length >= 7 && back.length >= 7) {
        totalFront += front.reduce((sum, h) => sum + (h.score || 0), 0);
        totalBack += back.reduce((sum, h) => sum + (h.score || 0), 0);
        count += 1;
      }
    });

    if (count >= 3) {
      const frontAvg = totalFront / count;
      const backAvg = totalBack / count;
      const diff = backAvg - frontAvg;

      if (diff >= 3) {
        insights.push({
          id: 'c-back-nine-fade',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Back-Nine Fade',
          description: `Back 9 is ${diff.toFixed(1)} strokes worse than the front on average`,
          actionable: 'Add a hydration/energy check around the turn to keep focus steady',
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      } else if (diff <= -3) {
        insights.push({
          id: 'c-slow-start',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Slow Start',
          description: `Front 9 is ${Math.abs(diff).toFixed(1)} strokes worse than the back on average`,
          actionable: 'Add a tighter warm-up and first-3-holes game plan',
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      }
    }
  }

  // === CLUB ACCURACY INSIGHTS (Advanced club tracking) ===
  const teeClubStats = new Map<string, { attempts: number; hits: number; missLeft: number; missRight: number; missShort: number; missLong: number }>();
  const approachClubStats = new Map<string, { attempts: number; hits: number }>();
  const approachDistanceStats = new Map<string, { attempts: number; hits: number }>();

  rounds.forEach(round => {
    if (!round.holes) return;

    round.holes.forEach(hole => {
      if (hole.par !== 3 && isRoundStatEnabled(round, 'fir') && hole.teeClub && hole.fairwayHit !== undefined && hole.fairwayHit !== null) {
        const stats = teeClubStats.get(hole.teeClub) || { attempts: 0, hits: 0, missLeft: 0, missRight: 0, missShort: 0, missLong: 0 };
        stats.attempts += 1;
        if (isHitValue(hole.fairwayHit)) {
          stats.hits += 1;
        } else if (hole.fairwayHit === 'left') {
          stats.missLeft += 1;
        } else if (hole.fairwayHit === 'right') {
          stats.missRight += 1;
        } else if (hole.fairwayHit === 'short') {
          stats.missShort += 1;
        } else if (hole.fairwayHit === 'long') {
          stats.missLong += 1;
        }
        teeClubStats.set(hole.teeClub, stats);
      }

      if (isRoundStatEnabled(round, 'gir') && hole.approachClub && hole.greenHit !== undefined && hole.greenHit !== null) {
        const stats = approachClubStats.get(hole.approachClub) || { attempts: 0, hits: 0 };
        stats.attempts += 1;
        if (isGreenHit(hole.greenHit)) stats.hits += 1;
        approachClubStats.set(hole.approachClub, stats);
      }

      if (isRoundStatEnabled(round, 'gir') && hole.approachDistance && hole.greenHit !== undefined && hole.greenHit !== null) {
        const stats = approachDistanceStats.get(hole.approachDistance) || { attempts: 0, hits: 0 };
        stats.attempts += 1;
        if (isGreenHit(hole.greenHit)) stats.hits += 1;
        approachDistanceStats.set(hole.approachDistance, stats);
      }
    });
  });

  const eligibleTeeClubs = [...teeClubStats.entries()].filter(([, stats]) => stats.attempts >= 5);
  if (eligibleTeeClubs.length > 0) {
    const [bestClub, bestStats] = eligibleTeeClubs.reduce((best, current) => {
      const bestRate = best[1].hits / best[1].attempts;
      const currentRate = current[1].hits / current[1].attempts;
      return currentRate > bestRate ? current : best;
    });
    const hitRate = Math.round((bestStats.hits / bestStats.attempts) * 100);
    insights.push({
      id: 'tee-club-accuracy',
      type: InsightType.SUPPORTING,
      confidence: bestStats.attempts >= 8 ? InsightConfidence.HIGH : InsightConfidence.MEDIUM,
      title: 'Most Accurate Tee Club',
      description: `${bestClub} hits ${hitRate}% of fairways (${bestStats.hits}/${bestStats.attempts})`,
      actionable: `Lean on ${bestClub} when accuracy matters most`,
      minimumRounds: INSIGHT_THRESHOLDS.LIGHT_TREND,
      priority: 4,
      dismissible: true
    });

    const driverStats = teeClubStats.get('Driver');
    const targetClub = driverStats ? 'Driver' : eligibleTeeClubs.sort((a, b) => b[1].attempts - a[1].attempts)[0][0];
    const targetStats = teeClubStats.get(targetClub);
    if (targetStats) {
      const misses = targetStats.attempts - targetStats.hits;
      if (misses >= 5) {
        const missCounts = [
          { dir: 'left', count: targetStats.missLeft },
          { dir: 'right', count: targetStats.missRight },
          { dir: 'short', count: targetStats.missShort },
          { dir: 'long', count: targetStats.missLong },
        ];
        const topMiss = missCounts.sort((a, b) => b.count - a.count)[0];
        if (topMiss.count / misses >= 0.6) {
          insights.push({
            id: 'tee-miss-pattern',
            type: InsightType.SUPPORTING,
            confidence: targetStats.attempts >= 8 ? InsightConfidence.MEDIUM : InsightConfidence.LOW,
            title: 'Tee Miss Pattern',
            description: `${targetClub} misses tend ${topMiss.dir} (${Math.round((topMiss.count / misses) * 100)}% of misses)`,
            actionable: `Play for the ${topMiss.dir} miss or adjust alignment on ${targetClub}`,
            minimumRounds: INSIGHT_THRESHOLDS.LIGHT_TREND,
            priority: 5,
            dismissible: true
          });
        }
      }
    }
  }

  const eligibleApproachClubs = [...approachClubStats.entries()].filter(([, stats]) => stats.attempts >= 5);
  if (eligibleApproachClubs.length > 0) {
    const [mostUsedClub, mostUsedStats] = eligibleApproachClubs.reduce((best, current) => (
      current[1].attempts > best[1].attempts ? current : best
    ));
    if (mostUsedStats.attempts >= 6) {
      const hitRate = Math.round((mostUsedStats.hits / mostUsedStats.attempts) * 100);
      insights.push({
        id: 'approach-club-most-used',
        type: InsightType.SUPPORTING,
        confidence: mostUsedStats.attempts >= 10 ? InsightConfidence.MEDIUM : InsightConfidence.LOW,
        title: 'Most Used Approach Club',
        description: `${mostUsedClub} is your most-used approach club (${mostUsedStats.attempts} shots, ${hitRate}% GIR).`,
        actionable: `Build practice reps around ${mostUsedClub} to turn volume into consistency.`,
        minimumRounds: INSIGHT_THRESHOLDS.LIGHT_TREND,
        priority: 4,
        dismissible: true
      });
    }

    const [bestClub, bestStats] = eligibleApproachClubs.reduce((best, current) => {
      const bestRate = best[1].hits / best[1].attempts;
      const currentRate = current[1].hits / current[1].attempts;
      return currentRate > bestRate ? current : best;
    });
    const hitRate = Math.round((bestStats.hits / bestStats.attempts) * 100);
    insights.push({
      id: 'approach-club-accuracy',
      type: InsightType.SUPPORTING,
      confidence: bestStats.attempts >= 8 ? InsightConfidence.HIGH : InsightConfidence.MEDIUM,
      title: 'Approach Strength',
      description: `${bestClub} is your most accurate approach club (${hitRate}% GIR)`,
      actionable: `Aim for center-green targets with ${bestClub} to play to your strength`,
      minimumRounds: INSIGHT_THRESHOLDS.LIGHT_TREND,
      priority: 4,
      dismissible: true
    });
  }

  const eligibleApproachDistances = [...approachDistanceStats.entries()].filter(([, stats]) => stats.attempts >= 6);
  if (eligibleApproachDistances.length > 0) {
    const [bestRange, bestStats] = eligibleApproachDistances.reduce((best, current) => {
      const bestRate = best[1].hits / best[1].attempts;
      const currentRate = current[1].hits / current[1].attempts;
      return currentRate > bestRate ? current : best;
    });
    const hitRate = Math.round((bestStats.hits / bestStats.attempts) * 100);
    insights.push({
      id: 'approach-distance-accuracy',
      type: InsightType.SUPPORTING,
      confidence: bestStats.attempts >= 10 ? InsightConfidence.HIGH : InsightConfidence.MEDIUM,
      title: 'Best Approach Distance',
      description: `${bestRange} yds is your most accurate range (${hitRate}% GIR)`,
      actionable: 'Manage to this yardage more often to play to your strengths',
      minimumRounds: INSIGHT_THRESHOLDS.LIGHT_TREND,
      priority: 5,
      dismissible: true
    });
  }

  // === FALLBACK INSIGHT (2+ rounds, no other insights) ===
  // If we have 2+ rounds but no insights yet, provide baseline
  if (totalRounds >= 2 && insights.length === 0) {
    const scoringValues = rounds.map(round => {
      const scoreToPar = getScoreToPar(round);
      return {
        round,
        scoreToPar,
        value: scoreToPar ?? round.score,
      };
    });
    const avgScore = scoringValues.reduce((sum, entry) => sum + entry.value, 0) / scoringValues.length;
    const bestEntry = scoringValues.reduce((best, current) => (
      current.value < best.value ? current : best
    ));
    const worstEntry = scoringValues.reduce((worst, current) => (
      current.value > worst.value ? current : worst
    ));
    const bestLabel = bestEntry.scoreToPar !== null
      ? `${formatScoreToPar(bestEntry.value)} (${bestEntry.round.score})`
      : `${bestEntry.round.score}`;
    const worstLabel = worstEntry.scoreToPar !== null
      ? `${formatScoreToPar(worstEntry.value)} (${worstEntry.round.score})`
      : `${worstEntry.round.score}`;
    
    insights.push({
      id: 'baseline-established',
      type: InsightType.TREND,
      confidence: InsightConfidence.MEDIUM,
      title: 'Baseline Established',
      description: `Averaging ${avgScore.toFixed(1)} over ${totalRounds} round${totalRounds !== 1 ? 's' : ''} (best: ${bestLabel}, worst: ${worstLabel})`,
      actionable: 'Keep logging full stats and more detail will show here.',
      minimumRounds: 2,
      priority: 3,
      dismissible: true
    });
  }

  // === POSITIVE REINFORCEMENT (at least one per screen) ===
  const hasPositive = insights.some(insight =>
    insight.id.startsWith('pb-') ||
    insight.id.startsWith('pr-') ||
    insight.id.includes('improving') ||
    insight.id === 'best-score-recent' ||
    insight.id === 'best-score-tied'
  );
  if (!hasPositive && totalRounds >= 2) {
    const scoringValues = rounds.map(round => {
      const scoreToPar = getScoreToPar(round);
      return {
        round,
        scoreToPar,
        value: scoreToPar ?? round.score,
      };
    });
    const avgScore = scoringValues.reduce((sum, entry) => sum + entry.value, 0) / scoringValues.length;
    const bestEntry = scoringValues.reduce((best, current) => (
      current.value < best.value ? current : best
    ));
    const bestLabel = bestEntry.scoreToPar !== null
      ? `${formatScoreToPar(bestEntry.value)} (${bestEntry.round.score})`
      : `${bestEntry.round.score}`;
    insights.push({
      id: 'positive-reinforcement',
      type: InsightType.TREND,
      confidence: InsightConfidence.MEDIUM,
      title: 'Positive Reinforcement',
      description: `Best score ${bestLabel} over ${totalRounds} rounds (avg ${avgScore.toFixed(1)})`,
      actionable: 'Repeat the routines that led to your lowest score',
      minimumRounds: 2,
      priority: 4,
      dismissible: true
    });
  }

  // === COACHING INSIGHTS (new module) ===
  const coachingInsights = generateCoachingInsights(rounds, userHandicap ?? null, clubDistances);
  if (coachingInsights.length > 0) {
    insights.push(...coachingInsights);
  }

  if (coachingInsights.length > 0) {
    const legacyOverlapIds = new Set([
      'tee-miss-pattern',
      'a-approach-distance-gap',
      'a-par3-gir-deficiency',
      'so-birdie-conversion-inefficiency',
      'so-par5-gap',
      'c-back-nine-fade',
      'c-slow-start',
      'cm-aggressive-targeting-penalty',
      'cm-compounding-errors',
      'so-high-bogey-rate',
      'so-double-plus-frequency',
    ]);
    for (let i = insights.length - 1; i >= 0; i -= 1) {
      if (legacyOverlapIds.has(insights[i].id)) {
        insights.splice(i, 1);
      }
    }
  }

  // === TEMPLATE INSIGHTS (Tiered, data-driven) ===
  if (totalRounds >= 3) {
    // Tier 1: Putts after missed greens
    const missedGreenPutts = allHoles
      .filter(({ hole }) => hole.greenHit !== undefined && hole.greenHit !== null && !isGreenHit(hole.greenHit) && typeof hole.putts === 'number')
      .map(({ hole }) => hole.putts as number);
    if (missedGreenPutts.length >= 10) {
      const avgMissPutts = missedGreenPutts.reduce((sum, val) => sum + val, 0) / missedGreenPutts.length;
      insights.push({
        id: 'missed-green-putts',
        type: InsightType.SUPPORTING,
        confidence: InsightConfidence.MEDIUM,
        title: 'Putting After Missed Greens',
        description: `You average ${avgMissPutts.toFixed(1)} putts when you miss the green. Tour average is 2.1.`,
        actionable: 'Focus on lag putting and speed control to save strokes after missed greens.',
        minimumRounds: 3,
        priority: 2,
        dismissible: true
      });
    }

    // Tier 1: Par type scoring gap
    const parTotals: Record<number, { sum: number; count: number }> = { 3: { sum: 0, count: 0 }, 4: { sum: 0, count: 0 }, 5: { sum: 0, count: 0 } };
    allHoles.forEach(({ hole }) => {
      if (!hole.par || !hole.score) return;
      if (![3, 4, 5].includes(hole.par)) return;
      parTotals[hole.par].sum += hole.score - hole.par;
      parTotals[hole.par].count += 1;
    });
    const parAverages = [3, 4, 5].map(par => ({
      par,
      avg: parTotals[par].count > 0 ? parTotals[par].sum / parTotals[par].count : null,
      count: parTotals[par].count,
    })).filter(entry => entry.avg !== null && entry.count >= 6) as Array<{ par: number; avg: number; count: number }>;
    if (parAverages.length >= 2) {
      const best = parAverages.reduce((min, cur) => (cur.avg < min.avg ? cur : min));
      const worst = parAverages.reduce((max, cur) => (cur.avg > max.avg ? cur : max));
      if (worst.avg - best.avg >= 0.3) {
        insights.push({
          id: 'par-type-gap',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: `Par ${worst.par}s Cost the Most`,
          description: `You average +${worst.avg.toFixed(1)} on par ${worst.par}s vs +${best.avg.toFixed(1)} on par ${best.par}s.`,
          actionable: `Target par ${worst.par}s in practice—small gains here save multiple strokes.`,
          minimumRounds: 3,
          priority: 3,
          dismissible: true
        });
      }
    }

    // Tier 1: Driver vs 3-wood accuracy on shorter holes
    const driverStats = { attempts: 0, hits: 0 };
    const threeWoodStats = { attempts: 0, hits: 0 };
    let yardageBasedAttempts = 0;
    allHoles.forEach(({ hole, round }) => {
      if (!hole.par || hole.par < 4) return;
      if (hole.fairwayHit === undefined || hole.fairwayHit === null) return;
      const yardage = getHoleYardage(round, hole.number);
      const isShort = typeof yardage === 'number' ? yardage <= 400 : true;
      if (!isShort) return;
      if (typeof yardage === 'number') yardageBasedAttempts += 1;
      const club = (hole.teeClub || '').toLowerCase();
      const isDriver = club.includes('driver');
      const isThreeWood = club.includes('3wood') || club.includes('3-wood') || club.includes('3 wood') || club === '3w';
      if (isDriver) {
        driverStats.attempts += 1;
        if (isHitValue(hole.fairwayHit)) driverStats.hits += 1;
      } else if (isThreeWood) {
        threeWoodStats.attempts += 1;
        if (isHitValue(hole.fairwayHit)) threeWoodStats.hits += 1;
      }
    });
    if (driverStats.attempts >= 5 && threeWoodStats.attempts >= 5) {
      const driverRate = (driverStats.hits / driverStats.attempts) * 100;
      const threeWoodRate = (threeWoodStats.hits / threeWoodStats.attempts) * 100;
      if (threeWoodRate - driverRate >= 10) {
        const yardageLabel = yardageBasedAttempts >= 5 ? 'under 400 yards' : 'shorter holes';
        insights.push({
          id: 'driver-vs-3wood-accuracy',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Tee Club Choice',
          description: `3-wood hits ${Math.round(threeWoodRate)}% of fairways vs Driver at ${Math.round(driverRate)}% on ${yardageLabel}.`,
          actionable: 'Consider 3-wood on shorter holes to keep the ball in play.',
          minimumRounds: 3,
          priority: 3,
          dismissible: true
        });
      }
    }

    // Tier 1: Fairway miss impact on bogeys
    const bogeyHoles = allHoles.filter(({ hole }) =>
      hole.par && hole.score && hole.par >= 4 && hole.fairwayHit !== undefined && hole.fairwayHit !== null && hole.score > hole.par
    );
    if (bogeyHoles.length >= 5) {
      const bogeyMisses = bogeyHoles.filter(({ hole }) => !isHitValue(hole.fairwayHit)).length;
      const missRate = bogeyMisses / bogeyHoles.length;
      if (missRate >= 0.6) {
        insights.push({
          id: 'bogey-fairway-miss',
          type: InsightType.SUPPORTING,
          confidence: InsightConfidence.MEDIUM,
          title: 'Fairway Misses Drive Bogeys',
          description: `${Math.round(missRate * 100)}% of your bogeys come after missing the fairway.`,
          actionable: 'Prioritize accuracy off the tee to cut big numbers quickly.',
          minimumRounds: 3,
          priority: 4,
          dismissible: true
        });
      }
    }

    // Tier 3: GIR trend
    if (recentRounds.length >= 3 && olderRounds.length >= 2) {
      const calcGirRate = (round: SavedRound): number | null => {
        if (round.holes && round.holes.length > 0) {
          const tracked = round.holes.filter(h => h.greenHit !== null && h.greenHit !== undefined);
          if (tracked.length === 0) return null;
          const hit = tracked.filter(h => isGreenHit(h.greenHit)).length;
          return (hit / tracked.length) * 100;
        }
        if (round.stats?.greensPossible && round.stats.greens !== undefined) {
          return (round.stats.greens / round.stats.greensPossible) * 100;
        }
        return null;
      };
      const recentRates = recentRounds.map(calcGirRate).filter((v): v is number => v !== null);
      const olderRates = olderRounds.map(calcGirRate).filter((v): v is number => v !== null);
      if (recentRates.length >= 3 && olderRates.length >= 2) {
        const recentAvg = recentRates.reduce((a, b) => a + b, 0) / recentRates.length;
        const olderAvg = olderRates.reduce((a, b) => a + b, 0) / olderRates.length;
        if (recentAvg - olderAvg >= 8) {
          insights.push({
            id: 'gir-improving',
            type: InsightType.TREND,
            confidence: InsightConfidence.MEDIUM,
            title: 'GIR Trending Up',
            description: `Your GIR% improved from ${Math.round(olderAvg)}% to ${Math.round(recentAvg)}% over recent rounds.`,
            actionable: 'Keep leaning on your iron swing; this is driving better scores.',
            minimumRounds: 5,
            priority: 1,
            dismissible: true
          });
        }
      }
    }

    const recentPutts = recentRounds
      .filter(r => isRoundStatEnabled(r, 'putts') && r.stats.putts)
      .map(r => r.stats.putts || 0);
    const olderPutts = olderRounds
      .filter(r => isRoundStatEnabled(r, 'putts') && r.stats.putts)
      .map(r => r.stats.putts || 0);
    if (recentPutts.length >= 3 && olderPutts.length >= 3) {
      const recentAvg = recentPutts.reduce((a, b) => a + b, 0) / recentPutts.length;
      const olderAvg = olderPutts.reduce((a, b) => a + b, 0) / olderPutts.length;
      if (recentAvg - olderAvg >= 1.5) {
        insights.push({
          id: 'putting-trending-up',
          type: InsightType.TREND,
          confidence: InsightConfidence.MEDIUM,
          title: 'Putting Trend',
          description: `Putts per round increased from ${olderAvg.toFixed(1)} to ${recentAvg.toFixed(1)} recently.`,
          actionable: 'Spend extra time on 20-40 ft lag putting to regain speed control.',
          minimumRounds: 5,
          priority: 2,
          dismissible: true
        });
      }
    }
  }

  // Tier 2: Course-specific insights (2+ rounds at same course)
  const roundsByCourse = orderedRounds.reduce<Record<string, SavedRound[]>>((acc, round) => {
    const key = (round.courseName || '').trim().toLowerCase();
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(round);
    return acc;
  }, {});
  const courseEntry = Object.values(roundsByCourse)
    .filter(group => group.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  if (courseEntry) {
    const courseName = courseEntry[0].courseName;
    const courseHoles = courseEntry.flatMap(round =>
      (round.holes || []).map(hole => ({ hole, round }))
    );
    const holeScores = new Map<number, { sum: number; count: number }>();
    courseHoles.forEach(({ hole }) => {
      if (!hole.score || !hole.par) return;
      const entry = holeScores.get(hole.number) || { sum: 0, count: 0 };
      entry.sum += hole.score - hole.par;
      entry.count += 1;
      holeScores.set(hole.number, entry);
    });
    const holeAverages = Array.from(holeScores.entries())
      .map(([number, data]) => ({ number, avg: data.sum / data.count }))
      .sort((a, b) => b.avg - a.avg);
    if (holeAverages.length >= 6) {
      const hardest = holeAverages.slice(0, 3).map(h => h.number).join(', ');
      const easiest = holeAverages.slice(-3).map(h => h.number).join(', ');
      insights.push({
        id: 'course-hardest-holes',
        type: InsightType.COURSE_AWARE,
        confidence: InsightConfidence.MEDIUM,
        title: `At ${courseName}, your toughest holes`,
        description: `Hardest holes: ${hardest}. Easiest: ${easiest}.`,
        actionable: 'Plan conservative targets on the hardest holes to protect your score.',
        minimumRounds: 2,
        priority: 2,
        dismissible: true
      });
    }

    const bestCourseRound = courseEntry.reduce((best, current) =>
      current.score < best.score ? current : best
    );
    const bestDate = new Date(bestCourseRound.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const courseFir = getAggregatedPercent(
      courseEntry.filter(r => r.stats.fairwaysPossible),
      round => round.stats.fairways,
      round => round.stats.fairwaysPossible
    );
    const courseGir = getAggregatedPercent(
      courseEntry.filter(r => r.stats.greensPossible),
      round => round.stats.greens,
      round => round.stats.greensPossible
    );
    const bestFir = bestCourseRound.stats.fairwaysPossible
      ? (bestCourseRound.stats.fairways || 0) / bestCourseRound.stats.fairwaysPossible * 100
      : null;
    const bestGir = bestCourseRound.stats.greensPossible
      ? (bestCourseRound.stats.greens || 0) / bestCourseRound.stats.greensPossible * 100
      : null;
    if (bestFir !== null && bestGir !== null && courseFir && courseGir) {
      const firDelta = Math.round(bestFir - courseFir.percent);
      const girDelta = Math.round(bestGir - courseGir.percent);
      if (firDelta >= 6 || girDelta >= 6) {
        insights.push({
          id: 'course-best-round',
          type: InsightType.COURSE_AWARE,
          confidence: InsightConfidence.MEDIUM,
          title: `Best round at ${courseName}`,
          description: `${bestCourseRound.score} on ${bestDate} with ${Math.round(bestFir)}% FIR and ${Math.round(bestGir)}% GIR (${Math.max(firDelta, girDelta)}% above your course avg).`,
          actionable: 'Repeat the same tee shot and approach strategy from that round.',
          minimumRounds: 2,
          priority: 3,
          dismissible: true
        });
      }
    }

    const courseMisses = courseHoles
      .filter(({ hole }) => hole.par && hole.par >= 4 && hole.fairwayHit !== undefined && hole.fairwayHit !== null)
      .map(({ hole }) => hole.fairwayHit);
    const missCounts = courseMisses.reduce(
      (acc, val) => {
        if (val === true) return acc;
        const miss = String(val);
        if (miss.includes('left')) acc.left += 1;
        else if (miss.includes('right')) acc.right += 1;
        else if (miss.includes('short')) acc.short += 1;
        else if (miss.includes('long')) acc.long += 1;
        return acc;
      },
      { left: 0, right: 0, short: 0, long: 0 }
    );
    const missTotal = missCounts.left + missCounts.right + missCounts.short + missCounts.long;
    if (missTotal >= 6) {
      const missEntries = Object.entries(missCounts).sort((a, b) => b[1] - a[1]);
      const [missDir, missCount] = missEntries[0];
      if (missCount / missTotal >= 0.6) {
        const aimDirection = missDir === 'left'
          ? 'right'
          : missDir === 'right'
            ? 'left'
            : missDir === 'short'
              ? 'long'
              : missDir === 'long'
                ? 'short'
                : 'center';
        insights.push({
          id: 'course-tee-miss',
          type: InsightType.COURSE_AWARE,
          confidence: InsightConfidence.MEDIUM,
          title: `At ${courseName}, your tee miss`,
          description: `You miss ${missDir} on ${Math.round((missCount / missTotal) * 100)}% of fairway misses.`,
          actionable: `Aim ${aimDirection}-center on this course to protect the big miss.`,
          minimumRounds: 2,
          priority: 4,
          dismissible: true
        });
      }
    }
  }

  const topicForInsight = (insight: Insight): string => {
    const id = insight.id.toLowerCase();
    if (id.startsWith('pb-') || id.startsWith('pr-') || id.includes('positive')) return 'progress';
    if (id.includes('putt')) return 'putting';
    if (id.includes('tee') || id.includes('driver') || id.includes('fairway')) return 'driving';
    if (id.includes('gir') || id.includes('approach') || id.includes('par3') || id.includes('par-3')) return 'approach';
    if (id.includes('scrambl') || id.includes('short-game') || id.includes('bunker')) return 'shortgame';
    if (id.includes('course-')) return 'course';
    if (
      id.includes('bogey') ||
      id.includes('double') ||
      id.includes('par5') ||
      id.includes('par-5') ||
      id.includes('front') ||
      id.includes('back') ||
      id.includes('consistency') ||
      id.includes('scoring')
    ) return 'scoring';
    return 'misc';
  };

  // Sort by priority (lower number = higher priority)
  insights.sort((a, b) => a.priority - b.priority);

  // Topic-level curation: avoid flooding with multiple variants of the same message.
  const topicCounts = new Map<string, number>();
  const curated: Insight[] = [];
  for (const insight of insights) {
    if (
      insight.id === 'so-par3-gap' &&
      curated.some(existing => existing.id === 'a-par3-gir-deficiency')
    ) {
      continue;
    }
    const topic = topicForInsight(insight);
    const limit = topic === 'progress' ? 3 : 2;
    const count = topicCounts.get(topic) ?? 0;
    if (count >= limit) continue;
    curated.push(insight);
    topicCounts.set(topic, count + 1);
  }

  return curated;
}
