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
}

export interface IntegrationProviderDef {
  provider: string;
  label: string;
  description: string;
  table: IntegrationTable;
  /** "Used for" badge in the UI. */
  category: "Maps" | "Voice" | "AI" | "CRM";
  fields: IntegrationFieldDef[];
}

export const INTEGRATION_PROVIDERS: IntegrationProviderDef[] = [
  {
    provider: "google_places",
    label: "Google Places",
    description: "Busca de empresas no check-in (Places API v1).",
    table: "settings",
    category: "Maps",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "AIza..." }],
  },
  {
    provider: "groq",
    label: "Groq — Whisper (voz)",
    description: "Transcrição de áudio das visitas (whisper-large-v3-turbo). Provedor primário de voz.",
    table: "chat",
    category: "Voice",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "gsk_..." }],
  },
  {
    provider: "openai",
    label: "OpenAI — Whisper (fallback de voz)",
    description: "Fallback de transcrição quando o Groq falha (/audio/transcriptions, whisper-1).",
    table: "chat",
    category: "Voice",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "sk-..." }],
  },
  {
    provider: "openrouter",
    label: "OpenRouter — LLM",
    description: "Sumarização das visitas e demais funções de IA. Provedor primário de LLM.",
    table: "chat",
    category: "AI",
    fields: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "sk-or-..." },
      { key: "model", label: "Modelo", placeholder: "openai/gpt-4o-mini", optional: true },
    ],
  },
  {
    provider: "gemini",
    label: "Gemini — LLM (fallback)",
    description: "Fallback de sumarização quando o OpenRouter não está configurado.",
    table: "chat",
    category: "AI",
    fields: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "AIza..." },
      { key: "model", label: "Modelo", placeholder: "gemini-2.5-flash", optional: true },
    ],
  },
  {
    provider: "gohighlevel",
    label: "GoHighLevel (CRM)",
    description: "Sincronização de contatos, oportunidades e tarefas.",
    table: "settings",
    category: "CRM",
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
