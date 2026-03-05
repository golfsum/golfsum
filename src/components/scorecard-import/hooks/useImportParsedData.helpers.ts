import type { EditableTeeBox, LockedFields, ParsedScorecardData, RoundSummary } from '../types';
import { buildDefaultTeeBox, buildLockedTeeFields } from '../utils';

type DirectionalValue = boolean | 'left' | 'right' | 'short' | 'long' | null;

interface BuildRoundSummaryInput {
  parsed?: ParsedScorecardData;
  playerName: string;
  scores: string[];
  pars: string[];
  putts: string[];
  penalties: string[];
  fairways: DirectionalValue[];
  greens: DirectionalValue[];
}

interface MergeParsedTeesInput {
  parsed: ParsedScorecardData;
  teeBoxes: EditableTeeBox[];
  lockedFields: LockedFields;
}

interface MergeLockedStringValuesInput {
  current: string[];
  locked: boolean[];
  incoming?: Array<number | null | undefined>;
}

interface MergeLockedArrayValuesInput<T> {
  current: T[];
  locked: boolean[];
  incoming?: Array<T | null | undefined>;
}

function parseIntOrNull(value: string): number | null {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseIntOrZero(value: string): number {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeLockedStringValues(input: MergeLockedStringValuesInput): string[] {
  return input.current.map((currentValue, index) => {
    if (input.locked[index]) return currentValue;
    const incomingValue = input.incoming?.[index];
    return incomingValue ? incomingValue.toString() : '';
  });
}

export function mergeLockedArrayValues<T>(input: MergeLockedArrayValuesInput<T>): T[] {
  return input.current.map((currentValue, index) => {
    if (input.locked[index]) return currentValue;
    return (input.incoming?.[index] ?? currentValue) as T;
  });
}

export function mergeLockedFairways(
  current: DirectionalValue[],
  lockedFairways: boolean[],
  incomingFairways: DirectionalValue[],
  incomingPars: number[] | undefined,
  fallbackPars: string[]
): DirectionalValue[] {
  const nextFairways = incomingFairways.map((value, index) => {
    const parValue = incomingPars?.[index] ?? parseInt(fallbackPars[index], 10);
    if (parValue === 3) {
      return null;
    }
    if (lockedFairways[index]) {
      return current[index];
    }
    return value;
  });

  return current.map((currentValue, index) => {
    if (lockedFairways[index]) return currentValue;
    return nextFairways[index] ?? currentValue;
  });
}

export function buildRoundSummaryFromData(input: BuildRoundSummaryInput): RoundSummary | null {
  const scoreSource = input.parsed?.playerScores?.length
    ? input.parsed.playerScores
    : input.scores.map(parseIntOrNull);
  const parSource = input.parsed?.par?.length
    ? input.parsed.par
    : input.pars.map(parseIntOrZero);
  const puttSource = input.parsed?.playerPutts?.length
    ? input.parsed.playerPutts
    : input.putts.map(parseIntOrNull);
  const fairwaySource = input.parsed?.playerFairways?.length
    ? input.parsed.playerFairways
    : input.fairways;
  const greenSource = input.parsed?.playerGreens?.length
    ? input.parsed.playerGreens
    : input.greens;
  const penaltySource = input.parsed?.playerPenalties?.length
    ? input.parsed.playerPenalties
    : input.penalties.map(parseIntOrZero);

  const totalScore = scoreSource.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const totalPar = scoreSource.reduce<number>(
    (sum, score, index) => sum + (score === null ? 0 : (parSource[index] ?? 0)),
    0
  );
  const totalPutts = puttSource.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const fairwaysPossible = fairwaySource.filter((_, index) => {
    const par = parSource[index] ?? 0;
    return par >= 4 && fairwaySource[index] !== null && fairwaySource[index] !== undefined;
  }).length;
  const fairwaysHit = fairwaySource.filter((value, index) => {
    const par = parSource[index] ?? 0;
    return par >= 4 && value === true;
  }).length;
  const greensPossible = greenSource.filter(value => value !== null && value !== undefined).length;
  const greensHit = greenSource.filter(value => value === true).length;
  const totalPenalties = penaltySource.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  if (totalScore === 0 && totalPutts === 0 && fairwaysPossible === 0 && greensPossible === 0) {
    return null;
  }

  return {
    playerName: input.parsed?.playerName || input.playerName || 'Player',
    totalScore: Number(totalScore),
    scoreToPar: Number(totalScore) - Number(totalPar),
    totalPutts,
    fairwaysHit,
    fairwaysPossible,
    greensHit,
    greensPossible,
    penalties: totalPenalties,
  };
}

export function mergeParsedTees(input: MergeParsedTeesInput): EditableTeeBox[] {
  const teeNames = input.parsed.teeNames?.length
    ? input.parsed.teeNames
    : Object.keys(input.parsed.yardageByTee || {});

  if (teeNames.length === 0) return [];

  const normalizeName = (value: string) => value.trim().toLowerCase();
  const existingByName = new Map(input.teeBoxes.map(tee => [normalizeName(tee.name), tee]));

  const nextTeeBoxes = teeNames.map(name => {
    const existing = existingByName.get(normalizeName(name));
    const base = existing ? { ...existing } : buildDefaultTeeBox(name);
    const teeLocks = input.lockedFields.tees[base.id] || buildLockedTeeFields();

    if (!teeLocks.name) {
      base.name = name;
    }

    const yardages = input.parsed.yardageByTee?.[name];
    if (yardages) {
      base.yardages = base.yardages.map((current, index) =>
        teeLocks.yardages[index] ? current : yardages[index] ? yardages[index].toString() : ''
      );
    }

    const ratingMen = input.parsed.ratingMenByTee?.[name];
    const slopeMen = input.parsed.slopeMenByTee?.[name];
    const ratingWomen = input.parsed.ratingWomenByTee?.[name];
    const slopeWomen = input.parsed.slopeWomenByTee?.[name];

    if (ratingMen !== undefined && !teeLocks.ratingMen) base.ratingMen = ratingMen.toFixed(1);
    if (slopeMen !== undefined && !teeLocks.slopeMen) base.slopeMen = slopeMen.toString();
    if (ratingWomen !== undefined && !teeLocks.ratingWomen) base.ratingWomen = ratingWomen.toFixed(1);
    if (slopeWomen !== undefined && !teeLocks.slopeWomen) base.slopeWomen = slopeWomen.toString();

    return base;
  });

  const preservedTees = input.teeBoxes.filter(tee => {
    const normalized = normalizeName(tee.name);
    if (teeNames.some(name => normalizeName(name) === normalized)) return false;
    const locks = input.lockedFields.tees[tee.id];
    if (!locks) return false;
    const hasLocked =
      locks.name ||
      locks.ratingMen ||
      locks.slopeMen ||
      locks.ratingWomen ||
      locks.slopeWomen ||
      locks.yardages.some(Boolean);
    return hasLocked;
  });

  return [...nextTeeBoxes, ...preservedTees];
}

export function ensureLockedTeeEntries(lockedFields: LockedFields, teeBoxes: EditableTeeBox[]): LockedFields {
  const nextTees = { ...lockedFields.tees };
  teeBoxes.forEach(tee => {
    if (!nextTees[tee.id]) {
      nextTees[tee.id] = buildLockedTeeFields();
    }
  });
  return { ...lockedFields, tees: nextTees };
}
