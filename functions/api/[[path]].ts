/**
 * Lumina Neo Pages Functions API Entry Point
 * Version: v1.1.1
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
        pollinations: { 
          enabled: true, 
          apiKey: '',
          image: { selectedModel: 'flux', defaults: {} },
          text: { selectedModel: 'openai', defaults: {} }
        },
        openrouter: { 
          enabled: false, 
          apiKey: '',
          image: { selectedModel: '', defaults: {} },
          text: { selectedModel: '', defaults: {} }
        }
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
    const { userId, passkey, profileId, locationId, city, state, country, maxItems, refresh } = body;

    if (!locationId || !userId || !profileId) {
        return errorResponse('INVALID_INPUT', 'Missing required fields');
    }

    const key = `POI:${locationId}`;
    
    if (!refresh) {
        const cached = await env.KV_POI.get<POIEntry[]>(key, 'json');
        if (cached && cached.length > 0) {
            return jsonResponse({ ok: true, data: cached });
        }
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

    const model = providerCfg.text?.selectedModel || 'openai';
    const systemPrompt = "You are a travel assistant. Return a JSON array of interesting landmarks or points of interest for the given location. Each object MUST have 'name' and 'description' (1-2 sentences). NO OTHER TEXT. MAX " + (maxItems || 10) + " items.";
    const userPrompt = `Location: ${city}, ${state}, ${country}`;

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
        const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
        pois = JSON.parse(cleaned);

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
                    balance: balance.balance || 0,
                    username: account.username || 'unknown',
                    tier: account.tier || 'Seed',
                    email: account.email
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
                models = Array.isArray(data) ? data.map(m => {
                    const id = typeof m === 'string' ? m : m.id;
                    return { id, label: id, paid: m.paid_only || false };
                }) : [];
            } else {
                models = (data.data || []).map((m: any) => ({
                    id: m.id,
                    label: m.id,
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
