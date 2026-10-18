// AI/LLM client resolution for Xpot.
// Reuses the OpenAI SDK shape (chat.completions.create) for every provider via
// their OpenAI-compatible endpoints, so callers stay provider-agnostic.
//
// Which provider runs is decided by chooseLLMProvider (providerChoice.ts):
//   1. OpenRouter — env OPENROUTER_API_KEY, else the panel's "openrouter" row when switched on
//   2. Gemini     — env GEMINI_API_KEY,     else the panel's "gemini" row when switched on
// Returns null when nothing is configured, so callers degrade gracefully.
//
// Keys are read fresh (no module cache) so admin edits take effect immediately.

import { OpenAI } from "openai";
import { storage } from "../storage.js";
import { chooseLLMProvider } from "./providerChoice.js";

const GEMINI_OPENAI_COMPAT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface AIClient {
  client: OpenAI;
  model: string;
}

/** General-purpose LLM client: OpenRouter preferred, Gemini fallback. */
export async function getLLMClient(): Promise<AIClient | null> {
  const [openrouter, gemini] = await Promise.all([
    storage.getChatIntegration("openrouter"),
    storage.getChatIntegration("gemini"),
  ]);
  const pick = chooseLLMProvider(process.env, { openrouter, gemini });
  if (!pick) return null;
  const baseURL = pick.provider === "openrouter" ? OPENROUTER_BASE_URL : GEMINI_OPENAI_COMPAT_BASE_URL;
  return { client: new OpenAI({ apiKey: pick.apiKey, baseURL }), model: pick.model ?? "" };
}
