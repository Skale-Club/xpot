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
  assert.equal(await sendSignupTelegram("Xpot application"), true);
  const [url, init] = fetchMock.mock.calls[0];
  assert.equal(url, "https://api.telegram.org/bottest-token/sendMessage");
  assert.deepEqual(JSON.parse(init.body), { chat_id: "-123", text: "Xpot application", disable_web_page_preview: true });
});
