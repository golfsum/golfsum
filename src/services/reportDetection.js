import { haversineYards } from './haversine';

export function getMissingYardageTees(tees = []) {
  return tees.filter((tee) => !Number.isFinite(Number(tee?.totalYards)) || Number(tee?.totalYards) <= 0);
}

export function hasSparseTeeList(tees = []) {
  return Array.isArray(tees) && tees.length > 0 && tees.length < 2;
}

export function isTeeMarkerSuspect(teeCoords, greenCoords) {
  if (!teeCoords || !greenCoords) return false;
  const distance = haversineYards(teeCoords.lat, teeCoords.lng, greenCoords.lat, greenCoords.lng);
  if (!Number.isFinite(distance)) return false;
  return distance > 800 || distance < 30;
}

export function isGpsDistanceSuspect(gpsYards, teeYardage) {
  if (!Number.isFinite(gpsYards) || !Number.isFinite(teeYardage)) return false;
  return Math.abs(Number(gpsYards) - Number(teeYardage)) > 150;
}
