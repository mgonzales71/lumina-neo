# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lumina Neo is a Cloudflare Pages SPA that generates contextually-aware AI images based on the user's location, current weather, time-of-day, and astronomical data. The backend runs as Cloudflare Pages Functions (TypeScript); the frontend is vanilla ES6+ JavaScript with no build step.

## Commands

```bash
npm run dev        # Local dev server via Wrangler (emulates Cloudflare Pages + Functions)
npm run deploy     # Deploy to Cloudflare Pages production
npm run typecheck  # TypeScript validation (no emit)
```

There is no build step — `public/` is served as-is. `wrangler pages dev public` is the complete dev command.

## Architecture

### Request Flow

```
Browser SPA (public/js/)
  └─ fetchApi() → POST /api/generate-image
        └─ functions/api/[[path]].ts  (router, 40+ endpoints)
              └─ generateImagePipeline()  (functions/src/pipeline.ts)
                    ├─ KV_PROFILES → load user profile
                    ├─ Nominatim API → reverse geocode lat/lon
                    ├─ KV_POI → load/select point of interest
                    ├─ Open-Meteo API → weather data
                    ├─ USNO API → moon phase/illumination
                    ├─ Build 50+ PromptVariables
                    ├─ renderPrompt() → final prompt string
                    └─ Pollinations.ai (or OpenRouter) → imageUrl
```

### Backend (`functions/`)

- **`api/[[path]].ts`** — Catch-all Pages Function. Pattern-matches `pathname` to route all requests. All responses are wrapped in `ApiResponse<T>`. Auth uses SHA-256 hashed passkeys stored in `KV_USERS`.
- **`src/pipeline.ts`** — `generateImagePipeline()` is the core orchestrator. Sequentially enriches context: geocode → POI → weather → moon → time-of-day → prompt rendering → image generation.
- **`src/types.ts`** — Single source of truth for all TypeScript types (`Env`, `PromptVariables`, `ProfileSettings`, `ProviderDefinition`, `ApiResponse<T>`, etc.).
- **`src/providers.ts`** — `PROVIDER_REGISTRY` maps provider IDs to endpoint configs. Pollinations.ai is enabled by default; OpenRouter is disabled.
- **`src/utils.ts`** — External API integrations: `reverseGeocode()`, `getWeather()`, `getMoonData()`, `renderPrompt()`, `resolveTheme()`.

### Frontend (`public/js/`)

- **`app.js`** — SPA bootstrap: checks auth, loads profile, applies appearance, sets up tab navigation with lazy-loaded modules.
- **`state.js`** — `AppState` global with localStorage persistence (`userId`, `profileId`, `currentProfile`, `activeTab`).
- **`api.js`** — `fetchApi()` wrapper that returns `json.data` on success or throws on error.
- **`ui-*.js`** — One module per tab (home, locations, poi, themes, styles, prompts, sizes, providers, profiles). Loaded on demand by `loadTabContent()`.

### Storage (Cloudflare KV)

| Namespace | Key Pattern | Contents |
|-----------|-------------|----------|
| `KV_USERS` | `USER:{userId}` | Hashed passkey, created date |
| `KV_PROFILES` | `PROF:{userId}:{profileId}` | Full `ProfileSettings` JSON |
| `KV_LOCATIONS` | `LOC:{locationId}` | Geocoded location data |
| `KV_POI` | `POI:{locationId}` | Points of interest array |

## Key Conventions

- **Version tracking**: Update the version number in any file you modify. Version is also stored in `wrangler.jsonc` as `VERSION`.
- **No truncation**: Always return complete file contents when editing — never use `// ...` or `/* existing code */` placeholders.
- **No unrequested refactoring**: Only modify code directly related to the requested change. Preserve all existing imports and function signatures.
- **Preserve imports**: All imports in `[[path]].ts` and pipeline files must remain intact when editing.
- **`functions/src/index.ts`** is a legacy backup entry — all routing changes go in `[[path]].ts`.
- **Frontend JS files** (`public/js/*.js`) are plain ES modules, not TypeScript — no type annotations or `as` casts.
- **Utils import path**: UI modules import from `'./utils.js'` (same directory), not `'../utils.js'`.
- **`fetchApi()` already unwraps `json.data`** — do not add `.data` again on the return value.
- **Time calculations in `pipeline.ts`** use `localNow` (UTC + `weather.utcOffsetSeconds`) for correct local time — `new Date()` alone is UTC on Cloudflare Workers.
- **`authenticateUser(env, userId, passkey)`** is the shared auth helper in `[[path]].ts` — use it before any sensitive operation.
