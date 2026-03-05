import { StrengthLevel, PatternInsightType } from './typesEnums';

export { StrengthLevel, PatternInsightType };

export interface PatternInsight {
  type: PatternInsightType;
  title: string;
  patternObserved: string;
  whatThisIndicates: string;
  commonContributors: string[];
  whatToWorkOn: string[];
  commonTrap?: string;
  scoringNote?: string;
  confidence: number;
  stars: number;
  confidenceLabel: string;
  strengthLevel: StrengthLevel;
  dataSupport: string;
  priority: number;
  impactScore: number;
  frequencyScore: number;
  sampleSize: number;
  estimatedStrokes?: number;
  difficulty?: 1 | 2 | 3;
  category?: string;
  coachExplanation?: string;
  beforeNextRound?: string[];
  startLineInference?: string;
  progress?: InsightProgress;
  meta?: InsightMeta;
}

export interface InsightProgress {
  status: 'IMPROVED' | 'REGRESSED' | 'UNCHANGED' | 'INSUFFICIENT_DATA';
  delta: number;
  deltaLabel: string;
  message: string;
  emoji: string;
  baselineLabel: string;
  lastRoundLabel: string;
}

export interface InsightMeta {
  suppressed: boolean;
  reason?: 'LOW_SAMPLE' | 'LOW_CONFIDENCE' | 'INCONSISTENT' | 'CONFLICTING';
  retryAfterEvents?: number;
  debugInfo?: {
    sampleScore: number;
    patternScore: number;
    consistencyScore: number;
  };
}

export interface PracticeDrill {
  title: string;
  duration: string;
  steps: string[];
  category: 'TEE' | 'APPROACH' | 'PUTTING';
  constraints?: {
    targetWindow?: string;
    successGoal: string;
  };
}

export interface PracticePlan {
  drills: PracticeDrill[];
  totalDuration: string;
  quickWarmUp?: {
    steps: string[];
    duration: string;
  };
}

export interface GamePlanCard {
  sections: {
    title: string;
    focus: string[];
  }[];
  oneRule: string;
}
