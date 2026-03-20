const FULL_SWING_LIES = ['fairway', 'tee', 'tee box', 'light rough', 'left rough', 'right rough'];
const MIN_SHOTS_FOR_THRESHOLD = 5;

export interface QualifyingShotInput {
  club?: string | null;
  lie?: string | null;
  distanceYards?: number | null;
  isShortPar3TeeShot?: boolean;
}

function normalizeLie(lie?: string | null): string {
  return String(lie || '').trim().toLowerCase();
}

export function isQualifyingShot(
  shot: QualifyingShotInput,
  currentAvg: number,
  sampleCount: number
): boolean {
  const lie = normalizeLie(shot.lie);
  if (!FULL_SWING_LIES.includes(lie)) return false;
  if (shot.isShortPar3TeeShot) return false;
  if (!shot.distanceYards || shot.distanceYards <= 0) return false;

  if (sampleCount < MIN_SHOTS_FOR_THRESHOLD || !Number.isFinite(currentAvg) || currentAvg <= 0) {
    return true;
  }

  const minDist = currentAvg * 0.5;
  const maxDist = currentAvg * 1.4;

  if (shot.distanceYards < minDist) return false;
  if (shot.distanceYards > maxDist) return false;
  return true;
}

export { FULL_SWING_LIES, MIN_SHOTS_FOR_THRESHOLD };
