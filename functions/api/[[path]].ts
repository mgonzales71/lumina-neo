/**
 * Lumina Neo Pages Functions API Entry Point
 * Version: v1.0.1
 */
import { Env, ApiResponse, UserRecord, ProfileSettings, LocationEntry, POIEntry, PromptVariables } from '../src/types';
import { PROVIDER_REGISTRY } from '../src/providers';
import { renderPrompt, reverseGeocode, getWeather, resolveTheme } from '../src/utils';
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
function createDefaultProfile(id: string): ProfileSettings {
  return {
    id,
    name: 'Default Profile',
    theme: 'dark',
    language: 'en',
    activePromptDayId: 'POI_DAYTIME',
    activePromptNightId: 'POI_NIGHTTIME',
    activeStyleId: 'photorealistic',
    activeImageSizeId: 'DEVICE',
    themes: [],
    styles: [
      { style: 'photorealistic', description: 'Highly detailed, photorealistic 8k image' }
    ],
    locations: [],
    prompts: {
      'POI_DAYTIME': { id: 'POI_DAYTIME', label: 'Daytime', template: 'A beautiful daytime shot of {poi_name}, {weather}, {style}', active: true },
      'POI_NIGHTTIME': { id: 'POI_NIGHTTIME', label: 'Nighttime', template: 'A cinematic nighttime shot of {poi_name}, {weather}, {style}', active: true }
    },
    imageSizes: {
      default: 'DEVICE',
      sizes: {
        'DEVICE': { label: 'This Device', mode: 'dynamic', width: null, height: null }
      }
    },
    providerSettings: {
      activeProvider: 'pollinations',
      providers: {
        pollinations: { enabled: true, apiKey: '' },
        openrouter: { enabled: false, apiKey: '' }
      }
    }
  };
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
    // Note: In Pages Functions, url.pathname includes /api/...
    if (url.pathname === '/api/auth/login' && method === 'POST') {
      return await handleLogin(request, env);
    }
    if (url.pathname === '/api/providers/registry' && method === 'GET') {
        return jsonResponse({ ok: true, data: PROVIDER_REGISTRY });
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

// --- Route Handlers (Mostly unchanged, using Env from context) ---

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

async function handleSanitizeLocation(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  const { city, state, country, save } = body;

  const mockId = `${city}-${state}-${country}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  const location: LocationEntry = {
    id: mockId,
    city: city || 'Unknown City',
    state: state || '',
    country: country || 'Unknown Country',
    lat: 45.52,
    lon: -122.67
  };

  if (save) {
      await env.KV_LOCATIONS.put(`LOC:${location.id}`, JSON.stringify(location));
  }

  return jsonResponse({ ok: true, data: { status: 'ok', location } });
}

async function handlePopulatePOI(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as any;
    const { locationId, refresh, maxItems } = body;

    if (!locationId) {
        return errorResponse('INVALID_INPUT', 'Missing locationId');
    }

    const key = `POI:${locationId}`;
    
    if (!refresh) {
        const cached = await env.KV_POI.get<POIEntry[]>(key, 'json');
        if (cached && cached.length > 0) {
            return jsonResponse({ ok: true, data: cached });
        }
    }

    const mockPOIs: POIEntry[] = [
        { name: 'Central Park', description: 'A large public park in the middle of Manhattan.' },
        { name: 'Empire State Building', description: 'A 102-story Art Deco skyscraper.' },
        { name: 'Statue of Liberty', description: 'A colossal neoclassical sculpture on Liberty Island.' }
    ];

    await env.KV_POI.put(key, JSON.stringify(mockPOIs));

    return jsonResponse({ ok: true, data: mockPOIs });
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
