import * as Location from 'expo-location';

export async function requestGpsPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function watchUserPosition(onUpdate, onError) {
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 3,    // only update if moved 3+ meters (~3 yards)
      timeInterval: 1200,
      mayShowUserSettingsDialog: true,
    },
    onUpdate,
    onError
  );
}

/**
 * Classify GPS horizontal accuracy into quality tiers.
 * @param {number|null|undefined} accuracyMeters - coords.accuracy in meters
 * @returns {'good'|'moderate'|'poor'|'none'}
 */
export function classifyGpsQuality(accuracyMeters) {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return 'none';
  if (accuracyMeters < 10) return 'good';
  if (accuracyMeters < 25) return 'moderate';
  return 'poor';
}
