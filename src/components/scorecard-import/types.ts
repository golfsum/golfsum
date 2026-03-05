import type { BackendScorecardResponse } from '../../services/scorecardOcrService';

export interface CourseSeed {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export type ScorecardSide = 'front' | 'back';

export interface ParsedScorecardData {
  par?: number[];
  yardageByTee?: Record<string, number[]>;
  handicapMen?: number[];
  handicapWomen?: number[];
  ratingMenByTee?: Record<string, number>;
  slopeMenByTee?: Record<string, number>;
  ratingWomenByTee?: Record<string, number>;
  slopeWomenByTee?: Record<string, number>;
  teeNames?: string[];
  playerName?: string;
  playerDate?: string;
  playerScores?: number[];
  playerPutts?: number[];
  playerFairways?: Array<boolean | null>;
  playerGreens?: Array<boolean | null>;
  playerUpDowns?: Array<boolean | null>;
  playerPenalties?: number[];
}

export interface RoundSummary {
  playerName: string;
  totalScore: number;
  scoreToPar: number;
  totalPutts: number;
  fairwaysHit: number;
  fairwaysPossible: number;
  greensHit: number;
  greensPossible: number;
  penalties: number;
}

export type ScanState = 'empty' | 'ready' | 'scanning' | 'complete' | 'error';

export interface ScanStep {
  id: 'scores' | 'course' | 'yardages';
  label: string;
  status: 'pending' | 'active' | 'complete' | 'warning' | 'error';
  detail?: string;
}

export type ReviewState =
  | { kind: 'ok' }
  | { kind: 'score_missing'; reason: 'ambiguous_score_rows' | 'undetected' }
  | { kind: 'course_missing' }
  | { kind: 'tee_missing' }
  | { kind: 'low_confidence'; fields: string[] };

export type ImportSection = 'player' | 'photo' | 'course' | 'yardages';

export type InputType =
  | 'score'
  | 'putts'
  | 'penalties'
  | 'fairway'
  | 'green'
  | 'par'
  | 'hcpMen'
  | 'hcpWomen'
  | 'yardage'
  | 'ratingMen'
  | 'slopeMen'
  | 'ratingWomen'
  | 'slopeWomen';

export interface EditableTeeBox {
  id: string;
  name: string;
  ratingMen: string;
  slopeMen: string;
  ratingWomen: string;
  slopeWomen: string;
  yardages: string[];
}

export type LockedTeeFields = {
  name: boolean;
  ratingMen: boolean;
  slopeMen: boolean;
  ratingWomen: boolean;
  slopeWomen: boolean;
  yardages: boolean[];
};

export type LockedFields = {
  courseName: boolean;
  city: boolean;
  state: boolean;
  country: boolean;
  pars: boolean[];
  hcpMen: boolean[];
  hcpWomen: boolean[];
  playerName: boolean;
  playerDate: boolean;
  scores: boolean[];
  putts: boolean[];
  penalties: boolean[];
  fairways: boolean[];
  greens: boolean[];
  upDowns: boolean[];
  tees: Record<string, LockedTeeFields>;
};

export type ParsedResponse = BackendScorecardResponse;
