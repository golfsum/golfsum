import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
// Weather Service - Uses Open-Meteo (free, no API key required)

export interface WeatherData {
  temp: number;
  conditions: string;
  wind: string;
  windDirection?: 'into' | 'helping' | 'cross-l' | 'cross-r' | 'swirling' | 'calm';
  humidity?: number;
}

// Weather code mapping from Open-Meteo
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

// Convert wind speed to description
const getWindDescription = (windSpeed: number): string => {
  if (windSpeed < 5) return 'Calm';
  if (windSpeed < 10) return 'Light';
  if (windSpeed < 15) return 'Moderate';
  if (windSpeed < 20) return 'Strong';
  return 'Very Strong';
};

// Get current weather based on coordinates
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
    
    if (!data.current) {
      return null;
    }

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

export async function getElevationFeet(lat: number, lon: number): Promise<number | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
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

// Get user's current location
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
        // Return default location (could be user's home course)
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000, // 5 minutes cache
      }
    );
  });
}

// Fetch weather for current location
export async function fetchLocalWeather(): Promise<WeatherData | null> {
  const location = await getUserLocation();
  
  if (!location) {
    // Return null - let user enter manually
    return null;
  }

  return getCurrentWeather(location.lat, location.lon);
}
