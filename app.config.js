// Dynamic Expo config — reads iOS Google Client ID from env
// and auto-registers the reversed client ID as a URL scheme (required for Google Sign-In on iOS).
const iosGoogleClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const allowCleartextTraffic = process.env.EXPO_PUBLIC_ALLOW_CLEARTEXT_TRAFFIC === 'true';
const mapboxDownloadToken =
  process.env.MAPBOX_DOWNLOAD_TOKEN ||
  process.env.MAPBOX_DOWNLOADS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_DOWNLOADS_TOKEN ||
  '';
const mapboxPublicToken = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN || '';
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || 'c4865044-3a6b-42c0-93b7-64f036338f22';

if (mapboxDownloadToken) {
  process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN = mapboxDownloadToken;
}

// Google requires the reversed client ID as an iOS URL scheme for OAuth redirects.
// e.g. "123456-abcdef.apps.googleusercontent.com" → "com.googleusercontent.apps.123456-abcdef"
function reversedClientId(clientId) {
  if (!clientId) return null;
  const parts = clientId.split('.');
  return parts.reverse().join('.');
}

const iosReversedClientId = reversedClientId(iosGoogleClientId);

module.exports = function(env) {
  const config = env.config;

  // Build the CFBundleURLTypes array
  const urlTypes = [];
  if (iosReversedClientId) {
    urlTypes.push({
      CFBundleURLSchemes: [iosReversedClientId],
    });
  }

  return {
    ...config,
    name: 'GolfSum',
    slug: 'golfsum',
    scheme: 'golfsum',
    version: '1.0.0',
    orientation: 'default',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0f1419',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.golfsum.app',
      buildNumber: '1',
      infoPlist: {
        NSCameraUsageDescription: 'GolfSum needs camera access to photograph scorecards',
        NSPhotoLibraryUsageDescription: 'GolfSum needs photo library access to upload scorecard images',
        NSLocationWhenInUseUsageDescription: 'GolfSum needs your location to find nearby golf courses',
        ITSAppUsesNonExemptEncryption: false,
        ...(urlTypes.length > 0 ? { CFBundleURLTypes: urlTypes } : {}),
      },
    },
    android: {
      softwareKeyboardLayoutMode: 'pan',
      // Window background when system draws behind status/nav (edge-to-edge)
      backgroundColor: '#1C1C1E',
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#0f1419',
      },
      package: 'com.golfsum.app',
      navigationBar: {
        visible: 'sticky-immersive',
        backgroundColor: '#00000000',
      },
      permissions: [
        'android.permission.CAMERA',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
      output: 'single',
    },
    extra: {
      ...(config.extra || {}),
      eas: {
        ...((config.extra && config.extra.eas) || {}),
        projectId: easProjectId,
      },
      mapboxPublicToken,
    },
    plugins: [
      './withWatchApp',
      [
        'expo-image-picker',
        {
          photosPermission: 'GolfSum needs access to your photos to upload scorecard images.',
          cameraPermission: 'GolfSum needs access to your camera to photograph scorecards.',
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'GolfSum needs your location to find nearby golf courses.',
        },
      ],
      'expo-notifications',
      '@react-native-community/datetimepicker',
      'expo-apple-authentication',
      ...(mapboxDownloadToken ? [[
        '@rnmapbox/maps',
        {
          RNMapboxMapsImpl: 'mapbox',
          RNMapboxMapsDownloadToken: mapboxDownloadToken,
        },
      ]] : []),
    ],
  };
};
