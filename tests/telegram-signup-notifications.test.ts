import { afterEach, beforeEach, test, vi } from "vitest";
import assert from "node:assert/strict";

const originalToken = process.env.XPOT_TELEGRAM_BOT_TOKEN;
const originalChat = process.env.XPOT_TELEGRAM_CHAT_ID;
const originalLeads = process.env.XPOT_LEADS_TELEGRAM_CHAT_ID;

beforeEach(() => vi.stubEnv("NODE_ENV", "production"));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalToken === undefined) delete process.env.XPOT_TELEGRAM_BOT_TOKEN;
  else process.env.XPOT_TELEGRAM_BOT_TOKEN = originalToken;
  if (originalChat === undefined) delete process.env.XPOT_TELEGRAM_CHAT_ID;
  else process.env.XPOT_TELEGRAM_CHAT_ID = originalChat;
  if (originalLeads === undefined) delete process.env.XPOT_LEADS_TELEGRAM_CHAT_ID;
  else process.env.XPOT_LEADS_TELEGRAM_CHAT_ID = originalLeads;
});

test("development cannot send even when credentials are present", async () => {
  vi.stubEnv("NODE_ENV", "development");
  process.env.XPOT_TELEGRAM_BOT_TOKEN = "secret-token";
  process.env.XPOT_LEADS_TELEGRAM_CHAT_ID = "-123";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { sendSignupTelegram } = await import("../server/auth/telegram.js");
  assert.equal(await sendSignupTelegram("lead"), false);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("Telegram sign-up notices stay disabled until both settings exist", async () => {
  delete process.env.XPOT_TELEGRAM_BOT_TOKEN;
  delete process.env.XPOT_LEADS_TELEGRAM_CHAT_ID;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { sendSignupTelegram } = await import("../server/auth/telegram.js");
  assert.equal(await sendSignupTelegram("draft"), false);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("Telegram sign-up notices post to the dedicated Leads chat", async () => {
  process.env.XPOT_TELEGRAM_BOT_TOKEN = "test-token";
  process.env.XPOT_LEADS_TELEGRAM_CHAT_ID = "-123";
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
    workCity: "Worcester & Co", workRegion: "MA", hasVehicle: true, test: true,
  });
  assert.match(text, /LEAD DE TESTE/);
  assert.match(text, /🔵 Informação/);
  assert.match(text, /Maria &lt;Teste&gt;/);
  assert.match(text, /Worcester &amp; Co, MA/);
  assert.match(text, /<b>Área de atuação<\/b>/);
});

test("a refused Telegram notice logs Telegram's reason without the token", async () => {
  process.env.XPOT_TELEGRAM_BOT_TOKEN = "secret-token";
  process.env.XPOT_LEADS_TELEGRAM_CHAT_ID = "-123";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ ok: false, description: "Bad Request: group chat was upgraded to a supergroup chat", parameters: { migrate_to_chat_id: -100123 } }),
  }));
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { sendSignupTelegram } = await import("../server/auth/telegram.js");
  assert.equal(await sendSignupTelegram("lead"), false);
  const logged = errorSpy.mock.calls.flat().join(" ");
  errorSpy.mockRestore();
  assert.match(logged, /upgraded to a supergroup/);
  assert.match(logged, /XPOT_LEADS_TELEGRAM_CHAT_ID to -100123/);
  assert.doesNotMatch(logged, /secret-token/);
});

test("sign-up notices never fall back to the Ops chat", async () => {
  process.env.XPOT_TELEGRAM_BOT_TOKEN = "test-token";
  process.env.XPOT_TELEGRAM_CHAT_ID = "-555";
  delete process.env.XPOT_LEADS_TELEGRAM_CHAT_ID;
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const { sendSignupTelegram, isSignupTelegramConfigured } = await import("../server/auth/telegram.js");
  assert.equal(isSignupTelegramConfigured(), false);
  assert.equal(await sendSignupTelegram("lead"), false);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("a Leads chat equal to Ops, or not a group id, is refused", async () => {
  const { signupLeadsChatId } = await import("../server/auth/telegram.js");
  assert.equal(signupLeadsChatId({ XPOT_TELEGRAM_CHAT_ID: "-555", XPOT_LEADS_TELEGRAM_CHAT_ID: "-555" }), null);
  assert.equal(signupLeadsChatId({ XPOT_LEADS_TELEGRAM_CHAT_ID: "12345" }), null);
  assert.equal(signupLeadsChatId({ XPOT_LEADS_TELEGRAM_CHAT_ID: "@xpotleads" }), null);
  assert.equal(signupLeadsChatId({ XPOT_TELEGRAM_CHAT_ID: "-555", XPOT_LEADS_TELEGRAM_CHAT_ID: " -1009 " }), "-1009");
});
