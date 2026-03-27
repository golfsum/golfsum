// Dynamic Expo config — reads environment variables for Mapbox and Google Auth
const iosGoogleClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const mapboxDownloadToken =
  process.env.MAPBOX_DOWNLOAD_TOKEN ||
  process.env.MAPBOX_DOWNLOADS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_DOWNLOADS_TOKEN ||
  '';
const mapboxPublicToken = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN || '';
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || 'c4865044-3a6b-42c0-93b7-64f036338f22';
// EAS Submit: ascAppId is set in eas.json (App Store Connect → App Information → Apple ID).
// Apple Developer Team ID — used by @bacons/apple-targets, Expo prebuild, and the Pod resource-bundle signing hook. Override per machine with APPLE_TEAM_ID if needed.
const appleTeamId = process.env.APPLE_TEAM_ID || 'D6V59CRG3F';

// Set this for the @rnmapbox/maps plugin to pick up during prebuild
if (mapboxDownloadToken) {
  process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN = mapboxDownloadToken;
}

// Helper to reverse Client ID for Google Auth URL Schemes
function reversedClientId(clientId) {
  if (!clientId) return null;
  const parts = clientId.split('.');
  return parts.reverse().join('.');
}

const iosReversedClientId = reversedClientId(iosGoogleClientId);

module.exports = function(env) {
  const config = env.config;

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
    // Warning: New Arch can sometimes conflict with complex Pod setups (Mapbox + Watch)
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0f1419',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.golfsum.app',
      buildNumber: '1',
      appleTeamId,
      entitlements: {
        'com.apple.security.application-groups': ['group.com.golfsum.app'],
      },
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
      backgroundColor: '#1C1C1E',
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#0f1419',
      },
      package: 'com.golfsum.app',
      permissions: [
        'android.permission.CAMERA',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
      ],
    },
    extra: {
      ...(config.extra || {}),
      eas: {
        ...((config.extra && config.extra.eas) || {}),
        projectId: easProjectId,
        build: {
          ...((config.extra && config.extra.eas && config.extra.eas.build) || {}),
          experimental: {
            ...((config.extra &&
              config.extra.eas &&
              config.extra.eas.build &&
              config.extra.eas.build.experimental) ||
              {}),
            ios: {
              ...((config.extra &&
                config.extra.eas &&
                config.extra.eas.build &&
                config.extra.eas.build.experimental &&
                config.extra.eas.build.experimental.ios) ||
                {}),
              appExtensions: [
                ...((config.extra &&
                  config.extra.eas &&
                  config.extra.eas.build &&
                  config.extra.eas.build.experimental &&
                  config.extra.eas.build.experimental.ios &&
                  config.extra.eas.build.experimental.ios.appExtensions) ||
                  []),
                {
                  targetName: 'GolfSumWatch',
                  bundleIdentifier: 'com.golfsum.app.watch',
                  entitlements: {
                    'com.apple.security.application-groups': ['group.com.golfsum.app'],
                  },
                },
              ],
            },
          },
        },
      },
      mapboxPublicToken,
    },
    plugins: [
      // 1. Force build from source to fix Maven/Tarball download errors
      [
        "expo-build-properties",
        {
          "ios": {
            "useFrameworks": "static",
            "reactNativeDependencies": {
              "buildFromSource": true
            }
          }
        }
      ],
      "./withPodResourceBundleSigning",
      // Sync watch-src / live-activity-src into targets/* before @bacons/apple-targets runs
      "./withWatchApp",
      // Native Mapbox — RNMAPBOX_MAPS_DOWNLOAD_TOKEN is set at top of this file (or EAS env)
      [
        '@rnmapbox/maps',
        {
          RNMapboxMapsImpl: 'mapbox',
        },
      ],
      "@bacons/apple-targets",
      [
        "expo-image-picker",
        {
          "photosPermission": "GolfSum needs access to your photos to upload scorecard images.",
          "cameraPermission": "GolfSum needs access to your camera to photograph scorecards."
        }
      ],
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "GolfSum needs your location to find nearby golf courses."
        }
      ],
      "expo-notifications",
      "@react-native-community/datetimepicker",
      "expo-apple-authentication",
      "expo-font",
      "expo-sharing",
      "expo-web-browser",
      // Keep this LAST so no subsequent plugin can overwrite Swift pod settings.
      "./withSwiftConcurrency",
    ],
  };
};