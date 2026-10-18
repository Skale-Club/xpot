// Which saved provider does a job. Pure (no database, no SDKs) so the rules the
// Integrations panel promises are unit-tested:
//
//   Voice transcription: Groq first, OpenAI as the fallback when Groq is off or
//   fails. Each one only when its switch is on AND a key is saved.
//   AI text (summaries, sales actions): OpenRouter first, Gemini when OpenRouter
//   is not usable. A key in the server environment (OPENROUTER_API_KEY,
//   GEMINI_API_KEY) overrides what the panel saved for that provider.

export interface SavedProvider {
  apiKey?: string | null;
  enabled?: boolean | null;
  model?: string | null;
}

export interface ProviderPick {
  provider: string;
  apiKey: string;
  model: string | null;
  /** Where the key came from: the panel, or the server environment. */
  source: "panel" | "env";
}

function savedKey(row: SavedProvider | null | undefined): string | null {
  if (!row || row.enabled !== true) return null;
  const key = row.apiKey?.trim();
  return key ? key : null;
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Providers to try for a transcription, in order. Empty when none is usable. */
export function transcriptionProviders(saved: { groq?: SavedProvider | null; openai?: SavedProvider | null }): ProviderPick[] {
  const picks: ProviderPick[] = [];
  const groq = savedKey(saved.groq);
  if (groq) picks.push({ provider: "groq", apiKey: groq, model: "whisper-large-v3-turbo", source: "panel" });
  const openai = savedKey(saved.openai);
  if (openai) picks.push({ provider: "openai", apiKey: openai, model: "whisper-1", source: "panel" });
  return picks;
}

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** The LLM to use, or null when nothing is configured (callers then skip the AI step). */
export function chooseLLMProvider(
  env: Record<string, string | undefined>,
  saved: { openrouter?: SavedProvider | null; gemini?: SavedProvider | null },
): ProviderPick | null {
  const candidates = [
    { provider: "openrouter", envKey: env.OPENROUTER_API_KEY, envModel: env.OPENROUTER_MODEL, row: saved.openrouter, fallbackModel: DEFAULT_OPENROUTER_MODEL },
    { provider: "gemini", envKey: env.GEMINI_API_KEY, envModel: env.GEMINI_MODEL, row: saved.gemini, fallbackModel: DEFAULT_GEMINI_MODEL },
  ];
  for (const c of candidates) {
    const fromEnv = clean(c.envKey);
    if (fromEnv) return { provider: c.provider, apiKey: fromEnv, model: clean(c.envModel) ?? c.fallbackModel, source: "env" };
    const fromPanel = savedKey(c.row);
    if (fromPanel) {
      return { provider: c.provider, apiKey: fromPanel, model: clean(c.envModel) ?? clean(c.row?.model) ?? c.fallbackModel, source: "panel" };
    }
  }
  return null;
}
