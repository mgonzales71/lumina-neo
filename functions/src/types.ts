// Data Models for Lumina-Neo
// Based on the provided architecture specification

/**
 * KV Namespace Bindings for Cloudflare Workers
 */
export interface Env {
  KV_USERS: KVNamespace;
  KV_PROFILES: KVNamespace;
  KV_LOCATIONS: KVNamespace;
  KV_POI: KVNamespace;
  KV_SYSTEM?: KVNamespace;
  ADMIN_PIN: string;
}

/**
 * Prompt Variables generated on the backend per request
 */
export interface PromptVariables {
  // Location
  lat: number;
  lon: number;
  city: string;
  state_region: string;
  country: string;
  geography_context: {
    urbanicity: "urban" | "suburban" | "rural";
    terrain: "mountains" | "flat";
    coast: "coastal" | "inland";
    near_water: boolean;
  };

  // Time
  iso_datetime: string;    // e.g. 2026-03-23T10:15:00Z
  date: string;            // DD-MM-YYYY
  time: string;            // HH:MM with AM/PM or 24h
  day_of_week: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  is_weekend: boolean;
  time_of_day_simple: "Daytime" | "Nighttime";
  time_of_day_bucket:
    | "blue_hour" | "golden_hour" | "dawn" | "morning"
    | "noon" | "afternoon" | "sunset" | "late_night";

  // Weather
  weather: string;           // "Clear", "Overcast", "Light rain", etc.
  precipitation_chance: number;
  temperature_f: number;
  wind_speed_mph: number;
  visibility_mi: number;
  cloud_cover_pct: number;
  uv_index: number;
  sun_strength: "low" | "medium" | "high";

  // Sun / moon
  sunrise: string;           // local HH:MM
  sunset: string;
  moon_phase: string;        // "waxing gibbous"
  moon_illumination_pct: number;
  moonrise: string;
  moonset: string;

  // Theme / profile
  theme: string;
  style: string;             // style ID, e.g. "hyper_photo_realistic"

  // POI
  poi_name: string;
  poi_desc: string;

  // Convenience aliases (short-form template variable names)
  time_of_day: "Daytime" | "Nighttime";
  datetime: string;
  temperature: string;
}

/**
 * Theme Entry
 * Begin/End encoded as MMDD integers (e.g. 505 for May 5)
 */
export interface ThemeEntry {
  Begin: number;
  End: number;
  Theme: string;
}

/**
 * Style Entry
 */
export interface StyleEntry {
  style: string;       // e.g. "hyper_photo_realistic"
  description: string; // human description
}

/**
 * Location Entry
 * Canonicalized locations after sanitization
 */
export interface LocationEntry {
  id: string;       // slug, e.g. "portland-or-usa"
  city: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
}

/**
 * POI Entry
 */
export interface POIEntry {
  name: string;
  description: string; // 1–2 concise, visual sentences
}

/**
 * Prompt Template
 */
export interface PromptTemplate {
  id: string;      // "POI_DAYTIME", "POI_NIGHTTIME"
  label: string;   // human label
  template: string; // template string with {variables}
  active: boolean;
}

/**
 * Image Sizes
 */
export type ImageMode = "dynamic" | "preset";

export interface ImageSize {
  label: string;
  mode: ImageMode;
  width: number | null;
  height: number | null;
}

export interface ImageSizeConfig {
  default: string;                // e.g. "DEVICE"
  sizes: Record<string, ImageSize>;
}

/**
 * Provider Registry Interfaces
 */
export interface ProviderFieldDef {
  key: string;
  type: "text" | "number" | "boolean" | "select";
  source?: "models";
  optional?: boolean;
  options?: string[]; // Added for select type support if needed
}

export interface ProviderGenerateDef {
  method: "GET" | "POST";
  urlTemplate?: string;
  url?: string;
  contentType?: string;
  promptLocation: "path" | "query" | "messages" | "body";
}

export interface ProviderCategory {
  enabled: boolean;
  modelsUrl?: string;
  multimodalModelsUrl?: string;
  generate: ProviderGenerateDef;
  fields: ProviderFieldDef[];
}

export interface ProviderDefinition {
  id: string;
  label: string;
  docsUrl: string;
  apiKeyUrl: string;
  auth: {
    type: "bearer";
    headerName: string;
    format: string;
  };
  categories: {
    image?: ProviderCategory;
    text?: ProviderCategory;
  };
}

export type ProviderRegistry = Record<string, ProviderDefinition>;

/**
 * User Specific Provider Settings
 */
export interface ProviderEndpointSettings {
  selectedModel: string;
  defaults: Record<string, string | number | boolean | null>;
}

export interface ProviderUserSettings {
  enabled: boolean;
  apiKey: string;
  image?: ProviderEndpointSettings;
  text?: ProviderEndpointSettings;
}

export interface ProviderSettingsRoot {
  activeProvider: string;
  providers: Record<string, ProviderUserSettings>;
}

/**
 * User Record
 */
export interface UserRecord {
  userId: string;
  passkeyHash: string;
  isAdmin: boolean;
  profiles: string[];
}

/**
 * Profile Settings
 */
export interface ProfileSettings {
  id: string;
  name: string;
  email?: string;

  // UI preferences (appearance is now frontend-only via localStorage)
  appearance?: "light" | "dark" | "auto";
  language: string;

  // Location mode
  locationMode?: 'gps' | 'custom';
  activeLocationId?: string | null;

  // Prompt & visual configuration
  activePromptDayId: string;
  activePromptNightId: string;
  activeStyleId: string;
  activeImageSizeId: string;

  // Domain data
  themes: ThemeEntry[];
  styles: StyleEntry[];
  locations: LocationEntry[];
  prompts: Record<string, PromptTemplate>;
  imageSizes: ImageSizeConfig;

  // AI providers
  providerSettings: ProviderSettingsRoot;
}

/**
 * API Standard Response Envelope
 */
export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
