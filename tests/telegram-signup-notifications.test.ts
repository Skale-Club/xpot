import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";

const originalToken = process.env.XPOT_TELEGRAM_BOT_TOKEN;
const originalChat = process.env.XPOT_TELEGRAM_CHAT_ID;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalToken === undefined) delete process.env.XPOT_TELEGRAM_BOT_TOKEN;
  else process.env.XPOT_TELEGRAM_BOT_TOKEN = originalToken;
  if (originalChat === undefined) delete process.env.XPOT_TELEGRAM_CHAT_ID;
  else process.env.XPOT_TELEGRAM_CHAT_ID = originalChat;
});

test("Telegram sign-up notices stay disabled until both settings exist", async () => {
  delete process.env.XPOT_TELEGRAM_BOT_TOKEN;
  delete process.env.XPOT_TELEGRAM_CHAT_ID;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { sendSignupTelegram } = await import("../server/auth/telegram.js");
  assert.equal(await sendSignupTelegram("draft"), false);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("Telegram sign-up notices post to the configured chat", async () => {
  process.env.XPOT_TELEGRAM_BOT_TOKEN = "test-token";
  process.env.XPOT_TELEGRAM_CHAT_ID = "-123";
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const { sendSignupTelegram } = await import("../server/auth/telegram.js");
  assert.equal(await sendSignupTelegram("<b>Xpot application</b>", { whatsappPhone: "+1 (508) 555-0199", whatsappText: "Hello" }), true);
  const [url, init] = fetchMock.mock.calls[0];
  assert.equal(url, "https://api.telegram.org/bottest-token/sendMessage");
  assert.deepEqual(JSON.parse(init.body), {
    chat_id: "-123",
    text: "<b>Xpot application</b>",
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: "Chamar no WhatsApp", url: "https://wa.me/15085550199?text=Hello" }]] },
  });
});

test("completed lead formatting is structured and escapes user content", async () => {
  const { formatSignupLeadTelegram } = await import("../server/auth/telegram.js");
  const text = formatSignupLeadTelegram({
    name: "Maria <Teste>", phone: "+15085550199", email: "maria@example.com",
    workCity: "Worcester", workRegion: "Massachusetts", hasVehicle: true,
    languages: ["en", "pt"], occupation: "Delivery driver", salesExperience: "some",
    fieldSalesReadiness: "ready", availability: "evenings", message: "Ready & available", test: true,
  });
  assert.match(text, /LEAD DE TESTE/);
  assert.match(text, /Maria &lt;Teste&gt;/);
  assert.match(text, /Ready &amp; available/);
  assert.match(text, /<b>Área de atuação<\/b>/);
});
