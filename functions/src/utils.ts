import { ThemeEntry } from './types';

/**
 * Lumina Neo Utilities
 * Version: v1.2.1
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
 * Retries up to 3 attempts before falling back to placeholder data.
 * Sets weatherFallback: true when real data could not be fetched so the
 * caller can surface a warning in the response instead of silently
 * generating an image with wrong weather/time-of-day data.
 */
export async function getWeather(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m`
    + `,precipitation,rain,snowfall,weather_code,cloud_cover`
    + `,wind_speed_10m,wind_gusts_10m,wind_direction_10m`
    + `,visibility,uv_index,is_day,shortwave_radiation`
    + `&daily=sunrise,sunset,precipitation_probability_max`
    + `&hourly=snow_depth`
    + `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`
    + `&timezone=auto&forecast_days=1`;

  const MAX_ATTEMPTS = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        // Brief back-off: 500 ms, then 1000 ms
        await new Promise(r => setTimeout(r, 500 * (attempt - 1)));
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as any;
      const current = data.current || {};
      const daily   = data.daily   || {};
      const utcOffsetSeconds: number = data.utc_offset_seconds || 0;

      // Snow depth: hourly array, index by current local hour
      const localHour = Math.floor((Date.now() / 1000 + utcOffsetSeconds) / 3600) % 24;
      const snowDepthM: number = (data.hourly?.snow_depth || [])[localHour] || 0;

      return {
        weatherFallback:  false,
        weatherCode:      current.weather_code        as number,
        isDay:            current.is_day === 1,
        precip:           current.precipitation        || 0,
        rain:             current.rain                 || 0,
        snowfall:         current.snowfall             || 0,
        snowDepthIn:      Math.round(snowDepthM * 39.3701 * 10) / 10, // m → inches, 1dp
        precipChance:     daily.precipitation_probability_max?.[0] || 0,
        tempF:            Math.round(current.temperature_2m         || 0),
        apparentTempF:    Math.round(current.apparent_temperature   || 0),
        humidity:         Math.round(current.relative_humidity_2m   || 0),
        dewPointF:        Math.round(current.dew_point_2m           || 0),
        windSpeed:        Math.round(current.wind_speed_10m         || 0),
        windGusts:        Math.round(current.wind_gusts_10m         || 0),
        windDirectionDeg: Math.round(current.wind_direction_10m     || 0),
        visibility:       Math.round((current.visibility            || 0) / 1609.34),
        cloudCover:       current.cloud_cover          || 0,
        uvIndex:          current.uv_index             || 0,
        shortwaveRadiation: current.shortwave_radiation || 0,
        sunrise:          daily.sunrise?.[0]?.split('T')?.[1]  || '06:00',
        sunset:           daily.sunset?.[0]?.split('T')?.[1]   || '18:00',
        utcOffsetSeconds,
      };
    } catch (err) {
      lastError = err;
      console.error(`Open-Meteo attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
    }
  }

  // All retries exhausted — return fallback with flag set
  console.error('Open-Meteo failed after all retries:', lastError);
  return {
    weatherFallback:  true,
    weatherCode: 0, isDay: true,
    precip: 0, rain: 0, snowfall: 0, snowDepthIn: 0,
    precipChance: 0,
    tempF: 70, apparentTempF: 70,
    humidity: 50, dewPointF: 50,
    windSpeed: 0, windGusts: 0, windDirectionDeg: 0,
    visibility: 10, cloudCover: 0, uvIndex: 0, shortwaveRadiation: 0,
    sunrise: '06:00', sunset: '18:00', utcOffsetSeconds: 0,
  };
}

export function degreesToCompass(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function getLightQuality(wm2: number, isDay: boolean): string {
  if (!isDay || wm2 < 5)   return 'No direct light';
  if (wm2 < 50)            return 'Dim ambient light';
  if (wm2 < 200)           return 'Soft diffuse light';
  if (wm2 < 400)           return 'Moderate sunlight';
  if (wm2 < 650)           return 'Bright direct sunlight';
  return 'Intense direct sunlight';
}

export function getPrecipitationType(weatherCode: number, rain: number, snowfall: number): string {
  if ([56, 57, 66, 67].includes(weatherCode))          return 'freezing rain';
  if (rain > 0 && snowfall > 0)                         return 'wintry mix';
  if ([51, 53, 55].includes(weatherCode))               return 'drizzle';
  if ([61, 63, 65, 80, 81, 82].includes(weatherCode))   return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode))   return 'snow';
  if ([95, 96, 99].includes(weatherCode))               return 'thunderstorm';
  return 'none';
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

interface WeatherEntry {
    short: string;
    long: string;
    shortNight?: string;
    longNight?: string;
}

const WMO_CODES: Record<number, WeatherEntry> = {
    0:  { short: 'Clear sky',
          long:  'Clear sky with full sunshine and excellent visibility',
          shortNight: 'Clear sky',
          longNight:  'Clear night sky with stars fully visible' },
    1:  { short: 'Mainly clear',
          long:  'Mainly clear with a few high clouds and good visibility',
          shortNight: 'Mainly clear',
          longNight:  'Mainly clear night with occasional thin clouds' },
    2:  { short: 'Partly cloudy',
          long:  'Partly cloudy with a mix of sunshine and clouds',
          shortNight: 'Partly cloudy',
          longNight:  'Partly cloudy night with the moon occasionally obscured' },
    3:  { short: 'Overcast',
          long:  'Completely overcast with dense cloud cover blocking all sunlight',
          shortNight: 'Overcast',
          longNight:  'Fully overcast night with no visible stars or moon' },
    45: { short: 'Fog',
          long:  'Fog with visibility significantly reduced to a few hundred meters' },
    48: { short: 'Freezing fog',
          long:  'Freezing fog depositing rime ice on surfaces with near-zero visibility' },
    51: { short: 'Light drizzle',
          long:  'Light drizzle with fine misty droplets dampening surfaces' },
    53: { short: 'Moderate drizzle',
          long:  'Moderate drizzle with steady fine rain and visibly wet surfaces' },
    55: { short: 'Dense drizzle',
          long:  'Dense drizzle with heavy mist and significantly reduced visibility' },
    56: { short: 'Light freezing drizzle',
          long:  'Light freezing drizzle forming a thin glaze of ice on surfaces' },
    57: { short: 'Heavy freezing drizzle',
          long:  'Heavy freezing drizzle rapidly coating all surfaces in dangerous ice' },
    61: { short: 'Light rain',
          long:  'Light rain with gentle steady rainfall and glistening wet surfaces' },
    63: { short: 'Moderate rain',
          long:  'Moderate rain with continuous steady rainfall and flowing gutters' },
    65: { short: 'Heavy rain',
          long:  'Heavy rain with intense downpour and possible standing water' },
    66: { short: 'Freezing rain',
          long:  'Freezing rain forming a dangerous clear ice glaze on all surfaces' },
    67: { short: 'Heavy freezing rain',
          long:  'Heavy freezing rain causing severe ice accumulation on roads and structures' },
    71: { short: 'Light snow',
          long:  'Light snowfall with gentle flakes leaving a thin white dusting' },
    73: { short: 'Moderate snow',
          long:  'Moderate snowfall with steady accumulation and reduced visibility' },
    75: { short: 'Heavy snow',
          long:  'Heavy snowfall with significant accumulation and very low visibility' },
    77: { short: 'Snow grains',
          long:  'Snow grains falling as tiny opaque white ice pellets' },
    80: { short: 'Light rain showers',
          long:  'Light rain showers with brief bursts of rain and bright intervals between',
          shortNight: 'Light rain showers',
          longNight:  'Light rain showers passing through with clearing breaks overnight' },
    81: { short: 'Moderate rain showers',
          long:  'Moderate rain showers with heavy bursts and distinct clearings between',
          shortNight: 'Moderate rain showers',
          longNight:  'Moderate rain showers moving through with breaks of dry air overnight' },
    82: { short: 'Violent rain showers',
          long:  'Violent rain showers with torrential downpours and rapidly changing conditions',
          shortNight: 'Violent rain showers',
          longNight:  'Violent rain showers overnight with intense bursts and brief lulls' },
    85: { short: 'Light snow showers',
          long:  'Light snow showers with brief flurries and clearing intervals',
          shortNight: 'Light snow showers',
          longNight:  'Light overnight snow showers with brief flurries and clearing skies between' },
    86: { short: 'Heavy snow showers',
          long:  'Heavy snow showers with intense blizzard-like bursts and accumulating snow',
          shortNight: 'Heavy snow showers',
          longNight:  'Heavy overnight snow showers with intense blizzard-like bursts' },
    95: { short: 'Thunderstorm',
          long:  'Thunderstorm with frequent lightning, rolling thunder, and heavy rain' },
    96: { short: 'Thunderstorm with hail',
          long:  'Thunderstorm with lightning, heavy rain, and small hail stones' },
    99: { short: 'Thunderstorm with heavy hail',
          long:  'Severe thunderstorm with frequent lightning, heavy rain, and large damaging hail' },
};

export function getWeatherDescriptions(code: number, isDay: boolean): { short: string; long: string } {
    const entry = WMO_CODES[code];
    if (!entry) return { short: 'Unknown', long: 'Unknown weather conditions' };
    return {
        short: (!isDay && entry.shortNight) ? entry.shortNight : entry.short,
        long:  (!isDay && entry.longNight)  ? entry.longNight  : entry.long,
    };
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
