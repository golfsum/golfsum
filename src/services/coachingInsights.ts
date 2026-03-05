import { Insight, InsightConfidence, InsightType, SavedRound, RoundHole, InsightCategory, HandicapAffinityGroup } from '../types';
import { resolveHandicapTier, type HandicapTier } from '../utils/handicap';
import { analyzeClubYardages, isFindingRelevantForTier } from './clubYardageIntelligence';
import { analyzeScoringDistribution } from './scoringDistribution';
import { analyzeMomentumTransitions } from './momentumMatrix';
import { analyzeWedgeZone } from './wedgeZoneIntelligence';
import { analyzePuttDistances } from './puttDistanceIntelligence';
import { analyzeConditionsImpact, analyzeTimeOfDay } from './conditionsIntelligence';
import { analyzeTeeStrategy } from './teeStrategyIntelligence';
import { analyzeBunkers } from './bunkerIntelligence';
import { analyzeStatsEfficiency } from './statsEfficiency';
import { analyzeHandicapTrajectory } from './handicapTrajectory';
import { analyzeStrokeAllocation } from './strokeAllocationIntelligence';
import { analyzeFatigue } from './fatigueIntelligence';

const PRIORITY_WEIGHTS: Record<string, number> = {
  PENALTY_PREVENTION: 1.0,
  PENALTY_TREND_ALERT: 0.85,
  SCORE_PROTECTION_OPPORTUNITY: 0.88,
  MILESTONE_PROGRESS: 0.56,
  OPENING_CLOSING_PATTERN: 0.67,
  BOUNCE_BACK_PATTERN: 0.66,
  TEE_CLUB_CONFIDENCE_SHIFT: 0.66,
  POST_PRACTICE_EFFECT: 0.69,
  PAR_TYPE_DISTRIBUTION: 0.67,
  EIGHTY_PERCENT_PRINCIPLE: 0.63,
  SITUATIONAL_PUTTING: 0.65,
  POST_EVENT_SCORING_CONTEXT: 0.64,
  COURSE_MASTERY_PATTERN: 0.6,
  WEATHER_IMPACT_PATTERN: 0.68,
  APPROACH_CONDITION_PATTERN: 0.71,
  PRE_ROUND_NUDGE: 0.57,
  POST_ROUND_NUDGE: 0.58,
  PROGRESSIVE_UNLOCK: 0.55,
  FAIRWAYS_PATTERN_RIGHT: 0.78,
  FAIRWAYS_PATTERN_LEFT: 0.78,
  OVERCORRECTION_PATTERN: 0.81,
  APPROACHES_FINISHING_SHORT: 0.87,
  APPROACHES_FINISHING_LONG: 0.74,
  SHOT_CHAIN_PATTERN: 0.72,
  MISS_VOLATILITY_PATTERN: 0.82,
  SCRAMBLING_OPPORTUNITY: 0.73,
  BUNKER_SAVE_OPPORTUNITY: 0.68,
  THREE_PUTT_OPPORTUNITY: 0.75,
  GIR_CONVERSION_OPPORTUNITY: 0.7,
  SCRAMBLE_PUTTING_OPPORTUNITY: 0.61,
  PAR_3_SCORING_OPPORTUNITY: 0.65,
  PAR_5_BIRDIE_OPPORTUNITY: 0.58,
  BACK_NINE_OPPORTUNITY: 0.58,
  FIRST_HOLE_OPPORTUNITY: 0.72,
  MOMENTUM_OPPORTUNITY: 0.62,
  APPROACH_DISTANCE_OPPORTUNITY: 0.62,
  WEDGE_ZONE_OPPORTUNITY: 0.78,
  MOMENTUM_TRANSITION_BIRDIE_KILLS: 0.85,
  MOMENTUM_TRANSITION_DOUBLE_COMPOUNDS: 0.8,
  MOMENTUM_TRANSITION_BOGEY_CHAINS: 0.82,
  MOMENTUM_TRANSITION_POSITIVE: 0.6,
  DRIVER_SCORING_VALUE: 0.82,
  STATS_EFFICIENCY: 0.76,
  HANDICAP_TRAJECTORY: 0.74,
  STROKE_ALLOCATION: 0.7,
  ROUND_FATIGUE_PATTERN: 0.72,
};

const MIN_SAMPLES = {
  par3Holes: 9,
  par5Holes: 9,
  scramblingAttempts: 10,
  bunkerShots: 5,
  girs: 12,
  firstHoles: 4,
  fullRounds: 4,
  bogeyTrainsHoles: 18,
  approachDistances: 4,
  penalties: 3,
  drivingShots: 14,
  approaches: 14,
  putts: 18,
  closingStretchRounds: 4,
  teeClubShiftShots: 10,
  postPracticePairs: 2,
  scoreContextTransitions: 6,
  penaltyFollowups: 4,
  repeatedCourseRounds: 3,
  weatherRounds: 5,
  weatherApproachHoles: 14,
};

function confidenceFromRounds(roundsUsed: number): InsightConfidence {
  if (roundsUsed >= 8) return InsightConfidence.HIGH;
  if (roundsUsed >= 5) return InsightConfidence.MEDIUM;
  return InsightConfidence.LOW;
}

function confidenceFromRoundsAndData(
  roundsUsed: number,
  dataCompleteness: number
): InsightConfidence {
  const baseConfidence = confidenceFromRounds(roundsUsed);
  if (dataCompleteness < 0.4) return InsightConfidence.LOW;
  if (dataCompleteness < 0.65 && baseConfidence === InsightConfidence.HIGH) {
    return InsightConfidence.MEDIUM;
  }
  return baseConfidence;
}

function isPatternRecentlyResolved(
  recentValue: number,
  historicalValue: number,
  direction: 'lower_is_better' | 'higher_is_better',
  threshold: number,
  recentRounds: number
): boolean {
  if (recentRounds < 3) return false;
  const delta = direction === 'lower_is_better'
    ? historicalValue - recentValue
    : recentValue - historicalValue;
  return delta >= threshold;
}

function getRecentRounds(roundsByDate: SavedRound[], n: number): SavedRound[] {
  return roundsByDate.slice(-n);
}

function toPriority(weightKey: keyof typeof PRIORITY_WEIGHTS): number {
  const weight = PRIORITY_WEIGHTS[weightKey];
  return Math.round((1 - weight) * 100);
}

function buildInsight(params: {
  id: string;
  title: string;
  description: string;
  actionable?: string;
  minimumRounds: number;
  roundsUsed: number;
  priorityWeight: keyof typeof PRIORITY_WEIGHTS;
  dataCompleteness?: number;
  category?: InsightCategory;
  handicapAffinity?: HandicapAffinityGroup;
}): Insight {
  const resolved = resolveInsightMeta(params.id, params.category, params.handicapAffinity);
  return {
    id: params.id,
    type: InsightType.SUPPORTING,
    confidence: confidenceFromRoundsAndData(params.roundsUsed, params.dataCompleteness ?? 1),
    title: params.title,
    description: params.description,
    actionable: params.actionable,
    minimumRounds: params.minimumRounds,
    priority: toPriority(params.priorityWeight),
    dismissible: true,
    category: resolved.category,
    handicapAffinity: resolved.handicapAffinity,
  };
}

function resolveInsightMeta(
  id: string,
  category?: InsightCategory,
  handicapAffinity?: HandicapAffinityGroup
): { category: InsightCategory; handicapAffinity: HandicapAffinityGroup } {
  if (category && handicapAffinity) return { category, handicapAffinity };
  const value = id.toLowerCase();

  if (value.includes('overcorrection-pattern') || value.includes('miss-direction-volatility')) return { category: InsightCategory.MISS_PATTERN, handicapAffinity: HandicapAffinityGroup.COMPETITIVE };
  if (value.includes('penalty-trend-over-time') || value.includes('penalty-prevention') || value.includes('penalty-free-round-tracking')) return { category: InsightCategory.PENALTY, handicapAffinity: HandicapAffinityGroup.ALL };
  if (value.includes('clean-hole-streak') || value.includes('bounce-back') || value.includes('front') || value.includes('back-nine') || value.includes('closing-stretch') || value.includes('post-double') || value.includes('post-round-review') || value.includes('pre-round-nudge')) return { category: InsightCategory.MENTAL, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (value.includes('three-putt-free-stretch') || value.includes('three-putt') || value.includes('putting-under-pressure') || value.includes('putting-after-penalty')) return { category: InsightCategory.PUTTING, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (value.includes('scrambling') || value.includes('bunker-save')) return { category: InsightCategory.SHORT_GAME, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (value.includes('par3-scoring-opportunity')) return { category: InsightCategory.SCORING, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (value.includes('par5-birdie-opportunity')) return { category: InsightCategory.SCORING, handicapAffinity: HandicapAffinityGroup.COMPETITIVE };
  if (value.includes('score-protection') || value.includes('tee-club-strategy') || value.includes('course-learning')) return { category: InsightCategory.COURSE_MGMT, handicapAffinity: HandicapAffinityGroup.ALL };
  if (value.includes('missed-right') || value.includes('missed-left') || value.includes('approaches-missed') || value.includes('tee-club-confidence')) return { category: InsightCategory.MISS_PATTERN, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (value.includes('gir-to-score-chain') || value.includes('fir-to-gir-chain') || value.includes('approach-distance') || value.includes('tee-club-breakdown') || value.includes('wind-impact-on-gir') || value.includes('wind-sensitive-distance')) return { category: InsightCategory.ADVANCED_STATS, handicapAffinity: HandicapAffinityGroup.COMPETITIVE };
  if (value.includes('weather') || value.includes('wind')) return { category: InsightCategory.WEATHER, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (value.includes('milestone') || value.includes('progressive-unlock') || value.includes('round-count-milestone')) return { category: InsightCategory.MILESTONE, handicapAffinity: HandicapAffinityGroup.ALL };
  if (value.includes('par') || value.includes('score')) return { category: InsightCategory.SCORING, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  return { category: InsightCategory.MENTAL, handicapAffinity: HandicapAffinityGroup.ALL };
}

function getAllHoles(rounds: SavedRound[]): RoundHole[] {
  return rounds.flatMap(round => round.holes ?? []).filter(h => typeof h.par === 'number');
}

function getCompletedRounds(rounds: SavedRound[]): SavedRound[] {
  return rounds.filter(r => (r.holes?.length ?? 0) >= 9);
}

function calcScoreToPar(round: SavedRound): number | null {
  if (!round.holes || round.holes.length === 0) return null;
  const parTotal = round.holes.reduce((sum, h) => sum + h.par, 0);
  return round.score - parTotal;
}

// Use shared helpers for consistent hit/miss detection
import { isFairwayHit, isGreenHit, isGreenMiss } from '../utils/statChecks';

function missDirection(
  value: RoundHole['fairwayHit'] | RoundHole['greenHit']
): 'left' | 'right' | 'short' | 'long' | null {
  if (!value || value === true) return null;
  if (value === 'double-left' || value === 'left') return 'left';
  if (value === 'double-right' || value === 'right') return 'right';
  if (value === 'short') return 'short';
  if (value === 'long') return 'long';
  return null;
}

function roundTimestamp(round: SavedRound): number {
  const ts = new Date(round.date as unknown as string).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function dominantLateralMiss(
  holes: RoundHole[],
  key: 'fairwayHit' | 'greenHit'
): { direction: 'left' | 'right'; pct: number; total: number } | null {
  const misses = holes
    .map(h => missDirection(h[key] as RoundHole['fairwayHit'] | RoundHole['greenHit']))
    .filter((d): d is 'left' | 'right' => d === 'left' || d === 'right');
  if (misses.length < 3) return null;
  const left = misses.filter(d => d === 'left').length;
  const right = misses.length - left;
  const direction = right >= left ? 'right' : 'left';
  const count = Math.max(left, right);
  const pct = count / misses.length;
  if (pct < 0.6) return null;
  return { direction, pct, total: misses.length };
}

function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function maxConsecutive(holes: RoundHole[], predicate: (h: RoundHole) => boolean): number {
  let max = 0;
  let run = 0;
  holes.forEach(h => {
    if (predicate(h)) {
      run += 1;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  });
  return max;
}

function sortHolesByNumber(holes: RoundHole[]): RoundHole[] {
  return [...holes].sort((a, b) => (a.number || 0) - (b.number || 0));
}

function parseWindSpeedMph(raw?: string): number | null {
  if (!raw) return null;
  const m = String(raw).match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function isWindyRound(round: SavedRound): boolean | null {
  const weather = round.weather || round.weatherFront9 || round.weatherBack9;
  if (!weather) return null;
  const windDir = String(weather.windDirection || '').toLowerCase();
  const cond = String(weather.conditions || '').toLowerCase();
  const windSpeed = parseWindSpeedMph(weather.wind);
  if (windDir && windDir !== 'calm') return true;
  if (cond.includes('wind')) return true;
  if (windSpeed != null) return windSpeed >= 10;
  if (windDir === 'calm') return false;
  return null;
}

export function generateCoachingInsights(
  rounds: SavedRound[],
  handicap?: number | null,
  clubDistances: Record<string, number> = {}
): Insight[] {
  const tier = resolveHandicapTier(handicap);
  const completedRounds = getCompletedRounds(rounds);
  const roundsUsed = completedRounds.length;
  const holes = getAllHoles(completedRounds);
  const insights: Insight[] = [];

  if (roundsUsed < 3 || holes.length === 0) {
    return insights;
  }

  const roundsByDate = completedRounds
    .slice()
    .sort((a, b) => roundTimestamp(a) - roundTimestamp(b));
  const tierBand: 'LOW' | 'MID' | 'HIGH' =
    tier === 'SCRATCH' ? 'LOW' : tier === 'BEGINNER' ? 'HIGH' : tier;
  const girCompleteness = roundsUsed > 0
    ? completedRounds.filter(r => r.stats.greens != null).length / roundsUsed
    : 0;
  const firCompleteness = roundsUsed > 0
    ? completedRounds.filter(r => r.stats.fairways != null).length / roundsUsed
    : 0;
  const puttCompleteness = roundsUsed > 0
    ? completedRounds.filter(r => typeof r.stats.putts === 'number' && (r.stats.putts ?? 0) > 0).length / roundsUsed
    : 0;
  const scrambleCompleteness = roundsUsed > 0
    ? completedRounds.filter(r => r.stats.upDownAttempts != null && (r.stats.upDownAttempts ?? 0) > 0).length / roundsUsed
    : 0;

  // Vol.2 (16A/16B): round-over-round miss-direction flip-flops (overcorrection)
  const evaluateFlipFlops = (key: 'fairwayHit' | 'greenHit', label: 'tee shots' | 'approaches') => {
    const dominantByRound = roundsByDate
      .map(round => ({
        round,
        dom: dominantLateralMiss(round.holes ?? [], key),
      }))
      .filter((item): item is { round: SavedRound; dom: { direction: 'left' | 'right'; pct: number; total: number } } => Boolean(item.dom));

    if (dominantByRound.length < 3) return;

    const recent = dominantByRound.slice(-5);
    let flips = 0;
    for (let i = 1; i < recent.length; i += 1) {
      if (recent[i - 1].dom.direction !== recent[i].dom.direction) flips += 1;
    }

    if (flips >= 2) {
      const last = recent[recent.length - 1].dom.direction;
      const prev = recent[recent.length - 2].dom.direction;
      insights.push(
        buildInsight({
          id: `${key}-overcorrection-pattern`,
          title: `${label === 'tee shots' ? 'Tee Shot' : 'Approach'} Overcorrection Pattern`,
          description: `Your ${label} miss direction is flipping round-to-round (${prev} to ${last}). That usually means you are chasing the last miss instead of letting one pattern stabilize.`,
          actionable: 'Hold setup and alignment constant for your next 3 rounds; avoid between-round swing fixes.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'OVERCORRECTION_PATTERN',
          dataCompleteness: key === 'fairwayHit' ? firCompleteness : girCompleteness,
        })
      );
    }
  };

  evaluateFlipFlops('fairwayHit', 'tee shots');
  evaluateFlipFlops('greenHit', 'approaches');

  // Vol.2 (16D): miss-direction volatility score (stable miss vs unstable miss)
  if (roundsByDate.length >= 10) {
    const computeVolatility = (key: 'fairwayHit' | 'greenHit') => {
      const biases = roundsByDate
        .map(round => {
          const dirs = (round.holes ?? [])
            .map(h => missDirection(h[key] as RoundHole['fairwayHit'] | RoundHole['greenHit']))
            .filter((d): d is 'left' | 'right' => d === 'left' || d === 'right');
          if (dirs.length < 3) return null;
          const right = dirs.filter(d => d === 'right').length;
          const left = dirs.length - right;
          return (right - left) / dirs.length;
        })
        .filter((v): v is number => v !== null);
      return biases.length >= 6 ? stdDev(biases) : null;
    };

    const fwVol = computeVolatility('fairwayHit');
    const grVol = computeVolatility('greenHit');
    const highVol = Math.max(fwVol ?? 0, grVol ?? 0);
    const lowVol = Math.max(fwVol ?? 1, grVol ?? 1);

    if (highVol > 0.5) {
      insights.push(
        buildInsight({
          id: 'miss-direction-volatility-high',
          title: 'Miss Pattern Volatility Is High',
          description: `Your left/right miss direction changes a lot across rounds (volatility ${highVol.toFixed(2)}). A stable miss is easier to manage than a shifting miss.`,
          actionable: 'Use the same pre-round setup routine (alignment, ball position, grip) every round.',
          minimumRounds: 10,
          roundsUsed,
          priorityWeight: 'MISS_VOLATILITY_PATTERN',
          dataCompleteness: Math.max(firCompleteness, girCompleteness),
        })
      );
    } else if (lowVol < 0.2) {
      insights.push(
        buildInsight({
          id: 'miss-direction-volatility-low',
          title: 'Your Miss Pattern Is Consistent',
          description: 'Your miss direction is stable round-to-round. That is a good thing because it is predictable and easier to plan around.',
          actionable: 'Aim to account for your common miss instead of trying to eliminate it mid-round.',
          minimumRounds: 10,
          roundsUsed,
          priorityWeight: 'MISS_VOLATILITY_PATTERN',
          dataCompleteness: Math.max(firCompleteness, girCompleteness),
        })
      );
    }
  }

  // New pack (1D): penalty trend alert (recent 5 vs prior 5 rounds)
  if (roundsByDate.length >= 10) {
    const penaltiesPerRound = roundsByDate.map(r => (typeof r.penalties === 'number' ? r.penalties : 0));
    const recent5 = penaltiesPerRound.slice(-5);
    const prior5 = penaltiesPerRound.slice(-10, -5);
    const recentAvg = recent5.reduce((sum, v) => sum + v, 0) / recent5.length;
    const priorAvg = prior5.reduce((sum, v) => sum + v, 0) / prior5.length;
    if (recentAvg - priorAvg >= 0.6 && recentAvg >= 1) {
      insights.push(
        buildInsight({
          id: 'penalty-trend-over-time',
          title: 'Penalty Trend Is Rising',
          description: `Recent penalties are up (${recentAvg.toFixed(1)} vs ${priorAvg.toFixed(1)} per round). This usually points to target-risk decisions rather than pure swing execution.`,
          actionable: 'On holes with one-sided trouble, choose the club/line that removes the penalty side.',
          minimumRounds: 10,
          roundsUsed,
          priorityWeight: 'PENALTY_TREND_ALERT',
        })
      );
    }
  }

  // Vol.2 (18A/18B/18C/18E): milestones and streak tracking
  if (roundsByDate.length >= 3) {
    const allScoredHoles = holes.filter(h => typeof h.score === 'number' && typeof h.par === 'number');
    if (allScoredHoles.length >= 18) {
      const cleanStreak = maxConsecutive(allScoredHoles, h => h.score <= h.par);
      if (cleanStreak >= 6) {
        insights.push(
          buildInsight({
            id: 'clean-hole-streak',
            title: 'Clean-Hole Streak Building',
            description: `You have a clean-hole streak of ${cleanStreak}. Stack these runs and scoring drops quickly.`,
            actionable: 'Protect momentum during streaks with conservative targets when trouble is in play.',
            minimumRounds: 3,
            roundsUsed,
            priorityWeight: 'MILESTONE_PROGRESS',
          })
        );
      }

      const noThreePuttStreak = maxConsecutive(
        allScoredHoles.filter(h => typeof h.putts === 'number'),
        h => (h.putts ?? 0) <= 2
      );
      if (noThreePuttStreak >= 9) {
        insights.push(
          buildInsight({
            id: 'three-putt-free-stretch',
            title: 'Three-Putt-Free Stretch',
            description: `You are stringing together cleaner greens (${noThreePuttStreak} holes without a 3-putt).`,
            actionable: 'Keep prioritizing first-putt speed over line from long range.',
            minimumRounds: 3,
            roundsUsed,
            priorityWeight: 'MILESTONE_PROGRESS',
          })
        );
      }
    }

    const penaltyFreeRounds = roundsByDate.filter(r => (typeof r.penalties === 'number' ? r.penalties : 0) === 0).length;
    if (penaltyFreeRounds >= 3) {
      insights.push(
        buildInsight({
          id: 'penalty-free-round-tracking',
          title: 'Penalty-Free Rounds Are Showing Up',
          description: `${penaltyFreeRounds} of your ${roundsByDate.length} rounds were penalty-free. Keep turning risky misses into playable misses.`,
          actionable: 'On danger holes, choose your miss side before you hit.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'MILESTONE_PROGRESS',
        })
      );
    }
  }

  const milestoneRoundCounts = [5, 10, 25, 50, 100] as const;
  if (milestoneRoundCounts.includes(roundsUsed as (typeof milestoneRoundCounts)[number])) {
    const milestoneCopy: Record<number, string> = {
      5: 'You unlocked your first stable baseline.',
      10: 'Trends are now reliable enough for first-vs-last comparisons.',
      25: 'Your profile now reflects true strengths and weak spots.',
      50: 'You now have deep pattern history for strategy decisions.',
      100: 'You now have a full long-term performance trajectory.',
    };
    insights.push(
      buildInsight({
        id: `round-count-milestone-${roundsUsed}`,
        title: `Milestone: ${roundsUsed} Rounds Logged`,
        description: milestoneCopy[roundsUsed] ?? 'Milestone reached.',
        actionable: 'Use this checkpoint to reset one focus area for the next 5 rounds.',
        minimumRounds: roundsUsed,
        roundsUsed,
        priorityWeight: 'MILESTONE_PROGRESS',
      })
    );
  }

  const par3Holes = holes.filter(h => h.par === 3 && typeof h.score === 'number');
  if (par3Holes.length >= MIN_SAMPLES.par3Holes) {
    const avg = par3Holes.reduce((sum, h) => sum + h.score, 0) / par3Holes.length;
    const expected = tierBand === 'LOW' ? 3.2 : tierBand === 'MID' ? 3.45 : 3.8;
    const threshold = tierBand === 'LOW' ? 0.3 : tierBand === 'MID' ? 0.4 : 0.5;
    if (avg - expected >= threshold) {
      const title =
        tierBand === 'LOW'
          ? 'Par 3s: Quick Wins Available'
          : tierBand === 'MID'
          ? 'Par 3s: Room to Gain Strokes'
          : 'Par 3s: Easier Than They Feel';
      const description =
        tierBand === 'LOW'
          ? 'Your par 3 scoring has room to match your ball-striking on other holes. A small shift to center-green targets can close that gap.'
          : tierBand === 'MID'
          ? 'Par 3s are where mid-handicappers can gain strokes fastest. A simple center-green strategy changes everything.'
          : 'Par 3s are opportunity holes. With center-green targets, pars come quickly.';
      insights.push(
        buildInsight({
          id: 'par3-scoring-opportunity',
          title,
          description,
          actionable:
            tierBand === 'LOW'
              ? 'Center green when trouble is severe. Attack when the miss is safe.'
              : tierBand === 'MID'
              ? 'Take enough club to reach the back.'
              : 'Just get it on the green.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'PAR_3_SCORING_OPPORTUNITY',
        })
      );
    }
  }

  const par5Holes = holes.filter(h => h.par === 5 && typeof h.score === 'number');
  if (par5Holes.length >= MIN_SAMPLES.par5Holes) {
    const birdies = par5Holes.filter(h => h.score <= 4).length;
    const birdieRate = birdies / par5Holes.length;
    const expected = tierBand === 'LOW' ? 0.15 : tierBand === 'MID' ? 0.1 : 0.02;
    if (birdieRate < expected) {
      const title =
        tierBand === 'LOW'
          ? 'Par 5s: Birdie Opportunities Ready to Convert'
          : tierBand === 'MID'
          ? 'Par 5s: Your Scoring Holes'
          : 'Par 5s: Built for Your Game';
      const description =
        tierBand === 'LOW'
          ? 'Your third-shot wedge and birdie-range putting is what turns these into scoring holes.'
          : tierBand === 'MID'
          ? 'A simple three-shot plan turns these into your easiest pars and birdie chances.'
          : 'Three solid shots and a two-putt make par 5s work for you.';
      insights.push(
        buildInsight({
          id: 'par5-birdie-opportunity',
          title,
          description,
          actionable:
            tierBand === 'LOW'
              ? 'Control the wedge, control the hole.'
              : tierBand === 'MID'
              ? 'Lay up to your favorite yardage.'
              : 'Three good shots is a great score.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'PAR_5_BIRDIE_OPPORTUNITY',
        })
      );
    }
  }

  const scrambleAttempts = holes.filter(h => isGreenMiss(h.greenHit) && h.upDown !== null);
  if (scrambleAttempts.length >= MIN_SAMPLES.scramblingAttempts) {
    const made = scrambleAttempts.filter(h => h.upDown === true).length;
    const rate = made / scrambleAttempts.length;
    const expected = tierBand === 'LOW' ? 0.5 : tierBand === 'MID' ? 0.35 : 0.2;
    if (rate < expected) {
      const title =
        tierBand === 'LOW'
          ? 'Scrambling: Strokes Ready to Save'
          : tierBand === 'MID'
          ? 'Scrambling: Your Shortcut to Better Scores'
          : 'Short Game: Fastest Path to Improvement';
      const description =
        tierBand === 'LOW'
          ? 'Converting more up & downs is the fastest way to shave strokes, often with a simple decision tweak.'
          : tierBand === 'MID'
          ? 'Improving up & downs turns bogeys back into pars without changing your swing.'
          : 'Simple shot selection around the green is where the fastest gains are.';
      insights.push(
        buildInsight({
          id: 'scrambling-opportunity',
          title,
          description,
          actionable:
            tierBand === 'LOW'
              ? 'Pick a landing spot, not a finishing spot.'
              : tierBand === 'MID'
              ? 'When in doubt from the fringe, putt. Further out, chip it low and let it run.'
              : 'On the green is always good.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'SCRAMBLING_OPPORTUNITY',
          dataCompleteness: scrambleCompleteness,
        })
      );
    }
  }

  // Bunker insight now routed through bunkerIntelligence service.

  const girHoles = holes.filter(h => isGreenHit(h.greenHit) && typeof h.putts === 'number');
  if (girHoles.length >= MIN_SAMPLES.girs) {
    const avgGirPutts = girHoles.reduce((sum, h) => sum + (h.putts ?? 2), 0) / girHoles.length;
    const expected = tierBand === 'LOW' ? 1.8 : tierBand === 'MID' ? 1.95 : 2.1;
    if (avgGirPutts > expected) {
      const title =
        tierBand === 'LOW'
          ? 'GIRs to Birdies: Making More Putts'
          : tierBand === 'MID'
          ? 'Greens in Regulation: Scoring Potential'
          : 'Hitting Greens: Two-Putt Pars Waiting';
      const description =
        tierBand === 'LOW'
          ? 'Small approach targeting tweaks and first-putt speed is where more birdies come from.'
          : tierBand === 'MID'
          ? 'Approach strategy sets up makeable putts; leave yourself flat looks.'
          : 'Focus on speed control so GIRs turn into easy pars.';
      insights.push(
        buildInsight({
          id: 'gir-conversion-opportunity',
          title,
          description,
          actionable:
            tierBand === 'LOW'
              ? 'Below the hole. Always.'
              : tierBand === 'MID'
              ? 'The putt starts with the approach.'
              : 'Lag it close, tap it in.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'GIR_CONVERSION_OPPORTUNITY',
          dataCompleteness: girCompleteness,
        })
      );
    }
  }

  if (roundsUsed >= MIN_SAMPLES.firstHoles) {
    const firstHoles = completedRounds
      .map(r => r.holes?.[0])
      .filter(h => h && typeof h.score === 'number' && typeof h.par === 'number') as RoundHole[];
    if (firstHoles.length >= MIN_SAMPLES.firstHoles) {
      const avgFirst = firstHoles.reduce((sum, h) => sum + h.score, 0) / firstHoles.length;
      const par = firstHoles[0].par;
      const sameParHoles = holes.filter(h => h.par === par && typeof h.score === 'number');
      const avgSamePar = sameParHoles.reduce((sum, h) => sum + h.score, 0) / sameParHoles.length;
      const threshold = tierBand === 'LOW' ? 0.3 : tierBand === 'MID' ? 0.4 : 0.5;
      if (avgFirst - avgSamePar >= threshold) {
        insights.push(
          buildInsight({
            id: 'first-hole-opportunity',
            title: 'First Hole: Setting the Tone for Better Rounds',
            description:
              'A strong first hole creates momentum. A small routine tweak and conservative target often saves early strokes.',
            actionable: 'First hole is about rhythm, not birdies.',
            minimumRounds: 5,
            roundsUsed,
            priorityWeight: 'FIRST_HOLE_OPPORTUNITY',
          })
        );
      }
    }
  }

  const fullRounds = completedRounds.filter(r => (r.holes?.length ?? 0) >= 18);
  if (fullRounds.length >= MIN_SAMPLES.fullRounds) {
    const diffs = fullRounds.map(r => {
      const ordered = sortHolesByNumber(r.holes ?? []);
      const front = ordered.filter(h => h.number >= 1 && h.number <= 9);
      const back = ordered.filter(h => h.number >= 10 && h.number <= 18);
      const frontScore = front.reduce((sum, h) => sum + h.score, 0);
      const backScore = back.reduce((sum, h) => sum + h.score, 0);
      return backScore - frontScore;
    });
    const avgDiff = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
    const threshold = tierBand === 'LOW' ? 2 : tierBand === 'MID' ? 3 : 4;
    if (avgDiff >= threshold) {
      insights.push(
        buildInsight({
          id: 'back-nine-opportunity',
          title:
            tierBand === 'LOW'
              ? 'Back Nine: Closing Strong'
              : tierBand === 'MID'
              ? 'Back Nine: Maintaining Momentum'
              : 'Back Nine: Finishing the Round',
          description:
            'Simplifying targets late in the round often brings back-nine scores in line with your front nine.',
          actionable:
            tierBand === 'LOW'
              ? 'Simplify after hole 12.'
              : tierBand === 'MID'
              ? 'Eat at the turn.'
              : 'Club up when tired.',
          minimumRounds: 5,
          roundsUsed,
          priorityWeight: 'BACK_NINE_OPPORTUNITY',
        })
      );
    }
  }

  // Vol.2 (19B): Closing stretch (16-18) performance
  if (fullRounds.length >= MIN_SAMPLES.closingStretchRounds) {
    const closing = fullRounds
      .map(r => {
        const h = sortHolesByNumber(r.holes ?? []);
        if (h.length < 18) return null;
        const final3 = h.slice(15, 18);
        const front15 = h.slice(0, 15);
        const final3Score = final3.reduce((sum, hole) => sum + hole.score, 0);
        const final3Par = final3.reduce((sum, hole) => sum + hole.par, 0);
        const front15Score = front15.reduce((sum, hole) => sum + hole.score, 0);
        const front15Par = front15.reduce((sum, hole) => sum + hole.par, 0);
        return {
          final3ToPar: final3Score - final3Par,
          front15ToPar: front15Score - front15Par,
        };
      })
      .filter(Boolean) as Array<{ final3ToPar: number; front15ToPar: number }>;

    if (closing.length >= MIN_SAMPLES.closingStretchRounds) {
      const avgFinal3 = closing.reduce((sum, r) => sum + r.final3ToPar, 0) / closing.length;
      const avgFront15Per3 = (closing.reduce((sum, r) => sum + r.front15ToPar, 0) / closing.length) / 5;
      if (avgFinal3 - avgFront15Per3 >= 0.8) {
        insights.push(
          buildInsight({
            id: 'closing-stretch-opportunity',
            title: 'Closing Stretch Is Costing Strokes',
            description: 'Holes 16-18 are trending higher than the rest of your round pace.',
            actionable: 'Use your safest tee club and center-green targets on closing holes.',
            minimumRounds: 5,
            roundsUsed,
            priorityWeight: 'OPENING_CLOSING_PATTERN',
          })
        );
      }
    }
  }

  const bigNumbers = holes.filter(h => h.score >= h.par + 2);
  if (holes.length >= MIN_SAMPLES.bogeyTrainsHoles) {
    const rate = bigNumbers.length / holes.length;
    const expected =
      tier === 'SCRATCH' ? 0.03 :
      tier === 'LOW' ? 0.05 :
      tier === 'MID' ? 0.15 :
      tier === 'HIGH' ? 0.25 :
      0.35;
    const recentScoreRounds = getRecentRounds(roundsByDate, 5);
    const recentScoreHoles = getAllHoles(recentScoreRounds).filter(h => typeof h.score === 'number' && typeof h.par === 'number');
    const recentBigRate = recentScoreHoles.length > 0
      ? recentScoreHoles.filter(h => h.score >= h.par + 2).length / recentScoreHoles.length
      : rate;
    if (
      rate > expected &&
      !isPatternRecentlyResolved(recentBigRate, rate, 'lower_is_better', 0.06, recentScoreRounds.length)
    ) {
      insights.push(
        buildInsight({
          id: 'score-protection-opportunity',
          title:
            tierBand === 'LOW'
              ? 'Score Protection: Turning Doubles into Bogeys'
              : tierBand === 'MID'
              ? 'Course Management: Keeping Big Numbers Away'
              : 'Scoring Opportunity: The Bogey Recovery',
          description:
            'Turning doubles into bogeys is the fastest path to better scores. One smart recovery is often all it takes.',
          actionable:
            tierBand === 'LOW'
              ? 'Bogey is acceptable. Double is not.'
              : tierBand === 'MID'
              ? 'One smart recovery. That is it.'
              : 'Get back to the fairway first.',
          minimumRounds: 2,
          roundsUsed,
          priorityWeight: 'SCORE_PROTECTION_OPPORTUNITY',
        })
      );
    }
  }

  // Vol.2 (20A): round-over-round bounce-back behavior
  if (roundsByDate.length >= 8) {
    const scores = roundsByDate.map(r => r.score).filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
    if (scores.length >= 8) {
      const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      const sd = stdDev(scores);
      if (sd > 0) {
        let badRoundCount = 0;
        let bounceBackCount = 0;
        for (let i = 0; i < roundsByDate.length - 1; i += 1) {
          const current = roundsByDate[i].score;
          const next = roundsByDate[i + 1].score;
          if (current >= mean + sd) {
            badRoundCount += 1;
            if (next <= mean) bounceBackCount += 1;
          }
        }
        if (badRoundCount >= 2) {
          const rate = bounceBackCount / badRoundCount;
          if (rate >= 0.6) {
            insights.push(
              buildInsight({
                id: 'bounce-back-strength',
                title: 'Strong Bounce-Back Pattern',
                description: `You rebound well after tough rounds (${Math.round(rate * 100)}% bounce-back rate).`,
                actionable: 'Use the same recovery routine after a poor round and trust your baseline.',
                minimumRounds: 8,
                roundsUsed,
                priorityWeight: 'BOUNCE_BACK_PATTERN',
              })
            );
          } else if (rate <= 0.3) {
            insights.push(
              buildInsight({
                id: 'bounce-back-opportunity',
                title: 'Post-Bad-Round Reset Opportunity',
                description: 'Tough rounds tend to carry into the next one. A reset plan can prevent second-day drift.',
                actionable: 'After a poor round, set one process goal (not score) for the next round.',
                minimumRounds: 8,
                roundsUsed,
                priorityWeight: 'BOUNCE_BACK_PATTERN',
              })
            );
          }
        }
      }
    }
  }

  if (holes.length >= MIN_SAMPLES.bogeyTrainsHoles) {
    let streak = 0;
    let bogeyTrains = 0;
    holes.forEach(h => {
      if (h.score > h.par) {
        streak += 1;
      } else {
        if (streak >= 3) bogeyTrains += 1;
        streak = 0;
      }
    });
    if (bogeyTrains >= (tierBand === 'LOW' ? 1 : tierBand === 'MID' ? 2 : 3)) {
      insights.push(
        buildInsight({
          id: 'momentum-opportunity',
          title: 'Momentum: Breaking the Streak Faster',
          description:
            'A simple reset routine between holes can break bogey streaks and save multiple strokes per round.',
          actionable: 'After a bogey, your only goal is par.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'MOMENTUM_OPPORTUNITY',
        })
      );
    }
  }

  // Vol.2 (20B): tee-club confidence shift (recent usage and performance drift)
  if (roundsByDate.length >= 6) {
    const clubStatsByWindow = (windowRounds: SavedRound[]) => {
      const stats = windowRounds
        .flatMap(r => r.holes ?? [])
        .filter(h => h.par >= 4 && h.teeClub && h.fairwayHit !== null && h.fairwayHit !== undefined)
        .reduce<Record<string, { shots: number; fwHits: number }>>((acc, h) => {
          const club = String(h.teeClub).trim();
          if (!club) return acc;
          if (!acc[club]) acc[club] = { shots: 0, fwHits: 0 };
          acc[club].shots += 1;
          if (isFairwayHit(h.fairwayHit)) acc[club].fwHits += 1;
          return acc;
        }, {});
      const primary = Object.entries(stats)
        .filter(([, s]) => s.shots >= 4)
        .sort((a, b) => b[1].shots - a[1].shots)[0];
      if (!primary) return null;
      return {
        club: primary[0],
        shots: primary[1].shots,
        fwPct: (primary[1].fwHits / primary[1].shots) * 100,
      };
    };

    const recent = roundsByDate.slice(-3);
    const prior = roundsByDate.slice(-6, -3);
    const recentPrimary = clubStatsByWindow(recent);
    const priorPrimary = clubStatsByWindow(prior);
    if (recentPrimary && priorPrimary) {
      const sameClub = recentPrimary.club === priorPrimary.club;
      const fwDelta = recentPrimary.fwPct - priorPrimary.fwPct;
      const usageDrop = priorPrimary.shots - recentPrimary.shots;

      if (sameClub && fwDelta <= -12 && recentPrimary.shots >= MIN_SAMPLES.teeClubShiftShots) {
        insights.push(
          buildInsight({
            id: 'tee-club-confidence-drop',
            title: `${recentPrimary.club} Confidence Shift`,
            description: `${recentPrimary.club} fairway rate dropped from ${Math.round(priorPrimary.fwPct)}% to ${Math.round(recentPrimary.fwPct)}% in recent rounds.`,
            actionable: `Rebuild trust with a simple target plan and one setup checkpoint before each ${recentPrimary.club} tee shot.`,
            minimumRounds: 6,
            roundsUsed,
            priorityWeight: 'TEE_CLUB_CONFIDENCE_SHIFT',
            dataCompleteness: firCompleteness,
          })
        );
      } else if (!sameClub && usageDrop >= 4) {
        insights.push(
          buildInsight({
            id: 'tee-club-strategy-shift',
            title: 'Tee Club Strategy Shift Detected',
            description: `You shifted away from ${priorPrimary.club} recently. That often signals confidence drift, not just strategy.`,
            actionable: 'On one suitable hole next round, reintroduce your stronger club with a conservative line.',
            minimumRounds: 6,
            roundsUsed,
            priorityWeight: 'TEE_CLUB_CONFIDENCE_SHIFT',
            dataCompleteness: firCompleteness,
          })
        );
      }
    }
  }

  // Vol.2 (20C): post-practice round effect
  if (roundsByDate.length >= 6) {
    const scoreMean = roundsByDate.reduce((sum, r) => sum + r.score, 0) / roundsByDate.length;
    const postPracticeDiffs: number[] = [];
    for (let i = 1; i < roundsByDate.length; i += 1) {
      const prev = roundsByDate[i - 1];
      const curr = roundsByDate[i];
      const prevIsPractice =
        prev.endRoundReason === 'practice' ||
        /practice/i.test(String(prev.eventTag || '')) ||
        /practice/i.test(String(prev.notes || ''));
      if (!prevIsPractice) continue;
      postPracticeDiffs.push(curr.score - scoreMean);
    }
    if (postPracticeDiffs.length >= MIN_SAMPLES.postPracticePairs) {
      const avgDelta = postPracticeDiffs.reduce((sum, d) => sum + d, 0) / postPracticeDiffs.length;
      if (avgDelta <= -1.5) {
        insights.push(
          buildInsight({
            id: 'post-practice-positive-effect',
            title: 'Practice Is Translating to Scores',
            description: 'Rounds after practice sessions are trending better than your baseline.',
            actionable: 'Keep your pre-round warm-up structure consistent; it is working.',
            minimumRounds: 6,
            roundsUsed,
            priorityWeight: 'POST_PRACTICE_EFFECT',
          })
        );
      } else if (avgDelta >= 1.5) {
        insights.push(
          buildInsight({
            id: 'post-practice-overload-effect',
            title: 'Post-Practice Score Drift',
            description: 'Rounds immediately after practice are trending worse than your baseline, likely from overload.',
            actionable: 'Before rounds, use one swing cue only; avoid technical changes on course days.',
            minimumRounds: 6,
            roundsUsed,
            priorityWeight: 'POST_PRACTICE_EFFECT',
          })
        );
      }
    }
  }

  // Vol.2 (22A): scoring distribution by par type
  if (holes.length >= 54) {
    const byPar = [3, 4, 5]
      .map(par => {
        const hs = holes.filter(h => h.par === par && typeof h.score === 'number');
        if (hs.length < 9) return null;
        const avgToPar = hs.reduce((sum, h) => sum + (h.score - h.par), 0) / hs.length;
        return { par, avgToPar, count: hs.length };
      })
      .filter(Boolean) as Array<{ par: 3 | 4 | 5; avgToPar: number; count: number }>;
    if (byPar.length >= 2) {
      const worst = byPar.reduce((max, cur) => (cur.avgToPar > max.avgToPar ? cur : max));
      const best = byPar.reduce((min, cur) => (cur.avgToPar < min.avgToPar ? cur : min));
      if (worst.avgToPar - best.avgToPar >= 0.35) {
        insights.push(
          buildInsight({
            id: 'score-distribution-by-par-type',
            title: `Par ${worst.par} Is Your Main Leak`,
            description: `Your scoring spread is uneven by par type: Par ${worst.par} is highest relative to par.`,
            actionable: `Set one tactical focus for Par ${worst.par} next round to reduce that gap.`,
            minimumRounds: 3,
            roundsUsed,
            priorityWeight: 'PAR_TYPE_DISTRIBUTION',
          })
        );
      }
    }
  }

  // Vol.2 (22B): 80% holes principle
  if (holes.length >= 36) {
    const bogeyOrBetter = holes.filter(h => h.score <= h.par + 1).length;
    const doublePlus = holes.filter(h => h.score >= h.par + 2).length;
    const stableRate = bogeyOrBetter / holes.length;
    const blowupRate = doublePlus / holes.length;

    if (stableRate >= 0.8 && blowupRate >= 0.1) {
      insights.push(
        buildInsight({
          id: 'eighty-percent-holes-principle',
          title: '80% of Holes Are Already Good',
          description: `You are scoring bogey-or-better on ${Math.round(stableRate * 100)}% of holes. Big numbers are the main separator now.`,
          actionable: 'Adopt a “no doubles” recovery rule: after trouble, play for bogey max.',
          minimumRounds: 2,
          roundsUsed,
          priorityWeight: 'EIGHTY_PERCENT_PRINCIPLE',
        })
      );
    }
  }

  const penalties = holes.filter(h => {
    const penaltyValue = (h as RoundHole & { penalties?: number }).penalties;
    return typeof penaltyValue === 'number' && penaltyValue > 0;
  });
  if (penalties.length >= MIN_SAMPLES.penalties) {
    const historicalPenaltiesPerRound = penalties.length / Math.max(1, roundsUsed);
    const recentPenaltyRounds = getRecentRounds(roundsByDate, 5);
    const recentPenalties = getAllHoles(recentPenaltyRounds).filter(h => {
      const penaltyValue = (h as RoundHole & { penalties?: number }).penalties;
      return typeof penaltyValue === 'number' && penaltyValue > 0;
    });
    const recentPenaltiesPerRound = recentPenalties.length / Math.max(1, recentPenaltyRounds.length);
    if (
      !isPatternRecentlyResolved(
        recentPenaltiesPerRound,
        historicalPenaltiesPerRound,
        'lower_is_better',
        0.5,
        recentPenaltyRounds.length
      )
    ) {
      insights.push(
        buildInsight({
          id: 'penalty-prevention',
          title: 'Penalty Prevention: Smarter Targets Save Strokes',
          description:
            'Penalties are almost always avoidable with smarter target selection and club choice.',
          actionable: 'If trouble is on your miss side, aim away from it.',
          minimumRounds: 1,
          roundsUsed,
          priorityWeight: 'PENALTY_PREVENTION',
        })
      );
    }
  }

  const fairwayShots = holes.filter(h => h.par >= 4 && h.fairwayHit !== null && h.fairwayHit !== undefined);

  // Vol.2 (17A): FIR -> GIR chain connection
  const chainShots = holes.filter(
    h =>
      h.par >= 4 &&
      h.fairwayHit !== null &&
      h.fairwayHit !== undefined &&
      h.greenHit !== null &&
      h.greenHit !== undefined
  );
  if (chainShots.length >= 30) {
    const fwHitShots = chainShots.filter(h => isFairwayHit(h.fairwayHit));
    const fwMissShots = chainShots.filter(h => !isFairwayHit(h.fairwayHit));
    if (fwHitShots.length >= 10 && fwMissShots.length >= 10) {
      const girWhenHit = fwHitShots.filter(h => isGreenHit(h.greenHit)).length / fwHitShots.length;
      const girWhenMiss = fwMissShots.filter(h => isGreenHit(h.greenHit)).length / fwMissShots.length;
      const delta = girWhenHit - girWhenMiss;
      if (delta >= 0.15) {
        insights.push(
          buildInsight({
            id: 'fir-to-gir-chain',
            title: 'Tee Shot Quality Drives GIR',
            description: `When you hit fairways, your GIR rate is ${Math.round(girWhenHit * 100)}% vs ${Math.round(girWhenMiss * 100)}% after misses.`,
            actionable: 'On tight holes, prioritize fairway position over max distance.',
            minimumRounds: 3,
            roundsUsed,
            priorityWeight: 'SHOT_CHAIN_PATTERN',
            dataCompleteness: Math.min(firCompleteness, girCompleteness),
          })
        );
      }
    }
  }

  // Vol.2 (17B): GIR -> score connection
  const scoreConnectionHoles = holes.filter(h => typeof h.score === 'number' && h.greenHit !== null && h.greenHit !== undefined);
  if (scoreConnectionHoles.length >= 30) {
    const girH = scoreConnectionHoles.filter(h => isGreenHit(h.greenHit));
    const missH = scoreConnectionHoles.filter(h => !isGreenHit(h.greenHit));
    if (girH.length >= 10 && missH.length >= 10) {
      const avgGirScore = girH.reduce((sum, h) => sum + h.score, 0) / girH.length;
      const avgMissScore = missH.reduce((sum, h) => sum + h.score, 0) / missH.length;
      const delta = avgMissScore - avgGirScore;
      if (delta >= 0.5) {
        insights.push(
          buildInsight({
            id: 'gir-to-score-chain',
            title: 'Greens Hit Are Your Score Lever',
            description: `Holes with GIR average ${avgGirScore.toFixed(1)} strokes vs ${avgMissScore.toFixed(1)} when you miss.`,
            actionable: 'Choose center-green targets on approach shots to raise GIR without adding risk.',
            minimumRounds: 3,
            roundsUsed,
            priorityWeight: 'SHOT_CHAIN_PATTERN',
            dataCompleteness: girCompleteness,
          })
        );
      }
    }
  }

  if (fairwayShots.length >= MIN_SAMPLES.drivingShots) {
    const misses = fairwayShots.filter(h => !isFairwayHit(h.fairwayHit));
    const rightMisses = misses.filter(h => missDirection(h.fairwayHit) === 'right').length;
    const leftMisses = misses.filter(h => missDirection(h.fairwayHit) === 'left').length;
    if (misses.length > 0) {
      const rightRate = rightMisses / misses.length;
      const leftRate = leftMisses / misses.length;
      const recentFwHoles = getRecentRounds(roundsByDate, 5)
        .flatMap(r => r.holes ?? [])
        .filter(h => h.par >= 4 && h.fairwayHit !== null && h.fairwayHit !== undefined);
      const recentMisses = recentFwHoles.filter(h => !isFairwayHit(h.fairwayHit));
      const recentRightRate = recentMisses.length > 0
        ? recentMisses.filter(h => missDirection(h.fairwayHit) === 'right').length / recentMisses.length
        : rightRate;
      const recentLeftRate = recentMisses.length > 0
        ? recentMisses.filter(h => missDirection(h.fairwayHit) === 'left').length / recentMisses.length
        : leftRate;

      if (
        rightRate >= 0.6 &&
        !isPatternRecentlyResolved(recentRightRate, rightRate, 'lower_is_better', 0.12, recentFwHoles.length)
      ) {
        insights.push(
          buildInsight({
            id: 'fairways-missed-right-refined',
            title: 'Fairways Missed Right: Face Control Opportunity',
            description:
              'A consistent right miss usually means the clubface is open at impact. Focus on face awareness, not aiming left.',
            actionable: 'Check setup first: neutral grip pressure and a square face at address.',
            minimumRounds: 3,
            roundsUsed,
            priorityWeight: 'FAIRWAYS_PATTERN_RIGHT',
            dataCompleteness: firCompleteness,
          })
        );
      }
      if (
        leftRate >= 0.6 &&
        !isPatternRecentlyResolved(recentLeftRate, leftRate, 'lower_is_better', 0.12, recentFwHoles.length)
      ) {
        insights.push(
          buildInsight({
            id: 'fairways-missed-left-refined',
            title: 'Fairways Missed Left: Face-to-Path Awareness',
            description:
              'A consistent left miss means the face is closing relative to your path. Focus on keeping the face stable.',
            actionable: 'Check alignment first. Closed shoulders at address often start left misses.',
            minimumRounds: 3,
            roundsUsed,
            priorityWeight: 'FAIRWAYS_PATTERN_LEFT',
            dataCompleteness: firCompleteness,
          })
        );
      }
    }
  }

  const approachShots = holes.filter(h => h.greenHit !== null && h.greenHit !== undefined);
  if (approachShots.length >= MIN_SAMPLES.approaches) {
    const shortMisses = approachShots.filter(h => missDirection(h.greenHit) === 'short').length;
    const longMisses = approachShots.filter(h => missDirection(h.greenHit) === 'long').length;
    const missCount = approachShots.filter(h => !isGreenHit(h.greenHit)).length;
    const historicalShortRate = missCount > 0 ? shortMisses / missCount : 0;
    const historicalLongRate = missCount > 0 ? longMisses / missCount : 0;
    const recentApproachHoles = getRecentRounds(roundsByDate, 5)
      .flatMap(r => r.holes ?? [])
      .filter(h => h.greenHit !== null && h.greenHit !== undefined);
    const recentMissCount = recentApproachHoles.filter(h => !isGreenHit(h.greenHit)).length;
    const recentShortMisses = recentApproachHoles.filter(h => missDirection(h.greenHit) === 'short').length;
    const recentLongMisses = recentApproachHoles.filter(h => missDirection(h.greenHit) === 'long').length;
    const recentShortRate = recentMissCount > 0 ? recentShortMisses / recentMissCount : historicalShortRate;
    const recentLongRate = recentMissCount > 0 ? recentLongMisses / recentMissCount : historicalLongRate;
    const recentApproachSample = recentApproachHoles.length;

    if (
      missCount > 0 &&
      historicalShortRate >= 0.55 &&
      !isPatternRecentlyResolved(recentShortRate, historicalShortRate, 'lower_is_better', 0.12, recentApproachSample)
    ) {
      insights.push(
        buildInsight({
          id: 'approaches-missed-short-refined',
          title: 'Approaches Short: Club-Up Opportunity',
          description:
            'Short approaches often come from choosing clubs based on best strikes. Take one more club and make your normal swing.',
          actionable: 'Club up and commit to your normal tempo.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'APPROACHES_FINISHING_SHORT',
          dataCompleteness: girCompleteness,
        })
      );
    }
    if (
      missCount > 0 &&
      historicalLongRate >= 0.55 &&
      !isPatternRecentlyResolved(recentLongRate, historicalLongRate, 'lower_is_better', 0.12, recentApproachSample)
    ) {
      insights.push(
        buildInsight({
          id: 'approaches-missed-long-refined',
          title: 'Approaches Long: Better Target Control',
          description:
            'Long misses often come from adrenaline or over-clubbing. Favor center or front-center targets and use your normal swing.',
          actionable: 'Center green is your safety target when long is your pattern.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'APPROACHES_FINISHING_LONG',
          dataCompleteness: girCompleteness,
        })
      );
    }
  }

  const allPutts = holes.filter(h => typeof h.putts === 'number');
  if (allPutts.length >= MIN_SAMPLES.putts) {
    const threePutts = allPutts.filter(h => (h.putts ?? 0) >= 3).length;
    const rate = threePutts / allPutts.length;
    const threePuttThreshold = tierBand === 'LOW' ? 0.05 : tierBand === 'MID' ? 0.08 : 0.12;
    const recentPuttHoles = getRecentRounds(roundsByDate, 5)
      .flatMap(r => r.holes ?? [])
      .filter(h => typeof h.putts === 'number');
    const recentThreePuttRate = recentPuttHoles.length > 0
      ? recentPuttHoles.filter(h => (h.putts ?? 0) >= 3).length / recentPuttHoles.length
      : rate;
    if (
      rate >= threePuttThreshold &&
      !isPatternRecentlyResolved(recentThreePuttRate, rate, 'lower_is_better', 0.04, recentPuttHoles.length)
    ) {
      insights.push(
        buildInsight({
          id: 'three-putt-opportunity-refined',
          title: 'Three-Putts: Speed Is the Lever',
          description:
            'Three-putts are almost always about first-putt speed. Finishing inside 3 feet changes everything.',
          actionable: 'On long putts, speed over line.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'THREE_PUTT_OPPORTUNITY',
          dataCompleteness: puttCompleteness,
        })
      );
    }
  }

  const scramblePutts = holes.filter(
    h => isGreenMiss(h.greenHit) && h.upDown !== null && typeof h.putts === 'number'
  );
  const girPutts = holes.filter(
    h => isGreenHit(h.greenHit) && typeof h.putts === 'number'
  );
  if (scramblePutts.length >= MIN_SAMPLES.scramblingAttempts && girPutts.length >= MIN_SAMPLES.girs) {
    const avgScramblePutts =
      scramblePutts.reduce((sum, h) => sum + (h.putts ?? 2), 0) / scramblePutts.length;
    const avgGirPutts = girPutts.reduce((sum, h) => sum + (h.putts ?? 2), 0) / girPutts.length;
    if (avgScramblePutts - avgGirPutts >= 0.3) {
      insights.push(
        buildInsight({
          id: 'scramble-putting-opportunity',
          title: 'Chip Positioning: Easier Putts Waiting',
          description:
            'Chipping to leave uphill putts means more up-and-downs. Read the putt before you chip.',
          actionable: 'Read the putt before you chip.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'SCRAMBLE_PUTTING_OPPORTUNITY',
          dataCompleteness: Math.min(scrambleCompleteness, puttCompleteness, girCompleteness),
        })
      );
    }
  }

  const approachDistanceBuckets = [
    '<75',
    '75-100',
    '100-125',
    '125-150',
    '150-175',
    '175-200',
    '200-225',
    '225-250',
    '250+',
  ] as const;

  const distanceStats = approachDistanceBuckets
    .map(range => {
      const shots = holes.filter(h => h.approachDistance === range);
      const count = shots.length;
      if (count < MIN_SAMPLES.approachDistances) return null;
      const gir = shots.filter(h => isGreenHit(h.greenHit)).length;
      const missCounts = shots.reduce<Record<'left' | 'right' | 'short' | 'long', number>>((acc, shot) => {
        const dir = missDirection(shot.greenHit);
        if (dir === 'left' || dir === 'right' || dir === 'short' || dir === 'long') {
          acc[dir] += 1;
        }
        return acc;
      }, { left: 0, right: 0, short: 0, long: 0 });
      const missTotal = Object.values(missCounts).reduce((sum, n) => sum + n, 0);
      const dominantMiss = missTotal
        ? (Object.entries(missCounts).sort((a, b) => b[1] - a[1])[0] as ['left' | 'right' | 'short' | 'long', number])
        : null;
      return {
        range,
        count,
        girRate: gir / count,
        dominantMiss: dominantMiss ? { dir: dominantMiss[0], pct: (dominantMiss[1] / missTotal) * 100 } : null,
      };
    })
    .filter(Boolean) as Array<{
      range: typeof approachDistanceBuckets[number];
      count: number;
      girRate: number;
      dominantMiss: { dir: 'left' | 'right' | 'short' | 'long'; pct: number } | null;
    }>;

  if (distanceStats.length >= 3) {
    const weakest = distanceStats.reduce((min, curr) => (curr.girRate < min.girRate ? curr : min));
    const strongest = distanceStats.reduce((max, curr) => (curr.girRate > max.girRate ? curr : max));
    const dropoff = strongest.girRate - weakest.girRate;
    const missContext =
      weakest.dominantMiss && weakest.dominantMiss.pct >= 55
        ? ` Miss is mostly ${weakest.dominantMiss.dir} there (${Math.round(weakest.dominantMiss.pct)}%).`
        : '';
    insights.push(
      buildInsight({
        id: 'approach-distance-dropoff',
        title: 'Approach Distance: Scoring Zone Dropoff',
        description:
          `From ${strongest.range}, GIR is ${Math.round(strongest.girRate * 100)}%. From ${weakest.range}, it drops to ${Math.round(weakest.girRate * 100)}%.${missContext}`,
        actionable:
          dropoff >= 0.15
            ? 'When possible, play to your stronger distance window.'
            : 'Track a few more rounds to confirm the distance trend.',
        minimumRounds: 3,
        roundsUsed,
        priorityWeight: 'APPROACH_DISTANCE_OPPORTUNITY',
        dataCompleteness: girCompleteness,
      })
    );
  }

  const teeShotsByClub = holes
    .filter(h => h.par >= 4 && h.teeClub && h.fairwayHit !== null && h.fairwayHit !== undefined)
    .reduce<Record<string, { count: number; fwHit: number; missLeft: number; missRight: number }>>((acc, hole) => {
      const club = String(hole.teeClub).trim();
      if (!club) return acc;
      if (!acc[club]) acc[club] = { count: 0, fwHit: 0, missLeft: 0, missRight: 0 };
      acc[club].count += 1;
      if (isFairwayHit(hole.fairwayHit)) {
        acc[club].fwHit += 1;
      } else {
        const dir = missDirection(hole.fairwayHit);
        if (dir === 'left') acc[club].missLeft += 1;
        if (dir === 'right') acc[club].missRight += 1;
      }
      return acc;
    }, {});

  const teeClubStats = Object.entries(teeShotsByClub)
    .map(([club, stat]) => {
      const missTotal = stat.count - stat.fwHit;
      const dominantMiss = missTotal > 0
        ? (stat.missRight >= stat.missLeft ? 'right' : 'left')
        : null;
      return {
        club,
        count: stat.count,
        fwPct: stat.count > 0 ? (stat.fwHit / stat.count) * 100 : 0,
        dominantMiss,
      };
    })
    .filter(stat => stat.count >= 5)
    .sort((a, b) => b.count - a.count);

  if (teeClubStats.length >= 2) {
    const [a, b] = teeClubStats.slice(0, 2);
    const delta = Math.abs(a.fwPct - b.fwPct);
    insights.push(
      buildInsight({
        id: 'tee-club-breakdown',
        title: 'Tee Club Breakdown',
        description: `${a.club}: ${Math.round(a.fwPct)}% FW${a.dominantMiss ? `, miss mostly ${a.dominantMiss}` : ''}. ${b.club}: ${Math.round(b.fwPct)}% FW${b.dominantMiss ? `, miss mostly ${b.dominantMiss}` : ''}.`,
        actionable:
          delta >= 10
            ? 'Use this as planning context by hole length and trouble.'
            : 'Fairway rates are similar; choose by shape and landing zone.',
        minimumRounds: 3,
        roundsUsed,
        priorityWeight: 'FAIRWAYS_PATTERN_RIGHT',
        dataCompleteness: firCompleteness,
      })
    );
  }

  // Vol.2 (21A/21B): situational putting (pressure and post-penalty)
  if (allPutts.length >= MIN_SAMPLES.putts) {
    const transitions = fullRounds
      .flatMap(r => {
        const hs = r.holes ?? [];
        return hs.slice(1).map((hole, idx) => {
          const prev = hs[idx];
          return { prev, hole };
        });
      })
      .filter(pair => typeof pair.hole.putts === 'number' && typeof pair.prev.score === 'number' && typeof pair.prev.par === 'number');

    const afterBirdie = transitions.filter(t => t.prev.score <= t.prev.par - 1).map(t => t.hole);
    const afterBogey = transitions.filter(t => t.prev.score >= t.prev.par + 1).map(t => t.hole);

    const puttingContextThreshold =
      tier === 'SCRATCH' ? 0.06 :
      tier === 'LOW' ? 0.08 :
      tier === 'MID' ? 0.10 :
      tier === 'HIGH' ? 0.14 :
      0.18;
    if (
      afterBirdie.length >= Math.max(MIN_SAMPLES.scoreContextTransitions, 12) &&
      afterBogey.length >= Math.max(MIN_SAMPLES.scoreContextTransitions, 12)
    ) {
      const afterBirdie3Putt = afterBirdie.filter(h => (h.putts ?? 0) >= 3).length / afterBirdie.length;
      const afterBogey3Putt = afterBogey.filter(h => (h.putts ?? 0) >= 3).length / afterBogey.length;
      if (afterBirdie3Putt - afterBogey3Putt >= puttingContextThreshold) {
        insights.push(
          buildInsight({
            id: 'putting-under-pressure',
            title: 'Putting Under Pressure Pattern',
            description: 'Three-putts are higher on holes after birdies than after bogeys, which suggests tempo drift when momentum is positive.',
            actionable: 'After a birdie, commit to a slower first-putt rhythm on the next green.',
            minimumRounds: 5,
            roundsUsed,
            priorityWeight: 'SITUATIONAL_PUTTING',
            dataCompleteness: puttCompleteness,
          })
        );
      }
    }

    const penaltyTransitions = fullRounds
      .flatMap(r => {
        const hs = r.holes ?? [];
        return hs.slice(1).map((hole, idx) => {
          const prev = hs[idx] as RoundHole & { penalties?: number };
          return { prev, hole };
        });
      })
      .filter(t => typeof t.hole.putts === 'number');
    const afterPenalty = penaltyTransitions.filter(t => (t.prev.penalties ?? 0) > 0).map(t => t.hole);
    const afterNoPenalty = penaltyTransitions.filter(t => (t.prev.penalties ?? 0) === 0).map(t => t.hole);
    if (afterPenalty.length >= MIN_SAMPLES.penaltyFollowups && afterNoPenalty.length >= MIN_SAMPLES.penaltyFollowups) {
      const avgPenaltyPutts = afterPenalty.reduce((sum, h) => sum + (h.putts ?? 2), 0) / afterPenalty.length;
      const avgNormalPutts = afterNoPenalty.reduce((sum, h) => sum + (h.putts ?? 2), 0) / afterNoPenalty.length;
      const penaltyPuttThreshold =
        tier === 'SCRATCH' ? 0.18 :
        tier === 'LOW' ? 0.22 :
        tier === 'MID' ? 0.28 :
        tier === 'HIGH' ? 0.35 :
        0.40;
      if (avgPenaltyPutts - avgNormalPutts >= penaltyPuttThreshold) {
        insights.push(
          buildInsight({
            id: 'putting-after-penalty',
            title: 'Putting After Penalties Is Costing Strokes',
            description: `After-penalty holes average ${avgPenaltyPutts.toFixed(2)} putts vs ${avgNormalPutts.toFixed(2)} otherwise.`,
            actionable: 'After a penalty, reset with one deep breath and a pure speed-first putting focus.',
            minimumRounds: 5,
            roundsUsed,
            priorityWeight: 'SITUATIONAL_PUTTING',
            dataCompleteness: puttCompleteness,
          })
        );
      }
    }
  }

  // Vol.2 (24A): scoring context after birdie vs bogey
  if (fullRounds.length >= 4) {
    const contextPairs = fullRounds.flatMap(r => {
      const hs = r.holes ?? [];
      return hs.slice(1).map((hole, idx) => ({ prev: hs[idx], hole }));
    });
    const nextAfterBirdie = contextPairs
      .filter(p => p.prev.score <= p.prev.par - 1)
      .map(p => p.hole.score - p.hole.par);
    const nextAfterBogey = contextPairs
      .filter(p => p.prev.score >= p.prev.par + 1)
      .map(p => p.hole.score - p.hole.par);

    if (nextAfterBirdie.length >= MIN_SAMPLES.scoreContextTransitions && nextAfterBogey.length >= MIN_SAMPLES.scoreContextTransitions) {
      const avgAfterBirdie = nextAfterBirdie.reduce((sum, v) => sum + v, 0) / nextAfterBirdie.length;
      const avgAfterBogey = nextAfterBogey.reduce((sum, v) => sum + v, 0) / nextAfterBogey.length;
      const bounceBackThreshold =
        tier === 'SCRATCH' ? 0.22 :
        tier === 'LOW' ? 0.28 :
        tier === 'MID' ? 0.38 :
        tier === 'HIGH' ? 0.50 :
        0.60;
      if (avgAfterBogey - avgAfterBirdie >= bounceBackThreshold) {
        insights.push(
          buildInsight({
            id: 'score-after-bogey-vs-birdie',
            title: 'Response-Hole Pattern',
            description: 'Your hole after a bogey trends worse than your hole after a birdie. The response hole is a key scoring swing point.',
            actionable: 'Adopt a “neutral reset” routine after bogeys: fairway-first then center-green.',
            minimumRounds: 4,
            roundsUsed,
            priorityWeight: 'POST_EVENT_SCORING_CONTEXT',
          })
        );
      }
    }
  }

  // Vol.2 (24B/10A): repeated-course mastery trend
  const roundsByCourse = completedRounds.reduce<Record<string, SavedRound[]>>((acc, r) => {
    const name = String(r.courseName || '').trim();
    if (!name) return acc;
    if (!acc[name]) acc[name] = [];
    acc[name].push(r);
    return acc;
  }, {});

  const bestCourseTrend = Object.entries(roundsByCourse)
    .map(([course, rs]) => {
      if (rs.length < MIN_SAMPLES.repeatedCourseRounds) return null;
      const sorted = rs.slice().sort((a, b) => roundTimestamp(a) - roundTimestamp(b));
      const firstN = sorted.slice(0, Math.min(3, sorted.length));
      const lastN = sorted.slice(-Math.min(3, sorted.length));
      const firstAvg = firstN
        .map(r => calcScoreToPar(r) ?? r.score)
        .reduce((sum, v) => sum + v, 0) / firstN.length;
      const lastAvg = lastN
        .map(r => calcScoreToPar(r) ?? r.score)
        .reduce((sum, v) => sum + v, 0) / lastN.length;
      return { course, firstAvg, lastAvg, delta: firstAvg - lastAvg, rounds: sorted.length };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs((b as { delta: number }).delta) - Math.abs((a as { delta: number }).delta))[0] as
      | { course: string; firstAvg: number; lastAvg: number; delta: number; rounds: number }
      | undefined;

  if (bestCourseTrend) {
    if (bestCourseTrend.delta >= 1.5) {
      insights.push(
        buildInsight({
          id: 'course-learning-curve-positive',
          title: `Course Mastery Building: ${bestCourseTrend.course}`,
          description: `Your scoring at ${bestCourseTrend.course} improved from ${bestCourseTrend.firstAvg >= 0 ? '+' : ''}${bestCourseTrend.firstAvg.toFixed(1)} to ${bestCourseTrend.lastAvg >= 0 ? '+' : ''}${bestCourseTrend.lastAvg.toFixed(1)} vs par across repeat rounds.`,
          actionable: 'Carry forward your successful strategy notes for this course.',
          minimumRounds: MIN_SAMPLES.repeatedCourseRounds,
          roundsUsed,
          priorityWeight: 'COURSE_MASTERY_PATTERN',
        })
      );
    } else if (bestCourseTrend.delta <= -1.5) {
      insights.push(
        buildInsight({
          id: 'course-learning-curve-opportunity',
          title: `Course Pattern Drift: ${bestCourseTrend.course}`,
          description: `Recent scores at ${bestCourseTrend.course} are trending higher than your early rounds.`,
          actionable: 'Review your tee-club and target choices on this course before your next round there.',
          minimumRounds: MIN_SAMPLES.repeatedCourseRounds,
          roundsUsed,
          priorityWeight: 'COURSE_MASTERY_PATTERN',
        })
      );
    }
  }

  // Vol.2 (25A): GIR after fairway hit vs miss by approach distance
  const approachByDistanceContext = holes
    .filter(
      h =>
        h.par >= 4 &&
        h.approachDistance &&
        h.greenHit !== null &&
        h.greenHit !== undefined &&
        h.fairwayHit !== null &&
        h.fairwayHit !== undefined
    )
    .reduce<Record<string, { fwHitTotal: number; fwHitGir: number; fwMissTotal: number; fwMissGir: number }>>((acc, h) => {
      const bucket = String(h.approachDistance);
      if (!acc[bucket]) acc[bucket] = { fwHitTotal: 0, fwHitGir: 0, fwMissTotal: 0, fwMissGir: 0 };
      if (isFairwayHit(h.fairwayHit)) {
        acc[bucket].fwHitTotal += 1;
        if (isGreenHit(h.greenHit)) acc[bucket].fwHitGir += 1;
      } else {
        acc[bucket].fwMissTotal += 1;
        if (isGreenHit(h.greenHit)) acc[bucket].fwMissGir += 1;
      }
      return acc;
    }, {});

  const distanceContextStats = Object.entries(approachByDistanceContext)
    .map(([bucket, s]) => {
      if (s.fwHitTotal < 5 || s.fwMissTotal < 5) return null;
      const hitRate = s.fwHitGir / s.fwHitTotal;
      const missRate = s.fwMissGir / s.fwMissTotal;
      return { bucket, hitRate, missRate, delta: hitRate - missRate };
    })
    .filter(Boolean) as Array<{ bucket: string; hitRate: number; missRate: number; delta: number }>;

  if (distanceContextStats.length) {
    const strongest = distanceContextStats.sort((a, b) => b.delta - a.delta)[0];
    if (strongest.delta >= 0.2) {
      insights.push(
        buildInsight({
          id: 'approach-after-fairway-by-distance',
          title: `Approach Window Leverage: ${strongest.bucket}`,
          description: `From ${strongest.bucket}, GIR is ${Math.round(strongest.hitRate * 100)}% after fairways vs ${Math.round(strongest.missRate * 100)}% after misses.`,
          actionable: 'On holes that land in this distance window, prioritize fairway-first off the tee.',
          minimumRounds: 4,
          roundsUsed,
          priorityWeight: 'APPROACH_CONDITION_PATTERN',
          dataCompleteness: Math.min(firCompleteness, girCompleteness),
        })
      );
    }
  }

  // New coaching pack (12A): weather impact correlation
  const weatherTagged = completedRounds
    .map(r => {
      const windy = isWindyRound(r);
      const toPar = calcScoreToPar(r);
      if (windy === null || toPar === null) return null;
      return { windy, toPar };
    })
    .filter(Boolean) as Array<{ windy: boolean; toPar: number }>;
  if (weatherTagged.length >= MIN_SAMPLES.weatherRounds) {
    const windy = weatherTagged.filter(r => r.windy);
    const calm = weatherTagged.filter(r => !r.windy);
    if (windy.length >= 3 && calm.length >= 3) {
      const windyAvg = windy.reduce((sum, r) => sum + r.toPar, 0) / windy.length;
      const calmAvg = calm.reduce((sum, r) => sum + r.toPar, 0) / calm.length;
      const diff = windyAvg - calmAvg;
      if (diff >= 1.5) {
        insights.push(
          buildInsight({
            id: 'weather-wind-scoring-impact',
            title: 'Wind Has a Measurable Score Impact',
            description: `Windy rounds trend ${diff.toFixed(1)} shots higher vs calmer rounds.`,
            actionable: 'In wind, club up and bias toward center-line targets to reduce big misses.',
            minimumRounds: 6,
            roundsUsed,
            priorityWeight: 'WEATHER_IMPACT_PATTERN',
          })
        );
      }
    }
  }

  // New coaching pack (12B): wind impact on GIR and approach windows
  const weatherTaggedApproaches = completedRounds
    .flatMap(round => {
      const windy = isWindyRound(round);
      if (windy === null) return [];
      return (round.holes ?? [])
        .filter(h => h.par >= 4 && h.greenHit !== null && h.greenHit !== undefined)
        .map(h => ({ windy, hole: h }));
    });

  if (weatherTaggedApproaches.length >= MIN_SAMPLES.weatherApproachHoles * 2) {
    const windyHoles = weatherTaggedApproaches.filter(x => x.windy).map(x => x.hole);
    const calmHoles = weatherTaggedApproaches.filter(x => !x.windy).map(x => x.hole);
    if (windyHoles.length >= MIN_SAMPLES.weatherApproachHoles && calmHoles.length >= MIN_SAMPLES.weatherApproachHoles) {
      const windyGir = windyHoles.filter(h => isGreenHit(h.greenHit)).length / windyHoles.length;
      const calmGir = calmHoles.filter(h => isGreenHit(h.greenHit)).length / calmHoles.length;
      const girGap = calmGir - windyGir;
      if (girGap >= 0.12) {
        insights.push(
          buildInsight({
            id: 'wind-impact-on-gir',
            title: 'Wind Is Reducing Your GIR Rate',
            description: `GIR in wind is ${Math.round(windyGir * 100)}% vs ${Math.round(calmGir * 100)}% in calmer rounds.`,
            actionable: 'In wind, favor the fat side and club up to remove short-side misses.',
            minimumRounds: 6,
            roundsUsed,
            priorityWeight: 'APPROACH_CONDITION_PATTERN',
            dataCompleteness: girCompleteness,
          })
        );
      }

      const byDistanceAndWind = weatherTaggedApproaches
        .filter(x => x.hole.approachDistance)
        .reduce<Record<string, { windyTotal: number; windyGir: number; calmTotal: number; calmGir: number }>>(
          (acc, x) => {
            const key = String(x.hole.approachDistance);
            if (!acc[key]) acc[key] = { windyTotal: 0, windyGir: 0, calmTotal: 0, calmGir: 0 };
            if (x.windy) {
              acc[key].windyTotal += 1;
              if (isGreenHit(x.hole.greenHit)) acc[key].windyGir += 1;
            } else {
              acc[key].calmTotal += 1;
              if (isGreenHit(x.hole.greenHit)) acc[key].calmGir += 1;
            }
            return acc;
          },
          {}
        );

      const windWindow = Object.entries(byDistanceAndWind)
        .map(([distance, s]) => {
          if (s.windyTotal < 5 || s.calmTotal < 5) return null;
          const windyRate = s.windyGir / s.windyTotal;
          const calmRate = s.calmGir / s.calmTotal;
          return { distance, windyRate, calmRate, gap: calmRate - windyRate };
        })
        .filter(Boolean)
        .sort((a, b) => (b as { gap: number }).gap - (a as { gap: number }).gap)[0] as
        | { distance: string; windyRate: number; calmRate: number; gap: number }
        | undefined;

      if (windWindow && windWindow.gap >= 0.2) {
        insights.push(
          buildInsight({
            id: `wind-sensitive-distance-${windWindow.distance}`,
            title: `Wind-Sensitive Approach Window: ${windWindow.distance}`,
            description: `From ${windWindow.distance}, GIR drops from ${Math.round(windWindow.calmRate * 100)}% to ${Math.round(windWindow.windyRate * 100)}% in wind.`,
            actionable: 'In this distance window, prioritize center-green and commit to a stock trajectory.',
            minimumRounds: 6,
            roundsUsed,
            priorityWeight: 'APPROACH_CONDITION_PATTERN',
            dataCompleteness: girCompleteness,
          })
        );
      }
    }
  }

  // New coaching pack (24C): compounding after doubles
  if (fullRounds.length >= 4) {
    const responsePairs = fullRounds.flatMap(r => {
      const hs = r.holes ?? [];
      return hs.slice(1).map((hole, idx) => ({ prev: hs[idx], hole }));
    });

    const nextAfterDouble = responsePairs
      .filter(p => p.prev.score >= p.prev.par + 2)
      .map(p => p.hole.score - p.hole.par);
    const nextAfterParOrBetter = responsePairs
      .filter(p => p.prev.score <= p.prev.par)
      .map(p => p.hole.score - p.hole.par);

    if (nextAfterDouble.length >= 6 && nextAfterParOrBetter.length >= 10) {
      const avgAfterDouble = nextAfterDouble.reduce((sum, v) => sum + v, 0) / nextAfterDouble.length;
      const avgAfterParOrBetter = nextAfterParOrBetter.reduce((sum, v) => sum + v, 0) / nextAfterParOrBetter.length;
      if (avgAfterDouble - avgAfterParOrBetter >= 0.4) {
        insights.push(
          buildInsight({
            id: 'post-double-compounding-pattern',
            title: 'Compounding After Double-Bogeys',
            description: 'The hole after a double is trending worse than your normal response holes.',
            actionable: 'After any double, play the next hole as a full reset: fairway-first, center-green, two-putt plan.',
            minimumRounds: 4,
            roundsUsed,
            priorityWeight: 'POST_EVENT_SCORING_CONTEXT',
          })
        );
      }
    }
  }

  // Vol.2 (26A/26B/26C): smart nudge timing and progressive unlock messaging
  if (insights.length > 0) {
    const ranked = insights.slice().sort((a, b) => a.priority - b.priority);
    const top = ranked[0];
    const second = ranked[1];
    const third = ranked[2];
    const isSafetyFocus =
      top.id.includes('penalty') || top.id.includes('score-protection') || top.id.includes('three-putt');

    insights.push(
      buildInsight({
        id: 'pre-round-nudge-priority',
        title: 'Pre-Round Focus Priority',
        description: `Primary focus today: ${top.title}${isSafetyFocus ? ' (strokes-saved first).' : '.'}`,
        actionable: top.actionable || 'Choose one process cue and stick to it for the full round.',
        minimumRounds: 3,
        roundsUsed,
        priorityWeight: 'PRE_ROUND_NUDGE',
      })
    );

    if (second) {
      insights.push(
        buildInsight({
          id: 'post-round-review-priority',
          title: 'Post-Round Review Order',
          description: `Review in order: 1) ${top.title}${third ? `, 2) ${second.title}, 3) ${third.title}` : `, 2) ${second.title}`}.`,
          actionable: 'Keep your next practice session focused on the top review item only.',
          minimumRounds: 3,
          roundsUsed,
          priorityWeight: 'POST_ROUND_NUDGE',
        })
      );
    }
  }

  if (roundsUsed === 3 || roundsUsed === 8 || roundsUsed === 20) {
    const unlockText: Record<number, { title: string; description: string; actionable: string }> = {
      3: {
        title: 'Insights Unlocked: Early Patterns',
        description: 'You now have enough rounds for early trend detection.',
        actionable: 'Reach 8 rounds to unlock high-confidence pattern insights.',
      },
      8: {
        title: 'Insights Unlocked: High Confidence',
        description: 'Your patterns are now stable enough for stronger coaching confidence.',
        actionable: 'Keep tracking to 20 rounds for long-horizon consistency and volatility reads.',
      },
      20: {
        title: 'Insights Unlocked: Long-Horizon Patterns',
        description: 'You now have enough data for deep consistency and behavioral trend analysis.',
        actionable: 'Use this checkpoint to reset one long-term priority for the next 10 rounds.',
      },
    };
    const u = unlockText[roundsUsed];
    insights.push(
      buildInsight({
        id: `progressive-unlock-${roundsUsed}`,
        title: u.title,
        description: u.description,
        actionable: u.actionable,
        minimumRounds: roundsUsed,
        roundsUsed,
        priorityWeight: 'PROGRESSIVE_UNLOCK',
      })
    );
  }

  if (Object.keys(clubDistances || {}).length >= 3 && roundsUsed >= 5) {
    const yardageAnalysis = analyzeClubYardages(completedRounds, clubDistances, handicap);
    const finding = yardageAnalysis.primaryFinding;
    if (finding && isFindingRelevantForTier(finding, tier)) {
      if (finding.type === 'BETWEEN_CLUBS_HESITATION' && finding.confidence !== 'LOW') {
        insights.push(
          buildInsight({
            id: `club-gap-hesitation-${finding.band.replace(/[^a-z0-9]/gi, '-')}`,
            title: `Between Clubs at ${finding.band} Yards`,
            description: finding.message,
            actionable: finding.actionMessage,
            minimumRounds: 5,
            roundsUsed,
            priorityWeight: 'APPROACHES_FINISHING_SHORT',
            category: InsightCategory.ADVANCED_STATS,
            handicapAffinity: HandicapAffinityGroup.COMPETITIVE,
          })
        );
      }

      if (finding.type === 'CONTACT_INCONSISTENCY' && finding.confidence !== 'LOW') {
        insights.push(
          buildInsight({
            id: `contact-inconsistency-${finding.band.replace(/[^a-z0-9]/gi, '-')}`,
            title: 'Contact Inconsistency From Scoring Distances',
            description: finding.message,
            actionable: finding.actionMessage,
            minimumRounds: 5,
            roundsUsed,
            priorityWeight: 'APPROACHES_FINISHING_SHORT',
            category: InsightCategory.ADVANCED_STATS,
            handicapAffinity: HandicapAffinityGroup.DEVELOPING,
          })
        );
      }

      if (finding.type === 'UNDERCLUBBING' && finding.confidence !== 'LOW') {
        insights.push(
          buildInsight({
            id: 'club-yardage-underclubbing',
            title: 'Consistent Underclubbing Detected',
            description: finding.message,
            actionable: finding.actionMessage,
            minimumRounds: 5,
            roundsUsed,
            priorityWeight: 'APPROACHES_FINISHING_SHORT',
            category: InsightCategory.ADVANCED_STATS,
            handicapAffinity: HandicapAffinityGroup.DEVELOPING,
          })
        );
      }

      if (finding.type === 'OVERCLUBBING' && finding.confidence !== 'LOW') {
        insights.push(
          buildInsight({
            id: 'club-yardage-overclubbing',
            title: 'Approaches Consistently Finishing Long',
            description: finding.message,
            actionable: finding.actionMessage,
            minimumRounds: 5,
            roundsUsed,
            priorityWeight: 'APPROACHES_FINISHING_LONG',
            category: InsightCategory.ADVANCED_STATS,
            handicapAffinity: HandicapAffinityGroup.DEVELOPING,
          })
        );
      }
    }
  }

  const scoringProfile = analyzeScoringDistribution(completedRounds, handicap);
  if (scoringProfile) {
    const birdieRatePct = (scoringProfile.distribution.scoringRate * 100).toFixed(0);
    const blowupRatePct = (scoringProfile.distribution.blowupRate * 100).toFixed(0);
    const doubleRatePct = ((scoringProfile.distribution.double + scoringProfile.distribution.triple + scoringProfile.distribution.worse) * 100).toFixed(0);
    if (scoringProfile.archetype === 'CEILING_CHASER') {
      insights.push(
        buildInsight({
          id: 'scoring-archetype-ceiling-chaser',
          title: 'Big Numbers Are Costing You',
          description: `Birdie rate is ${birdieRatePct}%, but double-or-worse is ${blowupRatePct}% and costs about ${scoringProfile.distribution.blowupCost.toFixed(1)} extra strokes per round.`,
          actionable: 'Use a bogey-max rule after trouble. Recovery hero shots usually add cost.',
          minimumRounds: 5,
          roundsUsed,
          priorityWeight: 'SCORE_PROTECTION_OPPORTUNITY',
          category: InsightCategory.SCORING,
          handicapAffinity: HandicapAffinityGroup.ALL,
        })
      );
    } else if (scoringProfile.archetype === 'EXPLOSIVE') {
      insights.push(
        buildInsight({
          id: 'scoring-archetype-explosive',
          title: 'High Ceiling, Expensive Floor',
          description: `Birdies at ${birdieRatePct}% with doubles+ at ${doubleRatePct}% creates large score swings round to round.`,
          actionable: 'On bad-swing holes, take the straightforward bogey route instead of forcing full recovery.',
          minimumRounds: 5,
          roundsUsed,
          priorityWeight: 'SCORE_PROTECTION_OPPORTUNITY',
          category: InsightCategory.SCORING,
          handicapAffinity: HandicapAffinityGroup.ALL,
        })
      );
    } else if (scoringProfile.archetype === 'FLOOR_RAISER') {
      insights.push(
        buildInsight({
          id: 'scoring-archetype-floor-raiser',
          title: 'Remarkably Consistent',
          description: `Double-or-worse is only ${blowupRatePct}% of holes. Your floor is stable.`,
          actionable: 'Pick 2-3 best birdie opportunities pre-round and allow more aggression only there.',
          minimumRounds: 5,
          roundsUsed,
          priorityWeight: 'PAR_5_BIRDIE_OPPORTUNITY',
          category: InsightCategory.SCORING,
          handicapAffinity: HandicapAffinityGroup.ALL,
        })
      );
    } else if (scoringProfile.archetype === 'STREAKY_SCORER') {
      insights.push(
        buildInsight({
          id: 'scoring-archetype-streaky',
          title: 'Streaks Define Your Rounds',
          description: 'Momentum shifts are creating scoring runs and scoring slumps within rounds.',
          actionable: 'After any bogey, play the next hole in reset mode before re-entering scoring mode.',
          minimumRounds: 5,
          roundsUsed,
          priorityWeight: 'MOMENTUM_OPPORTUNITY',
          category: InsightCategory.MENTAL,
          handicapAffinity: HandicapAffinityGroup.ALL,
        })
      );
    } else if (scoringProfile.archetype === 'CONSISTENT_GRINDER') {
      insights.push(
        buildInsight({
          id: 'scoring-archetype-consistent',
          title: 'Steady and Reliable',
          description: 'Volatility is low and scorecard stability is a strength.',
          actionable: 'Keep your current process; gains now come from small, targeted adjustments.',
          minimumRounds: 5,
          roundsUsed,
          priorityWeight: 'MILESTONE_PROGRESS',
          category: InsightCategory.SCORING,
          handicapAffinity: HandicapAffinityGroup.ALL,
        })
      );
    }
  }

  const momentum = analyzeMomentumTransitions(completedRounds);
  if (momentum.hasSufficientData && momentum.primaryPattern) {
    const pattern = momentum.primaryPattern;
    const priorityWeight: keyof typeof PRIORITY_WEIGHTS =
      pattern.type === 'BIRDIE_KILLS_NEXT'
        ? 'MOMENTUM_TRANSITION_BIRDIE_KILLS'
        : pattern.type === 'DOUBLE_COMPOUNDS'
          ? 'MOMENTUM_TRANSITION_DOUBLE_COMPOUNDS'
          : pattern.type === 'BOGEY_CHAINS'
            ? 'MOMENTUM_TRANSITION_BOGEY_CHAINS'
            : 'MOMENTUM_TRANSITION_POSITIVE';
    insights.push(
      buildInsight({
        id: `momentum-transition-${pattern.type.toLowerCase()}`,
        title: 'Hole-to-Hole Momentum Pattern',
        description: pattern.description,
        actionable: pattern.actionable,
        minimumRounds: 5,
        roundsUsed,
        priorityWeight,
        category: InsightCategory.MENTAL,
        handicapAffinity: HandicapAffinityGroup.DEVELOPING,
      })
    );
  }

  const wedge = analyzeWedgeZone(completedRounds, handicap);
  const wedgeAttempts = wedge.wedgeApproaches.reduce((sum, band) => sum + band.shotCount, 0);
  if (wedge.primaryFinding && wedgeAttempts >= 15 && wedge.primaryFinding.confidence !== 'LOW') {
    insights.push(
      buildInsight({
        id: `wedge-zone-${wedge.primaryFinding.type.toLowerCase()}`,
        title: 'Wedge Zone Performance Pattern',
        description: wedge.primaryFinding.message,
        actionable: wedge.primaryFinding.actionable,
        minimumRounds: 5,
        roundsUsed,
        priorityWeight: 'WEDGE_ZONE_OPPORTUNITY',
        category: InsightCategory.SHORT_GAME,
        handicapAffinity: HandicapAffinityGroup.DEVELOPING,
      })
    );
  }

  const puttDistance = analyzePuttDistances(completedRounds, handicap);
  if (puttDistance.hasSufficientData && puttDistance.primaryFinding && puttDistance.primaryFinding.confidence !== 'LOW') {
    insights.push(
      buildInsight({
        id: `putt-distance-${puttDistance.primaryFinding.type.toLowerCase()}`,
        title: 'First-Putt Distance Context',
        description: puttDistance.primaryFinding.message,
        actionable: puttDistance.primaryFinding.actionable,
        minimumRounds: 5,
        roundsUsed,
        priorityWeight: 'THREE_PUTT_OPPORTUNITY',
        category: InsightCategory.PUTTING,
        handicapAffinity: HandicapAffinityGroup.DEVELOPING,
      })
    );
  }

  const conditionsFinding = analyzeConditionsImpact(completedRounds);
  if (conditionsFinding && conditionsFinding.deltaStrokes >= 3) {
    const cond = conditionsFinding.dominantCondition;
    const defaultAction = 'Adjust targets and expectations when conditions are difficult.';
    const actionable = cond === 'Wind'
      ? 'In wind, take extra club, aim center-green, and remove hero shots.'
      : cond === 'Heat'
        ? 'In heat, hydrate from hole 1, slow pace slightly, and club for firmer surfaces.'
        : defaultAction;
    insights.push(
      buildInsight({
        id: `conditions-impact-${cond.toLowerCase()}`,
        title: `${cond} Affects Your Score`,
        description: conditionsFinding.description,
        actionable,
        minimumRounds: 6,
        roundsUsed,
        priorityWeight: 'WEATHER_IMPACT_PATTERN',
        category: InsightCategory.WEATHER,
        handicapAffinity: HandicapAffinityGroup.DEVELOPING,
      })
    );
  }

  const timeOfDay = analyzeTimeOfDay(completedRounds);
  if (timeOfDay.finding && timeOfDay.significantDiff) {
    insights.push(
      buildInsight({
        id: 'time-of-day-pattern',
        title: timeOfDay.timeOfDayEffect === 'MORNING_BETTER' ? 'You Score Better in the Morning' : 'You Score Better in the Afternoon',
        description: timeOfDay.finding.message,
        actionable: timeOfDay.finding.actionable,
        minimumRounds: 6,
        roundsUsed,
        priorityWeight: 'WEATHER_IMPACT_PATTERN',
        category: InsightCategory.COURSE_MGMT,
        handicapAffinity: HandicapAffinityGroup.ALL,
      })
    );
  }

  const teeStrategy = analyzeTeeStrategy(completedRounds);
  if (teeStrategy.hasSufficientData && teeStrategy.primaryFinding) {
    insights.push(
      buildInsight({
        id: `tee-strategy-${teeStrategy.primaryFinding.type.toLowerCase()}`,
        title: 'Tee Shot Strategy Value',
        description: teeStrategy.primaryFinding.message,
        actionable: teeStrategy.primaryFinding.actionable,
        minimumRounds: 5,
        roundsUsed,
        priorityWeight: 'DRIVER_SCORING_VALUE',
        category: InsightCategory.COURSE_MGMT,
        handicapAffinity: HandicapAffinityGroup.DEVELOPING,
      })
    );
  }

  const bunker = analyzeBunkers(completedRounds, handicap);
  if (bunker.hasSufficientData && bunker.primaryFinding) {
    insights.push(
      buildInsight({
        id: `bunker-intel-${bunker.primaryFinding.type.toLowerCase()}`,
        title: 'Bunker Performance Pattern',
        description: bunker.primaryFinding.message,
        actionable: bunker.primaryFinding.actionable,
        minimumRounds: 5,
        roundsUsed,
        priorityWeight: 'BUNKER_SAVE_OPPORTUNITY',
        category: InsightCategory.SHORT_GAME,
        handicapAffinity: HandicapAffinityGroup.DEVELOPING,
      })
    );
  }

  const efficiency = analyzeStatsEfficiency(completedRounds, handicap ?? null);
  if (efficiency.primaryFinding && efficiency.category !== 'INSUFFICIENT_DATA') {
    insights.push(
      buildInsight({
        id: `stats-efficiency-${efficiency.category.toLowerCase()}`,
        title: 'Score vs Stats Efficiency',
        description: efficiency.primaryFinding.message,
        actionable: efficiency.primaryFinding.actionable,
        minimumRounds: 5,
        roundsUsed,
        priorityWeight: 'STATS_EFFICIENCY',
        category: InsightCategory.ADVANCED_STATS,
        handicapAffinity: HandicapAffinityGroup.COMPETITIVE,
      })
    );
  }

  const trajectory = analyzeHandicapTrajectory(completedRounds);
  if (trajectory.primaryFinding) {
    insights.push(
      buildInsight({
        id: `handicap-trajectory-${trajectory.primaryFinding.type.toLowerCase()}`,
        title: 'Handicap Trajectory Attribution',
        description: trajectory.primaryFinding.message,
        actionable: trajectory.primaryFinding.actionable,
        minimumRounds: 8,
        roundsUsed,
        priorityWeight: 'HANDICAP_TRAJECTORY',
        category: InsightCategory.SCORING,
        handicapAffinity: HandicapAffinityGroup.ALL,
      })
    );
  }

  const strokeAllocation = analyzeStrokeAllocation(completedRounds, handicap ?? null);
  if (
    strokeAllocation.hasSufficientData &&
    strokeAllocation.primaryFinding &&
    (tier === 'SCRATCH' || tier === 'LOW' || tier === 'MID')
  ) {
    insights.push(
      buildInsight({
        id: `stroke-allocation-${strokeAllocation.primaryFinding.type.toLowerCase()}`,
        title: 'Stroke Allocation Efficiency',
        description: strokeAllocation.primaryFinding.message,
        actionable: strokeAllocation.primaryFinding.actionable,
        minimumRounds: 6,
        roundsUsed,
        priorityWeight: 'STROKE_ALLOCATION',
        category: InsightCategory.COURSE_MGMT,
        handicapAffinity: HandicapAffinityGroup.COMPETITIVE,
      })
    );
  }

  const fatigue = analyzeFatigue(completedRounds);
  if (fatigue.hasSufficientData && fatigue.primaryFinding) {
    insights.push(
      buildInsight({
        id: `round-fatigue-${fatigue.primaryFinding.type.toLowerCase()}`,
        title: 'Round Fatigue Pattern',
        description: fatigue.primaryFinding.message,
        actionable: fatigue.primaryFinding.actionable,
        minimumRounds: 8,
        roundsUsed,
        priorityWeight: 'ROUND_FATIGUE_PATTERN',
        category: InsightCategory.MENTAL,
        handicapAffinity: HandicapAffinityGroup.DEVELOPING,
      })
    );
  }

  return insights;
}
