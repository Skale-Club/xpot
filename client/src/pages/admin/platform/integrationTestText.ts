import { interpolate, type Lang } from "@/i18n";
import { integrationTestMessages } from "@/i18n/messages/integrationTests";
import type { IntegrationTestCode, IntegrationTestResult } from "@shared/integrationTest";

type Key = keyof typeof integrationTestMessages.en;

// Twilio's checks run in order; a later result has passed the earlier ones,
// and its sentence says so first, as the server's English message does.
const AFTER_ACCOUNT = new Set<IntegrationTestCode>([
  "twilio_no_sender",
  "twilio_number_check_failed",
  "twilio_number_not_owned",
  "twilio_service_missing",
  "twilio_service_check_failed",
  "twilio_ok",
]);
const AFTER_NUMBER = new Set<IntegrationTestCode>(["twilio_service_missing", "twilio_service_check_failed", "twilio_ok"]);

/**
 * A Test result in the user's language, from its code and params. `provider`
 * is the service's name on the card and `field` the translated label of the
 * field the result names. A code this build does not know shows the server's
 * English message.
 */
export function integrationTestText(
  result: Pick<IntegrationTestResult, "code" | "params" | "message">,
  lang: Lang,
  names: { provider: string; field?: string },
): string {
  const table = integrationTestMessages[lang] as Record<Key, string>;
  const codeKey = `test_${result.code}` as Key;
  if (!result.code || (result.code !== "twilio_ok" && !(codeKey in table))) return result.message;
  const vars = { ...result.params, provider: names.provider, ...(names.field ? { field: names.field } : {}) };
  const say = (key: Key) => interpolate(table[key], vars);

  const parts: string[] = [];
  if (AFTER_ACCOUNT.has(result.code)) parts.push(say("twilioAccountOk"));
  if (AFTER_NUMBER.has(result.code) && result.params?.from) parts.push(say("twilioNumberOk"));
  if (result.code === "twilio_ok") {
    if (result.params?.service) parts.push(say("twilioServiceOk"));
    parts.push(say("twilioNoSms"));
  } else {
    parts.push(say(codeKey));
  }
  return parts.join(" ");
}
