import * as Location from 'expo-location';

export async function requestGpsPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

// ─── Kalman filter for GPS smoothing ────────────────────────────
// Based on: https://github.com/villoren/KalmanLocationManager
// Typically cuts jitter by 60–70% on a walking GPS use case.

class GpsKalmanFilter {
  constructor() {
    this.minAccuracy = 1;
    this.Q = 3;         // process noise — higher = trust new readings more
    this.lat = null;
    this.lng = null;
    this.variance = -1;  // negative = not initialized
    this.timestampMs = 0;
  }

  reset() {
    this.variance = -1;
    this.lat = null;
    this.lng = null;
  }

  update(lat, lng, accuracy, timestampMs) {
    if (accuracy < this.minAccuracy) accuracy = this.minAccuracy;

    if (this.variance < 0) {
      // First reading — initialize
      this.timestampMs = timestampMs;
      this.lat = lat;
      this.lng = lng;
      this.variance = accuracy * accuracy;
      return { lat, lng, accuracy };
    }

    // Time step
    const dt = (timestampMs - this.timestampMs) / 1000;
    if (dt > 0) {
      // Increase variance with time (process noise)
      this.variance += dt * this.Q * this.Q;
      this.timestampMs = timestampMs;
    }

    // Kalman gain
    const K = this.variance / (this.variance + accuracy * accuracy);

    // Update estimates
    this.lat += K * (lat - this.lat);
    this.lng += K * (lng - this.lng);
    this.variance = (1 - K) * this.variance;

    return {
      lat: this.lat,
      lng: this.lng,
      accuracy: Math.sqrt(this.variance),
    };
  }
}

const kalman = new GpsKalmanFilter();

export async function watchUserPosition(onUpdate, onError) {
  kalman.reset();

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 3000,      // 3s polling — Kalman filter smooths adequately
      distanceInterval: 0,     // always update regardless of movement
      mayShowUserSettingsDialog: true,
    },
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;

      // Hard reject extreme outliers
      if (Number.isFinite(accuracy) && accuracy > 40) return;

      // Apply Kalman filter
      const filtered = kalman.update(
        latitude,
        longitude,
        accuracy ?? 20,
        position.timestamp,
      );

      // Emit filtered position with estimated accuracy
      onUpdate({
        ...position,
        coords: {
          ...position.coords,
          latitude: filtered.lat,
          longitude: filtered.lng,
          accuracy: Math.round(filtered.accuracy * 10) / 10,
        },
      });
    },
    onError,
  );
}

/**
 * Classify GPS horizontal accuracy into quality tiers.
 * @param {number|null|undefined} accuracyMeters - coords.accuracy in meters
 * @returns {'excellent'|'good'|'fair'|'poor'|'none'}
 */
export function classifyGpsQuality(accuracyMeters) {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return 'none';
  if (accuracyMeters <= 5)  return 'excellent';
  if (accuracyMeters <= 10) return 'good';
  if (accuracyMeters <= 20) return 'fair';
  if (accuracyMeters <= 40) return 'poor';
  return 'none';
}
