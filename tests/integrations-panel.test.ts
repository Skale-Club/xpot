// Account › Integrations must say what is really in force: which provider runs,
// whether the server environment overrides the panel, what is missing, and
// whether a save would lock everyone out of sign-in.

import express from "express";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProviderDef, integrationProblemCode, INTEGRATION_PROVIDERS } from "../shared/integrations-registry";
import { envProvides, integrationSource, maskIntegration } from "../server/routes/xpot/integrationStatus";
import {
  integrationStatusKey,
  integrationsTabFromPath,
  integrationsTabPath,
  isXphereQueryKey,
  locksOutSignIn,
  maskInboundKey,
  visibleXphereRows,
  type XphereRow,
} from "../client/src/pages/admin/integrationsUi";

const settingsRows: Record<string, any> = {};
const chatRows: Record<string, any> = {};
vi.mock("../server/storage.js", () => ({
  storage: {
    listChatIntegrations: async () => Object.values(chatRows),
    listIntegrationSettings: async () => Object.values(settingsRows),
    getChatIntegration: async (provider: string) => chatRows[provider],
    getIntegrationSettings: async (provider: string) => settingsRows[provider],
    upsertChatIntegration: async (provider: string, data: any) => {
      chatRows[provider] = { id: 1, provider, ...chatRows[provider], ...data, updatedAt: new Date() };
      return chatRows[provider];
    },
    upsertIntegrationSettings: async (provider: string, data: any) => {
      settingsRows[provider] = { id: 1, provider, ...settingsRows[provider], ...data, updatedAt: new Date() };
      return settingsRows[provider];
    },
  },
}));
// The services list and the kept test results are covered by platform-status.integration.test.ts.
vi.mock("../server/db.js", () => ({ db: {} }));
vi.mock("../server/routes/xpot/middleware.js", () => ({
  requireXpotManager: (_req: any, _res: any, next: any) => next(),
  requireSuperAdmin: (_req: any, _res: any, next: any) => next(),
}));

describe("registry", () => {
  it("no longer makes Groq and OpenAI exclusive: one is primary, the other its fallback", () => {
    expect(getProviderDef("groq")).toMatchObject({ role: "primary" });
    expect(getProviderDef("openai")).toMatchObject({ role: "fallback" });
    expect(INTEGRATION_PROVIDERS.some((p) => "mutexGroup" in p)).toBe(false);
  });

  it("marks GoHighLevel legacy and Twilio required for sign-in", () => {
    expect(getProviderDef("gohighlevel")?.legacy).toBe(true);
    expect(getProviderDef("twilio")?.requiredForSignIn).toBe(true);
  });

  it("requires GoHighLevel's Location ID, which every sync needs", () => {
    expect(integrationProblemCode("gohighlevel", { hasApiKey: true, config: {}, locationId: null })).toBe("missing_location_id");
    expect(integrationProblemCode("gohighlevel", { hasApiKey: true, config: {}, locationId: "  " })).toBe("missing_location_id");
    expect(integrationProblemCode("gohighlevel", { hasApiKey: true, config: {}, locationId: "loc_1" })).toBeNull();
    expect(integrationProblemCode("gohighlevel", { hasApiKey: false, config: {}, locationId: "loc_1" })).toBe("missing_api_key");
    expect(maskIntegration("gohighlevel", { isEnabled: true, apiKey: "pit-1234" }, {})).toMatchObject({
      problemCode: "missing_location_id",
      source: "none",
    });
  });
});

describe("where the configuration in force comes from", () => {
  const ready = { enabled: true, problem: null };
  const off = { enabled: false, problem: null };

  it("an OpenRouter or Gemini key in the environment overrides the panel", () => {
    expect(integrationSource(getProviderDef("openrouter")!, ready, { OPENROUTER_API_KEY: "env" })).toBe("env");
    expect(integrationSource(getProviderDef("gemini")!, off, { GEMINI_API_KEY: "env" })).toBe("env");
    expect(integrationSource(getProviderDef("openrouter")!, ready, {})).toBe("panel");
  });

  it("Places and Twilio fall back to the environment only when the panel is not usable", () => {
    const places = getProviderDef("google_places")!;
    expect(integrationSource(places, ready, { GOOGLE_MAPS_API_KEY: "env" })).toBe("panel");
    expect(integrationSource(places, off, { GOOGLE_MAPS_API_KEY: "env" })).toBe("env");
    expect(integrationSource(places, off, {})).toBe("none");
    const twilio = getProviderDef("twilio")!;
    const twilioEnv = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+15550000001" };
    expect(envProvides("twilio", twilioEnv)).toBe(true);
    expect(envProvides("twilio", { TWILIO_ACCOUNT_SID: "AC1" })).toBe(false);
    expect(integrationSource(twilio, { enabled: true, problem: "Auth Token is missing." }, twilioEnv)).toBe("env");
  });

  it("providers with no environment variable are the panel or nothing", () => {
    expect(integrationSource(getProviderDef("groq")!, ready, { GROQ_API_KEY: "x" })).toBe("panel");
    expect(integrationSource(getProviderDef("groq")!, off, {})).toBe("none");
  });

  it("masking reports the source and whether the environment could step in", () => {
    const status = maskIntegration("google_places", { isEnabled: false, apiKey: "AIza-1234" }, { GOOGLE_PLACES_API_KEY: "env" });
    expect(status).toMatchObject({ source: "env", envAvailable: true, enabled: false, hasApiKey: true });
  });
});

describe("the status shown on each provider", () => {
  const base = { enabled: false, problem: null, hasApiKey: false, source: "none" as const };
  it("is live when in use, from the panel or the environment", () => {
    expect(integrationStatusKey({ ...base, enabled: true, hasApiKey: true, source: "panel" })).toBe("live");
    expect(integrationStatusKey({ ...base, source: "env" })).toBe("live");
  });
  it("is incomplete, idle or off otherwise", () => {
    expect(integrationStatusKey({ ...base, enabled: true, problem: "x" })).toBe("broken");
    expect(integrationStatusKey({ ...base, hasApiKey: true })).toBe("idle");
    expect(integrationStatusKey(base)).toBe("off");
    expect(integrationStatusKey(undefined)).toBe("off");
  });
});

describe("turning off SMS sign-in", () => {
  const twilio = getProviderDef("twilio")!;
  const working = { enabled: true, problem: null, envAvailable: false };
  it("warns when it would lock everyone out", () => {
    expect(locksOutSignIn(twilio, working, { enabled: false })).toBe(true);
    expect(locksOutSignIn(twilio, working, { enabled: true, clearApiKey: true })).toBe(true);
  });
  it("stays quiet when the server has its own settings, nothing changes, or it never worked", () => {
    expect(locksOutSignIn(twilio, { ...working, envAvailable: true }, { enabled: false })).toBe(false);
    expect(locksOutSignIn(twilio, working, { enabled: true })).toBe(false);
    expect(locksOutSignIn(twilio, { ...working, problem: "x" }, { enabled: false })).toBe(false);
    expect(locksOutSignIn(getProviderDef("groq")!, working, { enabled: false })).toBe(false);
  });
});

describe("the tab in the URL", () => {
  it("reads and writes the tab", () => {
    expect(integrationsTabFromPath("/admin/integrations")).toBe("providers");
    expect(integrationsTabFromPath("/admin/integrations/")).toBe("providers");
    expect(integrationsTabFromPath("/admin/integrations/mcp")).toBe("mcp");
    expect(integrationsTabFromPath("/admin/integrations/xphere?x=1")).toBe("xphere");
    expect(integrationsTabFromPath("/admin/integrations/nope")).toBe("providers");
    expect(integrationsTabFromPath("/admin/xphere")).toBe("xphere");
    expect(integrationsTabPath("providers")).toBe("/admin/integrations");
    expect(integrationsTabPath("mcp")).toBe("/admin/integrations/mcp");
  });
});

describe("the Xphere list", () => {
  const row = (over: Partial<XphereRow>): XphereRow => ({
    userId: "u", repId: 1, displayName: "A", email: null, inboundApiKey: null, apiUrl: "https://xphere.app",
    apiKeySet: false, isEnabled: false, access: "active", deleted: false, usesVisits: true, ...over,
  });
  it("hides deleted, Tags-only, blocked and pending people until Show all", () => {
    const rows = [
      row({ repId: 1 }),
      row({ repId: 2, deleted: true }),
      row({ repId: 3, usesVisits: false }),
      row({ repId: 4, access: "blocked" }),
      row({ repId: 5, access: "pending" }),
    ];
    expect(visibleXphereRows(rows, false).map((r) => r.repId)).toEqual([1]);
    expect(visibleXphereRows(rows, true)).toHaveLength(5);
  });
  it("masks the inbound key", () => {
    expect(maskInboundKey("xpot_abcdefghijklmnop1234")).toBe("xpot_••••••••1234");
    expect(maskInboundKey("raw-key-9876")).toBe("••••••••9876");
  });
  it("refreshes the list and each person's connection together", () => {
    // A new key made in Integrations must reach People › Visits (and back), never a revoked one.
    expect(isXphereQueryKey(["/api/xpot/admin/xphere"])).toBe(true);
    expect(isXphereQueryKey(["/api/xpot/admin/xphere/u-123"])).toBe(true);
    expect(isXphereQueryKey(["/api/xpot/admin/xphere-other"])).toBe(false);
    expect(isXphereQueryKey(["/api/xpot/admin/reps"])).toBe(false);
    expect(isXphereQueryKey([42])).toBe(false);
  });
});

describe("integrations routes", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base: string;

  beforeEach(async () => {
    for (const rows of [settingsRows, chatRows]) for (const k of Object.keys(rows)) delete rows[k];
    const { createAdminIntegrationsRouter } = await import("../server/routes/xpot/admin-integrations");
    const app = express();
    app.use(express.json());
    app.use("/api/xpot", createAdminIntegrationsRouter());
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/xpot`;
  });
  afterEach(() => server.close());

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  it("keeps a key on an empty save and removes it only when asked", async () => {
    await call("PUT", "/admin/integrations/groq", { enabled: true, apiKey: "gsk_secret_1234" });
    await call("PUT", "/admin/integrations/groq", { enabled: true, apiKey: "" });
    expect(chatRows.groq.apiKey).toBe("gsk_secret_1234");
    const removed = await call("PUT", "/admin/integrations/groq", { enabled: false, clearApiKey: true });
    expect(removed.json).toMatchObject({ hasApiKey: false, enabled: false });
    expect(chatRows.groq.apiKey).toBeNull();
  });

  it("enabling OpenAI leaves Groq on (no more voice mutex)", async () => {
    await call("PUT", "/admin/integrations/groq", { enabled: true, apiKey: "gsk_1" });
    await call("PUT", "/admin/integrations/openai", { enabled: true, apiKey: "sk_1" });
    expect(chatRows.groq.enabled).toBe(true);
    expect(chatRows.openai.enabled).toBe(true);
  });

  it("names the refused field with a stable code", async () => {
    const res = await call("PUT", "/admin/integrations/twilio", { accountSid: "nope", fromNumber: "5085550100" });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("invalid_input");
    expect(res.json.errors).toEqual([
      expect.objectContaining({ path: "accountSid", code: "invalid_twilio_sid" }),
      expect.objectContaining({ path: "fromNumber", code: "invalid_e164" }),
    ]);
  });
});
