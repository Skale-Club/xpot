import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotManager } from "./middleware.js";
import {
  INTEGRATION_PROVIDERS,
  getProviderDef,
  type IntegrationStatus,
} from "#shared/integrations-registry.js";
import { getGHLPipelines } from "../../integrations/ghl.js";

function last4(key: string | null | undefined): string | null {
  if (!key) return null;
  const k = key.trim();
  return k.length >= 4 ? k.slice(-4) : "••••";
}

function mask(provider: string, row: any | undefined): IntegrationStatus {
  const def = getProviderDef(provider)!;
  const enabled = def.table === "chat" ? Boolean(row?.enabled) : Boolean(row?.isEnabled);
  return {
    provider,
    enabled,
    model: row?.model ?? null,
    locationId: row?.locationId ?? null,
    calendarId: row?.calendarId ?? null,
    hasApiKey: Boolean(row?.apiKey),
    apiKeyLast4: last4(row?.apiKey),
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

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
      return mask(def.provider, row);
    });

    res.json({ providers: INTEGRATION_PROVIDERS, status: items });
  });

  const putSchema = z.object({
    apiKey: z.string().trim().optional(),
    model: z.string().trim().max(120).optional().nullable(),
    locationId: z.string().trim().max(120).optional().nullable(),
    calendarId: z.string().trim().max(120).optional().nullable(),
    enabled: z.boolean().optional(),
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
      return res.json(mask(def.provider, saved));
    } else {
      const data: Record<string, unknown> = {};
      if (body.apiKey) data.apiKey = body.apiKey;
      if (body.locationId !== undefined) data.locationId = body.locationId;
      if (body.calendarId !== undefined) data.calendarId = body.calendarId;
      if (body.enabled !== undefined) data.isEnabled = body.enabled;
      const saved = await storage.upsertIntegrationSettings(def.provider, data);
      return res.json(mask(def.provider, saved));
    }
  });

  // Test the stored credentials for a provider.
  router.post("/admin/integrations/:provider/test", async (req, res) => {
    const def = getProviderDef(req.params.provider);
    if (!def) return res.status(404).json({ message: "Unknown provider" });

    try {
      const row = def.table === "chat"
        ? await storage.getChatIntegration(def.provider)
        : await storage.getIntegrationSettings(def.provider);
      const apiKey = row?.apiKey;
      if (!apiKey) return res.status(400).json({ ok: false, message: "Nenhuma API key salva." });

      const result = await testProvider(def.provider, apiKey, row);
      return res.status(result.ok ? 200 : 502).json(result);
    } catch (err) {
      return res.status(502).json({ ok: false, message: (err as Error).message });
    }
  });

  return router;
}

async function testProvider(
  provider: string,
  apiKey: string,
  row: any
): Promise<{ ok: boolean; message: string }> {
  switch (provider) {
    case "google_places": {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id",
        },
        body: JSON.stringify({ textQuery: "coffee", pageSize: 1 }),
      });
      return { ok: r.ok, message: r.ok ? "Places respondeu 200." : `Places retornou ${r.status}.` };
    }
    case "groq": {
      const r = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return { ok: r.ok, message: r.ok ? "Groq autenticou." : `Groq retornou ${r.status}.` };
    }
    case "openai": {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return { ok: r.ok, message: r.ok ? "OpenAI autenticou." : `OpenAI retornou ${r.status}.` };
    }
    case "openrouter": {
      const r = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return { ok: r.ok, message: r.ok ? "OpenRouter autenticou." : `OpenRouter retornou ${r.status}.` };
    }
    case "gemini": {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );
      return { ok: r.ok, message: r.ok ? "Gemini autenticou." : `Gemini retornou ${r.status}.` };
    }
    case "gohighlevel": {
      if (!row?.locationId) return { ok: false, message: "Location ID é obrigatório para testar o GHL." };
      const result = await getGHLPipelines(apiKey, row.locationId);
      return { ok: result.success, message: result.success ? "GHL autenticou." : result.message || "Falha no GHL." };
    }
    default:
      return { ok: false, message: "Provider sem teste implementado." };
  }
}
