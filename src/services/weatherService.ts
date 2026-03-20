import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export interface WeatherData {
  temp: number;
  conditions: string;
  wind: string;
  windDirection?: 'into' | 'helping' | 'cross-l' | 'cross-r' | 'swirling' | 'calm';
  humidity?: number;
}

const weatherCodeToCondition: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Foggy',
  51: 'Light Drizzle',
  53: 'Drizzle',
  55: 'Heavy Drizzle',
  56: 'Freezing Drizzle',
  57: 'Freezing Drizzle',
  61: 'Light Rain',
  63: 'Rainy',
  65: 'Heavy Rain',
  66: 'Freezing Rain',
  67: 'Freezing Rain',
  71: 'Light Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Light Showers',
  81: 'Showers',
  82: 'Heavy Showers',
  85: 'Snow Showers',
  86: 'Heavy Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ Hail',
  99: 'Thunderstorm w/ Hail',
};

const getWindDescription = (windSpeed: number): string => {
  if (windSpeed < 5) return 'Calm';
  if (windSpeed < 10) return 'Light';
  if (windSpeed < 15) return 'Moderate';
  if (windSpeed < 20) return 'Strong';
  return 'Very Strong';
};

export async function getCurrentWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const response = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${lat}&longitude=${lon}&` +
      `current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&` +
      `temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
    );

    if (!response.ok) {
      logger.error('Weather API error:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.current) return null;

    const current = data.current;
    const weatherCode = current.weather_code || 0;
    const windSpeed = current.wind_speed_10m || 0;

    return {
      temp: Math.round(current.temperature_2m || 70),
      conditions: weatherCodeToCondition[weatherCode] || 'Unknown',
      wind: getWindDescription(windSpeed),
      windDirection: windSpeed < 10 ? 'calm' : undefined,
      humidity: current.relative_humidity_2m,
    };
  } catch (error) {
    logger.error('Error fetching weather:', error);
    return null;
  }
}

// Returns absolute elevation in feet for a single point.
// Do NOT use this directly for playing yardage adjustment —
// use getElevationDifferenceFeet() instead.
export async function getElevationFeet(lat: number, lon: number): Promise<number | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  try {
    const response = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`
    );
    if (!response.ok) {
      logger.error('Elevation API error:', response.status);
      return null;
    }
    const data = await response.json();
    const meters = Array.isArray(data.elevation) ? data.elevation[0] : data.elevation;
    if (typeof meters !== 'number') return null;
    return Math.round(meters * 3.28084);
  } catch (error) {
    logger.error('Error fetching elevation:', error);
    return null;
  }
}

// Returns the elevation DIFFERENCE in feet between two points.
// Positive = uphill to target (plays longer).
// Negative = downhill to target (plays shorter).
// Use this for playing yardage adjustment — never absolute elevation.
//
// Rule of thumb: 1 yard adjustment per 3 feet of elevation change.
// Example: green is 30ft above tee → +10 yards playing distance.
// Example: green is 45ft below tee → -15 yards playing distance.
export async function getElevationDifferenceFeet(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<number | null> {
  const [fromElevation, toElevation] = await Promise.all([
    getElevationFeet(fromLat, fromLon),
    getElevationFeet(toLat, toLon),
  ]);

  if (fromElevation === null || toElevation === null) return null;

  // toElevation - fromElevation:
  // positive = green is higher than player = uphill = plays longer
  // negative = green is lower than player = downhill = plays shorter
  return toElevation - fromElevation;
}

// Converts elevation difference in feet to playing yardage adjustment.
// Cap at ±30 yards — anything beyond that is likely bad GPS/elevation data.
export function elevationDiffToYardageAdjustment(elevationDiffFeet: number): number {
  const rawAdjustment = elevationDiffFeet / 3;
  return Math.max(-30, Math.min(30, Math.round(rawAdjustment)));
}

export async function getUserLocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      logger.debug('Geolocation not supported');
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        logger.debug('Geolocation error:', error.message);
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000,
      }
    );
  });
}

export async function fetchLocalWeather(): Promise<WeatherData | null> {
  const location = await getUserLocation();
  if (!location) return null;
  return getCurrentWeather(location.lat, location.lon);
}