import type { CourseDetails } from '../services/golfCourseApiService';
import type { RoundTiming } from '../services/roundTimingService';

export interface ScorecardResult {
  html: string;
  rawText?: string;
  timestamp: Date;
  imageUri: string;
}

export interface UploadState {
  isLoading: boolean;
  error: string | null;
  result: ScorecardResult | null;
}

export type AppScreen = 'upload' | 'result' | 'round-detail';
export type TabName = 'averages' | 'history' | 'upload' | 'insights' | 'profile';

// Data Confidence Model - Core Analytics Philosophy
// "GolfSum never contradicts the golfer unless the data is strong enough to earn it."
export enum StatState {
  TRACKED = 'TRACKED',                    // Stat is actively tracked with sufficient data
  NOT_TRACKED = 'NOT_TRACKED',            // Stat is not tracked by user (display — or N/A)
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA' // Tracked but not enough rounds (muted + "Not enough data yet")
}

export interface StatWithConfidence {
  value: number | string;
  state: StatState;
  roundsUsed?: number; // How many rounds contributed to this stat
}

export interface StatPreferences {
  score: boolean;
  putts: boolean;
  fir: boolean;
  gir: boolean;
  scrambling: boolean;
  approachDistance: boolean;
  penalties: boolean;
  bunkers: boolean;
}

export interface WeatherData {
  temp?: string;
  conditions?: string;
  wind?: string;
  windDirection?: 'into' | 'helping' | 'cross-l' | 'cross-r' | 'swirling' | 'calm';
  humidity?: number;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  marketingEnabled: boolean;
  maintenanceEnabled: boolean;
}

export interface GpsShotLog {
  id: string;
  holeNumber: number;
  shotNumber: number;
  club: string;
  /** Present when the stroke is a logged putt (e.g. Apple Watch). */
  shotType?: 'putt';
  lie: string | null;
  actualYards: number | null;
  playingYards: number | null;
  from?: { lat: number; lng: number } | null;
  to?: { lat: number; lng: number } | null;
  weather?: {
    windMph?: number | null;
    windDegrees?: number | null;
    tempF?: number | null;
    humidity?: number | null;
  } | null;
  loggedAt?: string;
  playerConfirmedDistance?: boolean;
  addedRetrospectively?: boolean;
  offCourseFlag?: boolean;
}

export interface GpsHoleSummary {
  holeNumber: number;
  firstPuttDistance?: number | null;
  pinLocation?: 'front' | 'middle' | 'back' | null;
  putts?: number | null;
}

export interface GpsHoleDataQuality {
  holeNumber: number;
  dataComplete: boolean;
  flags?: {
    shotCountFlagged?: boolean;
    distanceJumpFlagged?: boolean;
    playerConfirmed?: boolean;
  };
}

export interface PendingGpsRoundData {
  courseId: string;
  courseName: string;
  courseOverride?: CourseDetails;
  teeName?: string;
  startingHole?: number;
  endingHole?: number;
  roundLength?: '18' | 'front9' | 'back9';
  routeHoleNumbers?: number[];
  routeLabel?: string;
  startedAt: number;
  endedAt: number;
  gpsShots: GpsShotLog[];
  gpsHoleSummaries?: GpsHoleSummary[];
  gpsHoleFlags?: GpsHoleDataQuality[];
  holeMapUrls?: Record<number, string>;
  /** GPS round timing (pauses, play time, hole timestamps). */
  roundTiming?: RoundTiming;
}

// History Stat State - Critical for WHS Compliance
// "If the app cannot prove a stat is real, it must act like it doesn't exist."
export enum HistoryStatState {
  TRACKED = 'TRACKED',           // Stat was recorded for this round
  NOT_TRACKED = 'NOT_TRACKED',   // Stat was not tracked (show "—" or "N/A")
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA' // Not applicable for individual rounds
}

export interface RoundStats {
  score: number;
  putts?: number;
  firstPuttDistance?: number | null;
  fairways?: number; // count of ✓
  fairwaysPossible?: number; // typically 14 (par 3s excluded)
  greens?: number; // GIR count
  greensPossible?: number; // typically 18
  upDownMade?: number;
  upDownAttempts?: number;
  courseName?: string;
  courseRating?: number;
  slopeRating?: number;
  teeBox?: string;
  
  // WHS Compliance Fields
  adjustedGrossScore?: number; // After Net Double Bogey adjustment
  courseHandicap?: number; // Handicap Index × (Slope Rating / 113)
  totalPar?: number;
  coursePar?: number;
}

export interface CourseSnapshot {
  courseId: string;
  externalId?: string;
  name: string;
  location: {
    city: string;
    state: string;
    country: string;
    latitude?: number;
    longitude?: number;
    elevationFt?: number;
  };
  holesCount: number;
  tee: {
    name: string;
    rating?: number;
    slope?: number;
    gender?: string;
    yardageTotal?: number;
  };
  holes: Array<{
    number: number;
    par: number;
    yardage?: number;
    handicapIndex?: number;
  }>;
  source?: string;
  version?: number;
  lastVerifiedAt?: number;
}

export interface SavedRound {
  id: string;
  date: Date;
  courseName: string;
  score: number; // Gross score (always displayed)
  stats: RoundStats;
  html: string;
  imageUri: string;
  thumbnailUri?: string;
  statPreferencesSnapshot?: StatPreferences;
  courseSnapshot?: CourseSnapshot;
  
  // WHS Compliance - Critical Fields
  isAcceptableForHandicap?: boolean; // Explicitly set, never inferred
  differential?: number; // Score Differential (WHS formula)
  adjustedGrossScore?: number; // After Net Double Bogey
  handicapStatus?: string; // e.g., "Not eligible — course not rated"
  
  // Course Source (for credibility and trust)
  courseSource?: CourseSource; // API, USER_DEFINED, or USER_ENTERED_RATING
  courseId?: string; // API course ID or user-defined course ID
  isCustomCourse?: boolean; // Quick flag for UI display
  
  // Incomplete Round Handling (WHS-Compliant)
  isIncomplete?: boolean; // Round ended before planned holes
  isNineHoleRound?: boolean; // True if user only played 9 holes
  holeCount?: number; // Actual holes played (9 or 18)
  plannedHoles?: number; // Originally intended to play (9 or 18)
  lastCompletedHole?: number; // Last hole with data entered
  endRoundReason?: 'finished-early' | 'nine-holes' | 'weather' | 'practice' | 'other'; // Why round ended
  adjustmentMethod?: 'Net Par for missing holes' | null; // How missing holes were handled
  needsPairing?: boolean; // True for 9-hole rounds awaiting another 9
  
  // Shotgun / Skins / Open-Ended Rounds
  startType?: 'standard' | 'shotgun'; // How the round was started
  holesPlayed?: number[]; // Array of hole numbers actually played (for non-sequential)
  eventTag?: string; // Optional: "Friday Skins", "League", "Charity", etc.
  
  // Legacy/Optional
  usedForHandicap?: boolean; // Deprecated: use isAcceptableForHandicap
  weather?: WeatherData;
  weatherFront9?: WeatherData;
  weatherBack9?: WeatherData | null;
  notes?: string;
  tee?: string;
  teeName?: string;
  roundLength?: '18' | 'front9' | 'back9';
  penalties?: number; // Penalty strokes for the round
  roundSource?: 'manual' | 'import';
  entryMode?: 'basic' | 'advanced';
  roundStartedAt?: number; // Unix ms when the round session began
  roundEndedAt?: number; // Unix ms when the round was saved/ended
  roundDurationMinutes?: number; // Persisted elapsed play time in whole minutes
  gpsShots?: GpsShotLog[];
  gpsShotCount?: number;
  gpsHoleSummaries?: GpsHoleSummary[];
  gpsHoleFlags?: GpsHoleDataQuality[];
  holeMapUrls?: Record<number, string>;
  /** GPS / session timing when available. */
  roundTiming?: RoundTiming;
  roundComplete?: boolean;

  // Round holes (for NDB calculation)
  holes?: RoundHole[];

  // Demo/Sample Data
  isSample?: boolean;
  isSeededTestRound?: boolean;
}

// Hole-by-hole data for WHS Net Double Bogey
export interface RoundHole {
  number: number;
  par: number;
  score: number; // Gross score
  adjustedScore?: number; // After NDB
  putts?: number;
  firstPuttDistance?: number | null;
  fairwayHit?: boolean | 'left' | 'right' | 'short' | 'long' | 'double-left' | 'double-right' | null; // null for par 3 (FIR is tee shot only)
  greenHit?: boolean | 'short' | 'long' | 'left' | 'right' | null; // GIR (shot attempting to reach green)
  approachDistance?:
    | '<50'
    | '50-100'
    | '100-150'
    | '150-200'
    | '200+'
    | '<75'
    | '75-100'
    | '100-125'
    | '125-150'
    | '150-175'
    | '175-200'
    | '200-225'
    | '225-250'
    | '250+'
    | null; // Optional, Advanced only
  handicapIndex?: number;
  teeClub?: string | null;
  approachClub?: string | null;
  upDown?: boolean | null;
  fairwayBunker?: boolean;
  greenSideBunker?: boolean;
  /** True when the golfer explicitly tapped "Save Hole". The definitive signal for played vs unplayed. */
  isSaved?: boolean;
  dataComplete?: boolean;
  flags?: {
    shotCountFlagged?: boolean;
    distanceJumpFlagged?: boolean;
    playerConfirmed?: boolean;
  };
}

// Course Source - Critical for WHS Credibility
export enum CourseSource {
  API = 'API',                           // From Golf Course API (fully trusted)
  USER_DEFINED = 'USER_DEFINED',         // User-entered course (not in API)
  USER_ENTERED_RATING = 'USER_ENTERED_RATING' // User provided rating/slope
}

// User-Defined Course (Missing Course Fallback)
export interface UserDefinedCourse {
  id: string;
  name: string;
  city: string;
  state: string;
  country?: string;
  teeName: string;
  isPrivate?: boolean;
  
  // WHS Critical Fields
  isRated: boolean; // Does it have rating/slope?
  isWHSEligible: boolean; // Can it be used for handicap?
  courseRating?: number; // User-entered (60.0-80.0)
  slopeRating?: number; // User-entered (55-155)
  
  // Meta
  source: CourseSource;
  createdDate: Date;
  requestedForAddition?: boolean; // User wants it added permanently
}

// User Profile for improved OCR and personalization
export interface UserProfile {
  playerRating?: number | null;
  // Personal Info (helps OCR recognize their name on scorecard)
  personalInfo: {
    name: string;              // "John Doe"
    nickname: string;          // "JD" or "Johnny" (what's on scorecard)
    initials: string;          // "JD" (most common on scorecards)
    handwriting: 'print' | 'cursive' | 'mixed';
  };
  
  // Scoring Preferences (tells OCR what symbols to expect)
  scoringPreferences: {
    trackPutts: boolean;       // Track putts per hole
    trackPuttDistance: boolean; // Track first putt distance
    trackFairways: boolean;    // Do they track fairways?
    fairwayMarking?: 'arrows' | 'check-x' | 'yes-no';
    fairwaySymbols: {
      hit: string;             // Default: "✓"
      missRight: string;       // Default: "→"
      missLeft: string;        // Default: "←"
      notApplicable: string;   // Default: "-"
    };
    trackGreens: boolean;
    greenMarking?: 'arrows' | 'check-x' | 'yes-no';
    greenSymbols: {
      hit: string;             // Default: "✓"
      missShort: string;       // Default: "↓"
      missLong: string;        // Default: "↑"
      missRight: string;       // Default: "→"
      missLeft: string;        // Default: "←"
    };
    trackApproachDistance: boolean; // Advanced only
    trackClubs: boolean;       // Advanced only - track club selection
    trackPenalties: boolean;   // Advanced only
    trackBunkers: boolean;     // Advanced only
    trackUpDown: boolean;
    scorecardColorsEnabled?: boolean;
    circlesBirdies: boolean;   // Do they circle birdies on scorecard?
    circlesEagles: boolean;
    boxesBogeys: boolean;      // Do they box bogeys?
    marksPutts: boolean;       // Do they write putt count per hole?
  };
  
  // Golf Bag (helps OCR recognize club abbreviations)
  bag: {
    driver: boolean;
    woods: string[];           // ["3W", "5W", "7W"]
    hybrids: string[];         // ["3H", "4H", "5H"]
    irons: string[];           // ["4i", "5i", "6i", "7i", "8i", "9i"]
    wedges: string[];          // ["PW", "GW", "SW", "LW"]
    putter: boolean;
  };
  
  // Club Distances (optional, for validation)
  clubDistances: {
    [club: string]: number;    // "Driver": 260, "7i": 168 - stock carry in yards
  };
  
  // Course Preferences
  coursePreferences: {
    homeCourseName: string;
    favoriteTee: string;       // "Blue", "White", etc.
    typicalHandicap: number;
  };

  // Goals
  goals?: {
    handicapIndex?: number | null;
    averageScore?: number | null;
    firPercent?: number | null;
    girPercent?: number | null;
    puttsPerRound?: number | null;
    upDownPercent?: number | null;
  };
  goalRoundTargets?: {
    handicapIndex?: number | null;
    averageScore?: number | null;
    firPercent?: number | null;
    girPercent?: number | null;
    puttsPerRound?: number | null;
    upDownPercent?: number | null;
  };
  
  // Scoring Mode
  scoringMode: 'basic' | 'advanced'; // Basic: Score, Putts, FIR, GIR only. Advanced: All stats

  // Stat preferences (source of truth for UI visibility)
  statPreferences?: StatPreferences;

  // Push notification preferences
  notificationPreferences?: NotificationPreferences;
}

// Default profile for new users
export const getDefaultProfile = (): UserProfile => ({
  playerRating: null,
  personalInfo: {
    name: '',
    nickname: '',
    initials: '',
    handwriting: 'print',
  },
  scoringPreferences: {
    trackPutts: true,
    trackPuttDistance: false,
    trackFairways: true,
    fairwayMarking: 'arrows',
    fairwaySymbols: { hit: '✓', missRight: '→', missLeft: '←', notApplicable: '-' },
    trackGreens: true,
    greenMarking: 'arrows',
    greenSymbols: { hit: '✓', missShort: '↓', missLong: '↑', missRight: '→', missLeft: '←' },
    trackApproachDistance: true,
    trackClubs: true,
    trackPenalties: true,
    trackBunkers: true,
    trackUpDown: true,
    scorecardColorsEnabled: true,
    circlesBirdies: true,
    circlesEagles: false,
    boxesBogeys: true,
    marksPutts: true,
  },
  statPreferences: {
    score: true,
    putts: true,
    fir: true,
    gir: true,
    scrambling: true,
    approachDistance: true,
    penalties: true,
    bunkers: true,
  },
  bag: {
    driver: true,
    woods: ['3W', '5W'],
    hybrids: [],
    irons: ['5i', '6i', '7i', '8i', '9i'],
    wedges: ['PW', 'GW', 'SW', 'LW'],
    putter: true,
  },
  clubDistances: {},
  coursePreferences: {
    homeCourseName: '',
    favoriteTee: 'Always Ask',
    typicalHandicap: 15,
  },
  goals: {
    handicapIndex: null,
    averageScore: null,
    firPercent: null,
    girPercent: null,
    puttsPerRound: null,
    upDownPercent: null,
  },
  goalRoundTargets: {
    handicapIndex: null,
    averageScore: null,
    firPercent: null,
    girPercent: null,
    puttsPerRound: null,
    upDownPercent: null,
  },
  scoringMode: 'basic',
  notificationPreferences: {
    pushEnabled: false,
    marketingEnabled: false,
    maintenanceEnabled: true,
  },
});

export interface TypicalValue {
  typical: number; // Trimmed mean (excludes top/bottom 10%)
  range: { min: number; max: number }; // Shows variability
  mean: number; // Simple average for reference
}

export interface RollingAverage {
  recent: number; // Last 5 rounds
  season: number; // All rounds this year
  career?: number; // Lifetime (optional)
}

export enum ConfidenceLevel {
  RELIABLE = 'RELIABLE',      // ≥ 0.75
  DEVELOPING = 'DEVELOPING',  // 0.50-0.74
  EARLY = 'EARLY',            // < 0.50
  INSUFFICIENT = 'INSUFFICIENT' // < 8 events
}

export enum TrendDirection {
  IMPROVING = 'IMPROVING',
  STABLE = 'STABLE',
  DECLINING = 'DECLINING',
}

export interface StatWithContext {
  typical: number;
  form?: number; // Last 5 rounds
  trend?: TrendDirection;
  confidence: ConfidenceLevel;
  expectedRange?: { min: number; max: number }; // For handicap comparison
  status?: 'ABOVE' | 'WITHIN' | 'BELOW'; // Compared to expected
  sampleSize: number;
}

export interface ContextualAverage {
  overall: number;
  byCondition?: {
    calm?: number;
    windy?: number;
  };
  byLie?: {
    fairway?: number;
    rough?: number;
  };
}

export interface AverageStats {
  // Scoring - Typical Values
  typicalScore: TypicalValue;
  typicalScoreVsPar: TypicalValue;
  
  // Rolling Form
  rollingScore: RollingAverage;
  
  // Advanced Stats with Confidence
  avgPutts: StatWithConfidence;
  avgFairways: StatWithConfidence;
  avgGreens: StatWithConfidence;
  avgScrambling: StatWithConfidence;
  avgUpDown: StatWithConfidence;
  
  // Opportunity-based Putting (when we have the data)
  puttsAfterGIR?: TypicalValue;
  puttsAfterMiss?: TypicalValue;
  
  // Contextual Stats
  fairwaysContextual?: ContextualAverage;
  greensContextual?: ContextualAverage;
  
  // Scoring breakdown (outcome-based, safe with minimal data)
  par3Avg: number;
  par4Avg: number;
  par5Avg: number;
  birdieRate: number;
  bogeyPlusRate: number;
  
  roundsUsed: number;
  totalRounds: number;
  handicapIndex?: number;
  
  // Benchmarks (for handicap-aware comparison)
  benchmarks?: {
    fairways?: number;
    greens?: number;
    threePutts?: number;
  };
}

// Personal Bests - Emotional Anchors
export interface PersonalBests {
  // Scoring Bests
  lowestRoundAllTime: PersonalBest | null;
  lowestRoundThisYear: PersonalBest | null;
  bestFront9: PersonalBest | null;
  bestBack9: PersonalBest | null;
  
  // Putting Bests
  fewestPuttsRound: PersonalBest | null;
  lowestAvgPutts: PersonalBest | null;
  
  // Scoring Highlights
  mostBirdiesRound: PersonalBest | null;
  fewestBogeys: PersonalBest | null;
  bogeyFreeRound: PersonalBest | null;
}

export interface PersonalBest {
  value: number;
  date: Date;
  courseName: string;
  badge?: 'Personal Best' | 'Season Best';
}

// Insight System - Interpretation with Confidence
export enum InsightType {
  WEEKLY_FOCUS = 'WEEKLY_FOCUS',       // Primary insight, max 1 at a time
  SUPPORTING = 'SUPPORTING',           // Supporting insights, contextual
  COURSE_AWARE = 'COURSE_AWARE',       // Course-specific patterns
  TREND = 'TREND'                      // Emerging trends
}

export enum InsightConfidence {
  HIGH = 'HIGH',       // 8+ rounds, clear pattern
  MEDIUM = 'MEDIUM',   // 5-7 rounds, emerging pattern
  LOW = 'LOW'          // 3-4 rounds, early signal
}

export enum InsightCategory {
  MISS_PATTERN = 'MISS_PATTERN',
  SCORING = 'SCORING',
  SHORT_GAME = 'SHORT_GAME',
  PUTTING = 'PUTTING',
  PENALTY = 'PENALTY',
  MENTAL = 'MENTAL',
  COURSE_MGMT = 'COURSE_MGMT',
  ADVANCED_STATS = 'ADVANCED_STATS',
  MILESTONE = 'MILESTONE',
  WEATHER = 'WEATHER',
}

export enum HandicapAffinityGroup {
  ALL = 'ALL',
  COMPETITIVE = 'COMPETITIVE',
  DEVELOPING = 'DEVELOPING',
  IMPROVING = 'IMPROVING',
  BEGINNER = 'BEGINNER',
}

export interface Insight {
  id: string;
  type: InsightType;
  confidence: InsightConfidence;
  title: string;
  description: string;
  actionable?: string; // "One clear focus for next round"
  minimumRounds: number;
  priority: number; // Lower = higher priority
  dismissible: boolean;
  category?: InsightCategory;
  handicapAffinity?: HandicapAffinityGroup;
  isRevisit?: boolean;
  revisitDescription?: string;
}

// Insight Gating Thresholds
export const INSIGHT_THRESHOLDS = {
  LIGHT_TREND: 3,
  FOCUS_INSIGHT: 3,
  BENCHMARKS: 3,
  STROKES_GAINED: 8,
  CONSISTENCY: 10
} as const;
