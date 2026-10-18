import { describe, expect, it } from "vitest";
import { integrationTestText } from "../client/src/pages/admin/platform/integrationTestText";
import { checkTwilioConfig } from "../server/auth/twilioCheck";
import { INTEGRATION_TEST_CODES } from "../shared/integrationTest";
import { integrationTestMessages } from "../client/src/i18n/messages/integrationTests";

const SID = "AC" + "a".repeat(32);
const MG = "MG" + "b".repeat(32);

const twilio = (routes: { account?: Response; numbers?: Response; service?: Response }) => async (url: string) => {
  if (url.includes("IncomingPhoneNumbers")) return routes.numbers ?? new Response(JSON.stringify({ incoming_phone_numbers: [{}] }), { status: 200 });
  if (url.includes("messaging.twilio.com")) return routes.service ?? new Response("{}", { status: 200 });
  return routes.account ?? new Response(JSON.stringify({ friendly_name: "Skale", status: "active" }), { status: 200 });
};

describe("integration test codes", () => {
  it("each has a sentence (twilio_ok is composed)", () => {
    const missing = INTEGRATION_TEST_CODES.filter((code) => code !== "twilio_ok" && !(`test_${code}` in integrationTestMessages.en));
    expect(missing).toEqual([]);
  });
});

describe("integrationTestText", () => {
  it("words a generic result with the card's provider name and the field label", () => {
    expect(integrationTestText({ code: "ok", message: "Groq authenticated." }, "pt", { provider: "Groq" })).toBe("Groq aceitou as credenciais.");
    expect(integrationTestText({ code: "http_error", params: { status: 401 }, message: "Groq returned 401. Invalid API Key" }, "es", { provider: "Groq" }))
      .toBe("Groq respondió con un error (401).");
    expect(integrationTestText({ code: "missing_secret", params: { field: "apiKey" }, message: "Paste the Auth Token" }, "pt", { provider: "Twilio", field: "Auth Token" }))
      .toBe("Informe Auth Token ou salve antes de testar.");
  });

  it("falls back to the server's message for a code it does not know", () => {
    expect(integrationTestText({ code: "brand_new" as never, message: "Something new." }, "pt", { provider: "X" })).toBe("Something new.");
  });

  it("composes Twilio's steps in the user's language", async () => {
    const ok = await checkTwilioConfig({ accountSid: SID, authToken: "t", fromNumber: "+15550000001", messagingServiceSid: MG }, twilio({}));
    expect(ok).toMatchObject({ ok: true, code: "twilio_ok", params: { name: '"Skale"', from: "+15550000001", service: MG } });
    expect(integrationTestText(ok, "pt", { provider: "Twilio" })).toBe(
      `Credenciais aceitas, a conta "Skale" está ativa. +15550000001 pertence à conta. O Messaging Service ${MG} existe. Nenhum SMS foi enviado.`,
    );
    // The English sentence matches what the server keeps as the last test.
    expect(integrationTestText(ok, "en", { provider: "Twilio" })).toBe(ok.message);

    const foreign = await checkTwilioConfig(
      { accountSid: SID, authToken: "t", fromNumber: "+15550000001" },
      twilio({ numbers: new Response(JSON.stringify({ incoming_phone_numbers: [] }), { status: 200 }) }),
    );
    expect(foreign.code).toBe("twilio_number_not_owned");
    expect(integrationTestText(foreign, "es", { provider: "Twilio" })).toMatch(/^Credenciales aceptadas, la cuenta "Skale" está activa\. Pero \+15550000001 no es un número de esta cuenta/);

    const noService = await checkTwilioConfig(
      { accountSid: SID, authToken: "t", fromNumber: "+15550000001", messagingServiceSid: MG },
      twilio({ service: new Response("{}", { status: 404 }) }),
    );
    expect(noService.code).toBe("twilio_service_missing");
    expect(integrationTestText(noService, "pt", { provider: "Twilio" })).toBe(
      `Credenciais aceitas, a conta "Skale" está ativa. +15550000001 pertence à conta. Mas o Messaging Service ${MG} não existe nesta conta.`,
    );
  });

  it("keeps Twilio's own words as the detail, out of the sentence", async () => {
    const failed = await checkTwilioConfig(
      { accountSid: SID, authToken: "t" },
      twilio({ account: new Response(JSON.stringify({ code: 20003, message: "Authenticate" }), { status: 500 }) }),
    );
    expect(failed).toMatchObject({ ok: false, code: "http_error", params: { status: 500 }, detail: "20003 Authenticate" });
    expect(integrationTestText(failed, "pt", { provider: "Twilio" })).toBe("Twilio respondeu com um erro (500).");
  });
});
