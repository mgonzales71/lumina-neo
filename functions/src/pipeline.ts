import { Env, ProfileSettings, POIEntry, PromptVariables } from './types';
import { renderPrompt, reverseGeocode, getWeather, getMoonData, resolveTheme } from './utils';

export interface PipelineParams {
    userId: string;
    profileId: string;
    lat: number;
    lon: number;
    deviceSize?: { width: number, height: number };
}

export interface PipelineResult {
    imageUrl: string;
    prompt: string;
    promptVars: PromptVariables;
    provider: string;
    model: string;
    width: number;
    height: number;
    poi: POIEntry;
    meta: {
        city: string;
        state: string;
        country: string;
        theme: string;
        weather: string;
        temp: number;
    }
}

export async function generateImagePipeline(env: Env, params: PipelineParams): Promise<PipelineResult> {
    const { userId, profileId, lat, lon, deviceSize } = params;

    // 1. Profile
    const profileKey = `PROF:${userId}:${profileId}`;
    let profile = await env.KV_PROFILES.get<ProfileSettings>(profileKey, 'json');
    if (!profile) {
        throw new Error('PROFILE_NOT_FOUND');
    }

    // 2. Location
    const geo = await reverseGeocode(lat, lon);
    const locationId = `${geo.city}-${geo.state}-${geo.country}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // 3. POI
    const poiKey = `POI:${locationId}`;
    let pois = await env.KV_POI.get<POIEntry[]>(poiKey, 'json');
    if (!pois || pois.length === 0) {
        pois = [
            { name: 'Local Landmark', description: 'A significant local site.' }
        ];
    }
    const selectedPOI = pois[Math.floor(Math.random() * pois.length)];

    // 4. Weather & Moon
    const [weather, moon] = await Promise.all([
        getWeather(lat, lon),
        getMoonData(lat, lon)
    ]);

    // 5. Theme & Style
    const theme = resolveTheme(profile.themes || []);
    const styleEntry = (profile.styles || []).find(s => s.style === profile.activeStyleId);
    const styleDesc = styleEntry ? styleEntry.description : profile.activeStyleId;

    // 6. Time Calculations — use local time via utc_offset_seconds from Open-Meteo
    // Cloudflare Workers run in UTC; sunrise/sunset from Open-Meteo are in local time
    const localNow = new Date(Date.now() + (weather.utcOffsetSeconds || 0) * 1000);
    const currentTimeMinutes = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();

    const parseTime = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    const sunriseMinutes = parseTime(weather.sunrise);
    const sunsetMinutes = parseTime(weather.sunset);

    const time_of_day_simple: 'Daytime' | 'Nighttime' =
        (currentTimeMinutes >= sunriseMinutes && currentTimeMinutes < sunsetMinutes) ? 'Daytime' : 'Nighttime';

    // Granular time-of-day bucket
    let time_of_day_bucket: PromptVariables['time_of_day_bucket'] = 'afternoon';

    if (currentTimeMinutes >= sunriseMinutes - 30 && currentTimeMinutes < sunriseMinutes) {
        time_of_day_bucket = 'dawn';
    } else if (currentTimeMinutes >= sunriseMinutes && currentTimeMinutes < sunriseMinutes + 30) {
        time_of_day_bucket = 'blue_hour';
    } else if (currentTimeMinutes >= sunriseMinutes + 30 && currentTimeMinutes < sunriseMinutes + 90) {
        time_of_day_bucket = 'golden_hour';
    } else if (currentTimeMinutes >= sunriseMinutes + 90 && currentTimeMinutes < 660) {
        time_of_day_bucket = 'morning';
    } else if (currentTimeMinutes >= 660 && currentTimeMinutes < 780) {
        time_of_day_bucket = 'noon';
    } else if (currentTimeMinutes >= 780 && currentTimeMinutes < sunsetMinutes - 90) {
        time_of_day_bucket = 'afternoon';
    } else if (currentTimeMinutes >= sunsetMinutes - 90 && currentTimeMinutes < sunsetMinutes - 30) {
        time_of_day_bucket = 'golden_hour';
    } else if (currentTimeMinutes >= sunsetMinutes - 30 && currentTimeMinutes < sunsetMinutes) {
        time_of_day_bucket = 'blue_hour';
    } else if (currentTimeMinutes >= sunsetMinutes && currentTimeMinutes < sunsetMinutes + 30) {
        time_of_day_bucket = 'sunset';
    } else {
        time_of_day_bucket = 'late_night';
    }

    // Format local date/time for prompt variables
    const isoLocal = localNow.toISOString();
    const localDateStr = isoLocal.substring(0, 10); // YYYY-MM-DD
    const localHour = localNow.getUTCHours();
    const localMin = localNow.getUTCMinutes().toString().padStart(2, '0');
    const ampm = localHour >= 12 ? 'PM' : 'AM';
    const h12 = localHour % 12 || 12;
    const localTimeStr = `${h12}:${localMin} ${ampm}`;
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const localDayOfWeek = dayNames[localNow.getUTCDay()] as PromptVariables['day_of_week'];
    const localDayNum = localNow.getUTCDay();

    const promptVars: PromptVariables = {
        lat, lon,
        city: geo.city,
        state_region: geo.state,
        country: geo.country,
        geography_context: {
            urbanicity: 'urban',
            terrain: 'flat',
            coast: 'inland',
            near_water: false
        },
        iso_datetime: isoLocal,
        date: localDateStr,
        time: localTimeStr,
        day_of_week: localDayOfWeek,
        is_weekend: [0, 6].includes(localDayNum),
        time_of_day_simple,
        time_of_day_bucket,
        weather: weather.description,
        precipitation_chance: weather.precipChance,
        temperature_f: weather.tempF,
        wind_speed_mph: weather.windSpeed,
        visibility_mi: weather.visibility,
        cloud_cover_pct: weather.cloudCover,
        uv_index: weather.uvIndex,
        sun_strength: weather.uvIndex > 6 ? 'high' : (weather.uvIndex > 3 ? 'medium' : 'low'),
        sunrise: weather.sunrise,
        sunset: weather.sunset,
        moon_phase: moon.moonPhase,
        moon_illumination_pct: moon.moonIllumination,
        moonrise: moon.moonrise,
        moonset: moon.moonset,
        poi_name: selectedPOI.name,
        poi_desc: selectedPOI.description,
        theme,
        style: styleDesc,
        // Convenience aliases for common short-form variable names in templates
        time_of_day: time_of_day_simple,
        datetime: `${localDateStr} ${localTimeStr}`,
        temperature: `${weather.tempF}°F`
    };

    // 7. Template
    const promptId = time_of_day_simple === 'Daytime' ? profile.activePromptDayId : profile.activePromptNightId;
    const template = profile.prompts[promptId] ? profile.prompts[promptId].template : '{poi_name}, {weather}, {style}';
    
    // 8. Render
    const finalPrompt = renderPrompt(template, promptVars);

    // 9. Size
    let width = 1024;
    let height = 1024;
    const sizeConfig = profile.imageSizes.sizes[profile.activeImageSizeId];
    if (sizeConfig) {
        if (sizeConfig.mode === 'dynamic' && deviceSize) {
            width = deviceSize.width;
            height = deviceSize.height;
        } else if (sizeConfig.mode === 'preset') {
            width = sizeConfig.width!;
            height = sizeConfig.height!;
        }
    }

    // 10. Provider
    const providerId = profile.providerSettings.activeProvider;
    const providerSettings = profile.providerSettings.providers[providerId];
    
    if (!providerSettings || !providerSettings.enabled) {
        throw new Error(`Provider ${providerId} not enabled.`);
    }

    let imageUrl = '';
    const model = providerSettings.image?.selectedModel || 'flux';
    const seed = Math.floor(Math.random() * 1000000);

    if (providerId === 'pollinations') {
        const encodedPrompt = encodeURIComponent(finalPrompt);
        imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`;
    } else {
        imageUrl = 'https://via.placeholder.com/1024x1024?text=Other+Provider';
    }

    return {
        imageUrl,
        prompt: finalPrompt,
        promptVars,
        provider: providerId,
        model,
        width,
        height,
        poi: selectedPOI,
        meta: {
            city: geo.city,
            state: geo.state,
            country: geo.country,
            theme,
            weather: weather.description,
            temp: weather.tempF
        }
    };
}
