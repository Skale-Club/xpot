/** Send one plain-text notification without ever exposing the bot token in logs. */
export async function sendSignupTelegram(text: string): Promise<boolean> {
  const token = process.env.XPOT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.XPOT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Telegram answered ${response.status}`);
    return true;
  } catch {
    console.error("[signup-telegram] delivery failed");
    return false;
  }
}
