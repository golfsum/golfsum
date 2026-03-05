import { PatternInsightType } from './typesEnums';

export const MIN_TEE_SHOTS = 6;
export const MIN_APPROACH_SHOTS = 6;
export const MIN_LONG_PUTTS = 6;
export const MIN_SHORT_PUTTS = 6;
export const MIN_PENALTY_ROUNDS = 1;

export const DRIVING_THRESHOLDS = {
  MODERATE: 0.60,
  STRONG: 0.70,
  VERY_STRONG: 0.80,
  MIN_FAIRWAYS_HIT: 3,
};

export const APPROACH_DEPTH_THRESHOLDS = {
  MODERATE: 0.55,
  STRONG: 0.65,
  VERY_STRONG: 0.75,
};

export const APPROACH_DIRECTION_THRESHOLDS = {
  MODERATE: 0.60,
  STRONG: 0.70,
  VERY_STRONG: 0.80,
};

export const PUTTING_THREE_PUTT_THRESHOLDS = {
  MODERATE: 0.20,
  STRONG: 0.25,
  VERY_STRONG: 0.35,
  MIN_TOTAL_PUTTS: 18,
};

export const PENALTY_THRESHOLDS = {
  MODERATE: 2.0,
  STRONG: 3.0,
  VERY_STRONG: 4.0,
};

export const BENCHMARKS = {
  FAIRWAYS_HIT: {
    0: 0.625,
    6: 0.575,
    11: 0.525,
    16: 0.475,
    21: 0.425,
  },
  GREENS_IN_REGULATION: {
    0: 0.675,
    6: 0.575,
    11: 0.475,
    16: 0.375,
    21: 0.275,
  },
  APPROACH_MISS_SHORT: {
    0: 0.40,
    6: 0.45,
    11: 0.50,
    16: 0.55,
    21: 0.60,
  },
  THREE_PUTT_RATE: {
    0: 0.065,
    6: 0.10,
    11: 0.15,
    16: 0.215,
    21: 0.30,
  },
  PENALTIES_PER_ROUND: {
    0: 0.25,
    6: 0.75,
    11: 1.25,
    16: 1.75,
    21: 2.5,
  },
};

export const IMPACT_SCORES = {
  [PatternInsightType.PENALTIES_HURTING_SCORES]: 1.00,
  [PatternInsightType.FAIRWAYS_MISSED_RIGHT]: 0.85,
  [PatternInsightType.FAIRWAYS_MISSED_LEFT]: 0.85,
  [PatternInsightType.WIND_FAIRWAY_ACCURACY_DROP]: 0.80,
  [PatternInsightType.APPROACHES_MISSED_SHORT]: 0.75,
  [PatternInsightType.APPROACHES_MISSED_LONG]: 0.75,
  [PatternInsightType.HIGH_THREE_PUTT]: 0.70,
  [PatternInsightType.LOW_SHORT_PUTT_MAKE_RATE]: 0.65,
  [PatternInsightType.GREENS_MISSED_LEFT]: 0.60,
  [PatternInsightType.GREENS_MISSED_RIGHT]: 0.60,
  [PatternInsightType.LOW_UP_DOWN_RATE]: 0.72,
  [PatternInsightType.POOR_BUNKER_SAVES]: 0.68,
  [PatternInsightType.WEAK_PAR3_SCORING]: 0.65,
  [PatternInsightType.POOR_PAR5_SCORING]: 0.58,
  [PatternInsightType.APPROACH_DISTANCE_WEAKNESS]: 0.70,
  [PatternInsightType.BACK_NINE_SCORING_DROP]: 0.62,
  [PatternInsightType.PAR4_SCORING_STRUGGLE]: 0.75,
  [PatternInsightType.HIGH_BOGEY_CONVERSION]: 0.60,
  [PatternInsightType.FRONT_NINE_BLOWUP]: 0.60,
  [PatternInsightType.WEATHER_SCORING_DROP]: 0.55,
  [PatternInsightType.APPROACH_CONTACT_INCONSISTENCY]: 0.72,
  [PatternInsightType.BETWEEN_CLUBS_HESITATION]: 0.66,
};

export const STROKE_IMPACT_PER_EVENT: Record<PatternInsightType, number> = {
  [PatternInsightType.PENALTIES_HURTING_SCORES]: 1.0,
  [PatternInsightType.HIGH_THREE_PUTT]: 0.8,
  [PatternInsightType.FAIRWAYS_MISSED_LEFT]: 0.25,
  [PatternInsightType.FAIRWAYS_MISSED_RIGHT]: 0.25,
  [PatternInsightType.WIND_FAIRWAY_ACCURACY_DROP]: 0.25,
  [PatternInsightType.APPROACHES_MISSED_SHORT]: 0.2,
  [PatternInsightType.APPROACHES_MISSED_LONG]: 0.2,
  [PatternInsightType.GREENS_MISSED_LEFT]: 0.2,
  [PatternInsightType.GREENS_MISSED_RIGHT]: 0.2,
  [PatternInsightType.LOW_SHORT_PUTT_MAKE_RATE]: 0.3,
  [PatternInsightType.LOW_UP_DOWN_RATE]: 0.4,
  [PatternInsightType.POOR_BUNKER_SAVES]: 0.35,
  [PatternInsightType.WEAK_PAR3_SCORING]: 0.35,
  [PatternInsightType.POOR_PAR5_SCORING]: 0.25,
  [PatternInsightType.APPROACH_DISTANCE_WEAKNESS]: 0.35,
  [PatternInsightType.BACK_NINE_SCORING_DROP]: 0.3,
  [PatternInsightType.PAR4_SCORING_STRUGGLE]: 0.45,
  [PatternInsightType.HIGH_BOGEY_CONVERSION]: 0.3,
  [PatternInsightType.FRONT_NINE_BLOWUP]: 0.25,
  [PatternInsightType.WEATHER_SCORING_DROP]: 0.2,
  [PatternInsightType.APPROACH_CONTACT_INCONSISTENCY]: 0.35,
  [PatternInsightType.BETWEEN_CLUBS_HESITATION]: 0.25,
};
