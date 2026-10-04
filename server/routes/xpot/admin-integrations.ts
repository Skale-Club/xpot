import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotManager } from "./middleware.js";
import {
  INTEGRATION_PROVIDERS,
  getProviderDef,
  getMutexSiblings,
  isConfigFieldKey,
  type ConfigFieldKey,
} from "#shared/integrations-registry.js";
import { invalidateSmsConfig } from "../../auth/sms.js";
import { checkTwilioConfig } from "../../auth/twilioCheck.js";
import { maskIntegration, mergeConfigPatch, readConfig } from "./integrationStatus.js";

const TEST_TIMEOUT_MS = 15000;
const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const putSchema = z.object({
  apiKey: z.string().trim().optional(),
  model: z.string().trim().max(120).optional().nullable(),
  locationId: z.string().trim().max(120).optional().nullable(),
  calendarId: z.string().trim().max(120).optional().nullable(),
  // Twilio, kept in integration_settings.config. "" clears a value.
  accountSid: z.string().trim().regex(/^(AC[0-9a-zA-Z]{32})?$/, "Account SID starts with AC and has 34 characters").optional(),
  fromNumber: z.string().trim().regex(/^(\+[1-9]\d{6,14})?$/, "From number must be in E.164 format, e.g. +15085550100").optional(),
  messagingServiceSid: z.string().trim().regex(/^(MG[0-9a-zA-Z]{32})?$/, "Messaging Service SID starts with MG and has 34 characters").optional(),
  enabled: z.boolean().optional(),
});
const testSchema = putSchema.omit({ enabled: true });

export function createAdminIntegrationsRouter() {
  const router = Router();
  router.use(requireXpotManager);

  // List every provider's masked status (registry ⨝ DB).
  router.get("/admin/integrations", async (_req, res) => {
    const [chat, settings] = await Promise.all([
      storage.listChatIntegrations(),
      storage.listIntegrationSettings(),
    ]);
    const chatByProvider = new Map(chat.map((r) => [r.provider, r]));
    const settingsByProvider = new Map(settings.map((r) => [r.provider, r]));

    const items = INTEGRATION_PROVIDERS.map((def) => {
      const row = def.table === "chat" ? chatByProvider.get(def.provider) : settingsByProvider.get(def.provider);
      return maskIntegration(def.provider, row);
    });

    res.json({ providers: INTEGRATION_PROVIDERS, status: items });
  });

  // Upsert one provider. Empty/omitted apiKey keeps the stored secret.
  router.put("/admin/integrations/:provider", async (req, res) => {
    const def = getProviderDef(req.params.provider);
    if (!def) return res.status(404).json({ message: "Unknown provider" });

    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }
    const body = parsed.data;

    if (def.table === "chat") {
      const data: Record<string, unknown> = {};
      if (body.apiKey) data.apiKey = body.apiKey;
      if (body.model !== undefined) data.model = body.model;
      if (body.enabled !== undefined) data.enabled = body.enabled;
      const saved = await storage.upsertChatIntegration(def.provider, data);
      // Mutex enforcement: enabling this provider disables siblings in the same group.
      if (body.enabled === true) {
        for (const sibling of getMutexSiblings(def.provider)) {
          if (sibling.table === "chat") {
            await storage.upsertChatIntegration(sibling.provider, { enabled: false });
          } else {
            await storage.upsertIntegrationSettings(sibling.provider, { isEnabled: false });
          }
        }
      }
      return res.json(maskIntegration(def.provider, saved));
    } else {
      const data: Record<string, unknown> = {};
      if (body.apiKey) data.apiKey = body.apiKey;
      if (body.locationId !== undefined) data.locationId = body.locationId;
      if (body.calendarId !== undefined) data.calendarId = body.calendarId;
      if (body.enabled !== undefined) data.isEnabled = body.enabled;
      const configPatch = pickConfig(body);
      if (Object.keys(configPatch).length) {
        const existing = await storage.getIntegrationSettings(def.provider);
        data.config = mergeConfigPatch(def.provider, existing?.config, configPatch);
      }
      const saved = await storage.upsertIntegrationSettings(def.provider, data);
      if (body.enabled === true) {
        for (const sibling of getMutexSiblings(def.provider)) {
          if (sibling.table === "chat") {
            await storage.upsertChatIntegration(sibling.provider, { enabled: false });
          } else {
            await storage.upsertIntegrationSettings(sibling.provider, { isEnabled: false });
          }
        }
      }
      if (def.provider === "twilio") invalidateSmsConfig();
      return res.json(maskIntegration(def.provider, saved));
    }
  });

  // Test the stored credentials for a provider.
  router.post("/admin/integrations/:provider/test", async (req, res) => {
    const def = getProviderDef(req.params.provider);
    if (!def) {
      console.warn(`[admin-integrations] Test requested for unknown provider: ${req.params.provider}`);
      return res.status(404).json({ ok: false, message: "Unknown provider" });
    }

    const parsed = testSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid test input", errors: parsed.error.flatten() });
    }

    console.log(`[admin-integrations] Test starting for ${def.provider}`);
    try {
      const row = def.table === "chat"
        ? await storage.getChatIntegration(def.provider)
        : await storage.getIntegrationSettings(def.provider);

      const config = mergeTestConfig(row, parsed.data);

      if (!config.apiKey) {
        console.warn(`[admin-integrations] No API key available for ${def.provider}`, { rowId: (row as any)?.id });
        const secretLabel = def.fields.find((f) => f.secret)?.label ?? "API Key";
        return res.json({ ok: false, message: `Paste the ${secretLabel} or save one before testing.` });
      }

      console.log(`[admin-integrations] Calling provider ${def.provider} (key length ${config.apiKey.length})`);
      const result = await testProvider(def.provider, config);
      console.log(`[admin-integrations] Test result for ${def.provider}:`, result);
      return res.json(result);
    } catch (err) {
      console.error(`[admin-integrations] Test threw for ${def.provider}:`, err);
      return res.json({
        ok: false,
        message: `Server error while testing: ${(err as Error).message || String(err)}`,
      });
    }
  });

  return router;
}

/** The ConfigFieldKey values present in a request body. */
function pickConfig(body: Record<string, unknown>): Partial<Record<ConfigFieldKey, string>> {
  const out: Partial<Record<ConfigFieldKey, string>> = {};
  for (const key of Object.keys(body)) {
    const value = body[key];
    if (isConfigFieldKey(key) && typeof value === "string") out[key] = value;
  }
  return out;
}

type TestConfig = {
  config: Partial<Record<ConfigFieldKey, string>>;
  apiKey: string;
  model: string | null;
  locationId: string | null;
  calendarId: string | null;
};

function filled(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mergeTestConfig(row: any | undefined, input: z.infer<typeof testSchema>): TestConfig {
  const config: Partial<Record<ConfigFieldKey, string>> = { ...readConfig(row?.config) };
  for (const [key, value] of Object.entries(pickConfig(input))) {
    if (value.trim()) config[key as ConfigFieldKey] = value.trim();
  }
  return {
    config,
    apiKey: filled(input.apiKey) ?? filled(row?.apiKey) ?? "",
    model: filled(input.model) ?? filled(row?.model),
    locationId: filled(input.locationId) ?? filled(row?.locationId),
    calendarId: filled(input.calendarId) ?? filled(row?.calendarId),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Provider did not respond within ${TEST_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorBody(r: Response): Promise<string> {
  const text = await r.text().catch(() => "");
  if (!text) return "";
  try {
    const json = JSON.parse(text);
    return json?.error?.message || json?.message || text;
  } catch {
    return text;
  }
}

async function testProvider(
  provider: string,
  config: TestConfig
): Promise<{ ok: boolean; message: string }> {
  const { apiKey } = config;
  switch (provider) {
    case "google_places": {
      const r = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id",
        },
        body: JSON.stringify({ textQuery: "coffee", pageSize: 1 }),
      });
      if (r.ok) return { ok: true, message: "Places responded 200." };
      const detail = await readErrorBody(r);
      return { ok: false, message: `Places returned ${r.status}. ${detail}`.trim() };
    }
    case "groq": {
      const r = await fetchWithTimeout("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (r.ok) return { ok: true, message: "Groq authenticated." };
      const detail = await readErrorBody(r);
      return { ok: false, message: `Groq returned ${r.status}. ${detail}`.trim() };
    }
    case "openai": {
      const r = await fetchWithTimeout("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (r.ok) return { ok: true, message: "OpenAI authenticated." };
      const detail = await readErrorBody(r);
      return { ok: false, message: `OpenAI returned ${r.status}. ${detail}`.trim() };
    }
    case "openrouter": {
      const r = await fetchWithTimeout("https://openrouter.ai/api/v1/key", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://xpot.local",
          "X-Title": "Xpot",
        },
      });
      if (r.ok) return { ok: true, message: "OpenRouter authenticated." };
      const detail = await readErrorBody(r);
      return { ok: false, message: `OpenRouter returned ${r.status}. ${detail}`.trim() };
    }
    case "gemini": {
      const r = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );
      if (r.ok) return { ok: true, message: "Gemini authenticated." };
      const detail = await readErrorBody(r);
      return { ok: false, message: `Gemini returned ${r.status}. ${detail}`.trim() };
    }
    case "gohighlevel": {
      if (!config.locationId) return { ok: false, message: "Location ID is required to test GHL." };
      const params = new URLSearchParams({ locationId: config.locationId });
      const r = await fetchWithTimeout(`${GHL_BASE_URL}/opportunities/pipelines?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: GHL_API_VERSION,
          "Content-Type": "application/json",
        },
      });
      if (r.ok) return { ok: true, message: "GHL authenticated." };
      const detail = await readErrorBody(r);
      return { ok: false, message: `GHL returned ${r.status}. ${detail}`.trim() };
    }
    case "twilio":
      // Read-only calls: the test must never send an SMS.
      return checkTwilioConfig(
        {
          accountSid: config.config.accountSid ?? "",
          authToken: apiKey,
          fromNumber: config.config.fromNumber,
          messagingServiceSid: config.config.messagingServiceSid,
        },
        fetchWithTimeout,
      );
    default:
      return { ok: false, message: "No test implemented for this provider." };
  }
}
