import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db.js";
import { authAccessRequests, users } from "#shared/schema.js";
import { escapeTelegramHtml, sendSignupTelegram } from "./telegram.js";

const ABANDONED_AFTER_MS = 30 * 60 * 1000;
const CHECK_EVERY_MS = 5 * 60 * 1000;

export function startAbandonedSignupNotifier(): () => void {
  const check = async () => {
    if (!process.env.XPOT_TELEGRAM_BOT_TOKEN || !process.env.XPOT_TELEGRAM_CHAT_ID) return;
    const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS);
    const drafts = await db
      .select({ request: authAccessRequests, phone: users.phone, firstName: users.firstName, lastName: users.lastName })
      .from(authAccessRequests)
      .innerJoin(users, eq(users.id, authAccessRequests.userId))
      .where(and(
        eq(authAccessRequests.status, "draft"),
        lt(authAccessRequests.lastActivityAt, cutoff),
        isNull(authAccessRequests.abandonedNotifiedAt),
      ))
      .limit(50);

    for (const row of drafts) {
      const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || "Name not provided";
      const place = [row.request.workCity, row.request.workRegion].filter(Boolean).join(", ") || "location not provided";
      const sent = await sendSignupTelegram(
        `<b>RASCUNHO ABANDONADO · XPOT</b>\n\nNome: ${escapeTelegramHtml(name)}\nTelefone: ${escapeTelegramHtml(row.phone ?? "Indisponível")}\nLocal: ${escapeTelegramHtml(place)}\n\nParou na pergunta ${row.request.draftStep + 1}.`,
        {
          whatsappPhone: row.phone,
          whatsappText: `Olá, ${name.split(/\s+/)[0]}! Vimos que você começou seu cadastro no Xpot. Posso ajudar?`,
        },
      );
      if (sent) {
        await db.update(authAccessRequests)
          .set({ abandonedNotifiedAt: new Date() })
          .where(eq(authAccessRequests.id, row.request.id));
      }
    }
  };

  const timer = setInterval(() => void check().catch((error) => console.error("[signup-telegram] draft scan failed", error)), CHECK_EVERY_MS);
  timer.unref();
  void check().catch((error) => console.error("[signup-telegram] draft scan failed", error));
  return () => clearInterval(timer);
}
