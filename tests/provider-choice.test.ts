// The Integrations panel promises "Groq first, OpenAI as fallback" and "OpenRouter
// first, Gemini as fallback", each only when switched on. These are the rules
// the voice-note and AI-summary code actually follows.

import { describe, expect, it } from "vitest";
import { chooseLLMProvider, transcriptionProviders } from "../server/lib/providerChoice";

const on = (apiKey: string, model: string | null = null) => ({ apiKey, enabled: true, model });
const off = (apiKey: string) => ({ apiKey, enabled: false });

describe("transcriptionProviders", () => {
  it("tries Groq, then OpenAI, when both are on", () => {
    expect(transcriptionProviders({ groq: on("gsk"), openai: on("sk") }).map((p) => p.provider)).toEqual(["groq", "openai"]);
  });

  it("never uses a provider that is switched off, even with a key", () => {
    expect(transcriptionProviders({ groq: off("gsk"), openai: on("sk") }).map((p) => p.provider)).toEqual(["openai"]);
    expect(transcriptionProviders({ groq: on("gsk"), openai: off("sk") }).map((p) => p.provider)).toEqual(["groq"]);
    expect(transcriptionProviders({ groq: off("gsk"), openai: off("sk") })).toEqual([]);
  });

  it("skips a provider with no key or a blank one", () => {
    expect(transcriptionProviders({ groq: on(""), openai: on("  ") })).toEqual([]);
    expect(transcriptionProviders({ groq: { enabled: true, apiKey: null }, openai: undefined })).toEqual([]);
  });

  it("treats a missing switch (never saved) as off", () => {
    expect(transcriptionProviders({ groq: { apiKey: "gsk", enabled: null } })).toEqual([]);
  });

  it("names the Whisper model each one runs", () => {
    expect(transcriptionProviders({ groq: on(" gsk "), openai: on("sk") })).toEqual([
      { provider: "groq", apiKey: "gsk", model: "whisper-large-v3-turbo", source: "panel" },
      { provider: "openai", apiKey: "sk", model: "whisper-1", source: "panel" },
    ]);
  });
});

describe("chooseLLMProvider", () => {
  it("prefers OpenRouter, then Gemini", () => {
    expect(chooseLLMProvider({}, { openrouter: on("or"), gemini: on("gm") })?.provider).toBe("openrouter");
    expect(chooseLLMProvider({}, { openrouter: off("or"), gemini: on("gm") })?.provider).toBe("gemini");
  });

  it("honours Gemini's switch", () => {
    expect(chooseLLMProvider({}, { openrouter: off("or"), gemini: off("gm") })).toBeNull();
    expect(chooseLLMProvider({}, { gemini: { apiKey: "gm" } })).toBeNull();
  });

  it("lets the server environment override the panel", () => {
    const pick = chooseLLMProvider({ OPENROUTER_API_KEY: "env-or" }, { openrouter: off("panel-or"), gemini: on("gm") });
    expect(pick).toMatchObject({ provider: "openrouter", apiKey: "env-or", source: "env", model: "openai/gpt-4o-mini" });
    expect(chooseLLMProvider({ GEMINI_API_KEY: "env-gm", GEMINI_MODEL: "gemini-2.5-pro" }, {})).toMatchObject({
      provider: "gemini",
      apiKey: "env-gm",
      model: "gemini-2.5-pro",
      source: "env",
    });
  });

  it("uses the panel's model, the env model winning over it", () => {
    expect(chooseLLMProvider({}, { openrouter: on("or", "anthropic/claude-3.7-sonnet") })?.model).toBe("anthropic/claude-3.7-sonnet");
    expect(chooseLLMProvider({ OPENROUTER_MODEL: "openai/gpt-4o" }, { openrouter: on("or", "x/y") })?.model).toBe("openai/gpt-4o");
    expect(chooseLLMProvider({}, { gemini: on("gm") })?.model).toBe("gemini-2.5-flash");
  });
});
