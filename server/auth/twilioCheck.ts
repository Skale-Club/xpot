// "Test" button for the Twilio integration. Never sends an SMS: it only reads
// from Twilio to prove that the credentials work and that the sender belongs
// to the account.

import type { IntegrationTestCode, IntegrationTestResult } from "#shared/integrationTest.js";

export interface TwilioCheckInput {
  accountSid: string;
  authToken: string;
  fromNumber?: string | null;
  messagingServiceSid?: string | null;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function detail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return "";
  try {
    const json = JSON.parse(text) as { message?: string; code?: number };
    return json.message ? `${json.code ?? ""} ${json.message}`.trim() : text;
  } catch {
    return text;
  }
}

function result(
  ok: boolean,
  code: IntegrationTestCode,
  message: string,
  params?: IntegrationTestResult["params"],
  providerDetail?: string,
): IntegrationTestResult {
  return { ok, code, message, ...(params ? { params } : {}), ...(providerDetail ? { detail: providerDetail } : {}) };
}

export async function checkTwilioConfig(
  input: TwilioCheckInput,
  fetcher: Fetcher,
): Promise<IntegrationTestResult> {
  const sid = input.accountSid.trim();
  if (!sid) return result(false, "twilio_sid_required", "Account SID is required to test Twilio.");
  const headers = { Authorization: `Basic ${Buffer.from(`${sid}:${input.authToken}`).toString("base64")}` };
  const base = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}`;

  const account = await fetcher(`${base}.json`, { method: "GET", headers });
  if (account.status === 401) {
    return result(false, "twilio_rejected", "Twilio rejected the Account SID and Auth Token (401). Check both values; the token is shown in the Twilio Console under Account Info.");
  }
  if (account.status === 404) return result(false, "twilio_unknown_sid", "Twilio does not know this Account SID (404).");
  if (!account.ok) {
    const text = await detail(account);
    return result(false, "http_error", `Twilio returned ${account.status}. ${text}`.trim(), { status: account.status }, text);
  }
  const info = (await account.json().catch(() => ({}))) as { friendly_name?: string; status?: string };
  const name = info.friendly_name ? `"${info.friendly_name}"` : sid;
  if (info.status && info.status !== "active") {
    return result(false, "twilio_inactive", `The credentials are valid, but account ${name} is ${info.status}, so it cannot send SMS.`, { name, status: info.status });
  }

  const notes: string[] = [`Credentials accepted, account ${name} is active.`];
  const params: Record<string, string | number> = { name };
  const from = input.fromNumber?.trim();
  const service = input.messagingServiceSid?.trim();
  if (!from && !service) {
    return result(false, "twilio_no_sender", `${notes[0]} But no From number or Messaging Service SID is set, so there is no sender yet.`, params);
  }

  if (from) {
    const owned = await fetcher(`${base}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`, { method: "GET", headers });
    if (!owned.ok) {
      const text = await detail(owned);
      return result(false, "twilio_number_check_failed", `${notes[0]} Could not check ${from} (${owned.status}). ${text}`.trim(), { ...params, from, status: owned.status }, text);
    }
    const list = (await owned.json().catch(() => ({}))) as { incoming_phone_numbers?: unknown[] };
    if (!list.incoming_phone_numbers?.length) {
      return result(
        false,
        "twilio_number_not_owned",
        `${notes[0]} But ${from} is not a number on this account. Use a number from Phone Numbers > Manage > Active numbers, in E.164 format (+15085550100).`,
        { ...params, from },
      );
    }
    notes.push(`${from} belongs to the account.`);
    params.from = from;
  }

  if (service) {
    const svc = await fetcher(`https://messaging.twilio.com/v1/Services/${encodeURIComponent(service)}`, { method: "GET", headers });
    if (svc.status === 404) {
      return result(false, "twilio_service_missing", `${notes.join(" ")} But Messaging Service ${service} was not found on this account.`, { ...params, service });
    }
    if (!svc.ok) {
      const text = await detail(svc);
      return result(
        false,
        "twilio_service_check_failed",
        `${notes.join(" ")} Could not check Messaging Service ${service} (${svc.status}). ${text}`.trim(),
        { ...params, service, status: svc.status },
        text,
      );
    }
    notes.push(`Messaging Service ${service} exists.`);
    params.service = service;
  }

  notes.push("No SMS was sent.");
  return result(true, "twilio_ok", notes.join(" "), params);
}
