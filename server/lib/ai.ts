// AI/LLM client resolution for Xpot.
// Reuses the OpenAI SDK shape (chat.completions.create) for every provider via
// their OpenAI-compatible endpoints, so callers stay provider-agnostic.
//
// Resolution order for the general LLM client (summaries, etc.):
//   1. OpenRouter — env OPENROUTER_API_KEY, else chat_integrations."openrouter"
//   2. Gemini     — env GEMINI_API_KEY,     else chat_integrations."gemini"
// Returns null when nothing is configured, so callers degrade gracefully.
//
// Keys are read fresh (no module cache) so admin edits take effect immediately.

import { OpenAI } from "openai";
import { storage } from "../storage.js";

const GEMINI_OPENAI_COMPAT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface AIClient {
  client: OpenAI;
  model: string;
}

export async function getOpenRouterClient(): Promise<AIClient | null> {
  let apiKey = process.env.OPENROUTER_API_KEY || null;
  let model = process.env.OPENROUTER_MODEL || null;
  if (!apiKey) {
    const integration = await storage.getChatIntegration("openrouter");
    if (integration?.apiKey && integration.enabled !== false) {
      apiKey = integration.apiKey;
      model = model || integration.model || null;
    }
  }
  if (!apiKey) return null;
  return {
    client: new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL }),
    model: model || "openai/gpt-4o-mini",
  };
}

export async function getGeminiClient(): Promise<AIClient | null> {
  let apiKey = process.env.GEMINI_API_KEY || null;
  let model = process.env.GEMINI_MODEL || null;
  if (!apiKey) {
    const integration = await storage.getChatIntegration("gemini");
    if (integration?.apiKey) {
      apiKey = integration.apiKey;
      model = model || integration.model || null;
    }
  }
  if (!apiKey) return null;
  return {
    client: new OpenAI({ apiKey, baseURL: GEMINI_OPENAI_COMPAT_BASE_URL }),
    model: model || "gemini-2.5-flash",
  };
}

/** General-purpose LLM client: OpenRouter preferred, Gemini fallback. */
export async function getLLMClient(): Promise<AIClient | null> {
  return (await getOpenRouterClient()) || (await getGeminiClient());
}
