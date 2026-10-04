import express from "express";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProviderDef, integrationProblem } from "../shared/integrations-registry";
import { maskIntegration, mergeConfigPatch } from "../server/routes/xpot/integrationStatus";
import { checkTwilioConfig } from "../server/auth/twilioCheck";

const SID = "AC" + "a".repeat(32);
const MG = "MG" + "b".repeat(32);
const TOKEN = "fake-test-token";

// The router talks to the database through storage and to the session through
// the manager middleware; both are replaced so no database is needed.
const rows: Record<string, any> = {};
vi.mock("../server/storage.js", () => ({
  storage: {
    listChatIntegrations: async () => [],
    listIntegrationSettings: async () => Object.values(rows),
    getChatIntegration: async () => undefined,
    getIntegrationSettings: async (provider: string) => rows[provider],
    upsertChatIntegration: async () => ({}),
    upsertIntegrationSettings: async (provider: string, data: any) => {
      rows[provider] = { id: 1, provider, ...rows[provider], ...data, updatedAt: new Date() };
      return rows[provider];
    },
  },
}));
vi.mock("../server/routes/xpot/middleware.js", () => ({
  requireXpotManager: (_req: any, _res: any, next: any) => next(),
}));

describe("twilio provider in the registry", () => {
  it("is a Messaging provider whose secret is the Auth Token", () => {
    const def = getProviderDef("twilio")!;
    expect(def.label).toBe("Twilio | SMS");
    expect(def.category).toBe("Messaging");
    expect(def.table).toBe("settings");
    expect(def.fields.map((f) => f.key)).toEqual(["accountSid", "apiKey", "fromNumber", "messagingServiceSid"]);
    expect(def.fields.filter((f) => f.secret).map((f) => f.label)).toEqual(["Auth Token"]);
  });

  it("reports what is missing", () => {
    expect(integrationProblem("twilio", { hasApiKey: false, config: {} })).toMatch(/Account SID/);
    expect(integrationProblem("twilio", { hasApiKey: false, config: { accountSid: SID } })).toMatch(/Auth Token/);
    expect(integrationProblem("twilio", { hasApiKey: true, config: { accountSid: SID } })).toMatch(/From number or a Messaging Service/);
    expect(integrationProblem("twilio", { hasApiKey: true, config: { accountSid: SID, fromNumber: "+15550000001" } })).toBeNull();
    expect(integrationProblem("twilio", { hasApiKey: true, config: { accountSid: SID, messagingServiceSid: MG } })).toBeNull();
    expect(integrationProblem("groq", { hasApiKey: false, config: {} })).toMatch(/No API key/);
    expect(integrationProblem("groq", { hasApiKey: true, config: {} })).toBeNull();
  });
});

describe("masking", () => {
  const row = {
    isEnabled: true,
    apiKey: "super-secret-token-9f3a",
    config: { accountSid: SID, fromNumber: "+15550000001", junk: "x" },
    updatedAt: new Date(0),
  };

  it("never returns the token, only its last 4 and the plain settings", () => {
    const status = maskIntegration("twilio", row);
    expect(JSON.stringify(status)).not.toContain("super-secret");
    expect(status).toMatchObject({ enabled: true, hasApiKey: true, apiKeyLast4: "9f3a", problem: null });
    expect(status.config).toEqual({ accountSid: SID, fromNumber: "+15550000001" });
  });

  it("handles a provider with no row yet", () => {
    expect(maskIntegration("twilio", undefined)).toMatchObject({ enabled: false, hasApiKey: false, apiKeyLast4: null, config: {} });
  });
});

describe("mergeConfigPatch", () => {
  it("keeps what is not sent, replaces what is, clears empties", () => {
    const stored = { accountSid: SID, fromNumber: "+15550000001" };
    expect(mergeConfigPatch("twilio", stored, {})).toEqual(stored);
    expect(mergeConfigPatch("twilio", stored, { fromNumber: "+15550000009" })).toEqual({ accountSid: SID, fromNumber: "+15550000009" });
    expect(mergeConfigPatch("twilio", stored, { fromNumber: "", messagingServiceSid: MG })).toEqual({ accountSid: SID, messagingServiceSid: MG });
    expect(mergeConfigPatch("twilio", null, { accountSid: ` ${SID} ` })).toEqual({ accountSid: SID });
  });

  it("ignores config keys the provider does not declare", () => {
    expect(mergeConfigPatch("google_places", null, { accountSid: SID })).toEqual({});
  });
});

describe("Twilio test never sends an SMS", () => {
  it("only issues GET requests and never touches Messages", async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      if (url.includes("IncomingPhoneNumbers")) return new Response(JSON.stringify({ incoming_phone_numbers: [{}] }), { status: 200 });
      if (url.includes("messaging.twilio.com")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ friendly_name: "Skale", status: "active" }), { status: 200 });
    };
    const result = await checkTwilioConfig({ accountSid: SID, authToken: "tok", fromNumber: "+15550000001", messagingServiceSid: MG }, fetcher);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("No SMS was sent");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls.some((c) => /\/Messages/.test(c.url))).toBe(false);
    expect(calls.find((c) => c.url.includes("IncomingPhoneNumbers"))!.url).toContain("PhoneNumber=%2B15550000001");
  });

  it("explains bad credentials, a foreign number and a suspended account", async () => {
    const bad = await checkTwilioConfig({ accountSid: SID, authToken: "x" }, async () => new Response("{}", { status: 401 }));
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/rejected/);

    const foreign = await checkTwilioConfig({ accountSid: SID, authToken: "x", fromNumber: "+15550000001" }, async (url) =>
      url.includes("IncomingPhoneNumbers")
        ? new Response(JSON.stringify({ incoming_phone_numbers: [] }), { status: 200 })
        : new Response(JSON.stringify({ status: "active" }), { status: 200 }),
    );
    expect(foreign.ok).toBe(false);
    expect(foreign.message).toMatch(/not a number on this account/);

    const suspended = await checkTwilioConfig(
      { accountSid: SID, authToken: "x", fromNumber: "+15550000001" },
      async () => new Response(JSON.stringify({ status: "suspended" }), { status: 200 }),
    );
    expect(suspended.ok).toBe(false);
    expect(suspended.message).toMatch(/suspended/);
  });
});

describe("integrations routes (twilio)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base: string;
  const twilioFetch = vi.fn();
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    for (const k of Object.keys(rows)) delete rows[k];
    const { createAdminIntegrationsRouter } = await import("../server/routes/xpot/admin-integrations");
    const app = express();
    app.use(express.json());
    app.use("/api/xpot", createAdminIntegrationsRouter());
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/xpot`;
    twilioFetch.mockReset();
    twilioFetch.mockImplementation(async (url: string) => {
      if (url.includes("IncomingPhoneNumbers")) return new Response(JSON.stringify({ incoming_phone_numbers: [{}] }), { status: 200 });
      return new Response(JSON.stringify({ friendly_name: "Skale", status: "active" }), { status: 200 });
    });
    // Only Twilio calls are intercepted; the test's own requests go to the real fetch.
    globalThis.fetch = ((url: any, init?: any) =>
      String(url).includes("twilio.com") ? twilioFetch(String(url), init) : realFetch(url, init)) as typeof fetch;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    server.close();
    vi.restoreAllMocks();
  });

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await realFetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  it("saves into config + api_key, masks on read and keeps the token when saved empty", async () => {
    const saved = await call("PUT", "/admin/integrations/twilio", {
      enabled: true,
      accountSid: SID,
      apiKey: TOKEN,
      fromNumber: "+15550000001",
    });
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({ enabled: true, hasApiKey: true, apiKeyLast4: "abcd", problem: null });
    expect(rows.twilio.config).toEqual({ accountSid: SID, fromNumber: "+15550000001" });
    expect(rows.twilio.apiKey).toBe(TOKEN);

    // Later save without the token (the panel leaves an untouched secret out) and with the number cleared.
    const again = await call("PUT", "/admin/integrations/twilio", { messagingServiceSid: MG, fromNumber: "" });
    expect(again.status).toBe(200);
    expect(rows.twilio.apiKey).toBe(TOKEN);
    expect(rows.twilio.config).toEqual({ accountSid: SID, messagingServiceSid: MG });

    const list = await call("GET", "/admin/integrations");
    expect(JSON.stringify(list.json)).not.toContain(TOKEN);
    expect(list.json.status.find((s: any) => s.provider === "twilio")).toMatchObject({
      apiKeyLast4: "abcd",
      config: { accountSid: SID, messagingServiceSid: MG },
    });
  });

  it("rejects malformed values", async () => {
    expect((await call("PUT", "/admin/integrations/twilio", { accountSid: "nope" })).status).toBe(400);
    expect((await call("PUT", "/admin/integrations/twilio", { fromNumber: "5085550100" })).status).toBe(400);
    expect((await call("PUT", "/admin/integrations/twilio", { messagingServiceSid: "xx" })).status).toBe(400);
  });

  it("the Test action reads from Twilio and never POSTs to Messages", async () => {
    await call("PUT", "/admin/integrations/twilio", { accountSid: SID, apiKey: TOKEN, fromNumber: "+15550000001" });
    const result = await call("POST", "/admin/integrations/twilio/test", {});
    expect(result.json).toMatchObject({ ok: true });
    expect(twilioFetch).toHaveBeenCalled();
    for (const [url, init] of twilioFetch.mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
      expect(String(url)).not.toMatch(/\/Messages/);
    }
  });

  it("asks for the token before testing", async () => {
    const result = await call("POST", "/admin/integrations/twilio/test", { accountSid: SID });
    expect(result.json.ok).toBe(false);
    expect(result.json.message).toMatch(/Auth Token/);
    expect(twilioFetch).not.toHaveBeenCalled();
  });
});
