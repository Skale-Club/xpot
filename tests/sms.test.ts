import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SmsError,
  defaultSmsSender,
  envTwilioConfig,
  invalidateSmsConfig,
  twilioConfigFromRow,
  type TwilioConfig,
} from "../server/auth/sms";

const DB: TwilioConfig = { accountSid: "ACdb00000000000000000000000000000", authToken: "db-token-secret", fromNumber: "+15550000001" };
const ENV = {
  TWILIO_ACCOUNT_SID: "ACenv0000000000000000000000000000",
  TWILIO_AUTH_TOKEN: "env-token-secret",
  TWILIO_FROM_NUMBER: "+15550000002",
} as NodeJS.ProcessEnv;
const EMPTY = {} as NodeJS.ProcessEnv;
const PROD = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

function fakeFetch() {
  const calls: Array<{ url: string; auth: string; form: URLSearchParams }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    const header = String((init.headers as Record<string, string>).Authorization).replace("Basic ", "");
    calls.push({ url, auth: Buffer.from(header, "base64").toString(), form: init.body as URLSearchParams });
    return new Response("{}", { status: 201 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  invalidateSmsConfig();
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("SMS configuration source", () => {
  it("uses the database config over the environment", async () => {
    const f = fakeFetch();
    const sms = defaultSmsSender({ env: ENV, loadDbConfig: async () => DB, fetchImpl: f.impl });
    await sms.send("+15551230000", "hi");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toContain(`/Accounts/${DB.accountSid}/Messages.json`);
    expect(f.calls[0].auth).toBe(`${DB.accountSid}:${DB.authToken}`);
    expect(f.calls[0].form.get("From")).toBe("+15550000001");
    expect(await sms.resolveLive!()).toBe(true);
  });

  it("falls back to the environment when the database has nothing", async () => {
    const f = fakeFetch();
    const sms = defaultSmsSender({ env: ENV, loadDbConfig: async () => null, fetchImpl: f.impl });
    await sms.send("+15551230000", "hi");
    expect(f.calls[0].auth).toBe(`${ENV.TWILIO_ACCOUNT_SID}:${ENV.TWILIO_AUTH_TOKEN}`);
    expect(f.calls[0].form.get("From")).toBe("+15550000002");
  });

  it("falls back to the environment when the database cannot be read", async () => {
    const f = fakeFetch();
    const sms = defaultSmsSender({
      env: ENV,
      loadDbConfig: async () => {
        throw new Error("db down");
      },
      fetchImpl: f.impl,
    });
    await sms.send("+15551230000", "hi");
    expect(f.calls[0].auth).toContain(ENV.TWILIO_ACCOUNT_SID!);
  });

  it("refuses to send in production with neither", async () => {
    const f = fakeFetch();
    const sms = defaultSmsSender({ env: PROD, loadDbConfig: async () => null, fetchImpl: f.impl });
    await expect(sms.send("+15551230000", "hi")).rejects.toBeInstanceOf(SmsError);
    await expect(sms.send("+15551230000", "hi")).rejects.toThrow(/Admin > Integrations/);
    expect(await sms.resolveLive!()).toBe(false);
    expect(f.calls).toHaveLength(0);
  });

  it("only logs the message in development with neither", async () => {
    const f = fakeFetch();
    const sms = defaultSmsSender({ env: EMPTY, loadDbConfig: async () => null, fetchImpl: f.impl });
    await sms.send("+15551230000", "code 123456");
    expect(f.calls).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[sms:dev]"));
    expect(sms.live).toBe(false);
  });

  it("reuses the config for a while and re-reads it after a save", async () => {
    const loader = vi.fn(async (): Promise<TwilioConfig | null> => DB);
    const sms = defaultSmsSender({ env: EMPTY, loadDbConfig: loader, fetchImpl: fakeFetch().impl });
    await sms.send("+15551230000", "a");
    await sms.send("+15551230000", "b");
    expect(loader).toHaveBeenCalledTimes(1);
    invalidateSmsConfig();
    await sms.send("+15551230000", "c");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("expires the cache after the TTL", async () => {
    let t = 1_000;
    const loader = vi.fn(async (): Promise<TwilioConfig | null> => DB);
    const sms = defaultSmsSender({ env: EMPTY, loadDbConfig: loader, fetchImpl: fakeFetch().impl, cacheTtlMs: 5_000, now: () => t });
    await sms.send("+15551230000", "a");
    t += 4_000;
    await sms.send("+15551230000", "b");
    expect(loader).toHaveBeenCalledTimes(1);
    t += 2_000;
    await sms.send("+15551230000", "c");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("logs which source was used and never the token", async () => {
    const sms = defaultSmsSender({ env: ENV, loadDbConfig: async () => DB, fetchImpl: fakeFetch().impl });
    await sms.send("+15551230000", "hi");
    const lines = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(lines).toContain("config source: db");
    expect(lines).not.toContain(DB.authToken);
  });

  it("names the source in Twilio errors, still without the token", async () => {
    const failing = (async () => new Response(JSON.stringify({ code: 20003, message: "Authenticate" }), { status: 401 })) as unknown as typeof fetch;
    const sms = defaultSmsSender({ env: ENV, loadDbConfig: async () => DB, fetchImpl: failing });
    const err = await sms.send("+15551230000", "hi").catch((e) => e as Error);
    expect(err).toBeInstanceOf(SmsError);
    expect(err.message).toContain("(401) 20003 Authenticate");
    expect(err.message).toContain("config: db");
    expect(err.message).not.toContain(DB.authToken);
  });

  it("prefers a messaging service over a from number", async () => {
    const f = fakeFetch();
    const sms = defaultSmsSender({
      env: EMPTY,
      loadDbConfig: async () => ({ ...DB, messagingServiceSid: "MG00000000000000000000000000000000" }),
      fetchImpl: f.impl,
    });
    await sms.send("+15551230000", "hi");
    expect(f.calls[0].form.get("MessagingServiceSid")).toBe("MG00000000000000000000000000000000");
    expect(f.calls[0].form.get("From")).toBeNull();
  });
});

describe("twilioConfigFromRow", () => {
  const row = { isEnabled: true, apiKey: "tok", config: { accountSid: "ACx", fromNumber: "+15550000001" } };
  it("needs the row enabled and complete", () => {
    expect(twilioConfigFromRow(row)).toEqual({ accountSid: "ACx", authToken: "tok", fromNumber: "+15550000001" });
    expect(twilioConfigFromRow({ ...row, isEnabled: false })).toBeNull();
    expect(twilioConfigFromRow({ ...row, apiKey: "" })).toBeNull();
    expect(twilioConfigFromRow({ ...row, config: { accountSid: "ACx" } })).toBeNull();
    expect(twilioConfigFromRow({ ...row, config: { fromNumber: "+1555" } })).toBeNull();
    expect(twilioConfigFromRow({ ...row, config: { accountSid: "ACx", messagingServiceSid: "MGx" } })?.messagingServiceSid).toBe("MGx");
    expect(twilioConfigFromRow(undefined)).toBeNull();
  });
});

describe("envTwilioConfig", () => {
  it("is null until the three required pieces are there", () => {
    expect(envTwilioConfig(EMPTY)).toBeNull();
    expect(envTwilioConfig({ TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "t" } as NodeJS.ProcessEnv)).toBeNull();
    expect(envTwilioConfig(ENV)?.fromNumber).toBe("+15550000002");
  });
});
