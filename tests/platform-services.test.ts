// The services list behind Admin › Integrations and Admin › Status: which
// provider of a job is doing the work, what the server environment configures,
// and which failure is shown as "last error". Pure: buildServices only.

import { describe, expect, it, vi } from "vitest";
import { SERVICES_BY_JOB, serviceJob } from "../shared/integrations-registry";

vi.mock("../server/db.js", () => ({ db: {} }));
vi.mock("../server/storage.js", () => ({ storage: {} }));

const { buildServices } = await import("../server/observability/services.js");
const { maskIntegration } = await import("../server/routes/xpot/integrationStatus.js");

const noInfra = { r2: false, supabase: false, engine: false, routeOptimization: false, push: false, wholesale: false, telegram: false };

function input(over: Partial<Parameters<typeof buildServices>[0]> = {}): Parameters<typeof buildServices>[0] {
  return {
    env: {},
    providers: [],
    checks: [],
    crm: {},
    xphere: { connected: 0, withToken: 0 },
    mcp: { active: 0, lastUsedAt: null },
    infra: noInfra,
    events: {},
    ...over,
  };
}

const find = (rows: ReturnType<typeof buildServices>, id: string) => rows.find((row) => row.id === id)!;

describe("services by job", () => {
  it("lists every service once, in the order of the Integrations page", () => {
    const rows = buildServices(input());
    expect(rows.map((r) => r.id)).toEqual(Object.values(SERVICES_BY_JOB).flat());
    expect(serviceJob("twilio")).toBe("signIn");
    expect(serviceJob("gohighlevel")).toBe("crm");
    expect(serviceJob("telegram")).toBe("infra");
  });

  it("marks the voice and AI provider doing the work: the primary when usable, else the fallback", () => {
    const providers = [
      maskIntegration("groq", { enabled: false, apiKey: "gsk_1" }, {}),
      maskIntegration("openai", { enabled: true, apiKey: "sk_1" }, {}),
      maskIntegration("openrouter", { enabled: true, apiKey: "sk-or-1" }, {}),
      maskIntegration("gemini", { enabled: true, apiKey: "AIza1" }, {}),
    ];
    const rows = buildServices(input({ providers }));
    expect(find(rows, "groq")).toMatchObject({ status: "idle", active: false });
    expect(find(rows, "openai")).toMatchObject({ status: "live", active: true });
    expect(find(rows, "openrouter").active).toBe(true);
    expect(find(rows, "gemini").active).toBe(false);
  });

  it("follows an environment key that overrides the panel", () => {
    const providers = [maskIntegration("gemini", { enabled: false }, { GEMINI_API_KEY: "env" })];
    const rows = buildServices(input({ env: { GEMINI_API_KEY: "env" }, providers }));
    expect(find(rows, "gemini")).toMatchObject({ status: "live", source: "env", active: true });
  });

  it("keeps the last test and counts a passing test as the last success", () => {
    const checks = [{ provider: "twilio", ok: false, message: "401", checkedAt: new Date("2026-10-02T00:00:00Z"), lastOkAt: new Date("2026-10-01T00:00:00Z") }];
    const row = find(buildServices(input({ checks })), "twilio");
    expect(row.lastTest).toEqual({ ok: false, message: "401", at: "2026-10-02T00:00:00.000Z" });
    expect(row.lastSuccessAt).toBe("2026-10-01T00:00:00.000Z");
    expect(row.lastError).toBeNull();
  });
});

describe("server-environment services", () => {
  it("say only whether they are configured, and which file storage is in use", () => {
    const rows = buildServices(input({ infra: { ...noInfra, supabase: true, push: true } }));
    expect(find(rows, "file_storage")).toMatchObject({ status: "live", source: "env", variant: "supabase" });
    expect(find(buildServices(input({ infra: { ...noInfra, r2: true, supabase: true } })), "file_storage").variant).toBe("r2");
    expect(find(rows, "push")).toMatchObject({ status: "live", source: "env" });
    expect(find(rows, "wholesale")).toMatchObject({ status: "off", source: "none", variant: null });
  });

  it("take their last error from the system events of the same part of the app", () => {
    const events = {
      "prospecting.worker": { id: 4, message: "tick failed", createdAt: new Date("2026-10-01T00:00:00Z") },
      "prospecting.engine": { id: 9, message: "engine 502", createdAt: new Date("2026-10-03T00:00:00Z") },
      push: { id: 2, message: "Push delivery failed.", createdAt: new Date("2026-10-02T00:00:00Z") },
    };
    const rows = buildServices(input({ events }));
    expect(find(rows, "prospecting_engine").lastError).toEqual({ message: "engine 502", at: "2026-10-03T00:00:00.000Z", eventId: 9 });
    expect(find(rows, "push").lastError?.eventId).toBe(2);
    expect(find(rows, "telegram").lastError).toBeNull();
  });

  it("show a provider's own recorded failure, the newer of it and the CRM sync log", () => {
    const events = {
      sms: { id: 7, message: "Twilio not configured", createdAt: new Date("2026-10-04T00:00:00Z") },
      xphere: { id: 8, message: "Xphere sync failed: 401", createdAt: new Date("2026-10-06T00:00:00Z") },
    };
    const crm = { xphere: { lastSyncedAt: null, lastFailed: { message: "403", at: new Date("2026-10-05T00:00:00Z") } } };
    const rows = buildServices(input({ events, crm }));
    expect(find(rows, "twilio").lastError).toMatchObject({ message: "Twilio not configured", eventId: 7 });
    expect(find(rows, "xphere").lastError).toMatchObject({ message: "Xphere sync failed: 401", eventId: 8 });
  });
});

describe("CRM and AI assistants", () => {
  it("Xphere is live when someone is connected, idle with only saved tokens", () => {
    expect(find(buildServices(input({ xphere: { connected: 2, withToken: 3 } })), "xphere")).toMatchObject({ status: "live", count: 2 });
    expect(find(buildServices(input({ xphere: { connected: 0, withToken: 1 } })), "xphere").status).toBe("idle");
  });

  it("CRM rows carry the sync log's last success and last failure", () => {
    const crm = { gohighlevel: { lastSyncedAt: new Date("2026-10-05T00:00:00Z"), lastFailed: { message: "401", at: new Date("2026-10-06T00:00:00Z") } } };
    const row = find(buildServices(input({ crm })), "gohighlevel");
    expect(row.lastSuccessAt).toBe("2026-10-05T00:00:00.000Z");
    expect(row.lastError).toEqual({ message: "401", at: "2026-10-06T00:00:00.000Z", eventId: null });
  });

  it("AI assistants are live while one can reach Xpot", () => {
    expect(find(buildServices(input({ mcp: { active: 1, lastUsedAt: new Date("2026-10-07T00:00:00Z") } })), "mcp"))
      .toMatchObject({ status: "live", count: 1, lastSuccessAt: "2026-10-07T00:00:00.000Z" });
  });
});
