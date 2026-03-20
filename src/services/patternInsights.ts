/**
 * Pattern Insights Service
 * 
 * Generates detailed, educational insights based on tracked patterns.
 * These insights provide actionable coaching when enough data exists.
 */

import { SavedRound, RoundHole } from '../types';
import { isRoundStatEnabled } from '../utils/statPreferences';
import { isFairwayHit } from '../utils/statChecks';
import { PatternInsightType } from './patternInsights/typesEnums';
import { PatternInsight, PracticeDrill, PracticePlan, GamePlanCard } from './patternInsights/types';
import { analyzeClubYardages } from './clubYardageIntelligence';
export { PatternInsightType, StrengthLevel } from './patternInsights/typesEnums';
export type { PatternInsight, InsightMeta, PracticeDrill, PracticePlan, GamePlanCard, InsightProgress } from './patternInsights/types';
import {
  MIN_TEE_SHOTS,
  MIN_APPROACH_SHOTS,
  MIN_LONG_PUTTS,
  MIN_SHORT_PUTTS,
  MIN_PENALTY_ROUNDS,
  DRIVING_THRESHOLDS,
  APPROACH_DEPTH_THRESHOLDS,
  APPROACH_DIRECTION_THRESHOLDS,
  PUTTING_THREE_PUTT_THRESHOLDS,
  PENALTY_THRESHOLDS,
} from './patternInsights/constants';
import {
  getPerEventImpact,
  getDifficulty,
  estimateStrokesPerRound,
  getImpactScore,
  calculateStars,
  getConfidenceLabel,
  calculateConsistency,
  calculateConfidenceScore,
  getStrengthLevel,
  calculateFrequencyScore,
  inferStartLine,
  calculatePriorityScore,
  clamp,
  calculateInsightProgress,
} from './patternInsights/helpers';
import {
  getHandicapTier,
  getHandicapAwareTitle,
  getHandicapAwareObservation,
  getHandicapAwareWorkOn,
  getCoachExplanation,
  getBeforeNextRound,
} from './patternInsights/handicapText';

const MIN_DIRECTIONAL_MISSES = 6;

const normalizeTier = (tier: ReturnType<typeof getHandicapTier>): 'LOW' | 'MID' | 'HIGH' => {
  if (tier === 'SCRATCH') return 'LOW';
  if (tier === 'BEGINNER') return 'HIGH';
  return tier;
};

const getConflictBucket = (type: PatternInsightType): string | null => {
  switch (type) {
    case PatternInsightType.FAIRWAYS_MISSED_LEFT:
    case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
      return 'DRIVING_DIRECTION';
    case PatternInsightType.APPROACHES_MISSED_SHORT:
    case PatternInsightType.APPROACHES_MISSED_LONG:
      return 'APPROACH_DEPTH';
    case PatternInsightType.GREENS_MISSED_LEFT:
    case PatternInsightType.GREENS_MISSED_RIGHT:
      return 'APPROACH_DIRECTION';
    default:
      return null;
  }
};

export function generatePatternInsights(rounds: SavedRound[], userHandicap?: number): PatternInsight[] {
  const insights: PatternInsight[] = [];
  
  // Driving Insights
  const drivingInsight = analyzeDrivingPattern(rounds, userHandicap);
  if (drivingInsight) insights.push(drivingInsight);
  
  // Approach Insights
  const approachDepthInsight = analyzeApproachDepthPattern(rounds, userHandicap);
  if (approachDepthInsight) insights.push(approachDepthInsight);
  
  const approachDirectionInsight = analyzeApproachDirectionPattern(rounds, userHandicap);
  if (approachDirectionInsight) insights.push(approachDirectionInsight);
  
  // Putting Insights
  const threePuttInsight = analyzeThreePuttPattern(rounds, userHandicap);
  if (threePuttInsight) insights.push(threePuttInsight);

  const shortPuttInsight = analyzeShortPuttPattern(rounds, userHandicap);
  if (shortPuttInsight) insights.push(shortPuttInsight);
  
  // Penalty Insights
  const penaltyInsight = analyzePenaltyPattern(rounds, userHandicap);
  if (penaltyInsight) insights.push(penaltyInsight);

  const lowUpDownInsight = analyzeLowUpDownRate(rounds, userHandicap);
  if (lowUpDownInsight) insights.push(lowUpDownInsight);

  const poorBunkerInsight = analyzePoorBunkerSaves(rounds, userHandicap);
  if (poorBunkerInsight) insights.push(poorBunkerInsight);

  const weakPar3Insight = analyzeWeakPar3Scoring(rounds, userHandicap);
  if (weakPar3Insight) insights.push(weakPar3Insight);

  const poorPar5Insight = analyzePoorPar5Scoring(rounds, userHandicap);
  if (poorPar5Insight) insights.push(poorPar5Insight);

  const approachDistanceInsight = analyzeApproachDistanceWeakness(rounds, userHandicap);
  if (approachDistanceInsight) insights.push(approachDistanceInsight);

  const approachContactInsight = analyzeApproachContactPattern(rounds, userHandicap);
  if (approachContactInsight) insights.push(approachContactInsight);

  const backNineInsight = analyzeBackNineScoringDrop(rounds, userHandicap);
  if (backNineInsight) insights.push(backNineInsight);

  const par4Insight = analyzePar4ScoringStruggle(rounds, userHandicap);
  if (par4Insight) insights.push(par4Insight);

  const bogeyChainInsight = analyzeHighBogeyConversion(rounds, userHandicap);
  if (bogeyChainInsight) insights.push(bogeyChainInsight);

  const frontNineInsight = analyzeFrontNineBlowup(rounds, userHandicap);
  if (frontNineInsight) insights.push(frontNineInsight);

  const weatherInsight = analyzeWeatherScoringDrop(rounds, userHandicap);
  if (weatherInsight) insights.push(weatherInsight);
  
  // Sort by priority score (highest first)
  insights.sort((a, b) => b.priority - a.priority);
  
  // Safety rules:
  // 1. Always include penalties if present
  // 2. Never show conflicting insights (e.g., both left and right miss)
  // 3. Return top 2-3 only
  
  const finalInsights: PatternInsight[] = [];
  const seenBuckets = new Set<string>();
  
  for (const insight of insights) {
    // Always include penalties first
    if (insight.type === PatternInsightType.PENALTIES_HURTING_SCORES) {
      finalInsights.push(insight);
      continue;
    }
    
    // Check for conflicts
    const bucket = getConflictBucket(insight.type);
    if (bucket && seenBuckets.has(bucket)) continue;
    finalInsights.push(insight);
    if (bucket) seenBuckets.add(bucket);
    
    // Stop at 3 total insights
    if (finalInsights.length >= 3) break;
  }
  
  return finalInsights;
}

/**
 * Generate "Focus for Your Next Round" summary
 */
export function generateNextRoundFocus(insights: PatternInsight[]): string[] {
  const focus: string[] = [];
  
  for (const insight of insights) {
    switch (insight.type) {
      case PatternInsightType.PENALTIES_HURTING_SCORES:
        focus.push('Reduce penalties off the tee');
        break;
      case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
      case PatternInsightType.FAIRWAYS_MISSED_LEFT:
        focus.push('Control start line on tee shots');
        break;
      case PatternInsightType.APPROACHES_MISSED_SHORT:
        focus.push('Commit to full club selections');
        break;
      case PatternInsightType.APPROACHES_MISSED_LONG:
        focus.push('Account for lie and spin on approaches');
        break;
      case PatternInsightType.GREENS_MISSED_LEFT:
      case PatternInsightType.GREENS_MISSED_RIGHT:
        focus.push('Aim for center-green more often');
        break;
      case PatternInsightType.HIGH_THREE_PUTT:
        focus.push('Prioritize speed on long putts');
        break;
      case PatternInsightType.LOW_UP_DOWN_RATE:
        focus.push('Commit to getting up and down from off the green');
        break;
      case PatternInsightType.POOR_BUNKER_SAVES:
        focus.push('Play out of bunkers conservatively - just exit cleanly');
        break;
      case PatternInsightType.WEAK_PAR3_SCORING:
        focus.push('Pick your club confidently on par 3s and commit');
        break;
      case PatternInsightType.POOR_PAR5_SCORING:
        focus.push('Lay up to a comfortable distance on par 5s');
        break;
      case PatternInsightType.APPROACH_DISTANCE_WEAKNESS:
        focus.push('Take one extra club from your weak distance band');
        break;
      case PatternInsightType.BACK_NINE_SCORING_DROP:
        focus.push('Maintain the same routine on the back nine as the front');
        break;
      case PatternInsightType.PAR4_SCORING_STRUGGLE:
        focus.push('Target center-green on all par 4 approaches');
        break;
      case PatternInsightType.HIGH_BOGEY_CONVERSION:
        focus.push('Reset fully after every bogey - blank slate next hole');
        break;
      case PatternInsightType.FRONT_NINE_BLOWUP:
        focus.push('Arrive early enough to warm up before hole 1');
        break;
      case PatternInsightType.WEATHER_SCORING_DROP:
        focus.push('Take one more club and swing at 80% in the wind');
        break;
      case PatternInsightType.APPROACH_CONTACT_INCONSISTENCY:
        focus.push('Keep one swing speed and prioritize clean contact');
        break;
      case PatternInsightType.BETWEEN_CLUBS_HESITATION:
        focus.push('When between clubs, default to the longer club and commit');
        break;
      default:
        break;
    }
  }
  
  return focus.slice(0, 3); // Max 3 focus items
}

/**
 * Analyze driving patterns (fairway miss direction)
 */
function analyzeDrivingPattern(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const roundsWithHoles = rounds.filter(
    r => isRoundStatEnabled(r, 'fir') && r.holes && r.holes.length > 0
  );
  
  if (roundsWithHoles.length === 0) return null;
  
  let leftMisses = 0;
  let rightMisses = 0;
  let fairwaysHit = 0;
  let totalFairwayAttempts = 0;
  
  roundsWithHoles.forEach(round => {
    round.holes?.forEach(hole => {
      // Only count par 4 and par 5 holes
      if (hole.par >= 4 && hole.fairwayHit !== undefined && hole.fairwayHit !== null) {
        totalFairwayAttempts++;
        if (hole.fairwayHit === 'left') leftMisses++;
        else if (hole.fairwayHit === 'right') rightMisses++;
        else if (isFairwayHit(hole.fairwayHit)) fairwaysHit++;
      }
    });
  });
  
  // Gate: Minimum 8 tee shots
  if (totalFairwayAttempts < MIN_TEE_SHOTS) {
    return null; // Not enough data yet
  }
  
  const totalMisses = leftMisses + rightMisses;
  
  // Suppress: Fewer than 3 fairways hit (too chaotic)
  if (fairwaysHit < DRIVING_THRESHOLDS.MIN_FAIRWAYS_HIT) {
    return null; // Too chaotic
  }
  
  if (totalMisses === 0) return null;
  
  const rightMissRate = rightMisses / totalMisses;
  const leftMissRate = leftMisses / totalMisses;
  
  const dominantRate = Math.max(rightMissRate, leftMissRate);
  const isRight = rightMissRate > leftMissRate;
  
  // Gate: Minimum 60% one-sided
  if (dominantRate < DRIVING_THRESHOLDS.MODERATE) return null;
  
  // Calculate consistency (% of rounds where pattern appears)
  const consistency = calculateConsistency(roundsWithHoles, (round) => {
    let roundLeftMisses = 0;
    let roundRightMisses = 0;
    let roundTotalMisses = 0;
    
    round.holes?.forEach(hole => {
      if (hole.par >= 4 && hole.fairwayHit !== undefined && hole.fairwayHit !== null) {
        if (hole.fairwayHit === 'left') { roundLeftMisses++; roundTotalMisses++; }
        if (hole.fairwayHit === 'right') { roundRightMisses++; roundTotalMisses++; }
      }
    });
    
    if (roundTotalMisses === 0) return false;
    
    const roundDominant = isRight ? roundRightMisses : roundLeftMisses;
    return (roundDominant / roundTotalMisses) >= 0.50; // Pattern present if ≥ 50% in this round
  });
  
  const strengthLevel = getStrengthLevel(dominantRate, DRIVING_THRESHOLDS);
  
  // New confidence calculation
  const confidenceCalc = calculateConfidenceScore(
    totalFairwayAttempts,
    MIN_TEE_SHOTS,
    dominantRate,
    DRIVING_THRESHOLDS.MODERATE,
    consistency
  );
  
  const stars = calculateStars(confidenceCalc.confidence);
  
  // Suppress if confidence < 40
  if (confidenceCalc.confidence < 40) {
    return null; // Will be suppressed
  }
  
  // Calculate scores for priority
  const impactScore = getImpactScore(
    isRight ? PatternInsightType.FAIRWAYS_MISSED_RIGHT : PatternInsightType.FAIRWAYS_MISSED_LEFT
  );
  const confidenceScore = confidenceCalc.confidence / 100;
  const frequencyScore = calculateFrequencyScore(
    isRight ? rightMisses : leftMisses,
    totalFairwayAttempts
  );
  
  const priorityScore = calculatePriorityScore(impactScore, confidenceScore, frequencyScore);
  
  // Infer start line
  const startLine = inferStartLine(
    isRight ? 'right' : 'left',
    totalMisses,
    dominantRate
  );
  
  const insightType = isRight ? PatternInsightType.FAIRWAYS_MISSED_RIGHT : PatternInsightType.FAIRWAYS_MISSED_LEFT;
  const dominantMisses = isRight ? rightMisses : leftMisses;
  const estimatedStrokes = estimateStrokesPerRound(
    dominantMisses,
    roundsWithHoles.length,
    getPerEventImpact(insightType)
  );

  return {
    type: insightType,
    title: getHandicapAwareTitle(
      insightType,
      userHandicap,
      isRight
    ),
    patternObserved: getHandicapAwareObservation(
      insightType,
      userHandicap,
      dominantRate,
      isRight
    ),
    whatThisIndicates: isRight 
      ? 'Shots finishing right are commonly caused by a clubface open relative to the swing path. Many players respond by aiming further left, which can actually increase left-to-right curve.'
      : 'Shots finishing left are commonly caused by a clubface closed relative to the swing path. Aiming further right to compensate can actually increase right-to-left curvature.',
    commonContributors: isRight
      ? [
          'Fade / slice pattern (path left, face open)',
          'Body alignment aimed left of target',
          'Visual misalignment on the tee',
          'Wind exaggerating curvature'
        ]
      : [
          'Draw / hook pattern (path right, face closed)',
          'Body alignment aimed right of target',
          'Over-correction from previous misses',
          'Wind exaggerating curvature'
        ],
    whatToWorkOn: getHandicapAwareWorkOn(
      isRight ? PatternInsightType.FAIRWAYS_MISSED_RIGHT : PatternInsightType.FAIRWAYS_MISSED_LEFT,
      userHandicap,
      isRight
    ),
    commonTrap: isRight
      ? 'Aiming further left to fix a right miss often makes the ball curve even more right if the face stays open.'
      : 'Aiming further right to fix a left miss often increases the hook if the face remains closed.',
    confidence: confidenceCalc.confidence,
    stars,
    confidenceLabel: getConfidenceLabel(stars),
    strengthLevel,
    dataSupport: `${totalFairwayAttempts} tee shots • ${roundsWithHoles.length} rounds`,
    priority: priorityScore,
    impactScore,
    frequencyScore,
    sampleSize: totalFairwayAttempts,
    estimatedStrokes,
    difficulty: getDifficulty(insightType),
    category: 'Tee Shots',
    
    // Coach-level content
    coachExplanation: getCoachExplanation(
      isRight ? PatternInsightType.FAIRWAYS_MISSED_RIGHT : PatternInsightType.FAIRWAYS_MISSED_LEFT,
      isRight
    ),
    beforeNextRound: getBeforeNextRound(
      isRight ? PatternInsightType.FAIRWAYS_MISSED_RIGHT : PatternInsightType.FAIRWAYS_MISSED_LEFT,
      isRight
    ),
    startLineInference: startLine,
    progress: calculateInsightProgress(insightType, rounds, userHandicap),
    
    meta: {
      suppressed: false,
      debugInfo: {
        sampleScore: confidenceCalc.sampleScore,
        patternScore: confidenceCalc.patternScore,
        consistencyScore: confidenceCalc.consistencyScore,
      },
    },
  };
}

/**
 * Analyze approach depth patterns (short vs long)
 */
function analyzeApproachDepthPattern(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const roundsWithHoles = rounds.filter(
    r => isRoundStatEnabled(r, 'gir') && r.holes && r.holes.length > 0
  );
  
  if (roundsWithHoles.length === 0) return null;
  
  let shortMisses = 0;
  let longMisses = 0;
  let totalApproachAttempts = 0;
  
  roundsWithHoles.forEach(round => {
    round.holes?.forEach(hole => {
      if (hole.greenHit !== undefined && hole.greenHit !== null && hole.greenHit !== true) {
        totalApproachAttempts++;
        if (hole.greenHit === 'short') shortMisses++;
        if (hole.greenHit === 'long') longMisses++;
      }
    });
  });
  
  // Gate: Minimum 10 approach shots
  if (totalApproachAttempts < MIN_APPROACH_SHOTS) return null;
  
  const totalDepthMisses = shortMisses + longMisses;
  if (totalDepthMisses === 0) return null;
  
  const shortMissRate = shortMisses / totalDepthMisses;
  const longMissRate = longMisses / totalDepthMisses;
  
  const dominantRate = Math.max(shortMissRate, longMissRate);
  const isShort = shortMissRate > longMissRate;
  
  // Gate: Minimum 55% for depth misses
  if (dominantRate < APPROACH_DEPTH_THRESHOLDS.MODERATE) return null;
  
  // Calculate consistency
  const consistency = calculateConsistency(roundsWithHoles, (round) => {
    let roundShortMisses = 0;
    let roundLongMisses = 0;
    let roundTotalMisses = 0;
    
    round.holes?.forEach(hole => {
      if (hole.greenHit !== undefined && hole.greenHit !== null && hole.greenHit !== true) {
        if (hole.greenHit === 'short') { roundShortMisses++; roundTotalMisses++; }
        if (hole.greenHit === 'long') { roundLongMisses++; roundTotalMisses++; }
      }
    });
    
    if (roundTotalMisses === 0) return false;
    
    const roundDominant = isShort ? roundShortMisses : roundLongMisses;
    return (roundDominant / roundTotalMisses) >= 0.50;
  });
  
  const strengthLevel = getStrengthLevel(dominantRate, APPROACH_DEPTH_THRESHOLDS);
  
  const confidenceCalc = calculateConfidenceScore(
    totalApproachAttempts,
    MIN_APPROACH_SHOTS,
    dominantRate,
    APPROACH_DEPTH_THRESHOLDS.MODERATE,
    consistency
  );
  
  const stars = calculateStars(confidenceCalc.confidence);
  
  // Suppress if confidence < 40
  if (confidenceCalc.confidence < 40) {
    return null;
  }
  
  const insightType = isShort ? PatternInsightType.APPROACHES_MISSED_SHORT : PatternInsightType.APPROACHES_MISSED_LONG;
  const dominantMisses = isShort ? shortMisses : longMisses;
  const estimatedStrokes = estimateStrokesPerRound(
    dominantMisses,
    roundsWithHoles.length,
    getPerEventImpact(insightType)
  );

  return {
    type: insightType,
    title: isShort ? 'Approaches Missed Short' : 'Approaches Missed Long',
    patternObserved: `${(dominantRate * 100).toFixed(0)}% of your approach misses are finishing ${isShort ? 'short' : 'long'} of the green.`,
    whatThisIndicates: isShort
      ? 'Short approaches often result from conservative club selection, poor contact (fat or low-point issues), underestimating wind or elevation, or playing away from trouble but leaving shots too safe.'
      : 'Long approaches often result from over-club selection, flyers from rough, helping the ball or adrenaline under pressure, or wind assisting more than expected.',
    commonContributors: isShort
      ? [
          'Conservative club selection',
          'Poor contact (fat or low-point issues)',
          'Underestimating wind or elevation',
          'Playing away from trouble but leaving shots too safe'
        ]
      : [
          'Over-club selection',
          'Flyers from rough',
          'Helping the ball or adrenaline under pressure',
          'Wind assisting more than expected'
        ],
    whatToWorkOn: isShort
      ? [
          'Recheck carry yardages, not total',
          'Commit fully to the shot and target',
          'Factor wind and slope before choosing club'
        ]
      : [
          'Adjust for lie and spin potential',
          'Pick safer back-edge targets',
          'Favor controlled swings over extra speed'
        ],
    confidence: confidenceCalc.confidence,
    stars,
    confidenceLabel: getConfidenceLabel(stars),
    strengthLevel,
    dataSupport: `${totalApproachAttempts} approaches • ${roundsWithHoles.length} rounds`,
    priority: calculatePriorityScore(
      getImpactScore(isShort ? PatternInsightType.APPROACHES_MISSED_SHORT : PatternInsightType.APPROACHES_MISSED_LONG),
      confidenceCalc.confidence / 100,
      calculateFrequencyScore(isShort ? shortMisses : longMisses, totalApproachAttempts)
    ),
    impactScore: getImpactScore(insightType),
    frequencyScore: calculateFrequencyScore(isShort ? shortMisses : longMisses, totalApproachAttempts),
    sampleSize: totalApproachAttempts,
    estimatedStrokes,
    difficulty: getDifficulty(insightType),
    category: 'Approach Play',
    
    // Coach-level content
    coachExplanation: getCoachExplanation(isShort ? PatternInsightType.APPROACHES_MISSED_SHORT : PatternInsightType.APPROACHES_MISSED_LONG),
    beforeNextRound: getBeforeNextRound(isShort ? PatternInsightType.APPROACHES_MISSED_SHORT : PatternInsightType.APPROACHES_MISSED_LONG),
    progress: calculateInsightProgress(insightType, rounds, userHandicap),
    
    meta: {
      suppressed: false,
      debugInfo: {
        sampleScore: confidenceCalc.sampleScore,
        patternScore: confidenceCalc.patternScore,
        consistencyScore: confidenceCalc.consistencyScore,
      },
    },
  };
}

/**
 * Analyze approach direction patterns (left vs right)
 */
function analyzeApproachDirectionPattern(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const roundsWithHoles = rounds.filter(
    r => isRoundStatEnabled(r, 'gir') && r.holes && r.holes.length > 0
  );
  
  if (roundsWithHoles.length === 0) return null;
  
  let leftMisses = 0;
  let rightMisses = 0;
  let totalMisses = 0;
  let totalDirectionalMisses = 0;
  
  roundsWithHoles.forEach(round => {
    round.holes?.forEach(hole => {
      if (hole.greenHit !== undefined && hole.greenHit !== null && hole.greenHit !== true) {
        totalMisses++;
      }
      if (hole.greenHit === 'left') {
        leftMisses++;
        totalDirectionalMisses++;
      }
      if (hole.greenHit === 'right') {
        rightMisses++;
        totalDirectionalMisses++;
      }
    });
  });
  
  if (totalDirectionalMisses < MIN_DIRECTIONAL_MISSES || totalMisses < MIN_APPROACH_SHOTS) return null;
  
  const leftMissRate = leftMisses / totalMisses;
  const rightMissRate = rightMisses / totalMisses;
  
  const dominantSide = leftMissRate > rightMissRate ? 'left' : 'right';
  const dominantRate = Math.max(leftMissRate, rightMissRate);
  
  // Gate: Minimum 60% for direction misses
  if (dominantRate < APPROACH_DIRECTION_THRESHOLDS.MODERATE) return null;
  
  // Calculate consistency
  const consistency = calculateConsistency(roundsWithHoles, (round) => {
    let roundLeftMisses = 0;
    let roundRightMisses = 0;
    let roundTotalMisses = 0;
    
    round.holes?.forEach(hole => {
      if (hole.greenHit === 'left') { roundLeftMisses++; roundTotalMisses++; }
      if (hole.greenHit === 'right') { roundRightMisses++; roundTotalMisses++; }
    });
    
    if (roundTotalMisses === 0) return false;
    
    const roundDominant = dominantSide === 'left' ? roundLeftMisses : roundRightMisses;
    return (roundDominant / roundTotalMisses) >= 0.50;
  });
  
  const strengthLevel = getStrengthLevel(dominantRate, APPROACH_DIRECTION_THRESHOLDS);
  
  const confidenceCalc = calculateConfidenceScore(
    totalMisses,
    MIN_APPROACH_SHOTS,
    dominantRate,
    APPROACH_DIRECTION_THRESHOLDS.MODERATE,
    consistency
  );
  
  const stars = calculateStars(confidenceCalc.confidence);
  
  // Suppress if confidence < 40
  if (confidenceCalc.confidence < 40) {
    return null;
  }
  
  const insightType = dominantSide === 'left' ? PatternInsightType.GREENS_MISSED_LEFT : PatternInsightType.GREENS_MISSED_RIGHT;
  const dominantMisses = dominantSide === 'left' ? leftMisses : rightMisses;
  const estimatedStrokes = estimateStrokesPerRound(
    dominantMisses,
    roundsWithHoles.length,
    getPerEventImpact(insightType)
  );

  return {
    type: insightType,
    title: `Greens Missed ${dominantSide.charAt(0).toUpperCase() + dominantSide.slice(1)}`,
    patternObserved: `${(dominantRate * 100).toFixed(0)}% of your directional approach misses are finishing ${dominantSide} of the green.`,
    whatThisIndicates: 'Consistent directional misses often come from alignment or start-line bias, shot shape not matching the target, or aiming at pins that do not fit your usual miss.',
    commonContributors: [
      'Alignment or start-line bias',
      'Shot shape not matching target line',
      'Aiming at pins that do not fit your usual miss'
    ],
    whatToWorkOn: [
      'Aim for center-green bias',
      'Match target to your natural shape',
      'Track start direction vs curve'
    ],
    confidence: confidenceCalc.confidence,
    stars,
    confidenceLabel: getConfidenceLabel(stars),
    strengthLevel,
    dataSupport: `${totalMisses} approach misses (${totalDirectionalMisses} directional) • ${roundsWithHoles.length} rounds`,
    priority: calculatePriorityScore(
      getImpactScore(insightType),
      confidenceCalc.confidence / 100,
      calculateFrequencyScore(dominantSide === 'left' ? leftMisses : rightMisses, totalMisses)
    ),
    impactScore: getImpactScore(insightType),
    frequencyScore: calculateFrequencyScore(dominantSide === 'left' ? leftMisses : rightMisses, totalMisses),
    sampleSize: totalMisses,
    estimatedStrokes,
    difficulty: getDifficulty(insightType),
    category: 'Approach Play',
    
    // Coach-level content
    coachExplanation: getCoachExplanation(dominantSide === 'left' ? PatternInsightType.GREENS_MISSED_LEFT : PatternInsightType.GREENS_MISSED_RIGHT),
    beforeNextRound: getBeforeNextRound(dominantSide === 'left' ? PatternInsightType.GREENS_MISSED_LEFT : PatternInsightType.GREENS_MISSED_RIGHT),
    progress: calculateInsightProgress(insightType, rounds, userHandicap),
    
    meta: {
      suppressed: false,
      debugInfo: {
        sampleScore: confidenceCalc.sampleScore,
        patternScore: confidenceCalc.patternScore,
        consistencyScore: confidenceCalc.consistencyScore,
      },
    },
  };
}

/**
 * Analyze three-putt patterns
 */
function analyzeThreePuttPattern(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const roundsWithHoles = rounds.filter(
    r => isRoundStatEnabled(r, 'putts') && r.holes && r.holes.length > 0
  );
  
  if (roundsWithHoles.length === 0) return null;
  
  let threePutts = 0;
  let totalHoles = 0;
  let totalPutts = 0;
  
  roundsWithHoles.forEach(round => {
    round.holes?.forEach(hole => {
      if (hole.putts !== undefined && hole.putts !== null) {
        totalHoles++;
        totalPutts += hole.putts;
        if (hole.putts >= 3) threePutts++;
      }
    });
  });
  
  // Suppress: Total putts < 18 (short round / scramble-like data)
  if (totalPutts < PUTTING_THREE_PUTT_THRESHOLDS.MIN_TOTAL_PUTTS) return null;
  
  // Gate: Minimum 10 holes with putt data
  if (totalHoles < MIN_LONG_PUTTS) return null;
  
  const threePuttRate = threePutts / totalHoles;
  
  // Gate: Minimum 20% three-putt rate
  if (threePuttRate < PUTTING_THREE_PUTT_THRESHOLDS.MODERATE) return null;
  
  // Calculate consistency (% of rounds with 3+ putts)
  const consistency = calculateConsistency(roundsWithHoles, (round) => {
    let roundThreePutts = 0;
    let roundTotalHoles = 0;
    
    round.holes?.forEach(hole => {
      if (hole.putts !== undefined && hole.putts !== null) {
        roundTotalHoles++;
        if (hole.putts >= 3) roundThreePutts++;
      }
    });
    
    if (roundTotalHoles === 0) return false;
    return (roundThreePutts / roundTotalHoles) >= 0.15; // Pattern present if ≥ 15% in this round
  });
  
  const strengthLevel = getStrengthLevel(threePuttRate, PUTTING_THREE_PUTT_THRESHOLDS);
  
  const confidenceCalc = calculateConfidenceScore(
    totalHoles,
    MIN_LONG_PUTTS,
    threePuttRate,
    PUTTING_THREE_PUTT_THRESHOLDS.MODERATE,
    consistency
  );
  
  const stars = calculateStars(confidenceCalc.confidence);
  
  // Suppress if confidence < 40
  if (confidenceCalc.confidence < 40) {
    return null;
  }
  
  const insightType = PatternInsightType.HIGH_THREE_PUTT;
  const estimatedStrokes = estimateStrokesPerRound(
    threePutts,
    roundsWithHoles.length,
    getPerEventImpact(insightType)
  );

  return {
    type: insightType,
    title: 'Too Many 3-Putts',
    patternObserved: `You're 3-putting ${(threePuttRate * 100).toFixed(0)}% of the time (${threePutts} in ${totalHoles} holes).`,
    whatThisIndicates: 'Three-putts usually come from weak lag speed, bad speed reads, or first putts running too far by.',
    commonContributors: [
      'Lag putting distance control issues',
      'Speed misreads (especially downhill)',
      'First putts finishing too far past the hole'
    ],
    whatToWorkOn: [
      'Prioritize speed over line on long putts',
      'Focus on leaving uphill second putts',
      'Practice pace control from 30–50 feet'
    ],
    confidence: confidenceCalc.confidence,
    stars,
    confidenceLabel: getConfidenceLabel(stars),
    strengthLevel,
    dataSupport: `${threePutts} three-putts in ${totalHoles} holes • ${roundsWithHoles.length} rounds`,
    priority: calculatePriorityScore(
      getImpactScore(insightType),
      confidenceCalc.confidence / 100,
      calculateFrequencyScore(threePutts, totalHoles)
    ),
    impactScore: getImpactScore(insightType),
    frequencyScore: calculateFrequencyScore(threePutts, totalHoles),
    sampleSize: totalHoles,
    estimatedStrokes,
    difficulty: getDifficulty(insightType),
    category: 'Putting',
    
    // Coach-level content
    coachExplanation: getCoachExplanation(PatternInsightType.HIGH_THREE_PUTT),
    beforeNextRound: getBeforeNextRound(PatternInsightType.HIGH_THREE_PUTT),
    progress: calculateInsightProgress(insightType, rounds, userHandicap),
    
    meta: {
      suppressed: false,
      debugInfo: {
        sampleScore: confidenceCalc.sampleScore,
        patternScore: confidenceCalc.patternScore,
        consistencyScore: confidenceCalc.consistencyScore,
      },
    },
  };
}

/**
 * Analyze penalty patterns
 */
function analyzePenaltyPattern(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const roundsWithPenaltyData = rounds.filter(
    r => isRoundStatEnabled(r, 'penalties') && r.penalties !== undefined && r.penalties !== null
  );
  
  // Gate: Minimum 1 round with penalty data (penalties always matter)
  if (roundsWithPenaltyData.length < MIN_PENALTY_ROUNDS) return null;
  
  const totalPenalties = roundsWithPenaltyData.reduce((sum, r) => sum + (r.penalties || 0), 0);
  const avgPenaltiesPerRound = totalPenalties / roundsWithPenaltyData.length;
  
  // Gate: Minimum 2 penalties per round
  if (avgPenaltiesPerRound < PENALTY_THRESHOLDS.MODERATE) return null;
  
  // Calculate consistency (% of rounds with 2+ penalties)
  const consistency = calculateConsistency(roundsWithPenaltyData, (round) => {
    return (round.penalties || 0) >= 2;
  });
  
  const strengthLevel = getStrengthLevel(avgPenaltiesPerRound, PENALTY_THRESHOLDS);
  
  // Penalties are objective and always visible, so high base confidence
  // Use a simplified calculation since penalties are straightforward
  const confidenceCalc = calculateConfidenceScore(
    roundsWithPenaltyData.length,
    MIN_PENALTY_ROUNDS,
    Math.min(avgPenaltiesPerRound / 5, 1), // Normalize to 0-1
    PENALTY_THRESHOLDS.MODERATE / 5,
    consistency
  );
  
  // Boost confidence for penalties since they're objective
  const adjustedConfidence = Math.min(100, confidenceCalc.confidence + 20);
  const stars = calculateStars(adjustedConfidence);
  
  // Suppress if confidence < 40 (rare for penalties)
  if (adjustedConfidence < 40) {
    return null;
  }
  
  const insightType = PatternInsightType.PENALTIES_HURTING_SCORES;
  const estimatedStrokes = estimateStrokesPerRound(
    totalPenalties,
    roundsWithPenaltyData.length,
    getPerEventImpact(insightType)
  );

  return {
    type: insightType,
    title: 'Penalties Are Costing Strokes',
    patternObserved: `You're averaging ${avgPenaltiesPerRound.toFixed(1)} penalty strokes per round.`,
    whatThisIndicates: 'Penalties usually come from aggressive tee targets, shots that do not fit your usual miss, or trying to pull off too much after a mistake.',
    commonContributors: [
      'Aggressive targets off the tee',
      'Playing shots that don\'t suit your typical miss',
      'Trying to recover too much after a mistake'
    ],
    whatToWorkOn: [
      'Choose safer tee targets when trouble is in play',
      'Play to your stock shot shape',
      'Take medicine early to avoid compounding errors'
    ],
    scoringNote: 'Cutting penalties is often the fastest way to lower scores.',
    confidence: adjustedConfidence,
    stars,
    confidenceLabel: getConfidenceLabel(stars),
    strengthLevel,
    dataSupport: `${totalPenalties} penalties • ${roundsWithPenaltyData.length} rounds`,
    priority: calculatePriorityScore(
      getImpactScore(insightType),
      adjustedConfidence / 100,
      calculateFrequencyScore(totalPenalties, roundsWithPenaltyData.length)
    ),
    impactScore: getImpactScore(insightType),
    frequencyScore: calculateFrequencyScore(totalPenalties, roundsWithPenaltyData.length),
    sampleSize: roundsWithPenaltyData.length,
    estimatedStrokes,
    difficulty: getDifficulty(insightType),
    category: 'Course Management',
    
    // Coach-level content
    coachExplanation: getCoachExplanation(PatternInsightType.PENALTIES_HURTING_SCORES),
    beforeNextRound: getBeforeNextRound(PatternInsightType.PENALTIES_HURTING_SCORES),
    progress: calculateInsightProgress(insightType, rounds, userHandicap),
    
    meta: {
      suppressed: false,
      debugInfo: {
        sampleScore: confidenceCalc.sampleScore,
        patternScore: confidenceCalc.patternScore,
        consistencyScore: confidenceCalc.consistencyScore,
      },
    },
  };
}

function analyzeShortPuttPattern(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const roundsWithData = rounds.filter(
    r => isRoundStatEnabled(r, 'putts') && isRoundStatEnabled(r, 'gir') && r.holes && r.holes.length > 0
  );
  if (roundsWithData.length === 0) return null;

  let girHoles = 0;
  let girWithTwoPutts = 0;
  roundsWithData.forEach(round => {
    round.holes?.forEach(hole => {
      if (hole.greenHit === true && hole.putts != null) {
        girHoles += 1;
        if (hole.putts >= 2) girWithTwoPutts += 1;
      }
    });
  });

  if (girHoles < 20) return null;
  const twoPuttRate = girWithTwoPutts / girHoles;
  if (twoPuttRate < 0.88) return null;

  const consistency = calculateConsistency(roundsWithData, round => {
    let sample = 0;
    let misses = 0;
    round.holes?.forEach(hole => {
      if (hole.greenHit === true && hole.putts != null) {
        sample += 1;
        if (hole.putts >= 2) misses += 1;
      }
    });
    return sample >= 4 && misses / sample >= 0.8;
  });
  const confidenceCalc = calculateConfidenceScore(girHoles, 20, twoPuttRate, 0.88, consistency);
  if (confidenceCalc.confidence < 40) return null;
  const insightType = PatternInsightType.LOW_SHORT_PUTT_MAKE_RATE;
  const estimatedStrokes = estimateStrokesPerRound(girWithTwoPutts, roundsWithData.length, getPerEventImpact(insightType));

  return {
    type: insightType,
    title: getHandicapAwareTitle(insightType, userHandicap),
    patternObserved: `${Math.round(twoPuttRate * 100)}% of GIR holes still need 2+ putts.`,
    whatThisIndicates: 'You are creating chances but not converting enough short follow-up putts.',
    commonContributors: ['Deceleration from short range', 'Inconsistent short-putt routine', 'Speed control leaving work'],
    whatToWorkOn: getHandicapAwareWorkOn(insightType, userHandicap),
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(twoPuttRate, { MODERATE: 0.88, STRONG: 0.92, VERY_STRONG: 0.95 }),
    dataSupport: `${girHoles} GIR holes • ${roundsWithData.length} rounds`,
    priority: calculatePriorityScore(getImpactScore(insightType), confidenceCalc.confidence / 100, calculateFrequencyScore(girWithTwoPutts, girHoles)),
    impactScore: getImpactScore(insightType),
    frequencyScore: calculateFrequencyScore(girWithTwoPutts, girHoles),
    sampleSize: girHoles,
    estimatedStrokes,
    difficulty: getDifficulty(insightType),
    category: 'Putting',
    progress: calculateInsightProgress(insightType, rounds, userHandicap),
    coachExplanation: getCoachExplanation(insightType),
    beforeNextRound: getBeforeNextRound(insightType),
    meta: {
      suppressed: false,
      debugInfo: {
        sampleScore: confidenceCalc.sampleScore,
        patternScore: confidenceCalc.patternScore,
        consistencyScore: confidenceCalc.consistencyScore,
      },
    },
  };
}

function getTierThreshold(
  handicap: number | undefined,
  thresholds: Record<ReturnType<typeof getHandicapTier>, number>
): number {
  return thresholds[getHandicapTier(handicap)];
}

function countHoleTypes(rounds: SavedRound[], par: number) {
  const holes = rounds.flatMap(r => r.holes ?? []).filter(h => h.par === par && typeof h.score === 'number');
  const avg = holes.length ? holes.reduce((sum, h) => sum + (h.score ?? 0), 0) / holes.length : 0;
  return { holes, avg };
}

function getRoundNineDelta(round: SavedRound): { frontToPar: number; backToPar: number } | null {
  if (!round.holes || round.holes.length < 18) return null;
  const sorted = [...round.holes].sort((a, b) => a.number - b.number);
  const front = sorted.filter(h => h.number >= 1 && h.number <= 9);
  const back = sorted.filter(h => h.number >= 10 && h.number <= 18);
  if (front.length < 9 || back.length < 9) return null;
  const frontScore = front.reduce((sum, h) => sum + h.score, 0);
  const frontPar = front.reduce((sum, h) => sum + h.par, 0);
  const backScore = back.reduce((sum, h) => sum + h.score, 0);
  const backPar = back.reduce((sum, h) => sum + h.par, 0);
  return { frontToPar: frontScore - frontPar, backToPar: backScore - backPar };
}

function isWindyRound(round: SavedRound): boolean | null {
  const weather = round.weather || round.weatherFront9 || round.weatherBack9;
  if (!weather) return null;
  const dir = String(weather.windDirection || '').toLowerCase();
  if (dir && dir !== 'calm') return true;
  const windText = String(weather.wind || '');
  const m = windText.match(/(\d+(\.\d+)?)/);
  if (m && Number(m[1]) >= 10) return true;
  if (dir === 'calm') return false;
  return null;
}

function analyzeLowUpDownRate(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const roundsWithScrambling = rounds.filter(r => isRoundStatEnabled(r, 'scrambling') && r.stats?.upDownAttempts != null);
  if (roundsWithScrambling.length < 3) return null;
  const attempts = roundsWithScrambling.reduce((sum, r) => sum + (r.stats?.upDownAttempts || 0), 0);
  const made = roundsWithScrambling.reduce((sum, r) => sum + (r.stats?.upDownMade || 0), 0);
  if (attempts < 15) return null;
  const rate = made / attempts;
  const threshold = getTierThreshold(userHandicap, { SCRATCH: 0.55, LOW: 0.45, MID: 0.32, HIGH: 0.22, BEGINNER: 0.15 });
  if (rate >= threshold) return null;

  const confidenceCalc = calculateConfidenceScore(attempts, 15, 1 - rate, 1 - threshold, calculateConsistency(roundsWithScrambling, r => {
    const a = r.stats?.upDownAttempts || 0;
    if (a < 3) return false;
    const m = r.stats?.upDownMade || 0;
    return m / a <= threshold;
  }));
  if (confidenceCalc.confidence < 40) return null;

  const type = PatternInsightType.LOW_UP_DOWN_RATE;
  return {
    type,
    title: getHandicapAwareTitle(type, userHandicap),
    patternObserved: `You are converting ${Math.round(rate * 100)}% of up-and-down chances (${made}/${attempts}).`,
    whatThisIndicates: 'Around-the-green conversion is leaving strokes on the table.',
    commonContributors: ['Inconsistent first chip contact', 'Too many long second putts', 'No reliable default short-game shot'],
    whatToWorkOn: ['Prioritize a stock chip shot', 'Play for makeable second putts', 'Track conversion during practice'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(1 - rate, { MODERATE: 1 - threshold, STRONG: 0.72, VERY_STRONG: 0.82 }),
    dataSupport: `${attempts} up-and-down attempts • ${roundsWithScrambling.length} rounds`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, calculateFrequencyScore(attempts - made, attempts)),
    impactScore: getImpactScore(type),
    frequencyScore: calculateFrequencyScore(attempts - made, attempts),
    sampleSize: attempts,
    estimatedStrokes: estimateStrokesPerRound(attempts - made, roundsWithScrambling.length, getPerEventImpact(type)),
    difficulty: getDifficulty(type),
    category: 'Short Game',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzePoorBunkerSaves(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const roundsWithBunker = rounds.filter(r => isRoundStatEnabled(r, 'bunkers') && r.holes?.length);
  const bunkerHoles = roundsWithBunker.flatMap(r => r.holes ?? []).filter(h => h.greenSideBunker || h.fairwayBunker);
  if (bunkerHoles.length < 8) return null;

  const byPar = new Map<number, { bunker: number[]; nonBunker: number[] }>();
  roundsWithBunker.forEach(round => {
    (round.holes ?? []).forEach(hole => {
      if (!byPar.has(hole.par)) byPar.set(hole.par, { bunker: [], nonBunker: [] });
      const entry = byPar.get(hole.par)!;
      if (hole.greenSideBunker || hole.fairwayBunker) entry.bunker.push(hole.score);
      else entry.nonBunker.push(hole.score);
    });
  });

  let weightedDelta = 0;
  let weightedCount = 0;
  byPar.forEach(({ bunker, nonBunker }) => {
    if (!bunker.length || !nonBunker.length) return;
    const bunkerAvg = bunker.reduce((s, v) => s + v, 0) / bunker.length;
    const nonBunkerAvg = nonBunker.reduce((s, v) => s + v, 0) / nonBunker.length;
    weightedDelta += (bunkerAvg - nonBunkerAvg) * bunker.length;
    weightedCount += bunker.length;
  });
  if (!weightedCount) return null;
  const delta = weightedDelta / weightedCount;
  const doublesOrWorse = bunkerHoles.filter(h => h.score >= h.par + 2).length / bunkerHoles.length;
  if (delta < 1.2 && doublesOrWorse < 0.4) return null;

  const type = PatternInsightType.POOR_BUNKER_SAVES;
  const confidenceCalc = calculateConfidenceScore(bunkerHoles.length, 8, Math.max(delta / 2, doublesOrWorse), 0.6, calculateConsistency(roundsWithBunker, r => {
    const bunker = (r.holes ?? []).filter(h => h.greenSideBunker || h.fairwayBunker);
    if (!bunker.length) return false;
    return bunker.filter(h => h.score >= h.par + 2).length / bunker.length >= 0.4;
  }));
  if (confidenceCalc.confidence < 40) return null;

  return {
    type,
    title: getHandicapAwareTitle(type, userHandicap),
    patternObserved: `Bunker holes are averaging ${delta.toFixed(1)} extra strokes vs similar non-bunker holes.`,
    whatThisIndicates: 'Bunker recovery execution is creating avoidable doubles and missed saves.',
    commonContributors: ['Inconsistent strike point in sand', 'Poor distance control from bunkers', 'Risky first recovery choice'],
    whatToWorkOn: ['Focus on clean exits first', 'Use one reliable bunker setup', 'Accept safe first putt distances'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(Math.max(delta / 2, doublesOrWorse), { MODERATE: 0.6, STRONG: 0.75, VERY_STRONG: 0.9 }),
    dataSupport: `${bunkerHoles.length} bunker holes`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, clamp(Math.max(delta / 2, doublesOrWorse))),
    impactScore: getImpactScore(type),
    frequencyScore: clamp(Math.max(delta / 2, doublesOrWorse)),
    sampleSize: bunkerHoles.length,
    estimatedStrokes: estimateStrokesPerRound(Math.round(weightedDelta), Math.max(roundsWithBunker.length, 1), getPerEventImpact(type)),
    difficulty: getDifficulty(type),
    category: 'Short Game',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzeWeakPar3Scoring(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const { holes, avg } = countHoleTypes(rounds, 3);
  if (holes.length < 12) return null;
  const threshold = getTierThreshold(userHandicap, { SCRATCH: 3.3, LOW: 3.6, MID: 4.1, HIGH: 4.5, BEGINNER: 5.0 });
  if (avg <= threshold) return null;
  const type = PatternInsightType.WEAK_PAR3_SCORING;
  const confidenceCalc = calculateConfidenceScore(holes.length, 12, clamp((avg - 3) / 3), clamp((threshold - 3) / 3), calculateConsistency(rounds.filter(r => r.holes?.length), r => {
    const par3 = (r.holes ?? []).filter(h => h.par === 3);
    if (!par3.length) return false;
    return par3.reduce((s, h) => s + h.score, 0) / par3.length > threshold;
  }));
  if (confidenceCalc.confidence < 40) return null;
  return {
    type,
    title: getHandicapAwareTitle(type, userHandicap),
    patternObserved: `Par 3 average is ${avg.toFixed(2)} over ${holes.length} holes.`,
    whatThisIndicates: 'Par-3 execution and commitment are costing makeable pars.',
    commonContributors: ['Unclear club commitment', 'Pin-hunting instead of center-green targets', 'Contact inconsistency under pressure'],
    whatToWorkOn: ['Commit to one club choice', 'Favor center-green target lines', 'Run full routine before every par-3 swing'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(clamp((avg - 3) / 3), { MODERATE: clamp((threshold - 3) / 3), STRONG: 0.65, VERY_STRONG: 0.8 }),
    dataSupport: `${holes.length} par-3 holes`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, clamp((avg - threshold) / 2)),
    impactScore: getImpactScore(type),
    frequencyScore: clamp((avg - threshold) / 2),
    sampleSize: holes.length,
    estimatedStrokes: Math.round(((avg - threshold) * holes.length / Math.max(rounds.length, 1)) * 10) / 10,
    difficulty: getDifficulty(type),
    category: 'Scoring',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzePoorPar5Scoring(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const { holes, avg } = countHoleTypes(rounds, 5);
  if (holes.length < 12) return null;
  const threshold = getTierThreshold(userHandicap, { SCRATCH: 5.2, LOW: 5.8, MID: 6.3, HIGH: 6.8, BEGINNER: 7.5 });
  if (avg <= threshold) return null;
  const type = PatternInsightType.POOR_PAR5_SCORING;
  const confidenceCalc = calculateConfidenceScore(holes.length, 12, clamp((avg - 5) / 3), clamp((threshold - 5) / 3), calculateConsistency(rounds.filter(r => r.holes?.length), r => {
    const par5 = (r.holes ?? []).filter(h => h.par === 5);
    if (!par5.length) return false;
    return par5.reduce((s, h) => s + h.score, 0) / par5.length > threshold;
  }));
  if (confidenceCalc.confidence < 40) return null;
  const tier = normalizeTier(getHandicapTier(userHandicap));
  return {
    type,
    title: tier === 'LOW' ? 'Par 5 Birdie Opportunities Missed' : 'Par 5s Costing Strokes',
    patternObserved: `Par 5 average is ${avg.toFixed(2)} over ${holes.length} holes.`,
    whatThisIndicates: 'Par 5 strategy is not creating enough low-risk scoring chances.',
    commonContributors: ['Low-percentage second-shot decisions', 'Poor layup windows', 'Inconsistent wedge distance control'],
    whatToWorkOn: ['Play to favorite layup yardages', 'Prioritize in-play positioning', 'Treat par-5 third shots as scoring shots'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(clamp((avg - 5) / 3), { MODERATE: clamp((threshold - 5) / 3), STRONG: 0.65, VERY_STRONG: 0.8 }),
    dataSupport: `${holes.length} par-5 holes`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, clamp((avg - threshold) / 2)),
    impactScore: getImpactScore(type),
    frequencyScore: clamp((avg - threshold) / 2),
    sampleSize: holes.length,
    estimatedStrokes: Math.round(((avg - threshold) * holes.length / Math.max(rounds.length, 1)) * 10) / 10,
    difficulty: getDifficulty(type),
    category: 'Scoring',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzeApproachDistanceWeakness(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const roundsWithDistance = rounds.filter(r => isRoundStatEnabled(r, 'approachDistance') && r.holes?.length);
  const holes = roundsWithDistance.flatMap(r => r.holes ?? []).filter(h => h.approachDistance && h.greenHit != null);
  if (holes.length < 15) return null;
  const byBand = holes.reduce<Record<string, { total: number; gir: number }>>((acc, hole) => {
    const band = String(hole.approachDistance);
    if (!acc[band]) acc[band] = { total: 0, gir: 0 };
    acc[band].total += 1;
    if (hole.greenHit === true) acc[band].gir += 1;
    return acc;
  }, {});
  const overallGir = holes.filter(h => h.greenHit === true).length / holes.length;
  const sorted = Object.entries(byBand)
    .filter(([, value]) => value.total >= 3)
    .map(([band, value]) => ({ band, total: value.total, girRate: value.gir / value.total }))
    .sort((a, b) => a.girRate - b.girRate);
  if (!sorted.length) return null;
  const weakest = sorted[0];
  if (overallGir - weakest.girRate < 0.2) return null;
  const type = PatternInsightType.APPROACH_DISTANCE_WEAKNESS;
  const confidenceCalc = calculateConfidenceScore(holes.length, 15, clamp((overallGir - weakest.girRate) + 0.4), 0.6, calculateConsistency(roundsWithDistance, r => {
    const rs = (r.holes ?? []).filter(h => String(h.approachDistance || '') === weakest.band && h.greenHit != null);
    if (rs.length < 2) return false;
    const rate = rs.filter(h => h.greenHit === true).length / rs.length;
    return overallGir - rate >= 0.15;
  }));
  if (confidenceCalc.confidence < 40) return null;
  return {
    type,
    title: `Weak Zone: ${weakest.band} Yards`,
    patternObserved: `${weakest.band} GIR is ${Math.round(weakest.girRate * 100)}% vs ${Math.round(overallGir * 100)}% overall.`,
    whatThisIndicates: 'One approach window is underperforming relative to your baseline.',
    commonContributors: ['Club indecision in this window', 'Distance-control mismatch', 'Trajectory mismatch for this yardage'],
    whatToWorkOn: ['Use one extra club from this band', 'Practice this yardage with two clubs', 'Aim center green until GIR stabilizes'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(overallGir - weakest.girRate, { MODERATE: 0.2, STRONG: 0.3, VERY_STRONG: 0.4 }),
    dataSupport: `${holes.length} tracked approach shots`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, clamp(overallGir - weakest.girRate)),
    impactScore: getImpactScore(type),
    frequencyScore: clamp(overallGir - weakest.girRate),
    sampleSize: holes.length,
    estimatedStrokes: estimateStrokesPerRound(holes.length * (overallGir - weakest.girRate), Math.max(roundsWithDistance.length, 1), getPerEventImpact(type)),
    difficulty: getDifficulty(type),
    category: 'Approach Play',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzeBackNineScoringDrop(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const deltas = rounds.map(getRoundNineDelta).filter(Boolean) as Array<{ frontToPar: number; backToPar: number }>;
  if (deltas.length < 5) return null;
  const avgFront = deltas.reduce((s, d) => s + d.frontToPar, 0) / deltas.length;
  const avgBack = deltas.reduce((s, d) => s + d.backToPar, 0) / deltas.length;
  const drop = avgBack - avgFront;
  if (drop < 2) return null;
  const type = PatternInsightType.BACK_NINE_SCORING_DROP;
  const confidenceCalc = calculateConfidenceScore(deltas.length, 5, clamp(drop / 4), 0.5, calculateConsistency(deltas, d => d.backToPar - d.frontToPar >= 1));
  if (confidenceCalc.confidence < 40) return null;
  return {
    type,
    title: getHandicapAwareTitle(type, userHandicap),
    patternObserved: `Back nine is ${drop.toFixed(1)} strokes worse than front nine on average.`,
    whatThisIndicates: 'Late-round routine and decision quality are slipping.',
    commonContributors: ['Decision fatigue', 'Tempo slipping late', 'Reduced commitment to target lines'],
    whatToWorkOn: ['Use the same routine cadence after hole 12', 'Take one reset breath before every tee shot', 'Favor conservative targets late'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(clamp(drop / 4), { MODERATE: 0.5, STRONG: 0.65, VERY_STRONG: 0.8 }),
    dataSupport: `${deltas.length} full rounds`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, clamp(drop / 4)),
    impactScore: getImpactScore(type),
    frequencyScore: clamp(drop / 4),
    sampleSize: deltas.length,
    estimatedStrokes: Math.round(drop * 10) / 10,
    difficulty: getDifficulty(type),
    category: 'Scoring',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzePar4ScoringStruggle(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const { holes, avg } = countHoleTypes(rounds, 4);
  if (holes.length < 16) return null;
  const threshold = getTierThreshold(userHandicap, { SCRATCH: 4.5, LOW: 5.0, MID: 5.5, HIGH: 6.2, BEGINNER: 6.8 });
  if (avg <= threshold) return null;
  const type = PatternInsightType.PAR4_SCORING_STRUGGLE;
  const confidenceCalc = calculateConfidenceScore(holes.length, 16, clamp((avg - 4) / 3), clamp((threshold - 4) / 3), calculateConsistency(rounds.filter(r => r.holes?.length), r => {
    const par4 = (r.holes ?? []).filter(h => h.par === 4);
    if (!par4.length) return false;
    return par4.reduce((s, h) => s + h.score, 0) / par4.length >= threshold;
  }));
  if (confidenceCalc.confidence < 40) return null;
  return {
    type,
    title: getHandicapAwareTitle(type, userHandicap),
    patternObserved: `Par 4 average is ${avg.toFixed(2)} across ${holes.length} holes.`,
    whatThisIndicates: 'The highest-volume scoring hole type is producing too many dropped shots.',
    commonContributors: ['Poor tee-to-approach chain', 'Misses into short-sided trouble', 'Inconsistent conservative targets'],
    whatToWorkOn: ['Build a default two-shot plan for par 4s', 'Center-green approach targeting', 'Use safer clubs on penalty-heavy holes'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(clamp((avg - 4) / 3), { MODERATE: clamp((threshold - 4) / 3), STRONG: 0.65, VERY_STRONG: 0.8 }),
    dataSupport: `${holes.length} par-4 holes`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, clamp((avg - threshold) / 2)),
    impactScore: getImpactScore(type),
    frequencyScore: clamp((avg - threshold) / 2),
    sampleSize: holes.length,
    estimatedStrokes: Math.round(((avg - threshold) * holes.length / Math.max(rounds.length, 1)) * 10) / 10,
    difficulty: getDifficulty(type),
    category: 'Scoring',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzeHighBogeyConversion(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const holes = rounds.flatMap(r => r.holes ?? []);
  if (holes.length < 36) return null;
  let bogeys = 0;
  let chainBogeys = 0;
  rounds.forEach(round => {
    const sorted = [...(round.holes ?? [])].sort((a, b) => a.number - b.number);
    for (let i = 0; i < sorted.length; i += 1) {
      const hole = sorted[i];
      if (hole.score >= hole.par + 1) {
        bogeys += 1;
        const next = sorted[i + 1];
        if (next && next.score >= next.par + 1) chainBogeys += 1;
      }
    }
  });
  if (!bogeys) return null;
  const rate = chainBogeys / bogeys;
  if (rate <= 0.4) return null;
  const type = PatternInsightType.HIGH_BOGEY_CONVERSION;
  const confidenceCalc = calculateConfidenceScore(bogeys, 8, rate, 0.4, calculateConsistency(rounds.filter(r => r.holes?.length), r => {
    const sorted = [...(r.holes ?? [])].sort((a, b) => a.number - b.number);
    let b = 0;
    let c = 0;
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i].score >= sorted[i].par + 1) {
        b += 1;
        const next = sorted[i + 1];
        if (next && next.score >= next.par + 1) c += 1;
      }
    }
    return b >= 2 && c / b >= 0.4;
  }));
  if (confidenceCalc.confidence < 40) return null;
  return {
    type,
    title: getHandicapAwareTitle(type, userHandicap),
    patternObserved: `${Math.round(rate * 100)}% of bogeys are followed by another bogey or worse.`,
    whatThisIndicates: 'Score damage is compounding after mistakes.',
    commonContributors: ['Carrying previous-hole frustration', 'Aggressive immediate recovery choices', 'Routine breakdown after mistakes'],
    whatToWorkOn: ['Use a fixed reset routine after every bogey', 'Play next hole to safest target first', 'Prioritize one stable swing cue'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(rate, { MODERATE: 0.4, STRONG: 0.5, VERY_STRONG: 0.6 }),
    dataSupport: `${bogeys} bogeys tracked`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, rate),
    impactScore: getImpactScore(type),
    frequencyScore: rate,
    sampleSize: bogeys,
    estimatedStrokes: estimateStrokesPerRound(chainBogeys, Math.max(rounds.length, 1), getPerEventImpact(type)),
    difficulty: getDifficulty(type),
    category: 'Mental / Strategy',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzeFrontNineBlowup(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const deltas = rounds.map(getRoundNineDelta).filter(Boolean) as Array<{ frontToPar: number; backToPar: number }>;
  if (deltas.length < 5) return null;
  const avgFront = deltas.reduce((s, d) => s + d.frontToPar, 0) / deltas.length;
  const avgBack = deltas.reduce((s, d) => s + d.backToPar, 0) / deltas.length;
  const drop = avgFront - avgBack;
  if (drop < 2.5) return null;
  const type = PatternInsightType.FRONT_NINE_BLOWUP;
  const confidenceCalc = calculateConfidenceScore(deltas.length, 5, clamp(drop / 5), 0.5, calculateConsistency(deltas, d => d.frontToPar - d.backToPar >= 1.5));
  if (confidenceCalc.confidence < 40) return null;
  return {
    type,
    title: getHandicapAwareTitle(type, userHandicap),
    patternObserved: `Front nine is ${drop.toFixed(1)} strokes worse than back nine on average.`,
    whatThisIndicates: 'Pre-round warmup and early-hole decision rhythm are costing strokes.',
    commonContributors: ['Cold start physically', 'No first-hole routine anchor', 'Overly aggressive early decisions'],
    whatToWorkOn: ['Use structured 10-15 minute warmup', 'Start with conservative targets first 3 holes', 'Commit to full routine on first tee'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(clamp(drop / 5), { MODERATE: 0.5, STRONG: 0.65, VERY_STRONG: 0.8 }),
    dataSupport: `${deltas.length} full rounds`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, clamp(drop / 5)),
    impactScore: getImpactScore(type),
    frequencyScore: clamp(drop / 5),
    sampleSize: deltas.length,
    estimatedStrokes: Math.round(drop * 10) / 10,
    difficulty: getDifficulty(type),
    category: 'Scoring',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzeWeatherScoringDrop(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const tagged = rounds
    .map(round => {
      const windy = isWindyRound(round);
      if (windy == null) return null;
      return { windy, score: round.score };
    })
    .filter(Boolean) as Array<{ windy: boolean; score: number }>;
  if (tagged.length < 4) return null;
  const windy = tagged.filter(r => r.windy);
  const calm = tagged.filter(r => !r.windy);
  if (windy.length < 2 || calm.length < 2) return null;
  const windyAvg = windy.reduce((s, r) => s + r.score, 0) / windy.length;
  const calmAvg = calm.reduce((s, r) => s + r.score, 0) / calm.length;
  const drop = windyAvg - calmAvg;
  if (drop < 3) return null;

  const type = PatternInsightType.WEATHER_SCORING_DROP;
  const confidenceCalc = calculateConfidenceScore(tagged.length, 4, clamp(drop / 6), 0.5, 1);
  if (confidenceCalc.confidence < 40) return null;
  return {
    type,
    title: getHandicapAwareTitle(type, userHandicap),
    patternObserved: `Windy rounds average ${drop.toFixed(1)} strokes higher than calmer rounds.`,
    whatThisIndicates: 'You need a repeatable wind plan for club choice and ball flight.',
    commonContributors: ['Under-clubbing into wind', 'Swinging harder instead of smoother', 'Over-penalizing misses in crosswinds'],
    whatToWorkOn: ['Take one extra club in wind', 'Use 75-80% swings', 'Target the fat side of greens and fairways'],
    confidence: confidenceCalc.confidence,
    stars: calculateStars(confidenceCalc.confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidenceCalc.confidence)),
    strengthLevel: getStrengthLevel(clamp(drop / 6), { MODERATE: 0.5, STRONG: 0.65, VERY_STRONG: 0.8 }),
    dataSupport: `${windy.length} windy rounds vs ${calm.length} calm rounds`,
    priority: calculatePriorityScore(getImpactScore(type), confidenceCalc.confidence / 100, clamp(drop / 6)),
    impactScore: getImpactScore(type),
    frequencyScore: clamp(drop / 6),
    sampleSize: tagged.length,
    estimatedStrokes: Math.round(drop * 10) / 10,
    difficulty: getDifficulty(type),
    category: 'Conditions',
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

function analyzeApproachContactPattern(rounds: SavedRound[], userHandicap?: number): PatternInsight | null {
  const clubDistances = rounds
    .map(
      round =>
        (round as SavedRound & {
          userProfileSnapshot?: { clubDistances?: Record<string, number> };
        }).userProfileSnapshot?.clubDistances
    )
    .find(distances => distances && Object.keys(distances).length > 0) || {};
  const analysis = analyzeClubYardages(rounds, clubDistances, userHandicap);
  const finding = analysis.primaryFinding;
  if (!finding) return null;

  const isContact = finding.type === 'CONTACT_INCONSISTENCY';
  const isGap = finding.type === 'BETWEEN_CLUBS_HESITATION';
  if (!isContact && !isGap) return null;

  const type = isContact
    ? PatternInsightType.APPROACH_CONTACT_INCONSISTENCY
    : PatternInsightType.BETWEEN_CLUBS_HESITATION;
  const sampleSize = analysis.analyzedBands
    .filter(band => (isContact ? band.pattern === 'INCONSISTENT' : band.pattern === 'GAP_HESITATION'))
    .reduce((sum, band) => sum + band.shotCount, 0);
  if (sampleSize < 8) return null;

  const confidence = finding.confidence === 'HIGH' ? 78 : finding.confidence === 'MEDIUM' ? 62 : 45;
  const impactScore = getImpactScore(type);
  const frequencyScore = clamp(sampleSize / 20, 0.2, 1);

  return {
    type,
    title: isContact ? 'Approach Contact Trend' : `Between Clubs at ${finding.band}`,
    patternObserved: finding.message,
    whatThisIndicates: isContact
      ? 'Misses split short and long from the same range usually point to strike-quality variation.'
      : 'Contact quality is solid, but indecision in a club gap is introducing short-side misses.',
    commonContributors: isContact
      ? ['Changing tempo between swings', 'Low-point inconsistency', 'Steering to force distance']
      : ['Late club decision', 'Lack of pre-shot commitment', 'Trying to force the shorter club'],
    whatToWorkOn: isContact
      ? ['Use one repeatable swing speed', 'Prioritize strike quality over yardage tweaking', 'Commit to full finish']
      : ['Default to the longer club in the gap', 'Decide before address', 'Commit to one smooth tempo'],
    confidence,
    stars: calculateStars(confidence),
    confidenceLabel: getConfidenceLabel(calculateStars(confidence)),
    strengthLevel: getStrengthLevel(
      isContact ? 0.72 : 0.66,
      { MODERATE: 0.55, STRONG: 0.7, VERY_STRONG: 0.8 }
    ),
    dataSupport: `${sampleSize} approach shots`,
    priority: calculatePriorityScore(impactScore, confidence / 100, frequencyScore),
    impactScore,
    frequencyScore,
    sampleSize,
    estimatedStrokes: estimateStrokesPerRound(
      sampleSize,
      Math.max(1, rounds.length),
      getPerEventImpact(type)
    ),
    difficulty: getDifficulty(type),
    category: 'Approach',
    coachExplanation: isContact
      ? 'This profile should be treated as a contact issue first. Club-yardage changes are secondary.'
      : 'This is a decision pattern. Standardizing gap-club selection removes hesitation misses.',
    beforeNextRound: [finding.preRoundMessage],
    progress: calculateInsightProgress(type, rounds, userHandicap),
  };
}

/**
 * Get suppression message for insights that don't meet confidence threshold
 */
export function getSuppressionMessage(reason: string): {title: string; message: string} {
  switch (reason) {
    case 'LOW_SAMPLE':
      return {
        title: 'More Shots Needed',
        message: 'This trend needs more shots before it is ready.'
      };
    case 'LOW_CONFIDENCE':
      return {
        title: 'Tip Not Shown',
        message: 'There is not enough steady history yet to show this tip.'
      };
    case 'INCONSISTENT':
      return {
        title: 'Trend Not Steady',
        message: 'This trend does not show up steadily enough across rounds yet.'
      };
    case 'CONFLICTING':
      return {
        title: 'Conditions Vary',
        message: 'Changing conditions make this tip less reliable right now.'
      };
    default:
      return {
        title: 'Too Early to Call',
        message: 'Early rounds can be noisy. This gets clearer over time.'
      };
  }
}

/**
 * Get practice drill for an insight type
 */
function getDrillForInsight(type: PatternInsightType, handicap: number | undefined): PracticeDrill | null {
  const tier = getHandicapTier(handicap);
  const drillTier = normalizeTier(tier);
  
  switch (type) {
    case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
    case PatternInsightType.FAIRWAYS_MISSED_LEFT:
      if (drillTier === 'LOW') {
        return {
          title: 'Tee Shot Start Line Control',
          duration: '15 min',
          category: 'TEE',
          steps: [
            'One alignment stick on feet',
            'Pick one intermediate target',
            'Same club throughout',
            'Score start line only (ignore curve)'
          ],
          constraints: {
            targetWindow: '8-10 yards',
            successGoal: '7/10 balls start in window'
          }
        };
      } else if (drillTier === 'MID') {
        return {
          title: 'Tee Shot Start Line',
          duration: '15 min',
          category: 'TEE',
          steps: [
            'Alignment stick on feet OR target line',
            'Same club throughout',
            'Pick a start window',
            'Check alignment between shots'
          ],
          constraints: {
            targetWindow: '12-15 yards',
            successGoal: '6/10 balls start in window'
          }
        };
      } else {
        return {
          title: 'Tee Shot Routine',
          duration: '15 min',
          category: 'TEE',
          steps: [
            'No alignment sticks required',
            'Focus on routine + commitment',
            'Aim for entire fairway',
            'Build confidence with solid contact'
          ],
          constraints: {
            targetWindow: 'Entire fairway',
            successGoal: 'Solid contact and confident swings'
          }
        };
      }
    
    case PatternInsightType.APPROACHES_MISSED_SHORT:
      if (drillTier === 'LOW') {
        return {
          title: 'Approach Distance Control',
          duration: '15 min',
          category: 'APPROACH',
          steps: [
            'One target',
            'Two clubs only',
            'Alternate clubs each shot',
            'Track carry distance'
          ],
          constraints: {
            successGoal: 'Carry must land pin-high or better'
          }
        };
      } else if (drillTier === 'MID') {
        return {
          title: 'Approach Distance Control',
          duration: '15 min',
          category: 'APPROACH',
          steps: [
            'One target',
            'One club',
            'Smooth tempo',
            'Full commitment to each swing'
          ],
          constraints: {
            successGoal: 'Finish at or past target, not short'
          }
        };
      } else {
        return {
          title: 'Approach Contact Quality',
          duration: '15 min',
          category: 'APPROACH',
          steps: [
            'Big target (center of green)',
            'Take more club than instinct',
            'Smooth, confident swings',
            'Focus on clean contact'
          ],
          constraints: {
            successGoal: 'Solid contact > distance precision'
          }
        };
      }
    
    case PatternInsightType.APPROACHES_MISSED_LONG:
      if (drillTier === 'LOW') {
        return {
          title: 'Approach Control',
          duration: '15 min',
          category: 'APPROACH',
          steps: [
            'One target',
            'Account for lie and spin',
            'Controlled tempo',
            'Track landing vs finish'
          ],
          constraints: {
            successGoal: 'Carry lands front half of green'
          }
        };
      } else if (drillTier === 'MID') {
        return {
          title: 'Approach Tempo',
          duration: '15 min',
          category: 'APPROACH',
          steps: [
            'One target',
            'Check lie conditions',
            'Swing at 80% effort',
            'Smooth tempo throughout'
          ],
          constraints: {
            successGoal: 'Consistent contact, back-edge or better'
          }
        };
      } else {
        return {
          title: 'Approach Control',
          duration: '15 min',
          category: 'APPROACH',
          steps: [
            'Big target (center of green)',
            'Take one less club sometimes',
            'Easy, smooth swings',
            'Focus on rhythm'
          ],
          constraints: {
            successGoal: 'Solid contact with smooth finish'
          }
        };
      }
    
    case PatternInsightType.HIGH_THREE_PUTT:
      if (drillTier === 'LOW') {
        return {
          title: 'Lag Putting Speed Control',
          duration: '10 min',
          category: 'PUTTING',
          steps: [
            'Start at 35-45 feet',
            'Hole location changes each set',
            'Vary slopes and speeds',
            'Score by leave distance, not makes'
          ],
          constraints: {
            successGoal: 'Finish inside 18 inches'
          }
        };
      } else if (drillTier === 'MID') {
        return {
          title: 'Lag Putting Speed',
          duration: '10 min',
          category: 'PUTTING',
          steps: [
            'Start at 30-40 feet',
            'Focus on speed, not line',
            'Leave uphill second putts',
            'Score by leave distance'
          ],
          constraints: {
            successGoal: 'Finish inside 3 feet'
          }
        };
      } else {
        return {
          title: 'Lag Putting',
          duration: '10 min',
          category: 'PUTTING',
          steps: [
            'Start at 20-30 feet',
            'Just get it close',
            'Don\'t worry about making it',
            'Build feel and confidence'
          ],
          constraints: {
            successGoal: 'Finish inside 5 feet'
          }
        };
      }
    
    case PatternInsightType.PENALTIES_HURTING_SCORES:
      if (tier === 'SCRATCH') {
        return {
          title: 'Pressure Decision Drill',
          duration: '15 min',
          category: 'TEE',
          steps: [
            '10 tee shots with a penalty consequence - if it goes to your miss side, treat it as OB',
            'Pick a landing zone that avoids your miss',
            'After each shot, score: safe zone hit or not',
            'No mulligans',
          ],
          constraints: { successGoal: '7/10 in safe zone' },
        };
      }
      if (tier === 'LOW') {
        return {
          title: 'Tee Shot Safety Drill',
          duration: '15 min',
          category: 'TEE',
          steps: [
            'Define a no-fly zone that matches your common penalty shape',
            'Hit 10 drives to a conservative target away from trouble',
            'Score each as safe zone vs would-be penalty',
            'Focus on target selection, not swing change',
          ],
          constraints: { successGoal: '8/10 avoid the no-fly zone' },
        };
      }
      if (tier === 'MID') {
        return {
          title: 'Conservative Tee Shot Practice',
          duration: '15 min',
          category: 'TEE',
          steps: [
            'Pick your most reliable club (not necessarily driver)',
            'Aim for the widest part of the fairway',
            'Hit 10 shots and accept any fairway-side result',
            'Note which club produced the safest outcomes',
          ],
          constraints: { successGoal: '7/10 in the fairway or near it' },
        };
      }
      if (tier === 'HIGH') {
        return {
          title: 'Safe Tee Shot',
          duration: '15 min',
          category: 'TEE',
          steps: [
            'Leave driver in the bag for this drill',
            'Use 3-wood or hybrid',
            'Hit 10 shots to a generous target area',
            'Count anything that stayed in-bounds',
          ],
          constraints: { successGoal: '8/10 in play' },
        };
      }
      return {
        title: 'Keep It In Play',
        duration: '15 min',
        category: 'TEE',
        steps: [
          'Tee up the most forgiving club you have',
          'Swing at 70% - not full power',
          'Count how many stay in your safe area',
          'Slower usually means straighter',
        ],
        constraints: { successGoal: '7/10 in a safe area' },
      };

    case PatternInsightType.LOW_SHORT_PUTT_MAKE_RATE:
      if (tier === 'SCRATCH') {
        return {
          title: 'Short Putt Pressure Ladder',
          duration: '12 min',
          category: 'PUTTING',
          steps: [
            '4 balls in a circle at 3 feet, all 4 quadrants',
            'Make all 4 to advance to 4 feet, then 5 feet',
            'If any miss, restart at 3 feet',
            'Track highest completed rung',
          ],
          constraints: { successGoal: 'Reach 5-foot circle without missing' },
        };
      }
      if (tier === 'LOW') {
        return {
          title: 'Short Putt Routine Lock-In',
          duration: '10 min',
          category: 'PUTTING',
          steps: ['3 feet, uphill only', 'Same pre-putt routine each rep', 'Eyes on hole until drop', '5 sets of 5'],
          constraints: { successGoal: '22/25 made' },
        };
      }
      if (tier === 'MID') {
        return {
          title: 'Short Putt Routine',
          duration: '10 min',
          category: 'PUTTING',
          steps: ['3-4 feet, straight putts only', 'No decel through impact', 'Build out from tap-in range', '20 putts total'],
          constraints: { successGoal: '16/20 made' },
        };
      }
      if (tier === 'HIGH') {
        return {
          title: 'Make More Short Putts',
          duration: '10 min',
          category: 'PUTTING',
          steps: ['Set tee 3 feet from cup', 'Roll putts firm enough to reach back of cup', 'Accept long misses, avoid short ones', '15 putts'],
          constraints: { successGoal: '11/15 made' },
        };
      }
      return {
        title: 'Short Putt Touch',
        duration: '10 min',
        category: 'PUTTING',
        steps: ['Start at 18 inches', 'Move to 2.5 feet', 'Roll every ball toward center', '10 putts total'],
        constraints: { successGoal: '7/10 made' },
      };

    case PatternInsightType.LOW_UP_DOWN_RATE:
      if (tier === 'SCRATCH') return { title: 'Up and Down Simulation', duration: '20 min', category: 'APPROACH', steps: ['Drop 5 balls from 5 lies', 'Chip and putt everything out', 'Vary lies each set', 'Track conversion across 20 attempts'], constraints: { successGoal: '11/20 up-and-downs made' } };
      if (tier === 'LOW') return { title: 'Up and Down Conversion', duration: '15 min', category: 'APPROACH', steps: ['5 balls from 20 yards', 'Chip then putt out every rep', 'Rotate lies each set', 'No mulligans'], constraints: { successGoal: '8/15 up-and-downs made' } };
      if (tier === 'MID') return { title: 'Chip and One-Putt', duration: '15 min', category: 'APPROACH', steps: ['5 balls from 15 yards', 'Get every chip on green first', 'Putt everything out', 'Count finishes inside 5 feet'], constraints: { successGoal: '8/15 chips within 5 feet' } };
      if (tier === 'HIGH') return { title: 'Chip Onto Green', duration: '15 min', category: 'APPROACH', steps: ['Easy fringe lie only', 'Land every ball on green', 'Use one reliable chip shot', '15 attempts'], constraints: { successGoal: '12/15 on the green' } };
      return { title: 'Get It On, Get It Down', duration: '15 min', category: 'APPROACH', steps: ['Bump-and-run from just off green', 'Two shots to finish is a win', 'No hero chips yet', '10 attempts'], constraints: { successGoal: '2 shots or fewer, 7/10 times' } };

    case PatternInsightType.POOR_BUNKER_SAVES:
      if (tier === 'SCRATCH') return { title: 'Bunker Distance Control', duration: '15 min', category: 'APPROACH', steps: ['3 flag distances: 10/15/20 yards', 'Hit to each with same lie', 'Track short/at/past flag', 'Adjust face and swing length'], constraints: { successGoal: 'Within 6 feet on 7/15' } };
      if (tier === 'LOW') return { title: 'Bunker Exit + Distance', duration: '15 min', category: 'APPROACH', steps: ['Flat bunker, one 15-yard flag', 'Open face and dig feet in', 'Hit 2 inches behind ball', 'Land on green near flag'], constraints: { successGoal: '10/15 on green near flag' } };
      if (tier === 'MID') return { title: 'Consistent Bunker Exit', duration: '15 min', category: 'APPROACH', steps: ['Flat greenside bunker', 'Open stance + open face', 'Swing through sand, finish high', 'Prioritize clean exits'], constraints: { successGoal: '12/15 exits on the green' } };
      if (tier === 'HIGH') return { title: 'Get Out of the Bunker', duration: '15 min', category: 'APPROACH', steps: ['Easy flat lie only', 'Swing past impact', 'Take plenty of sand', 'Count successful exits'], constraints: { successGoal: '9/15 exits on the green' } };
      return { title: 'Bunker First Exit', duration: '15 min', category: 'APPROACH', steps: ['Easy flat lie only', 'Full swing, no slowdown', 'Anything on green is a win', '10 attempts'], constraints: { successGoal: '6/10 on the green' } };

    case PatternInsightType.WEAK_PAR3_SCORING:
      if (tier === 'SCRATCH') return { title: 'Par 3 Simulation (Pressure)', duration: '20 min', category: 'APPROACH', steps: ['Pick 3 typical par-3 distances', 'One ball per hole with full routine', 'Score GIR only', 'Play 9 simulated holes'], constraints: { successGoal: '6/9 greens hit' } };
      if (tier === 'LOW') return { title: 'Par 3 Club Commitment', duration: '15 min', category: 'APPROACH', steps: ['Pick 2 common distances', 'Commit to club before setup', '5 balls per distance', 'Track GIR + miss direction'], constraints: { successGoal: '6/10 on green' } };
      if (tier === 'MID') return { title: 'Par 3 Commitment Drill', duration: '15 min', category: 'APPROACH', steps: ['One distance, one club', 'Full routine each shot', 'Center-green only', '10 shots'], constraints: { successGoal: '5/10 on green' } };
      if (tier === 'HIGH') return { title: 'Par 3 Targeting', duration: '15 min', category: 'APPROACH', steps: ['Use full green as target', 'Most reliable iron only', 'Same club all 15 shots', 'Focus clean contact'], constraints: { successGoal: '7/15 on or near green' } };
      return { title: 'Par 3 Iron Practice', duration: '15 min', category: 'APPROACH', steps: ['Pick comfortable short par-3 distance', 'Make contact and swing through', 'Aim for green not pin', '10 shots'], constraints: { successGoal: '5/10 solid contact' } };

    case PatternInsightType.POOR_PAR5_SCORING:
      if (tier === 'SCRATCH') return { title: 'Par 5 Third Shot Approach', duration: '20 min', category: 'APPROACH', steps: ['Simulate 80-110 yard third shots', '10 approaches', 'Track birdie-range proximity', 'Record GIR + proximity'], constraints: { successGoal: '6/10 within 20 feet' } };
      if (tier === 'LOW') return { title: 'Par 5 Layup Accuracy', duration: '15 min', category: 'TEE', steps: ['Use stock layup club', '10 shots to 50-yard landing zone', 'No hero shots', 'Confirm favorite third-shot distance'], constraints: { successGoal: '8/10 in landing zone' } };
      if (tier === 'MID') return { title: 'Par 5 Two-Shot Practice', duration: '15 min', category: 'TEE', steps: ['Drive to comfort zone', 'Layup to 80-100 yards', 'Practice layup shot 10 reps', 'Count target-zone hits'], constraints: { successGoal: '7/10 layups in zone' } };
      if (tier === 'HIGH') return { title: 'Par 5 Bogey Elimination', duration: '15 min', category: 'TEE', steps: ['Stock fairway wood or hybrid only', 'Target 180+ yards in play', 'No green-seeking second shots', '10 reps'], constraints: { successGoal: '8/10 in play and advanced' } };
      return { title: 'Par 5 Step by Step', duration: '15 min', category: 'TEE', steps: ['Hit reliable club three times in a row', 'Treat par 5 as three separate shots', 'No pressure to reach in two', '9 total shots'], constraints: { successGoal: 'All 9 shots in play' } };

    case PatternInsightType.APPROACH_DISTANCE_WEAKNESS:
      if (tier === 'SCRATCH') return { title: 'Distance Band Sharpening', duration: '20 min', category: 'APPROACH', steps: ['Use 2 clubs for weak band', 'Alternate 6 shots each', 'Track short/on/long outcomes', 'Identify better performer'], constraints: { successGoal: '8/12 greens hit from band' } };
      if (tier === 'LOW') return { title: 'Distance Band Focus', duration: '15 min', category: 'APPROACH', steps: ['Two clubs, 5 shots each', 'Center-green target only', 'Track clean contact vs mishit', 'Alternate every 5 shots'], constraints: { successGoal: '7/10 clean contact' } };
      if (tier === 'MID') return { title: 'Distance Zone Practice', duration: '15 min', category: 'APPROACH', steps: ['Use most comfortable club in band', '10 shots to one target', 'Smooth tempo focus', 'Test if more club improves outcome'], constraints: { successGoal: '6/10 on or near green' } };
      if (tier === 'HIGH') return { title: 'Iron Zone Practice', duration: '15 min', category: 'APPROACH', steps: ['Use one extra club', '10 smooth swings', 'Whole green is target', 'Do not force speed'], constraints: { successGoal: '5/10 on green' } };
      return { title: 'Club Practice by Zone', duration: '15 min', category: 'APPROACH', steps: ['Use your normal club for this distance', 'Focus clean strikes', '15 shots total', 'Count solid contact only'], constraints: { successGoal: '10/15 solid strikes' } };

    case PatternInsightType.BACK_NINE_SCORING_DROP:
      if (tier === 'SCRATCH') return { title: 'Late-Round Focus Practice', duration: '15 min', category: 'APPROACH', steps: ['Simulate holes 15-18 pressure', '5-shot challenge with consequences', 'Use full tournament routine', 'Score against simulated par'], constraints: { successGoal: 'Even or better vs simulated par' } };
      if (tier === 'LOW') return { title: 'Fatigue Swing Drill', duration: '20 min', category: 'APPROACH', steps: ['Hit 30 prep balls first', 'Then 10 quality routine reps', 'Compare contact quality late', 'Track decision quality under fatigue'], constraints: { successGoal: 'Consistent contact on all 10' } };
      if (tier === 'MID') return { title: 'Back Nine Routine', duration: '15 min', category: 'APPROACH', steps: ['Set up 5 mixed shot types', 'Full routine every shot', 'Keep same pace and commitment', 'Simulate holes 16-18'], constraints: { successGoal: 'Routine held for all 5 shots' } };
      return { title: 'Consistent Finish', duration: '15 min', category: 'APPROACH', steps: ['End session with best 10 swings', 'Slow down between shots', 'One target for all 10', 'Quality over quantity'], constraints: { successGoal: '7/10 in target area' } };

    case PatternInsightType.PAR4_SCORING_STRUGGLE:
      if (tier === 'SCRATCH') return { title: 'Par 4 Hole Simulation', duration: '20 min', category: 'TEE', steps: ['Simulate: driver, approach, putt out', 'Full routine each shot', 'Play 5 simulated holes', 'Track score by hole'], constraints: { successGoal: '3/5 at bogey or better' } };
      if (tier === 'LOW') return { title: 'Par 4 Decision Chain', duration: '15 min', category: 'TEE', steps: ['Set typical par-4 distance', 'Practice tee + approach chain', 'Commit before every shot', 'Run 6 sets'], constraints: { successGoal: 'Committed plan on both shots every set' } };
      if (tier === 'MID') return { title: 'Par 4 Play Smart', duration: '15 min', category: 'APPROACH', steps: ['Practice typical par-4 approaches', 'Center-green target only', '10 approach reps', 'Track GIR and near-miss'], constraints: { successGoal: '5/10 on green' } };
      if (tier === 'HIGH') return { title: 'Par 4 Approach', duration: '15 min', category: 'APPROACH', steps: ['Practice 130-150 yard approaches', 'Aim fat side of green', '12 shots total', 'Smooth committed swing'], constraints: { successGoal: '6/12 on green' } };
      return { title: 'Par 4 Scoring Contact', duration: '15 min', category: 'APPROACH', steps: ['Focus solid approach contact', 'Whole green target', '10 shots total', 'No pin chasing'], constraints: { successGoal: '5/10 solid and on green' } };

    case PatternInsightType.HIGH_BOGEY_CONVERSION:
      if (tier === 'SCRATCH' || tier === 'LOW') return { title: 'Reset Shot Practice', duration: '15 min', category: 'APPROACH', steps: ['Hit one deliberate miss', 'Take 3-breath reset', 'Hit full-routine recovery shot', 'Run 5 miss-reset pairs'], constraints: { successGoal: '4/5 recovery shots on target' } };
      if (tier === 'MID') return { title: 'Bounce Back Drill', duration: '15 min', category: 'APPROACH', steps: ['Hit any shot', 'Say reset out loud', 'Pick new target and recommit', 'Run 10 pairs'], constraints: { successGoal: '7/10 second shots on target' } };
      return { title: 'One Shot at a Time', duration: '10 min', category: 'APPROACH', steps: ['Say next shot after every miss', 'Refocus on shot in front of you', '10 approach shots with reset each rep', 'Do not track prior outcome'], constraints: { successGoal: 'Full attention on each shot' } };

    case PatternInsightType.FRONT_NINE_BLOWUP:
      if (tier === 'SCRATCH' || tier === 'LOW') return { title: 'First 3 Holes Simulation', duration: '20 min', category: 'TEE', steps: ['Structured warm-up first (chips + putts + irons)', 'Then simulate first 3 holes', 'No extra practice swings counting', 'Treat every first shot as live'], constraints: { successGoal: '+3 or better on 3 simulated holes' } };
      if (tier === 'MID') return { title: 'Pre-Round Warm-Up Structure', duration: '20 min', category: 'APPROACH', steps: ['10 putts (5 short, 5 lag)', '5 chips', '5 irons', '3 driver swings'], constraints: { successGoal: 'Leave warm-up with one simple feel' } };
      return { title: 'Warm Up Before You Start', duration: '15 min', category: 'APPROACH', steps: ['Chip 10 balls first', 'Hit 10 mid-irons', 'Hit 5 drivers with no miss-counting', 'Start round loose, not cold'], constraints: { successGoal: 'Loose and ready before hole 1' } };

    case PatternInsightType.WEATHER_SCORING_DROP:
      if (tier === 'SCRATCH') return { title: 'Wind Shot Shaping', duration: '20 min', category: 'APPROACH', steps: ['Hit 5 knockdowns', 'Hit 5 into headwind and 5 with tailwind targets', 'Track distance deltas vs stock', 'Track launch and line control'], constraints: { successGoal: 'Knockdown flies 85-90% stock distance consistently' } };
      if (tier === 'LOW') return { title: 'Knockdown Iron Practice', duration: '15 min', category: 'APPROACH', steps: ['Choke down 1 inch', '3/4 swing with ball slightly back', '10 shots at one target', 'Compare carry to stock'], constraints: { successGoal: 'Consistent trajectory at 80-90% stock distance' } };
      if (tier === 'MID') return { title: 'Wind Club Selection Practice', duration: '15 min', category: 'APPROACH', steps: ['Pick one target distance', 'Hit normal club then one-more-club/easy swing', 'Compare consistency', '10 comparison shots'], constraints: { successGoal: 'Find your best wind shot' } };
      return { title: 'Swing Easy in Wind', duration: '15 min', category: 'APPROACH', steps: ['Take one extra club', 'Swing at 75% effort', 'Compare contact vs full speed', '10 shots total'], constraints: { successGoal: '8/10 solid contact with controlled swing' } };

    case PatternInsightType.APPROACH_CONTACT_INCONSISTENCY:
      if (tier === 'SCRATCH' || tier === 'LOW') return { title: 'Contact Baseline Drill', duration: '20 min', category: 'APPROACH', steps: ['Pick one iron and one target distance', 'Hit 10 balls at 70% speed', 'Track flush/thin/fat contact', 'Hit 10 at 85% and compare'], constraints: { successGoal: 'Find speed with 8/10 flush contact' } };
      if (tier === 'MID') return { title: 'Swing Speed Calibration', duration: '15 min', category: 'APPROACH', steps: ['One club, one target', 'Alternate easy and normal tempo', 'Track which gives cleaner contact', 'Ignore exact distance outcome'], constraints: { successGoal: '7/10 clean strikes' } };
      return { title: 'One Swing Speed Drill', duration: '15 min', category: 'APPROACH', steps: ['Pick a comfortable mid-iron', 'Use the same tempo every shot', 'Do not adjust between balls', 'Count clean strikes over 15 balls'], constraints: { successGoal: '9/15 clean contact' } };

    case PatternInsightType.BETWEEN_CLUBS_HESITATION:
      if (tier === 'SCRATCH') return { title: 'Gap Distance Decision Drill', duration: '20 min', category: 'APPROACH', steps: ['6 shots with shorter club full speed', '6 shots with longer club at 85%', 'Track GIR and dispersion', 'Declare a standing rule club'], constraints: { successGoal: 'Clear winner by tighter dispersion' } };
      if (tier === 'LOW') return { title: 'Commit to the Longer Club', duration: '15 min', category: 'APPROACH', steps: ['Set target at gap distance', 'Hit only longer club', '10 shots no switching', 'Track at/over target frequency'], constraints: { successGoal: '7/10 at or past target' } };
      return { title: 'Between Clubs Routine', duration: '15 min', category: 'APPROACH', steps: ['When unsure, take longer club', '10 shots from trouble distance', 'Commit to full swing each rep', 'Avoid steering the shot'], constraints: { successGoal: '6/10 on or near green' } };
    
    default:
      return null;
  }
}

/**
 * Generate practice plan from insights
 */
export function generatePracticePlan(insights: PatternInsight[], userHandicap?: number): PracticePlan {
  const drills: PracticeDrill[] = [];
  const categories = new Set<string>();
  
  // Get drills for top 3 insights, avoid duplicates
  for (const insight of insights.slice(0, 3)) {
    const drill = getDrillForInsight(insight.type, userHandicap);
    
    if (drill && !categories.has(drill.category)) {
      drills.push(drill);
      categories.add(drill.category);
    }
    
    if (drills.length >= 3) break;
  }
  
  // Calculate total duration
  const totalMinutes = drills.reduce((sum, drill) => {
    const match = drill.duration.match(/(\d+)/);
    return sum + (match ? parseInt(match[1]) : 0);
  }, 0);
  
  // Generate quick warm-up focus
  const quickWarmUp = {
    duration: '5 min',
    steps: [] as string[]
  };
  
  if (drills.some(d => d.category === 'TEE')) {
    quickWarmUp.steps.push('3 tee shots focusing on start line');
  }
  if (drills.some(d => d.category === 'APPROACH')) {
    quickWarmUp.steps.push('5 approach shots with full commitment');
  }
  if (drills.some(d => d.category === 'PUTTING')) {
    quickWarmUp.steps.push('5 lag putts focusing on speed');
  }
  
  if (quickWarmUp.steps.length === 0) {
    quickWarmUp.steps.push('3 tee shots', '3 approach shots', '3 putts');
  }
  
  return {
    drills,
    totalDuration: `${totalMinutes} min`,
    quickWarmUp
  };
}

/**
 * Generate "One Rule to Remember" based on insight combination
 */
function getOneRule(insights: PatternInsight[], handicap: number | undefined): string {
  const tier = normalizeTier(getHandicapTier(handicap));
  
  // Check for penalties
  if (insights.some(i => i.type === PatternInsightType.PENALTIES_HURTING_SCORES)) {
    return 'One safe miss is fine. Two is not.';
  }
  
  // Check for driving patterns
  if (insights.some(i => i.type === PatternInsightType.FAIRWAYS_MISSED_RIGHT || i.type === PatternInsightType.FAIRWAYS_MISSED_LEFT)) {
    if (tier === 'LOW') return 'Commit to the shot you choose.';
    if (tier === 'MID') return 'Trust your setup, not mid-round adjustments.';
    return 'Play the next shot, not the last one.';
  }
  
  // Check for approach patterns
  if (insights.some(i => i.type === PatternInsightType.APPROACHES_MISSED_SHORT || i.type === PatternInsightType.APPROACHES_MISSED_LONG)) {
    if (tier === 'LOW') return 'Commit fully to club choice.';
    if (tier === 'MID') return 'Trust the number, swing smoothly.';
    return 'Take enough club and swing easy.';
  }
  
  // Check for putting
  if (insights.some(i => i.type === PatternInsightType.HIGH_THREE_PUTT)) {
    return 'Speed first, line second on long putts.';
  }
  
  // Default
  return 'Play your game, not someone else\'s.';
}

/**
 * Map insight to game plan focus
 */
function mapInsightToGamePlan(insight: PatternInsight, handicap: number | undefined): { title: string; focus: string[] } | null {
  const tier = normalizeTier(getHandicapTier(handicap));
  
  switch (insight.type) {
    case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
    case PatternInsightType.FAIRWAYS_MISSED_LEFT:
      return {
        title: 'Off the tee',
        focus: tier === 'LOW' 
          ? [
              'Control start line before adjusting targets',
              'Pick an intermediate target',
              'Commit to alignment'
            ]
          : tier === 'MID'
          ? [
              'Favor center-fairway targets',
              'Commit to start line, not curve',
              'Avoid aiming adjustments mid-round'
            ]
          : [
              'Use your most reliable club',
              'Aim for the widest part of the fairway',
              'Build a simple pre-shot routine'
            ]
      };
    
    case PatternInsightType.APPROACHES_MISSED_SHORT:
      return {
        title: 'Approach shots',
        focus: tier === 'LOW'
          ? [
              'Trust carry numbers',
              'Commit fully to club choice',
              'Aim middle when in doubt'
            ]
          : tier === 'MID'
          ? [
              'Trust the yardage',
              'Commit to the full swing',
              'Favor middle-of-green targets'
            ]
          : [
              'Take one more club than instinct',
              'Swing smoothly',
              'Aim for the biggest part of the green'
            ]
      };
    
    case PatternInsightType.APPROACHES_MISSED_LONG:
      return {
        title: 'Approach shots',
        focus: tier === 'LOW'
          ? [
              'Account for lie and spin',
              'Pick back-edge targets',
              'Control tempo'
            ]
          : tier === 'MID'
          ? [
              'Check lie conditions',
              'Aim for safe back targets',
              'Smooth tempo beats extra speed'
            ]
          : [
              'Take one less club sometimes',
              'Easy swings',
              'Center of green is always good'
            ]
      };
    
    case PatternInsightType.PENALTIES_HURTING_SCORES:
      return {
        title: 'Scoring priority',
        focus: [
          'Eliminate penalty shots',
          'Take your medicine early',
          'One mistake is okay, avoid compounding'
        ]
      };
    
    case PatternInsightType.HIGH_THREE_PUTT:
      // Will be added as putting focus
      return null;
    
    default:
      return null;
  }
}

/**
 * Get putting focus based on handicap
 */
function getPuttingFocus(insights: PatternInsight[], handicap: number | undefined): { title: string; focus: string[] } {
  const tier = normalizeTier(getHandicapTier(handicap));
  const hasThreePuttIssue = insights.some(i => i.type === PatternInsightType.HIGH_THREE_PUTT);
  
  if (hasThreePuttIssue) {
    return {
      title: 'On the greens',
      focus: tier === 'LOW'
        ? [
            'Prioritize speed on long putts',
            'Leave uphill second putts',
            'Distance control > line from 25+ feet'
          ]
        : tier === 'MID'
        ? [
            'Prioritize speed on long putts',
            'Avoid downhill second putts',
            'Get it close, not in'
          ]
        : [
            'Get the first putt close',
            'Don\'t worry about making long putts',
            'Inside 5 feet is great'
          ]
    };
  }
  
  // Default putting focus if no specific issue
  return {
    title: 'On the greens',
    focus: tier === 'LOW'
      ? ['Trust your read and commit']
      : tier === 'MID'
      ? ['Read once, trust it']
      : ['Keep it simple, stay confident']
  };
}

/**
 * Generate Game Plan Card for pre-round focus
 */
export function generateGamePlanCard(insights: PatternInsight[], userHandicap?: number): GamePlanCard {
  const sections: { title: string; focus: string[] }[] = [];
  
  // Get top 2 insights (excluding 3-putt since it becomes putting focus)
  const topInsights = insights
    .filter(i => i.type !== PatternInsightType.HIGH_THREE_PUTT)
    .slice(0, 2);
  
  // Map insights to game plan sections
  for (const insight of topInsights) {
    const section = mapInsightToGamePlan(insight, userHandicap);
    if (section) {
      sections.push(section);
    }
  }
  
  // Always add putting focus
  sections.push(getPuttingFocus(insights, userHandicap));
  
  // Limit to 3 sections
  const finalSections = sections.slice(0, 3);
  
  // Generate "one rule"
  const oneRule = getOneRule(insights, userHandicap);
  
  return {
    sections: finalSections,
    oneRule
  };
}

/**
 * Format insight for display
 */
export function getInsightFooter(): string {
  return 'These trends come from your rounds, not one shot. Use them to guide decisions and practice, not to diagnose your swing.';
}
