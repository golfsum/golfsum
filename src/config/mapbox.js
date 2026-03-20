import Constants from 'expo-constants';

const expoExtraToken =
  Constants?.expoConfig?.extra?.mapboxPublicToken ||
  Constants?.manifest2?.extra?.expoClient?.extra?.mapboxPublicToken ||
  '';

export const MAPBOX_PUBLIC_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN || expoExtraToken || '';
