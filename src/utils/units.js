/**
 * Distance unit formatting utilities.
 * distanceUnit: 'yards' | 'meters'
 * - yards mode: distances in yards, accuracy in feet
 * - meters mode: distances in meters, accuracy in meters
 */

export const formatAccuracy = (meters, distanceUnit) => {
  if (!Number.isFinite(meters)) return '--';
  if (distanceUnit === 'meters') {
    return `${Math.round(meters)}m`;
  }
  const feet = Math.round(meters * 3.281);
  return `${feet}ft`;
};

export const formatYardage = (yards, distanceUnit) => {
  if (!Number.isFinite(yards) || yards <= 0) return '--';
  if (distanceUnit === 'meters') {
    return `${Math.round(yards * 0.9144)}m`;
  }
  return `${Math.round(yards)}y`;
};

export const yardsToDisplay = (yards, distanceUnit) => {
  if (!Number.isFinite(yards)) return null;
  if (distanceUnit === 'meters') return Math.round(yards * 0.9144);
  return Math.round(yards);
};

export const unitSuffix = (distanceUnit) =>
  distanceUnit === 'meters' ? 'm' : 'y';
