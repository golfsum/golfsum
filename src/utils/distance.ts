export type DistanceUnit = 'yards' | 'meters';

const YARDS_TO_METERS = 0.9144;
const FEET_TO_METERS = 0.3048;

export const yardsToMeters = (yards: number): number => yards * YARDS_TO_METERS;
export const metersToYards = (meters: number): number => meters / YARDS_TO_METERS;
export const feetToMeters = (feet: number): number => feet * FEET_TO_METERS;
export const metersToFeet = (meters: number): number => meters / FEET_TO_METERS;

export const getYardageUnitLabel = (unit: DistanceUnit): string =>
  unit === 'meters' ? 'm' : 'yds';

export const getPuttDistanceUnitLabel = (unit: DistanceUnit): string =>
  unit === 'meters' ? 'm' : 'ft';

export const formatYardage = (yards: number, unit: DistanceUnit): number =>
  unit === 'meters' ? Math.round(yardsToMeters(yards)) : Math.round(yards);

export const formatPuttDistance = (feet: number, unit: DistanceUnit): number =>
  unit === 'meters' ? Math.round(feetToMeters(feet)) : Math.round(feet);

export const parsePuttDistanceToFeet = (value: number, unit: DistanceUnit): number =>
  unit === 'meters' ? Math.round(metersToFeet(value)) : Math.round(value);
