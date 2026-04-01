import { Env, ProfileSettings, POIEntry, PromptVariables } from './types';
import { renderPrompt, reverseGeocode, getWeather, getMoonData, resolveTheme, getWeatherDescriptions, degreesToCompass, getLightQuality, getPrecipitationType } from './utils';
import { PROVIDER_REGISTRY } from './providers';

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
        weatherFallback: boolean;
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
    
    // 3. POI — load from cache or auto-generate via AI for new locations
    const poiKey = `POI:${locationId}`;
    let pois = await env.KV_POI.get<POIEntry[]>(poiKey, 'json');
    if (!pois || pois.length === 0) {
        pois = await generateAndCachePOIs(env, profile, poiKey, geo.city, geo.state, geo.country);
    }
    const rndPOI = new Uint32Array(1);
    crypto.getRandomValues(rndPOI);
    const selectedPOI = pois[rndPOI[0] % pois.length];

    // Auto-register new locations to the profile so the web app sees them
    if (!profile.locations) profile.locations = [];
    const locationKnown = profile.locations.some(l => l.id === locationId);
    if (!locationKnown) {
        profile.locations.push({ id: locationId, lat, lon, city: geo.city, state: geo.state, country: geo.country });
        await env.KV_PROFILES.put(profileKey, JSON.stringify(profile));
    }

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

    // Use API-provided is_day for weather description (more accurate in polar regions / edge of day)
    const isDay = weather.isDay;
    const weatherDesc = getWeatherDescriptions(weather.weatherCode, isDay);

    // Derived atmospheric conditions
    const precipitationType = getPrecipitationType(weather.weatherCode, weather.rain, weather.snowfall);
    const windDirection      = degreesToCompass(weather.windDirectionDeg);
    const lightQuality       = getLightQuality(weather.shortwaveRadiation, isDay);
    const frostRisk          = weather.dewPointF <= 36;
    const rainbowPotential   = isDay && weather.precip > 0 && weather.cloudCover < 80;
    const heatShimmer        = weather.apparentTempF >= 95 && weather.humidity < 40;

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
        weather: weatherDesc.short,
        weather_descriptive: weatherDesc.long,
        precipitation_chance: weather.precipChance,
        precipitation_type: precipitationType,
        temperature_f: weather.tempF,
        apparent_temperature_f: weather.apparentTempF,
        wind_speed_mph: weather.windSpeed,
        wind_gusts_mph: weather.windGusts,
        wind_direction: windDirection,
        visibility_mi: weather.visibility,
        cloud_cover_pct: weather.cloudCover,
        uv_index: weather.uvIndex,
        sun_strength: weather.uvIndex > 6 ? 'high' : (weather.uvIndex > 3 ? 'medium' : 'low'),
        humidity_pct: weather.humidity,
        dew_point_f: weather.dewPointF,
        snow_depth_in: weather.snowDepthIn,
        light_quality: lightQuality,
        frost_risk: frostRisk,
        rainbow_potential: rainbowPotential,
        heat_shimmer: heatShimmer,
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
    const activeSizeId = profile.activeImageSizeId || profile.imageSizes.default || 'DEVICE';
    const sizeConfig = profile.imageSizes.sizes[activeSizeId];
    if (sizeConfig) {
        if (sizeConfig.mode === 'dynamic') {
            if (!deviceSize) {
                throw new Error('Active size is "This Device" but no device dimensions were provided. The iOS Shortcut must pass deviceWidth and deviceHeight.');
            }
            // Cap unknown device dimensions — arbitrary screen sizes shouldn't generate huge images
            const MAX_DIM = 2048;
            width  = deviceSize.width;
            height = deviceSize.height;
            if (width > MAX_DIM || height > MAX_DIM) {
                const ratio = width / height;
                if (ratio > 1) { width = MAX_DIM; height = Math.round(MAX_DIM / ratio); }
                else           { height = MAX_DIM; width  = Math.round(MAX_DIM * ratio); }
            }
        } else if (sizeConfig.mode === 'preset') {
            width = sizeConfig.width!;
            height = sizeConfig.height!;
        }

        // iOS depth/parallax effect: pad by 10% so the parallax shift has ~5% headroom per edge.
        // No size cap here — preset dimensions are intentional and must not be silently shrunk.
        if (sizeConfig.depthEffect) {
            width  = Math.round(width  * 1.10);
            height = Math.round(height * 1.10);
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
    const rndSeed = new Uint32Array(1);
    crypto.getRandomValues(rndSeed);
    const seed = rndSeed[0] % 1000000;

    if (providerId === 'pollinations') {
        const encodedPrompt = encodeURIComponent(finalPrompt);
        const apiKey = providerSettings.apiKey || '';
        const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
        const defaults = providerSettings.image?.defaults || {};

        let extraParams = '';
        if (defaults.nologo !== false) extraParams += '&nologo=true';
        if (defaults.private === true || defaults.private === 'true') extraParams += '&private=true';
        if (defaults.enhance === true || defaults.enhance === 'true') extraParams += '&enhance=true';
        if (defaults.safe === true || defaults.safe === 'true') extraParams += '&safe=true';
        if (defaults.transparent === true || defaults.transparent === 'true') extraParams += '&transparent=true';
        if (defaults.quality && ['low', 'medium', 'high', 'hd'].includes(String(defaults.quality))) {
            extraParams += `&quality=${defaults.quality}`;
        }
        if (defaults.negative_prompt && String(defaults.negative_prompt).trim()) {
            extraParams += `&negative_prompt=${encodeURIComponent(String(defaults.negative_prompt))}`;
        }

        imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}${extraParams}${keyParam}`;
    } else if (providerId === 'openrouter') {
        const apiKey = providerSettings.apiKey;
        if (!apiKey) throw new Error('OpenRouter API key is required. Add it in the Providers tab.');

        const orModel = model || 'black-forest-labs/flux-schnell';
        const defaults = providerSettings.image?.defaults || {};

        const orBody: Record<string, any> = {
            model: orModel,
            prompt: finalPrompt,
            n: 1,
            size: `${width}x${height}`
        };
        if (defaults.negative_prompt && String(defaults.negative_prompt).trim()) {
            orBody.negative_prompt = String(defaults.negative_prompt).trim();
        }

        const orResponse = await fetch('https://openrouter.ai/api/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://lumina-neo.pages.dev',
                'X-Title': 'Lumina Neo'
            },
            body: JSON.stringify(orBody)
        });

        if (!orResponse.ok) {
            const errText = await orResponse.text();
            throw new Error(`OpenRouter image generation failed (${orResponse.status}): ${errText}`);
        }

        const orResult = await orResponse.json() as any;
        imageUrl = orResult.data?.[0]?.url || '';
        if (!imageUrl) throw new Error('OpenRouter returned no image URL in response');
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
            weather: weatherDesc.short,
            temp: weather.tempF,
            weatherFallback: weather.weatherFallback
        }
    };
}

/**
 * Auto-generates POIs for a location using the profile's text provider and
 * caches them in KV_POI. Called when a GPS location has no cached POIs yet
 * (first visit, iOS Shortcut in a new city, etc.).
 * Falls back to a single generic placeholder if AI generation fails.
 */
async function generateAndCachePOIs(
    env: Env,
    profile: ProfileSettings,
    poiKey: string,
    city: string,
    state: string,
    country: string
): Promise<POIEntry[]> {
    const fallback: POIEntry[] = [{ name: city || 'Local Landmark', description: `A notable landmark in ${[city, state, country].filter(Boolean).join(', ')}.` }];

    try {
        const providerId = profile.providerSettings.activeProvider;
        const providerCfg = profile.providerSettings.providers[providerId];
        const registry = PROVIDER_REGISTRY[providerId];

        if (!providerCfg?.enabled || !registry?.categories.text) return fallback;

        const model = providerCfg.text?.selectedModel || 'openai';
        const isUS = country === 'United States' || country === 'US' || country === 'USA';
        const locationStr = isUS
            ? `the city of ${city} in the state of ${state}`
            : [city, state, country].filter(Boolean).join(', ');

        const systemPrompt = 'You are an expert on points of interest and other unique and notable places of things views or vistas of requested locations. Do not cite sources or any additional information beyond returning one item per line with no formatting.';
        const userPrompt = `Task: Generate a list of up to 30 visually unique points of interest, landmarks, or vistas in or nearby ${locationStr}. Format Rules: 1. Output ONLY a raw JSON array of objects. 2. Do NOT include markdown code blocks (no backticks). 3. Do NOT include any introductory or concluding text. 4. Each object must have exactly two keys: "name" and "description". 5. "description" must be 1-2, concise sentences that visually describes the named point of interest.`;

        const response = await fetch(registry.categories.text.generate.url!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${providerCfg.apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        const result = await response.json() as any;
        const content = result.choices?.[0]?.message?.content || '[]';
        const start = content.indexOf('[');
        const end = content.lastIndexOf(']');
        if (start === -1 || end === -1 || end < start) return fallback;

        const extracted = content.slice(start, end + 1)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/\r?\n|\r/g, ' ')
            .replace(/\t/g, ' ');

        const pois: POIEntry[] = JSON.parse(extracted);
        if (Array.isArray(pois) && pois.length > 0) {
            await env.KV_POI.put(poiKey, JSON.stringify(pois));
            return pois;
        }
        return fallback;

    } catch {
        return fallback;
    }
}
