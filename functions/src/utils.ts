import { ThemeEntry } from './types';

/**
 * Lumina Neo Utilities
 * Version: v1.1.0
 */

export function renderPrompt(template: string, vars: Record<string, any>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const v = vars[key];
    return v !== undefined && v !== null ? String(v) : `{${key}}`;
  });
}

/**
 * Nominatim Reverse Geocoding
 */
export async function reverseGeocode(lat: number, lon: number) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Lumina-Neo/1.1.0 (Cloudflare Pages Functions)'
      }
    });
    const data = await response.json() as any;
    
    const addr = data.address || {};
    return {
      city: addr.city || addr.town || addr.village || addr.suburb || 'Unknown City',
      state: addr.state || addr.province || '',
      country: addr.country || 'Unknown Country'
    };
  } catch (err) {
    console.error('Nominatim failed:', err);
    return { city: 'Unknown', state: '', country: '' };
  }
}

/**
 * Open-Meteo Weather Integration
 */
export async function getWeather(lat: number, lon: number) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,visibility&daily=sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=1`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    const current = data.current || {};
    const daily = data.daily || {};

    return {
      description: getWeatherDescription(current.weather_code),
      precip: current.precipitation || 0,
      tempF: Math.round(current.temperature_2m || 0),
      windSpeed: Math.round(current.wind_speed_10m || 0),
      visibility: Math.round((current.visibility || 0) / 1609.34), // meters to miles
      cloudCover: current.cloud_cover || 0,
      uvIndex: 0, // Not in basic current, can add later if needed
      sunrise: daily.sunrise?.[0]?.split('T')?.[1] || '06:00',
      sunset: daily.sunset?.[0]?.split('T')?.[1] || '18:00',
    };
  } catch (err) {
    console.error('Open-Meteo failed:', err);
    return {
      description: 'Clear',
      precip: 0,
      tempF: 70,
      windSpeed: 0,
      visibility: 10,
      cloudCover: 0,
      sunrise: '06:00',
      sunset: '18:00'
    };
  }
}

/**
 * USNO Moon Data Integration
 */
export async function getMoonData(lat: number, lon: number, dateStr?: string) {
    try {
        // USNO API requires date and location
        // Note: USNO API can be flaky or slow, using a fallback-friendly approach
        const d = dateStr || new Date().toISOString().split('T')[0];
        const url = `https://aa.usno.navy.mil/api/rstt/oneday?date=${d}&coords=${lat},${lon}&tz=0`;
        
        const response = await fetch(url);
        const data = await response.json() as any;
        
        const moon = data.properties?.data?.moondata || [];
        const phaseEntry = data.properties?.data?.curphase || 'Unknown';
        const illEntry = data.properties?.data?.fracillum || '0%';

        const rise = moon.find((m: any) => m.phen === 'Rise')?.time || '--:--';
        const set = moon.find((m: any) => m.phen === 'Set')?.time || '--:--';

        return {
            moonPhase: phaseEntry,
            moonIllumination: parseInt(illEntry.replace('%', '')) || 0,
            moonrise: rise,
            moonset: set
        };
    } catch (err) {
        console.error('USNO Moon API failed:', err);
        return {
            moonPhase: 'Waxing Gibbous',
            moonIllumination: 50,
            moonrise: '20:00',
            moonset: '06:00'
        };
    }
}

function getWeatherDescription(code: number): string {
    const codes: Record<number, string> = {
        0: 'Clear sky',
        1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Fog', 48: 'Depositing rime fog',
        51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
        61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
        71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall',
        95: 'Thunderstorm',
    };
    return codes[code] || 'Clear';
}

export function resolveTheme(themes: ThemeEntry[]): string {
    const now = new Date();
    const mmdd = (now.getMonth() + 1) * 100 + now.getDate();
    
    const match = themes.find(t => {
        if (t.Begin <= t.End) {
            return mmdd >= t.Begin && mmdd <= t.End;
        } else {
            return mmdd >= t.Begin || mmdd <= t.End;
        }
    });

    return match ? match.Theme : 'General';
}
