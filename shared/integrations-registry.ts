// Single source of truth for the admin Integrations panel.
//
// Each provider maps to one row (keyed by `provider`) in either `chat_integrations`
// (AI/voice providers — column set: enabled, model, api_key) or `integration_settings`
// (external services — column set: is_enabled, api_key, location_id, calendar_id,
// plus a free-form `config` jsonb for provider-specific, non-secret settings).
//
// The backend uses this to mask secrets on read, validate writes, and route the
// upsert to the right table. The frontend uses the same list to render forms
// generically — add a provider here and it shows up in both places.

export type IntegrationTable = "chat" | "settings";

/** Field keys stored in the `config` jsonb column of integration_settings (no dedicated column). */
export const CONFIG_FIELD_KEYS = ["accountSid", "fromNumber", "messagingServiceSid"] as const;
export type ConfigFieldKey = (typeof CONFIG_FIELD_KEYS)[number];

export function isConfigFieldKey(key: string): key is ConfigFieldKey {
  return (CONFIG_FIELD_KEYS as readonly string[]).includes(key);
}

export interface IntegrationFieldDef {
  /** A real column on the target table, or a ConfigFieldKey (stored in `config`). */
  key: "apiKey" | "model" | "locationId" | "calendarId" | ConfigFieldKey;
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
  category: "Maps" | "Voice" | "AI" | "Pipeline" | "Messaging";
  fields: IntegrationFieldDef[];
  /** Primary or fallback for its job (voice transcription, AI text): shown as a hint on the card. */
  role?: "primary" | "fallback";
  /**
   * The server environment can supply this provider. "override": an env key wins over
   * whatever the panel saved. "fallback": the env is used while the panel's own config is
   * off or incomplete.
   */
  envMode?: "override" | "fallback";
  /** Phone sign-in codes are sent through it: turning it off can lock everyone out. */
  requiredForSignIn?: boolean;
  /** Kept working, but no longer the recommended way (labelled "Legacy"). */
  legacy?: boolean;
}

export const INTEGRATION_PROVIDERS: IntegrationProviderDef[] = [
  {
    provider: "google_places",
    label: "Google Places",
    description: "Business search at check-in and in prospecting, address autocomplete and map images.",
    table: "settings",
    category: "Maps",
    envMode: "fallback",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "AIza..." }],
  },
  {
    provider: "groq",
    label: "Groq — Whisper (voice)",
    description: "Primary for visit voice notes: turns the recording into text.",
    table: "chat",
    category: "Voice",
    role: "primary",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "gsk_..." }],
  },
  {
    provider: "openai",
    label: "OpenAI — Whisper (voice fallback)",
    description: "Fallback for visit voice notes: used when Groq is off or fails.",
    table: "chat",
    category: "Voice",
    role: "fallback",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "sk-..." }],
  },
  {
    provider: "openrouter",
    label: "OpenRouter — LLM",
    description: "Primary for AI text: visit summaries and suggested follow-ups.",
    table: "chat",
    category: "AI",
    role: "primary",
    envMode: "override",
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
    description: "Fallback for AI text: used when OpenRouter is off or has no key.",
    table: "chat",
    category: "AI",
    role: "fallback",
    envMode: "override",
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
    description: "Legacy contact, opportunity and task sync, kept for accounts that still use it. Xphere is the current CRM sync.",
    table: "settings",
    category: "Pipeline",
    legacy: true,
    fields: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "Private integration token" },
      // Every sync call is scoped to a location (helpers.ts), so it is required.
      { key: "locationId", label: "Location ID" },
      { key: "calendarId", label: "Calendar ID", optional: true },
    ],
  },
  {
    provider: "twilio",
    label: "Twilio | SMS",
    description: "Sign-in codes and team notices by SMS. Needs the Account SID, the Auth Token and a From number or a Messaging Service.",
    table: "settings",
    category: "Messaging",
    envMode: "fallback",
    requiredForSignIn: true,
    fields: [
      { key: "accountSid", label: "Account SID", placeholder: "AC..." },
      { key: "apiKey", label: "Auth Token", secret: true },
      { key: "fromNumber", label: "From number (E.164)", placeholder: "+15085550100", optional: true },
      { key: "messagingServiceSid", label: "Messaging Service SID", placeholder: "MG...", optional: true },
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
  /** Non-secret provider-specific values (ConfigFieldKey), only the ones that are filled. */
  config: Partial<Record<ConfigFieldKey, string>>;
  /** What is still missing for the provider to work, or null when it is ready. */
  problem: string | null;
  /** The same gap as a stable code, for the screen to word in its language. */
  problemCode: IntegrationProblemCode | null;
  /**
   * Where the configuration in force comes from: what is saved in this panel, the
   * server environment (see envMode), or nowhere (the provider is not in use).
   */
  source: IntegrationSource;
  /** The server environment has its own settings for this provider (see envMode). */
  envAvailable: boolean;
  updatedAt: string | null;
}

export type IntegrationSource = "panel" | "env" | "none";

export type IntegrationProblemCode =
  | "missing_api_key"
  | "missing_location_id"
  | "missing_account_sid"
  | "missing_auth_token"
  | "missing_sender";

const PROBLEM_MESSAGES: Record<IntegrationProblemCode, string> = {
  missing_api_key: "No API key on file, so calls will fail. Paste a key and click Save.",
  missing_location_id: "Location ID is missing; every sync needs it.",
  missing_account_sid: "Account SID is missing.",
  missing_auth_token: "Auth Token is missing.",
  missing_sender: "Set a From number or a Messaging Service SID.",
};

type ProblemState = { hasApiKey: boolean; config: Partial<Record<ConfigFieldKey, string>>; locationId?: string | null };

/** Setup gaps for a provider given what is saved, as a code. Null means it has everything it needs. */
export function integrationProblemCode(provider: string, state: ProblemState): IntegrationProblemCode | null {
  if (provider === "twilio") {
    if (!state.config.accountSid) return "missing_account_sid";
    if (!state.hasApiKey) return "missing_auth_token";
    if (!state.config.fromNumber && !state.config.messagingServiceSid) return "missing_sender";
    return null;
  }
  if (!state.hasApiKey) return "missing_api_key";
  if (provider === "gohighlevel" && !state.locationId?.trim()) return "missing_location_id";
  return null;
}

/** Setup gaps for a provider given what is saved, in English. Null means it has everything it needs. */
export function integrationProblem(provider: string, state: ProblemState): string | null {
  const code = integrationProblemCode(provider, state);
  return code ? PROBLEM_MESSAGES[code] : null;
}
