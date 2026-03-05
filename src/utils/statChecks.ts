import type { RoundHole, SavedRound } from '../types';

/**
 * Shared helpers for checking FIR / GIR values consistently across the codebase.
 *
 * RoundHole.fairwayHit can be:
 *   true | false | 'hit' | 'miss' | 'left' | 'right' | 'short' | 'long'
 *   | 'double-left' | 'double-right' | 'yes' | 'y' | null | undefined
 *
 * RoundHole.greenHit can be:
 *   true | false | 'hit' | 'miss' | 'left' | 'right' | 'short' | 'long'
 *   | 'yes' | 'y' | null | undefined
 *
 * "hit" values  → the golfer hit the fairway / green
 * "miss" values → the golfer missed (optionally with direction)
 * null/undefined → stat was not tracked for that hole
 */

/** Returns true when the value means "fairway was hit". */
export const isFairwayHit = (value: unknown): boolean =>
  value === true || value === 'hit' || value === 'yes' || value === 'y';

/** Returns true when the value means "green was hit (in regulation)". */
export const isGreenHit = (value: unknown): boolean =>
  value === true || value === 'hit' || value === 'yes' || value === 'y';

/**
 * Returns true when the value means "fairway was missed".
 * Returns false for null / undefined (stat not tracked) and for hit values.
 */
export const isFairwayMiss = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  return !isFairwayHit(value);
};

/**
 * Returns true when the value means "green was missed".
 * Returns false for null / undefined (stat not tracked) and for hit values.
 * Catches: false, 'miss', 'left', 'right', 'short', 'long', 'double-left', 'double-right'
 */
export const isGreenMiss = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  return !isGreenHit(value);
};

/**
 * Returns true when at least one hole in the provided rounds has a non-null value for the field.
 */
export const hasTrackingData = (
  rounds: SavedRound[],
  field: keyof RoundHole
): boolean =>
  rounds.some(
    round => round.holes?.some(hole => hole[field] !== null && hole[field] !== undefined) ?? false
  );

/**
 * Formats a numeric display value while honoring whether the stat is actually tracked.
 */
export const displayStat = (
  value: number | null | undefined,
  tracked: boolean,
  format: (v: number) => string = v => `${v}`
): string => {
  if (!tracked) return '—';
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return format(value);
};
