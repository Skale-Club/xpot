import type { ReactNode } from "react";
import { Clock3, MessageCircle, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { signinMessages } from "@/i18n/messages/signin";

/**
 * "Your sign-up is under review" and "Your access is turned off": the one
 * screen for a person who signed in but cannot use Xpot yet (or anymore). The
 * sign-in card and every screen that finds a 403 on the session show this same
 * card, with the WhatsApp of the Xpot team when one is set.
 */
export function AccessNotice({ kind, whatsappHref, action }: { kind: "pending" | "blocked"; whatsappHref: string | null; action: ReactNode }) {
  const t = useT(signinMessages);
  const pending = kind === "pending";
  const Icon = pending ? Clock3 : ShieldOff;
  return (
    <div className="space-y-4 text-center" data-testid={`signin-${kind}`}>
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${pending ? "bg-amber-400/10 text-amber-300" : "bg-red-500/10 text-red-300"}`}>
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <p className="text-lg font-bold text-white">{pending ? t("pendingTitle") : t("blockedTitle")}</p>
        <p className="mt-1 text-sm text-white/60">{pending ? t("pendingText") : t("blockedText")}</p>
      </div>
      {whatsappHref && (
        <div className="space-y-2">
          {pending ? <p className="text-sm text-white/50">{t("pendingQuestion")}</p> : null}
          <Button asChild variant="secondary" size="lg" className="w-full">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-testid="signin-whatsapp">
              <MessageCircle className="text-emerald-300" />
              {t("contactWhatsapp")}
            </a>
          </Button>
        </div>
      )}
      {action}
    </div>
  );
}
