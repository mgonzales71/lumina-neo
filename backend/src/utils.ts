import { ProfileSettings, ThemeEntry } from './types';

export function renderPrompt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const v = vars[key];
    return v !== undefined && v !== null ? String(v) : `{${key}}`;
  });
}

export async function reverseGeocode(lat: number, lon: number) {
    // Mock
    return {
        city: 'Portland',
        state: 'Oregon',
        country: 'USA'
    };
}

export async function getWeather(lat: number, lon: number) {
    // Mock
    return {
        description: 'Overcast',
        precip: 10,
        tempF: 61,
        windSpeed: 5,
        visibility: 10,
        cloudCover: 80,
        uvIndex: 2,
        sunrise: '06:30',
        sunset: '19:45',
        moonPhase: 'Waxing Gibbous'
    };
}

export function resolveTheme(themes: ThemeEntry[]): string {
    const now = new Date();
    const mmdd = (now.getMonth() + 1) * 100 + now.getDate();
    
    // Simple match
    const match = themes.find(t => {
        if (t.Begin <= t.End) {
            return mmdd >= t.Begin && mmdd <= t.End;
        } else {
            // Wrapped (e.g. Dec to Jan)
            return mmdd >= t.Begin || mmdd <= t.End;
        }
    });

    return match ? match.Theme : 'General';
}
