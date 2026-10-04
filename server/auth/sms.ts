// SMS through Twilio's REST API (no SDK). Xpot uses the same Twilio number
// Skale Club already sends notifications from.
//
// Where the credentials come from, in this order:
//   1. the "Twilio | SMS" integration saved in Admin → Integrations (database),
//      when it is enabled and complete;
//   2. the environment: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either
//      TWILIO_FROM_NUMBER (E.164) or TWILIO_MESSAGING_SERVICE_SID.
//
// With neither, development logs the message instead of sending it, and
// production refuses (sign-in codes would never arrive).
//
// This file stays free of database imports so tests can use it as is: the
// database lookup is injected (see smsConfigDb.ts and phoneAuth.ts).

export interface SmsSender {
  /** Sends one SMS; throws when the provider refuses it. */
  send(to: string, body: string): Promise<void>;
  /** False when nothing is configured and messages only reach the server log. Last known value. */
  readonly live: boolean;
  /** Same as `live`, but re-resolves the configuration (database included). */
  resolveLive?(): Promise<boolean>;
}

export class SmsError extends Error {}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** E.164 sender; ignored when a messaging service is set. */
  fromNumber?: string;
  messagingServiceSid?: string;
}

export type SmsConfigSource = "db" | "env" | "none";

/** Reads the Twilio settings saved in the panel; null when absent, disabled or incomplete. */
export type TwilioConfigLoader = () => Promise<TwilioConfig | null>;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function completeConfig(input: { accountSid?: unknown; authToken?: unknown; fromNumber?: unknown; messagingServiceSid?: unknown }): TwilioConfig | null {
  const accountSid = clean(input.accountSid);
  const authToken = clean(input.authToken);
  const fromNumber = clean(input.fromNumber);
  const messagingServiceSid = clean(input.messagingServiceSid);
  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) return null;
  return {
    accountSid,
    authToken,
    ...(fromNumber ? { fromNumber } : {}),
    ...(messagingServiceSid ? { messagingServiceSid } : {}),
  };
}

export function envTwilioConfig(env: NodeJS.ProcessEnv = process.env): TwilioConfig | null {
  return completeConfig({
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    fromNumber: env.TWILIO_FROM_NUMBER,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
  });
}

/** Twilio config from an integration_settings row: usable only when enabled and complete. */
export function twilioConfigFromRow(
  row: { isEnabled?: boolean | null; apiKey?: string | null; config?: Record<string, string> | null } | null | undefined,
): TwilioConfig | null {
  if (!row?.isEnabled) return null;
  return completeConfig({
    accountSid: row.config?.accountSid,
    authToken: row.apiKey,
    fromNumber: row.config?.fromNumber,
    messagingServiceSid: row.config?.messagingServiceSid,
  });
}

export function smsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return envTwilioConfig(env) !== null;
}

export function twilioSender(config: TwilioConfig, fetchImpl: typeof fetch = fetch, source: SmsConfigSource = "env"): SmsSender {
  return {
    live: true,
    async send(to, body) {
      const form = new URLSearchParams({ To: to, Body: body });
      if (config.messagingServiceSid) form.set("MessagingServiceSid", config.messagingServiceSid);
      else form.set("From", config.fromNumber ?? "");
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const data = (await res.json()) as { message?: string; code?: number };
          detail = data.message ? ` ${data.code ?? ""} ${data.message}`.trimEnd() : "";
        } catch {
          // not JSON
        }
        throw new SmsError(`Twilio refused the message (${res.status})${detail} [config: ${source}, account ${config.accountSid}]`);
      }
    },
  };
}

/** Development stand-in: prints the SMS to the server log. */
export const logSender: SmsSender = {
  live: false,
  async send(to, body) {
    console.log(`[sms:dev] to ${to}: ${body}`);
  },
};

const NOT_CONFIGURED =
  "SMS is not configured: fill in Twilio under Admin > Integrations, or set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER";

// The panel saves call invalidateSmsConfig(); every sender then re-reads the
// database on its next send instead of waiting for the cache to expire.
let configEpoch = 0;
export function invalidateSmsConfig() {
  configEpoch++;
}

export interface DefaultSmsSenderOptions {
  env?: NodeJS.ProcessEnv;
  /** Database lookup. Without it only the environment is used. */
  loadDbConfig?: TwilioConfigLoader;
  fetchImpl?: typeof fetch;
  /** How long a resolved configuration is reused. Default 60s. */
  cacheTtlMs?: number;
  now?: () => number;
}

export function defaultSmsSender(opts: DefaultSmsSenderOptions = {}): SmsSender {
  const env = opts.env ?? process.env;
  const ttl = opts.cacheTtlMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const production = env.NODE_ENV === "production";

  let cached: { source: SmsConfigSource; config: TwilioConfig | null; at: number; epoch: number } | null = null;
  let live = envTwilioConfig(env) !== null;

  async function resolve() {
    if (cached && cached.epoch === configEpoch && now() - cached.at < ttl) return cached;
    const epoch = configEpoch;
    let source: SmsConfigSource = "none";
    let config: TwilioConfig | null = null;
    let cacheable = true;
    if (opts.loadDbConfig) {
      try {
        config = await opts.loadDbConfig();
        if (config) source = "db";
      } catch (err) {
        // A database hiccup must not stop sign-in codes while env credentials exist.
        cacheable = false;
        console.error("[sms] could not read the Twilio settings from the database", err instanceof Error ? err.message : err);
      }
    }
    if (!config) {
      config = envTwilioConfig(env);
      if (config) source = "env";
    }
    const resolved = { source, config, at: now(), epoch };
    live = config !== null;
    if (cacheable) cached = resolved;
    return resolved;
  }

  return {
    get live() {
      return live;
    },
    async resolveLive() {
      return (await resolve()).config !== null;
    },
    async send(to, body) {
      const { source, config } = await resolve();
      if (config) {
        console.log(`[sms] sending through Twilio (config source: ${source}, account ${config.accountSid})`);
        return twilioSender(config, opts.fetchImpl ?? fetch, source).send(to, body);
      }
      if (production) {
        console.error("[sms] no Twilio configuration (config source: none)");
        throw new SmsError(NOT_CONFIGURED);
      }
      return logSender.send(to, body);
    },
  };
}
