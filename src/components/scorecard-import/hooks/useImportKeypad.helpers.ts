import type { EditableTeeBox, InputType } from '../types';

export type DirectionalValue = boolean | 'left' | 'right' | 'short' | 'long' | null;

export function encodeDirectionalValue(value: DirectionalValue): string {
  if (value === true) return 'hit';
  if (value === false) return 'miss';
  if (value === 'left') return 'left';
  if (value === 'right') return 'right';
  if (value === 'short') return 'short';
  if (value === 'long') return 'long';
  return 'na';
}

export function isPlayerNumericField(field: InputType): field is 'score' | 'putts' | 'penalties' {
  return field === 'score' || field === 'putts' || field === 'penalties';
}

export function isFlagField(field: InputType): field is 'fairway' | 'green' {
  return field === 'fairway' || field === 'green';
}

export function isHoleNumericField(field: InputType): field is 'par' | 'hcpMen' | 'hcpWomen' | 'yardage' {
  return field === 'par' || field === 'hcpMen' || field === 'hcpWomen' || field === 'yardage';
}

export function getHoleNumericValue(
  field: 'par' | 'hcpMen' | 'hcpWomen' | 'yardage',
  index: number,
  pars: string[],
  hcpMen: string[],
  hcpWomen: string[],
  teeBoxes: EditableTeeBox[],
  activeTeeIndex: number
) {
  if (field === 'par') return pars[index] || '';
  if (field === 'hcpMen') return hcpMen[index] || '';
  if (field === 'hcpWomen') return hcpWomen[index] || '';
  return teeBoxes[activeTeeIndex]?.yardages[index] || '';
}

export function updateActiveTeeScalarField(
  field: 'ratingMen' | 'slopeMen' | 'ratingWomen' | 'slopeWomen',
  value: string,
  teeBoxes: EditableTeeBox[],
  activeTeeIndex: number
) {
  const next = [...teeBoxes];
  const active = next[activeTeeIndex];
  if (!active) return next;
  next[activeTeeIndex] = { ...active, [field]: value };
  return next;
}

export type TeeScalarField = 'ratingMen' | 'slopeMen' | 'ratingWomen' | 'slopeWomen';

export function asTeeScalarField(field: InputType): TeeScalarField | null {
  if (field === 'ratingMen') return 'ratingMen';
  if (field === 'slopeMen') return 'slopeMen';
  if (field === 'ratingWomen') return 'ratingWomen';
  if (field === 'slopeWomen') return 'slopeWomen';
  return null;
}

export function shouldAutoAdvanceNumericField(field: InputType, nextValue: string): boolean {
  return (field === 'score' || field === 'putts') && nextValue.length >= 2;
}
