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
        // Fallback or trigger population (simplified for now)
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

    // 6. Prompt Vars
    const now = new Date();
    const time_of_day_simple = (now.getHours() >= 6 && now.getHours() < 18) ? 'Daytime' : 'Nighttime';
    
    const promptVars: any = {
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
        iso_datetime: now.toISOString(),
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        day_of_week: now.toLocaleDateString('en-US', { weekday: 'long' }),
        is_weekend: [0, 6].includes(now.getDay()),
        time_of_day_simple,
        time_of_day_bucket: 'afternoon', // Simplified
        weather: weather.description,
        precipitation_chance: weather.precip,
        temperature_f: weather.tempF,
        wind_speed_mph: weather.windSpeed,
        visibility_mi: weather.visibility,
        cloud_cover_pct: weather.cloudCover,
        uv_index: weather.uvIndex,
        sun_strength: weather.uvIndex > 5 ? 'high' : 'medium',
        sunrise: weather.sunrise,
        sunset: weather.sunset,
        moon_phase: moon.moonPhase,
        moon_illumination_pct: moon.moonIllumination,
        moonrise: moon.moonrise,
        moonset: moon.moonset,
        poi_name: selectedPOI.name,
        poi_desc: selectedPOI.description,
        theme,
        style: styleDesc
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
        imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`;
    } else {
        // Generic POST logic could go here
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
