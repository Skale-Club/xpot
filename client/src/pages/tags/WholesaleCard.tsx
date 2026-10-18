import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShoppingBag } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { tagsGet } from "./lib";
import { Button } from "@/components/ui/button";
import { CopyButton, EYEBROW_MUTED } from "./ui";

/** "Buy kits at wholesale": the rep's own code and the Stuscle store link that carries it. */
export function WholesaleCard() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const { data } = useQuery({
    queryKey: ["/api/xpot/wholesale"],
    queryFn: () => tagsGet<{ code: string; url: string }>("/api/xpot/wholesale"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!data) return null;
  return (
    <section className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.10] to-fuchsia-600/[0.05] p-4 lg:flex lg:items-center lg:gap-6 lg:p-5" data-testid="wholesale-card">
      <div className="flex items-start gap-3 lg:min-w-0 lg:flex-1 lg:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/15 text-violet-200">
          <ShoppingBag className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-white">{t("wholesaleTitle")}</p>
          <p className="mt-0.5 text-sm text-white/55">{t("wholesaleText")}</p>
        </div>
      </div>
      {/* Phones stack the code and the button; wide screens put them on one row beside the text. */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch lg:mt-0 lg:shrink-0">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 py-1.5 pl-4 pr-1.5 sm:flex-1 lg:w-64 lg:flex-none">
          <span className="min-w-0 flex-1">
            <span className={`block ${EYEBROW_MUTED}`}>{t("wholesaleCode")}</span>
            <span className="block font-mono text-lg font-bold tracking-[0.12em] text-white" data-testid="wholesale-code">
              {data.code}
            </span>
          </span>
          <CopyButton text={data.code} label={tc("copy")} />
        </div>
        <Button asChild variant="brand" accent="tags" size="lg" className="w-full sm:w-auto">
          <a href={data.url} target="_blank" rel="noopener noreferrer" data-testid="wholesale-open">
            {t("wholesaleOpen")}
            <ExternalLink />
          </a>
        </Button>
      </div>
    </section>
  );
}
