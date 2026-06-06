// Single source of truth for the admin Integrations panel.
//
// Each provider maps to one row (keyed by `provider`) in either `chat_integrations`
// (AI/voice providers — column set: enabled, model, api_key) or `integration_settings`
// (external services — column set: is_enabled, api_key, location_id, calendar_id).
//
// The backend uses this to mask secrets on read, validate writes, and route the
// upsert to the right table. The frontend uses the same list to render forms
// generically — add a provider here and it shows up in both places.

export type IntegrationTable = "chat" | "settings";

export interface IntegrationFieldDef {
  /** Maps to a real column on the target table. */
  key: "apiKey" | "model" | "locationId" | "calendarId";
  label: string;
  /** Render as a password input and mask on read. */
  secret?: boolean;
  placeholder?: string;
  optional?: boolean;
  /** Render as a searchable select. Typed custom values are still allowed. */
  options?: string[];
}

export interface IntegrationProviderDef {
  provider: string;
  label: string;
  description: string;
  table: IntegrationTable;
  /** "Used for" badge in the UI. */
  category: "Maps" | "Voice" | "AI" | "Pipeline";
  fields: IntegrationFieldDef[];
  /**
   * Optional group id — only one provider in a group can be enabled at a time.
   * The UI auto-disables siblings when you turn one on; the server enforces
   * the same invariant on save so direct API calls can't violate it.
   */
  mutexGroup?: string;
}

export const INTEGRATION_PROVIDERS: IntegrationProviderDef[] = [
  {
    provider: "google_places",
    label: "Google Places",
    description: "Business search at check-in (Places API v1).",
    table: "settings",
    category: "Maps",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "AIza..." }],
  },
  {
    provider: "groq",
    label: "Groq — Whisper (voice)",
    description: "Visit audio transcription (whisper-large-v3-turbo). Primary voice provider.",
    table: "chat",
    category: "Voice",
    mutexGroup: "voice",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "gsk_..." }],
  },
  {
    provider: "openai",
    label: "OpenAI — Whisper (voice fallback)",
    description: "Transcription fallback when Groq fails (/audio/transcriptions, whisper-1).",
    table: "chat",
    category: "Voice",
    mutexGroup: "voice",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "sk-..." }],
  },
  {
    provider: "openrouter",
    label: "OpenRouter — LLM",
    description: "Visit summaries and other AI functions. Primary LLM provider.",
    table: "chat",
    category: "AI",
    fields: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "sk-or-..." },
      {
        key: "model",
        label: "Model",
        placeholder: "openai/gpt-4o-mini",
        optional: true,
        options: [
          "openai/gpt-4o-mini",
          "openai/gpt-4o",
          "openai/gpt-4.1-mini",
          "openai/gpt-4.1",
          "anthropic/claude-3.5-sonnet",
          "anthropic/claude-3.7-sonnet",
          "google/gemini-2.5-flash",
          "google/gemini-2.5-pro",
          "meta-llama/llama-3.3-70b-instruct",
          "qwen/qwen-2.5-72b-instruct",
          "deepseek/deepseek-chat",
        ],
      },
    ],
  },
  {
    provider: "gemini",
    label: "Gemini — LLM (fallback)",
    description: "Summary fallback when OpenRouter is not configured.",
    table: "chat",
    category: "AI",
    fields: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "AIza..." },
      {
        key: "model",
        label: "Model",
        placeholder: "gemini-2.5-flash",
        optional: true,
        options: [
          "gemini-2.5-flash",
          "gemini-2.5-flash-lite",
          "gemini-2.5-pro",
          "gemini-2.0-flash",
          "gemini-1.5-flash",
          "gemini-1.5-pro",
        ],
      },
    ],
  },
  {
    provider: "gohighlevel",
    label: "GoHighLevel",
    description: "Contact, opportunity and task sync.",
    table: "settings",
    category: "Pipeline",
    fields: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "Bearer token / PIT" },
      { key: "locationId", label: "Location ID", optional: true },
      { key: "calendarId", label: "Calendar ID", optional: true },
    ],
  },
];

export function getProviderDef(provider: string): IntegrationProviderDef | undefined {
  return INTEGRATION_PROVIDERS.find((p) => p.provider === provider);
}

/** All providers sharing the same mutex group (excluding the given one). */
export function getMutexSiblings(provider: string): IntegrationProviderDef[] {
  const def = getProviderDef(provider);
  if (!def?.mutexGroup) return [];
  return INTEGRATION_PROVIDERS.filter(
    (p) => p.provider !== provider && p.mutexGroup === def.mutexGroup
  );
}

/** Shape returned to the browser — secrets are masked, never the raw key. */
export interface IntegrationStatus {
  provider: string;
  enabled: boolean;
  model: string | null;
  locationId: string | null;
  calendarId: string | null;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  updatedAt: string | null;
}
