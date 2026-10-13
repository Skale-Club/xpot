export interface SignupLeadTelegram {
  name: string;
  phone: string;
  email: string;
  workCity: string;
  workRegion: string;
  hasVehicle: boolean;
  languages: string[];
  otherLanguages?: string;
  occupation: string;
  salesExperience: "none" | "some" | "experienced";
  fieldSalesReadiness: "ready" | "with_support" | "not_ready";
  availability: "weekdays" | "evenings" | "weekends" | "flexible";
  message?: string;
  test?: boolean;
}

export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SALES = { none: "Sem experiência", some: "Alguma experiência", experienced: "Experiente" } as const;
const READINESS = { ready: "Pronto para vender presencialmente", with_support: "Pronto com apoio inicial", not_ready: "Ainda não se sente preparado" } as const;
const AVAILABILITY = { weekdays: "Dias de semana", evenings: "À noite", weekends: "Fins de semana", flexible: "Horários flexíveis" } as const;
const LANGUAGES: Record<string, string> = { en: "Inglês", pt: "Português", es: "Espanhol", other: "Outro" };

export function formatSignupLeadTelegram(lead: SignupLeadTelegram): string {
  const languages = lead.languages.map((language) => LANGUAGES[language] ?? language);
  if (lead.otherLanguages?.trim()) languages.push(lead.otherLanguages.trim());
  return [
    lead.test ? "🧪 <b>LEAD DE TESTE · XPOT</b>" : "✨ <b>NOVO LEAD · XPOT</b>",
    "✅ Formulário concluído",
    "",
    "<b>Contato</b>",
    `👤 ${escapeTelegramHtml(lead.name)}`,
    `📱 ${escapeTelegramHtml(lead.phone)}`,
    `✉️ ${escapeTelegramHtml(lead.email)}`,
    "",
    "<b>Área de atuação</b>",
    `📍 ${escapeTelegramHtml(lead.workCity)}, ${escapeTelegramHtml(lead.workRegion)}`,
    `🚗 Veículo próprio: ${lead.hasVehicle ? "Sim" : "Não"}`,
    `🗣 Idiomas: ${escapeTelegramHtml(languages.join(", "))}`,
    "",
    "<b>Perfil</b>",
    `💼 Ocupação: ${escapeTelegramHtml(lead.occupation)}`,
    `🤝 Vendas: ${SALES[lead.salesExperience]}`,
    `🚶 Campo: ${READINESS[lead.fieldSalesReadiness]}`,
    `🗓 Disponibilidade: ${AVAILABILITY[lead.availability]}`,
    "",
    "<b>Confirmações</b>",
    "✓ Investimento no kit inicial",
    "✓ Compromisso com atividade em campo",
    ...(lead.message?.trim() ? ["", "<b>Mensagem</b>", `💬 ${escapeTelegramHtml(lead.message.trim())}`] : []),
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
        text: "💬 Chamar no WhatsApp",
        url: `https://wa.me/${phone}?text=${encodeURIComponent(options.whatsappText ?? "Olá! Recebemos seu cadastro no Xpot e queremos conversar com você.")}`,
      }]],
    } : undefined;
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Telegram answered ${response.status}`);
    return true;
  } catch {
    console.error("[signup-telegram] delivery failed");
    return false;
  }
}
