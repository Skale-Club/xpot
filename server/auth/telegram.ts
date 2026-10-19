export interface SignupLeadTelegram {
  name: string;
  phone: string;
  email: string;
  workCity: string;
  workRegion: string;
  hasVehicle: boolean;
  test?: boolean;
}

export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatSignupLeadTelegram(lead: SignupLeadTelegram): string {
  return [
    lead.test ? "<b>LEAD DE TESTE · XPOT</b>" : "<b>NOVO LEAD · XPOT</b>",
    "Formulário concluído",
    "",
    "<b>Contato</b>",
    `Nome: ${escapeTelegramHtml(lead.name)}`,
    `Telefone: ${escapeTelegramHtml(lead.phone)}`,
    `E-mail: ${escapeTelegramHtml(lead.email)}`,
    "",
    "<b>Área de atuação</b>",
    `Local: ${escapeTelegramHtml(lead.workCity)}, ${escapeTelegramHtml(lead.workRegion)}`,
    `Veículo próprio: ${lead.hasVehicle ? "Sim" : "Não"}`,
    "",
    "<b>Confirmações</b>",
    "Kit inicial: entendeu como funciona",
    "Conta ativa: entendeu como manter",
  ].join("\n");
}

interface TelegramOptions {
  whatsappPhone?: string | null;
  whatsappText?: string;
}

/** Send one formatted notification without ever exposing the bot token in logs. */
export async function sendSignupTelegram(text: string, options: TelegramOptions = {}): Promise<boolean> {
  const token = process.env.XPOT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.XPOT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return false;
  try {
    const phone = options.whatsappPhone?.replace(/\D/g, "") ?? "";
    const replyMarkup = phone.length >= 8 ? {
      inline_keyboard: [[{
        text: "Chamar no WhatsApp",
        url: `https://wa.me/${phone}?text=${encodeURIComponent(options.whatsappText ?? "Olá! Recebemos seu cadastro no Xpot e queremos conversar com você.")}`,
      }]],
    } : undefined;
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      // Telegram's own reason ("chat not found", a group upgraded to a supergroup...); it never echoes the token.
      const answer = await response.json().catch(() => null) as { description?: string; parameters?: { migrate_to_chat_id?: number } } | null;
      const migrated = answer?.parameters?.migrate_to_chat_id;
      console.error(`[signup-telegram] Telegram refused (${response.status}): ${answer?.description ?? "no reason given"}${migrated ? `; set XPOT_TELEGRAM_CHAT_ID to ${migrated}` : ""}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[signup-telegram] delivery failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return false;
  }
}
