// "Test" button for the Twilio integration. Never sends an SMS: it only reads
// from Twilio to prove that the credentials work and that the sender belongs
// to the account.

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

export async function checkTwilioConfig(
  input: TwilioCheckInput,
  fetcher: Fetcher,
): Promise<{ ok: boolean; message: string }> {
  const sid = input.accountSid.trim();
  if (!sid) return { ok: false, message: "Account SID is required to test Twilio." };
  const headers = { Authorization: `Basic ${Buffer.from(`${sid}:${input.authToken}`).toString("base64")}` };
  const base = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}`;

  const account = await fetcher(`${base}.json`, { method: "GET", headers });
  if (account.status === 401) {
    return { ok: false, message: "Twilio rejected the Account SID and Auth Token (401). Check both values; the token is shown in the Twilio Console under Account Info." };
  }
  if (account.status === 404) return { ok: false, message: "Twilio does not know this Account SID (404)." };
  if (!account.ok) {
    return { ok: false, message: `Twilio returned ${account.status}. ${await detail(account)}`.trim() };
  }
  const info = (await account.json().catch(() => ({}))) as { friendly_name?: string; status?: string };
  const name = info.friendly_name ? `"${info.friendly_name}"` : sid;
  if (info.status && info.status !== "active") {
    return { ok: false, message: `The credentials are valid, but account ${name} is ${info.status}, so it cannot send SMS.` };
  }

  const notes: string[] = [`Credentials accepted, account ${name} is active.`];
  const from = input.fromNumber?.trim();
  const service = input.messagingServiceSid?.trim();
  if (!from && !service) {
    return { ok: false, message: `${notes[0]} But no From number or Messaging Service SID is set, so there is no sender yet.` };
  }

  if (from) {
    const owned = await fetcher(`${base}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`, { method: "GET", headers });
    if (!owned.ok) {
      return { ok: false, message: `${notes[0]} Could not check ${from} (${owned.status}). ${await detail(owned)}`.trim() };
    }
    const list = (await owned.json().catch(() => ({}))) as { incoming_phone_numbers?: unknown[] };
    if (!list.incoming_phone_numbers?.length) {
      return {
        ok: false,
        message: `${notes[0]} But ${from} is not a number on this account. Use a number from Phone Numbers > Manage > Active numbers, in E.164 format (+15085550100).`,
      };
    }
    notes.push(`${from} belongs to the account.`);
  }

  if (service) {
    const svc = await fetcher(`https://messaging.twilio.com/v1/Services/${encodeURIComponent(service)}`, { method: "GET", headers });
    if (svc.status === 404) {
      return { ok: false, message: `${notes.join(" ")} But Messaging Service ${service} was not found on this account.` };
    }
    if (!svc.ok) {
      return { ok: false, message: `${notes.join(" ")} Could not check Messaging Service ${service} (${svc.status}). ${await detail(svc)}`.trim() };
    }
    notes.push(`Messaging Service ${service} exists.`);
  }

  notes.push("No SMS was sent.");
  return { ok: true, message: notes.join(" ") };
}
