import * as Location from 'expo-location';

export async function requestGpsPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function watchUserPosition(onUpdate, onError) {
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 2,
      timeInterval: 1200,
      mayShowUserSettingsDialog: true,
    },
    onUpdate,
    onError
  );
}

