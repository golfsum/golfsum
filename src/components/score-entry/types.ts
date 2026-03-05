export type FIRResult = 'hit' | 'miss' | 'left' | 'right' | 'short' | 'long' | 'double-left' | 'double-right' | null;
export type GIRResult = 'hit' | 'miss' | 'left' | 'right' | 'short' | 'long' | null;
export type ApproachDistance =
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
  | null;

export const APPROACH_DISTANCE_BUCKETS: Array<{ value: ApproachDistance; label: string }> = [
  { value: '<50', label: '<50' },
  { value: '50-100', label: '50-100' },
  { value: '100-150', label: '100-150' },
  { value: '150-200', label: '150-200' },
  { value: '200+', label: '200+' },
];

export interface HoleScore {
  hole: number;
  par: number;
  yardage: number;
  handicap: number;
  /** Score from player +/- input only (excludes auto-added penalty strokes). */
  manualStrokes: number | null;
  /** Auto-added from penalty selections (Hazard/OB). */
  penaltyStrokes: number;
  score: number | null;
  putts: number | null;
  fir: FIRResult;
  gir: GIRResult;
  approachDistance: ApproachDistance;
  teeClub: string | null;
  approachClub: string | null;
  upDown: boolean | null;
  firstPuttDistance: number | null;
  misHit: boolean;
  missedGreen: boolean;
  fairwayBunker: boolean;
  greenSideBunker: boolean;
  hazardOrDrop: boolean;
  dropShot: boolean;
  outOfBounds: boolean;
  drinks: number;
  /** True when the golfer explicitly tapped "Save Hole". The ONLY signal for whether a hole was played. */
  isSaved: boolean;
}

export interface StatPreferences {
  putts: boolean;
  fir: boolean;
  gir: boolean;
  scrambling: boolean;
  bunkers: boolean;
  penalties: boolean;
  approachDistance: boolean;
}
