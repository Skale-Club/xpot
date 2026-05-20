// Minimal Gemini-only AI client for Xpot.
// Uses the Google OpenAI-compat endpoint so we can reuse the OpenAI SDK shape
// (chat.completions.create) without adding a second SDK.
//
// Key resolution order:
//   1. process.env.GEMINI_API_KEY (env override — useful for dev)
//   2. chat_integrations.gemini.apiKey (admin-configured in skaleclub)
// Returns null when no key is found, so callers can degrade gracefully.

import { OpenAI } from "openai";
import { storage } from "../storage.js";

const GEMINI_OPENAI_COMPAT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

export interface AIClient {
  client: OpenAI;
  model: string;
}

let cachedKey: string | null = null;

export async function getGeminiClient(): Promise<AIClient | null> {
  if (process.env.GEMINI_API_KEY) {
    cachedKey = process.env.GEMINI_API_KEY;
  }
  if (!cachedKey) {
    const integration = await storage.getChatIntegration("gemini");
    if (integration?.apiKey) cachedKey = integration.apiKey;
  }
  if (!cachedKey) return null;

  return {
    client: new OpenAI({ apiKey: cachedKey, baseURL: GEMINI_OPENAI_COMPAT_BASE_URL }),
    // gemini-2.5-flash is the standard project default for cheap tool calls.
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}
