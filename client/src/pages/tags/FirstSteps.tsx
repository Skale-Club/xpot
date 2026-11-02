import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { firstStepsOf } from "./whoToAsk";
import { APP_BASE } from "./lib";
import { CARD } from "./ui";

/** The one line that says where a first piece comes from: the person's company by name, or the Shop for someone selling alone. */
export function useFirstPieceLine(): string {
  const t = useT(tagsMessages);
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const { company } = firstStepsOf(me);
  return company ? t("firstStepCompany", { company }) : t("firstStepShop");
}

/**
 * Home for someone with no pieces: what to do, in order, and whom to look for. The first step is the company's own
 * name when they belong to a team (no contact button: the data has no phone to put behind one), or a way into the
 * Shop for someone selling alone.
 */
export function FirstSteps() {
  const t = useT(tagsMessages);
  const [, navigate] = useLocation();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const { name, company } = firstStepsOf(me);
  const firstLine = useFirstPieceLine();
  const steps = [firstLine, t("firstStepRead"), t("firstStepLive")];

  return (
    <section className={`${CARD} p-5`} data-testid="first-steps">
      <h2 className="text-xl font-bold tracking-tight text-white">{name ? t("firstWelcome", { name }) : t("firstWelcomeNoName")}</h2>
      <p className="mt-1 text-sm text-white/60">{t("firstIntro")}</p>
      <ol className="mt-4 space-y-3">
        {steps.map((text, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-400/15 text-xs font-bold text-violet-200">{index + 1}</span>
            <span className="text-sm leading-6 text-white/85">{text}</span>
          </li>
        ))}
      </ol>
      {!company && (
        <Button type="button" variant="secondary" onClick={() => navigate(`${APP_BASE}/shop`)} className="mt-4 w-full lg:w-auto" data-testid="first-steps-shop">
          <ShoppingBag />
          {t("firstOpenShop")}
        </Button>
      )}
    </section>
  );
}
