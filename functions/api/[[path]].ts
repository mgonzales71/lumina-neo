/**
 * Lumina Neo Pages Functions API Entry Point
 * Version: v1.4.0
 */
import { Env, ApiResponse, UserRecord, ProfileSettings, LocationEntry, POIEntry, PromptVariables } from '../src/types';
import { PROVIDER_REGISTRY } from '../src/providers';
import { renderPrompt, reverseGeocode, getWeather, getMoonData, resolveTheme } from '../src/utils';
import { generateImagePipeline } from '../src/pipeline';

// CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-Passkey, X-Profile-Id',
};

// Helper: JSON Response
function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// Helper: Error Response
function errorResponse(code: string, message: string, details?: any, status = 400): Response {
  return jsonResponse({
    ok: false,
    error: { code, message, details }
  }, status);
}

// Helper: Hashing
async function hashPasskey(passkey: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(passkey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Default Profile Generator
function createDefaultProfile(id: string, name = 'Default Profile'): ProfileSettings {
  return {
    id,
    name,
    appearance: 'auto',
    language: 'en',
    activePromptDayId: 'POI_DAYTIME',
    activePromptNightId: 'POI_NIGHTTIME',
    activeStyleId: 'hyper_photo_realistic',
    activeImageSizeId: 'DEVICE',
    themes: [],
    styles: [
      { style: 'hyper_photo_realistic', description: 'A visual style that looks more real than a typical photograph, with extreme detail, lifelike textures, precise lighting, and sharp clarity.' },
      { style: 'cinematic', description: 'A dramatic visual style inspired by film, with moody lighting, strong composition, and a polished, story-driven look.' },
      { style: 'watercolor', description: 'A soft painted style with fluid brushwork, blended colors, and a light, artistic texture.' }
    ],
    locations: [],
    prompts: {
      'POI_DAYTIME': {
        id: 'POI_DAYTIME',
        label: 'Daytime',
        template: 'Generate a {style} image of {poi_name} in {city}, {state_region}. POI description: {poi_desc}. Ensure architectural and geographical accuracy based on real-world references. Time: {time_of_day_simple} {date} {time}. Weather: {weather}, {temperature_f}°F. Sunrise at {sunrise} and sunset at {sunset} for realistic sun positioning. Adjust sun visibility based on {weather}. UV index: {uv_index}, visibility: {visibility_mi} miles. Cloud cover {cloud_cover_pct}%. Safe Zone Framing: keep significant elements centered and critical content within 80-90% of the image width and height. Atmosphere: incorporate the theme of {theme} as a subtle, realistic element. Apply a professional, natural-looking auto-enhancement: brighten shadows, recover highlights, boost midtone contrast, and enhance clarity while preserving a photorealistic look.',
        active: true
      },
      'POI_NIGHTTIME': {
        id: 'POI_NIGHTTIME',
        label: 'Nighttime',
        template: 'Generate a {style} image of {poi_name} in {city}, {state_region}. POI description: {poi_desc}. Ensure architectural and geographical accuracy based on real-world references. Time: {time_of_day_simple} {date} {time}. Weather: {weather}, {temperature_f}°F. Moon in {moon_phase} with {moon_illumination_pct}% illumination. Account for moonrise {moonrise} and moonset {moonset} for realistic moon positioning. Adjust moon visibility based on {weather}. Safe Zone Framing: keep significant elements centered and critical content within 80-90% of the image width and height. Atmosphere: incorporate the theme of {theme} as a subtle, realistic element. Apply a professional, natural-looking auto-enhancement: brighten shadows, recover highlights, boost midtone contrast, and enhance clarity while preserving a photorealistic look.',
        active: true
      }
    },
    imageSizes: {
      default: 'DEVICE',
      sizes: {
        'DEVICE':          { label: 'This Device',    mode: 'dynamic', width: null, height: null },
        'IPHONE':          { label: 'iPhone',         mode: 'preset',  width: 1179, height: 2556 },
        'IPHONE_PRO':      { label: 'iPhone Pro',     mode: 'preset',  width: 1206, height: 2622 },
        'IPHONE_PRO_MAX':  { label: 'iPhone Pro Max', mode: 'preset',  width: 1320, height: 2868 },
        'IPAD':            { label: 'iPad',           mode: 'preset',  width: 2064, height: 2752 },
        'DESKTOP':         { label: 'Desktop',        mode: 'preset',  width: 1920, height: 1080 },
        'SQUARE':          { label: 'Square',         mode: 'preset',  width: 2048, height: 2048 }
      }
    },
    providerSettings: {
      activeProvider: 'pollinations',
      providers: {
        pollinations: {
          enabled: true,
          apiKey: '',
          image: { selectedModel: 'gptimage', defaults: { nologo: true, private: true, enhance: false, safe: false } },
          text:  { selectedModel: 'gemini-search', defaults: {} }
        },
        openrouter: {
          enabled: false,
          apiKey: '',
          image: { selectedModel: '', defaults: {} },
          text:  { selectedModel: '', defaults: {} }
        }
      }
    }
  };
}

// Helper: Authenticate user — returns UserRecord or throws
async function authenticateUser(env: Env, userId: string, passkey: string): Promise<UserRecord> {
  if (!userId || !passkey) throw new Error('Missing userId or passkey');
  const user = await env.KV_USERS.get<UserRecord>(`USER:${userId}`, 'json');
  if (!user) throw new Error('AUTH_FAILED');
  const hashed = await hashPasskey(passkey);
  if (user.passkeyHash !== hashed) throw new Error('AUTH_FAILED');
  return user;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const method = request.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  // Router
  try {
    if (url.pathname === '/api/auth/login' && method === 'POST') {
      return await handleLogin(request, env);
    }
    if (url.pathname === '/api/providers/registry' && method === 'GET') {
        return jsonResponse({ ok: true, data: PROVIDER_REGISTRY });
    }
    if (url.pathname === '/api/providers/account' && method === 'GET') {
        return await handleGetProviderAccount(request, env);
    }
    if (url.pathname === '/api/providers/models' && method === 'GET') {
        return await handleGetProviderModels(request, env);
    }
    if (url.pathname === '/api/admin/create-user' && method === 'POST') {
      return await handleAdminCreateUser(request, env);
    }
    if (url.pathname === '/api/profiles/list' && method === 'GET') {
        return await handleListProfiles(request, env);
    }
    if (url.pathname === '/api/env' && method === 'GET') {
        const lat = parseFloat(url.searchParams.get('lat') || '0');
        const lon = parseFloat(url.searchParams.get('lon') || '0');
        const [weather, moon] = await Promise.all([
            getWeather(lat, lon),
            getMoonData(lat, lon)
        ]);
        return jsonResponse({ ok: true, data: { weather, moon } });
    }
    if (url.pathname === '/api/profile' && method === 'GET') {
      return await handleGetProfile(request, env);
    }
    if (url.pathname === '/api/profile' && method === 'PUT') {
      return await handleSaveProfile(request, env);
    }
    if (url.pathname === '/api/locations/sanitize' && method === 'POST') {
      return await handleSanitizeLocation(request, env);
    }
    if (url.pathname === '/api/poi/populate' && method === 'POST') {
      return await handlePopulatePOI(request, env);
    }
    if (url.pathname === '/api/poi/save' && method === 'POST') {
      return await handleSavePOI(request, env);
    }
    if (url.pathname === '/api/profile/delete' && method === 'DELETE') {
      return await handleDeleteProfile(request, env);
    }
    if (url.pathname === '/api/generate-image' && method === 'POST') {
      return await handleGenerateImage(request, env);
    }
    if (url.pathname === '/api/shortcuts/generate' && method === 'POST') {
      return await handleShortcutsGenerate(request, env);
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', { path: url.pathname }, 404);

  } catch (err: any) {
    return errorResponse('INTERNAL_ERROR', err.message || 'Unknown error', { stack: err.stack }, 500);
  }
};

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  const { userId, passkey } = body;

  if (!userId || !passkey) {
    return errorResponse('INVALID_INPUT', 'Missing userId or passkey');
  }

  const userKey = `USER:${userId}`;
  let user = await env.KV_USERS.get<UserRecord>(userKey, 'json');

  const hashed = await hashPasskey(passkey);

  if (!user) {
    if (userId === 'DEFAULT') {
      user = {
        userId: 'DEFAULT',
        passkeyHash: hashed,
        isAdmin: true,
        profiles: ['default']
      };
      await env.KV_USERS.put(userKey, JSON.stringify(user));
    } else {
      return errorResponse('AUTH_FAILED', 'Invalid credentials', {}, 401);
    }
  }

  if (user.passkeyHash !== hashed) {
    return errorResponse('AUTH_FAILED', 'Invalid credentials', {}, 401);
  }

  if (!user.profiles || user.profiles.length === 0) {
     user.profiles = ['default'];
     await env.KV_USERS.put(userKey, JSON.stringify(user));
  }

  return jsonResponse({ ok: true, data: { userId: user.userId, profiles: user.profiles } });
}

async function handleAdminCreateUser(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  const { adminPin, newUserId, newPasskey } = body;

  if (!adminPin || !newUserId || !newPasskey) {
    return errorResponse('INVALID_INPUT', 'Missing adminPin, newUserId, or newPasskey');
  }

  // Verify admin PIN from Cloudflare secret
  if (adminPin !== env.ADMIN_PIN) {
    return errorResponse('AUTH_FAILED', 'Invalid admin PIN', {}, 401);
  }

  const userKey = `USER:${newUserId}`;
  const existing = await env.KV_USERS.get(userKey);
  if (existing) {
    return errorResponse('CONFLICT', 'User already exists', { userId: newUserId }, 409);
  }

  const passkeyHash = await hashPasskey(newPasskey);
  const newUser: UserRecord = {
    userId: newUserId,
    passkeyHash,
    isAdmin: false,
    profiles: ['default']
  };

  await env.KV_USERS.put(userKey, JSON.stringify(newUser));

  // Create default profile for new user
  const defaultProfile = createDefaultProfile('default', 'Default Profile');
  await env.KV_PROFILES.put(`PROF:${newUserId}:default`, JSON.stringify(defaultProfile));

  return jsonResponse({ ok: true, data: { created: true, userId: newUserId } });
}

async function handleGetProfile(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const profileId = url.searchParams.get('profileId');

  if (!userId || !profileId) {
    return errorResponse('INVALID_INPUT', 'Missing userId or profileId');
  }

  const key = `PROF:${userId}:${profileId}`;
  let profile = await env.KV_PROFILES.get<ProfileSettings>(key, 'json');

  if (!profile) {
    profile = createDefaultProfile(profileId);
    await env.KV_PROFILES.put(key, JSON.stringify(profile));
  }

  return jsonResponse({ ok: true, data: profile });
}

async function handleSaveProfile(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { userId: string, profile: ProfileSettings };
  const { userId, profile } = body;

  if (!userId || !profile || !profile.id) {
    return errorResponse('INVALID_INPUT', 'Missing userId or profile data');
  }

  const key = `PROF:${userId}:${profile.id}`;
  await env.KV_PROFILES.put(key, JSON.stringify(profile));

  return jsonResponse({ ok: true, data: { saved: true, profileId: profile.id } });
}

function nominatimResultToLocation(r: any): LocationEntry {
  const addr = r.address || {};
  const id = `${addr.city || addr.town || addr.village || 'loc'}-${addr.state || addr.province || ''}-${addr.country || ''}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id,
    city: addr.city || addr.town || addr.village || addr.suburb || addr.county || 'Unknown',
    state: addr.state || addr.province || addr.region || '',
    country: addr.country || '',
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon)
  };
}

async function handleSanitizeLocation(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  const { city, state, country, save, selectedIndex } = body;

  try {
    const q = `${city || ''} ${state || ''} ${country || ''}`.trim();
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=5`;

    const res = await fetch(url, { headers: { 'User-Agent': 'Lumina-Neo/1.4.0' } });
    const results = await res.json() as any[];

    if (!results || results.length === 0) {
      return errorResponse('NOT_FOUND', 'Location not found');
    }

    // If a specific candidate was chosen, use it
    if (typeof selectedIndex === 'number' && results[selectedIndex]) {
      const location = nominatimResultToLocation(results[selectedIndex]);
      if (save) {
        await env.KV_LOCATIONS.put(`LOC:${location.id}`, JSON.stringify(location));
      }
      return jsonResponse({ ok: true, data: { status: 'ok', location } });
    }

    // Multiple distinct results — let the caller choose
    if (results.length > 1) {
      const candidates = results.map(nominatimResultToLocation);
      return jsonResponse({ ok: true, data: { status: 'multiple', candidates } });
    }

    // Single result
    const location = nominatimResultToLocation(results[0]);
    if (save) {
      await env.KV_LOCATIONS.put(`LOC:${location.id}`, JSON.stringify(location));
    }
    return jsonResponse({ ok: true, data: { status: 'ok', location } });

  } catch (err: any) {
    return errorResponse('GEOCODE_FAILED', err.message);
  }
}

async function handlePopulatePOI(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as any;
    const { userId, passkey, profileId, locationId, city, state, country, maxItems, refresh } = body;

    if (!locationId || !userId || !profileId) {
        return errorResponse('INVALID_INPUT', 'Missing required fields');
    }

    const key = `POI:${locationId}`;

    // Check cache before requiring city — cache hit needs no location name
    if (!refresh) {
        const cached = await env.KV_POI.get<POIEntry[]>(key, 'json');
        if (cached && cached.length > 0) {
            return jsonResponse({ ok: true, data: cached });
        }
    }

    // To generate POIs we need a city name
    if (!city) {
        return errorResponse('INVALID_INPUT', 'City is required to generate POIs');
    }

    const profKey = `PROF:${userId}:${profileId}`;
    const profile = await env.KV_PROFILES.get<ProfileSettings>(profKey, 'json');
    if (!profile) return errorResponse('NOT_FOUND', 'Profile not found');

    const providerId = profile.providerSettings.activeProvider;
    const providerCfg = profile.providerSettings.providers[providerId];
    const registry = PROVIDER_REGISTRY[providerId];

    if (!providerCfg || !providerCfg.enabled || !registry || !registry.categories.text) {
        return errorResponse('CONFIG_ERROR', 'Text provider not configured or enabled');
    }

    const model = providerCfg.text?.selectedModel || 'gemini-search';
    const limit = maxItems || 30;
    const isUS = country === 'United States' || country === 'US' || country === 'USA';
    const locationStr = isUS
        ? `the city of ${city} in the state of ${state}`
        : [city, state, country].filter(Boolean).join(', ');
    const systemPrompt = "You are an expert on points of interest and other unique and notable places of things views or vistas of requested locations. Do not cite sources or any additional information beyond returning one item per line with no formatting.";
    const userPrompt = `Task: Generate a list of up to ${limit} visually unique points of interest, landmarks, or vistas in or nearby ${locationStr}. Format Rules: 1. Output ONLY a raw JSON array of objects. 2. Do NOT include markdown code blocks (no backticks). 3. Do NOT include any introductory or concluding text. 4. Each object must have exactly two keys: "name" and "description". 5. "description" must be 1-2, concise sentences that visually describes the named point of interest.`;

    try {
        const response = await fetch(registry.categories.text.generate.url!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${providerCfg.apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        const result = await response.json() as any;
        let pois: POIEntry[] = [];
        
        const content = result.choices?.[0]?.message?.content || '[]';
        // Extract the JSON array by finding first [ and last ]
        const start = content.indexOf('[');
        const end = content.lastIndexOf(']');
        if (start === -1 || end === -1 || end < start) throw new Error('No JSON array found in AI response');
        const extracted = content.slice(start, end + 1)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/\r?\n|\r/g, ' ')
            .replace(/\t/g, ' ');
        pois = JSON.parse(extracted);

        if (Array.isArray(pois) && pois.length > 0) {
            await env.KV_POI.put(key, JSON.stringify(pois));
            return jsonResponse({ ok: true, data: pois });
        }
        
        throw new Error('No POIs returned from AI');

    } catch (err: any) {
        console.error('POI AI failed:', err);
        return errorResponse('GENERATION_FAILED', 'Failed to generate POIs: ' + err.message);
    }
}

async function handleSavePOI(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as any;
    const { locationId, pois } = body;

    if (!locationId || !Array.isArray(pois)) {
        return errorResponse('INVALID_INPUT', 'Missing locationId or pois array');
    }

    const key = `POI:${locationId}`;
    await env.KV_POI.put(key, JSON.stringify(pois));

    return jsonResponse({ ok: true, data: pois });
}

async function handleGenerateImage(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as any;
    const { userId, passkey, profileId, lat, lon, deviceSize } = body;

    try {
        await authenticateUser(env, userId, passkey);
    } catch {
        return errorResponse('AUTH_FAILED', 'Invalid credentials', {}, 401);
    }

    try {
        const result = await generateImagePipeline(env, {
            userId,
            profileId,
            lat,
            lon,
            deviceSize
        });

        return jsonResponse({
            ok: true,
            data: {
                imageUrl: result.imageUrl,
                debug: {
                    prompt: result.prompt,
                    promptVariables: result.promptVars,
                    provider: result.provider,
                    model: result.model,
                    width: result.width,
                    height: result.height
                }
            }
        });
    } catch (err: any) {
        return errorResponse('GENERATION_FAILED', err.message);
    }
}

async function handleShortcutsGenerate(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as any;
    const { userId, passkey, profileId, lat, lon } = body;

    try {
        await authenticateUser(env, userId, passkey);
    } catch {
        return errorResponse('AUTH_FAILED', 'Invalid credentials', {}, 401);
    }

    try {
        const result = await generateImagePipeline(env, {
            userId,
            profileId,
            lat,
            lon
        });

        return jsonResponse({
            ok: true,
            data: {
                imageUrl: result.imageUrl,
                poi: {
                    name: result.poi.name,
                    description: result.poi.description
                },
                meta: {
                    city: result.meta.city,
                    state_region: result.meta.state,
                    country: result.meta.country,
                    theme: result.meta.theme,
                    weather: result.meta.weather,
                    temperature: `${result.meta.temp}°F`
                }
            }
        });
    } catch (err: any) {
        return errorResponse('GENERATION_FAILED', err.message);
    }
}

async function handleGetProviderAccount(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const profileId = url.searchParams.get('profileId');
    const providerId = url.searchParams.get('providerId');

    if (!userId || !profileId || !providerId) return errorResponse('INVALID_INPUT', 'Missing params');

    const profKey = `PROF:${userId}:${profileId}`;
    const profile = await env.KV_PROFILES.get<ProfileSettings>(profKey, 'json');
    if (!profile) return errorResponse('NOT_FOUND', 'Profile not found');

    const providerCfg = profile.providerSettings.providers[providerId];
    if (!providerCfg || !providerCfg.apiKey) return errorResponse('CONFIG_ERROR', 'API Key not found');

    if (providerId === 'pollinations') {
        try {
            const [balanceRes, profileRes] = await Promise.all([
                fetch('https://gen.pollinations.ai/account/balance', {
                    headers: { 'Authorization': `Bearer ${providerCfg.apiKey}` }
                }),
                fetch('https://gen.pollinations.ai/account/profile', {
                    headers: { 'Authorization': `Bearer ${providerCfg.apiKey}` }
                })
            ]);

            const balance = await balanceRes.json() as any;
            const account = await profileRes.json() as any;

            return jsonResponse({
                ok: true,
                data: {
                    balance: Math.round((balance.balance || 0) * 100) / 100,
                    username: account.name || account.username || 'Unknown',
                    tier: account.displayTier || account.tier || 'Seed',
                    email: account.email || '',
                    nextResetAt: account.nextResetAt || ''
                }
            });
        } catch (err: any) {
            return errorResponse('PROVIDER_ERROR', err.message);
        }
    }

    return errorResponse('NOT_SUPPORTED', 'Account info not supported for this provider');
}

async function handleGetProviderModels(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const providerId = url.searchParams.get('providerId');
    const category = url.searchParams.get('category') || 'image'; // image or text

    if (providerId === 'pollinations') {
        try {
            const endpoint = category === 'image' 
                ? 'https://gen.pollinations.ai/image/models' 
                : 'https://gen.pollinations.ai/v1/models';
            
            const res = await fetch(endpoint);
            const data = await res.json() as any;

            let models = [];
            if (category === 'image') {
                // Filter models that can output image or video
                models = Array.isArray(data) ? data
                    .filter(m => m.output_modalities?.includes('image') || m.output_modalities?.includes('video'))
                    .map(m => {
                        const id = typeof m === 'string' ? m : (m.name || m.id);
                        return { id, label: id, paid: m.paid_only || false };
                    }) : [];
            } else {
                // Filter models that can output text
                models = (data.data || [])
                    .filter((m: any) => m.output_modalities?.includes('text'))
                    .map((m: any) => ({
                        id: m.name || m.id,
                        label: m.name || m.id,
                        paid: m.paid_only || false
                    }));
            }

            return jsonResponse({ ok: true, data: models });
        } catch (err: any) {
            return errorResponse('PROVIDER_ERROR', err.message);
        }
    }

    return errorResponse('NOT_SUPPORTED', 'Model discovery not supported for this provider');
}

async function handleListProfiles(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
        return errorResponse('INVALID_INPUT', 'Missing userId');
    }

    try {
        const { keys } = await env.KV_PROFILES.list({ prefix: `PROF:${userId}:` });
        const profilePromises = keys.map(async (key) => {
            const profile = await env.KV_PROFILES.get<ProfileSettings>(key.name, 'json');
            return profile ? { id: profile.id, name: profile.name } : null;
        });

        const profiles = (await Promise.all(profilePromises)).filter(p => p !== null);
        return jsonResponse({ ok: true, data: profiles });
    } catch (err: any) {
        console.error('Error listing profiles:', err);
        return errorResponse('INTERNAL_ERROR', 'Failed to list profiles', err.message);
    }
}

async function handleDeleteProfile(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const profileId = url.searchParams.get('profileId');

    if (!userId || !profileId) {
        return errorResponse('INVALID_INPUT', 'Missing userId or profileId');
    }

    try {
        // 1. Delete profile from KV_PROFILES
        const profileKey = `PROF:${userId}:${profileId}`;
        await env.KV_PROFILES.delete(profileKey);

        // 2. Remove profileId from UserRecord in KV_USERS
        const userKey = `USER:${userId}`;
        let user = await env.KV_USERS.get<UserRecord>(userKey, 'json');

        if (user) {
            user.profiles = user.profiles.filter(id => id !== profileId);
            await env.KV_USERS.put(userKey, JSON.stringify(user));
        }

        return jsonResponse({ ok: true, data: { deleted: true, profileId } });
    } catch (err: any) {
        console.error('Error deleting profile:', err);
        return errorResponse('INTERNAL_ERROR', 'Failed to delete profile', err.message);
    }
}
