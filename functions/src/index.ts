/**
 * Lumina Neo Backend
 * Version: v1.0.1
 * Cloudflare Worker for API services
 */
import { Env, ApiResponse, UserRecord, ProfileSettings, LocationEntry, POIEntry, PromptVariables } from './types';
import { PROVIDER_REGISTRY } from './providers';
import { renderPrompt, reverseGeocode, getWeather, resolveTheme } from './utils';
import { generateImagePipeline } from './pipeline';

// CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Adjust in production
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

// Main Worker Handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
  },
};

// --- Route Handlers ---

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  const { userId, passkey } = body;

  if (!userId || !passkey) {
    return errorResponse('INVALID_INPUT', 'Missing userId or passkey');
  }

  // Check if user exists
  const userKey = `USER:${userId}`;
  let user = await env.KV_USERS.get<UserRecord>(userKey, 'json');

  const hashed = await hashPasskey(passkey);

  if (!user) {
    // For prototype simplicity: if user is DEFAULT and not found, create it
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

  // Initialize default profile if needed
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

  // TODO: Verify auth token/passkey if we were being strict, 
  // but for now relying on previous login success in client
  
  const key = `PROF:${userId}:${profileId}`;
  let profile = await env.KV_PROFILES.get<ProfileSettings>(key, 'json');

  if (!profile) {
    // Create default if missing (lazy init)
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

  // Mock Geocoding Logic
  // In reality, call Google Maps/Mapbox/OpenCage API
  
  const mockId = `${city}-${state}-${country}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  const location: LocationEntry = {
    id: mockId,
    city: city || 'Unknown City',
    state: state || '',
    country: country || 'Unknown Country',
    lat: 45.52, // Mock lat (Portland)
    lon: -122.67 // Mock lon
  };

  // If "save" is true, we should save to KV_LOCATIONS (global registry)
  // But usually client saves to their profile. 
  // The prompt says: "If save is true... Persist to KV_LOCATIONS... Optionally also update profile"
  // Here we just return the sanitized location for the client to confirm/save.
  
  if (save) {
      await env.KV_LOCATIONS.put(`LOC:${location.id}`, JSON.stringify(location));
  }

  return jsonResponse({ 
      ok: true, 
      data: { 
          status: 'ok', 
          location 
      } 
  });
}

async function handlePopulatePOI(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as any;
    const { locationId, refresh, maxItems } = body;

    if (!locationId) {
        return errorResponse('INVALID_INPUT', 'Missing locationId');
    }

    const key = `POI:${locationId}`;
    
    // Check Cache
    if (!refresh) {
        const cached = await env.KV_POI.get<POIEntry[]>(key, 'json');
        if (cached && cached.length > 0) {
            return jsonResponse({ ok: true, data: cached });
        }
    }

    // Generate (Mock AI)
    // In reality, call Provider based on settings
    const mockPOIs: POIEntry[] = [
        { name: 'Central Park', description: 'A large public park in the middle of Manhattan.' },
        { name: 'Empire State Building', description: 'A 102-story Art Deco skyscraper.' },
        { name: 'Statue of Liberty', description: 'A colossal neoclassical sculpture on Liberty Island.' }
    ];

    // Persist
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

    // Optional: Verify passkey here if strict

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

    // Optional: Verify passkey

    try {
        const result = await generateImagePipeline(env, {
            userId,
            profileId,
            lat,
            lon
        });

        // Simplified JSON for Shortcuts
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
