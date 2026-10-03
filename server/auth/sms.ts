// SMS through Twilio's REST API (no SDK). Xpot uses the same Twilio number
// Skale Club already sends notifications from.
//
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either TWILIO_FROM_NUMBER (E.164)
//   or TWILIO_MESSAGING_SERVICE_SID.
//
// Without them, development logs the message instead of sending it, and
// production refuses (sign-in codes would never arrive).

export interface SmsSender {
  /** Sends one SMS; throws when the provider refuses it. */
  send(to: string, body: string): Promise<void>;
  /** False when nothing is configured and messages only reach the server log. */
  readonly live: boolean;
}

export class SmsError extends Error {}

export function smsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_FROM_NUMBER || env.TWILIO_MESSAGING_SERVICE_SID));
}

export function twilioSender(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): SmsSender {
  const sid = env.TWILIO_ACCOUNT_SID ?? "";
  const token = env.TWILIO_AUTH_TOKEN ?? "";
  return {
    live: true,
    async send(to, body) {
      const form = new URLSearchParams({ To: to, Body: body });
      if (env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", env.TWILIO_MESSAGING_SERVICE_SID);
      else form.set("From", env.TWILIO_FROM_NUMBER ?? "");
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
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
        throw new SmsError(`Twilio refused the message (${res.status})${detail}`);
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

export function defaultSmsSender(env: NodeJS.ProcessEnv = process.env): SmsSender {
  if (smsConfigured(env)) return twilioSender(env);
  if (env.NODE_ENV === "production") {
    return {
      live: false,
      async send() {
        throw new SmsError("SMS is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)");
      },
    };
  }
  return logSender;
}
