import { Insight } from '../types';
import { PatternInsightType } from '../services/patternInsights';

export type InsightCategory =
  | 'Scoring Outcomes'
  | 'Putting'
  | 'Tee Shots'
  | 'Approach Play'
  | 'Short Game & Scrambling'
  | 'Course Management'
  | 'Consistency & Variance'
  | 'Positive Reinforcement'
  | 'Milestones & Personal Bests';

export type RequiredStat = 'putts' | 'fir' | 'gir' | 'scrambling' | 'penalties' | 'bunkers';

export interface InsightEligibility {
  minRoundsRequired: number;
  requiredStats: RequiredStat[];
  confidenceThreshold: number;
  minStrokeImpact: number;
  cooldownRounds: number;
}

const DEFAULT_ELIGIBILITY: InsightEligibility = {
  minRoundsRequired: 3,
  requiredStats: [],
  confidenceThreshold: 0.6,
  minStrokeImpact: 0.3,
  cooldownRounds: 3,
};

export const PATTERN_ELIGIBILITY: Record<PatternInsightType, InsightEligibility> = {
  [PatternInsightType.FAIRWAYS_MISSED_RIGHT]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['fir'],
  },
  [PatternInsightType.FAIRWAYS_MISSED_LEFT]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['fir'],
  },
  [PatternInsightType.WIND_FAIRWAY_ACCURACY_DROP]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['fir'],
  },
  [PatternInsightType.APPROACHES_MISSED_SHORT]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['gir'],
  },
  [PatternInsightType.APPROACHES_MISSED_LONG]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['gir'],
  },
  [PatternInsightType.GREENS_MISSED_LEFT]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['gir'],
  },
  [PatternInsightType.GREENS_MISSED_RIGHT]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['gir'],
  },
  [PatternInsightType.HIGH_THREE_PUTT]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['putts'],
  },
  [PatternInsightType.LOW_SHORT_PUTT_MAKE_RATE]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['putts'],
  },
  [PatternInsightType.PENALTIES_HURTING_SCORES]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['penalties'],
  },
  [PatternInsightType.LOW_UP_DOWN_RATE]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['scrambling'],
  },
  [PatternInsightType.POOR_BUNKER_SAVES]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['bunkers'],
  },
  [PatternInsightType.WEAK_PAR3_SCORING]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: [],
  },
  [PatternInsightType.POOR_PAR5_SCORING]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: [],
  },
  [PatternInsightType.APPROACH_DISTANCE_WEAKNESS]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['gir'],
  },
  [PatternInsightType.BACK_NINE_SCORING_DROP]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: [],
  },
  [PatternInsightType.PAR4_SCORING_STRUGGLE]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: [],
  },
  [PatternInsightType.HIGH_BOGEY_CONVERSION]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: [],
  },
  [PatternInsightType.FRONT_NINE_BLOWUP]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: [],
  },
  [PatternInsightType.WEATHER_SCORING_DROP]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: [],
  },
  [PatternInsightType.APPROACH_CONTACT_INCONSISTENCY]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['gir'],
  },
  [PatternInsightType.BETWEEN_CLUBS_HESITATION]: {
    ...DEFAULT_ELIGIBILITY,
    requiredStats: ['gir'],
  },
};

export const INSIGHT_ID_ELIGIBILITY: Record<string, InsightEligibility> = {
  'putting-opportunity': { ...DEFAULT_ELIGIBILITY, requiredStats: ['putts'] },
  'putting-strength': { ...DEFAULT_ELIGIBILITY, requiredStats: ['putts'] },
  'putting-improving': { ...DEFAULT_ELIGIBILITY, requiredStats: ['putts'] },
  'gir-opportunity': { ...DEFAULT_ELIGIBILITY, requiredStats: ['gir'] },
  'consistency-opportunity': { ...DEFAULT_ELIGIBILITY },
  'scoring-improving': { ...DEFAULT_ELIGIBILITY },
  'best-score-recent': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'baseline-established': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 2, requiredStats: [] },
  'tee-club-accuracy': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['fir'] },
  'tee-miss-pattern': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['fir'] },
  'approach-club-accuracy': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'approach-distance-accuracy': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'positive-putting': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 1, requiredStats: ['putts'] },
  'positive-driving': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 1, requiredStats: ['fir'] },
  'positive-approach': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 1, requiredStats: ['gir'] },
  'positive-scrambling': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 1, requiredStats: ['scrambling'] },
  'so-high-bogey-rate': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'so-double-plus-frequency': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'so-par5-gap': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'so-par3-gap': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'so-par4-gap': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'pr-driving-improved': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['fir'] },
  'pr-gir-improved': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'pb-lowest-score': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'sg-low-scrambling': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['scrambling'] },
  'sg-scrambling-strength': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['scrambling'] },
  'a-par3-gir-deficiency': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'a-approach-distance-gap': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'c-front-back-disparity': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'cm-aggressive-targeting-penalty': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['penalties'] },
  'cm-compounding-errors': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'cm-par5-decision-errors': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'cm-smart-management': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'so-birdie-conversion-inefficiency': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'so-birdie-conversion-inefficiency-extended': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'so-missed-scoring-opportunities': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'so-scoring-volatility': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'pb-best-fir': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['fir'] },
  'pb-best-gir': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'pb-best-putts': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['putts'] },
  'pb-best-scrambling': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['scrambling'] },
  'pb-first-under-target': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'sg-bunker-inefficiency': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['bunkers'] },
  'a-approach-strength': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'a-par5-gir-inefficiency': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3, requiredStats: ['gir'] },
  'c-consistency-improved': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'c-back-nine-fade': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
  'c-slow-start': { ...DEFAULT_ELIGIBILITY, minRoundsRequired: 3 },
};

export function getEligibilityForInsight(insight: Insight): InsightEligibility {
  return INSIGHT_ID_ELIGIBILITY[insight.id] || DEFAULT_ELIGIBILITY;
}
