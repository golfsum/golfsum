export const DEFAULT_HANDICAP = 15;

export type HandicapTier = 'SCRATCH' | 'LOW' | 'MID' | 'HIGH' | 'BEGINNER';

export function resolveHandicap(handicap: number | undefined | null, fallback: number = DEFAULT_HANDICAP): number {
  return typeof handicap === 'number' && Number.isFinite(handicap) ? handicap : fallback;
}

export function resolveHandicapTier(handicap?: number | null): HandicapTier {
  const value = resolveHandicap(handicap, DEFAULT_HANDICAP);
  if (value <= 3) return 'SCRATCH';
  if (value <= 10) return 'LOW';
  if (value <= 18) return 'MID';
  if (value <= 26) return 'HIGH';
  return 'BEGINNER';
}

export function getHandicapTier(handicap?: number | null): HandicapTier {
  return resolveHandicapTier(handicap);
}
