import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShoppingBag } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { tagsGet } from "./lib";
import { CopyButton } from "./ui";

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
    <section className="rounded-[20px] border border-indigo-400/20 bg-gradient-to-br from-indigo-500/[0.10] to-blue-500/[0.05] p-4" data-testid="wholesale-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-400/15 text-indigo-200">
          <ShoppingBag className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-white">{t("wholesaleTitle")}</p>
          <p className="mt-0.5 text-sm text-white/55">{t("wholesaleText")}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 py-1.5 pl-4 pr-1.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-white/40">{t("wholesaleCode")}</span>
          <span className="block font-mono text-lg font-bold tracking-[0.12em] text-white" data-testid="wholesale-code">
            {data.code}
          </span>
        </span>
        <CopyButton text={data.code} label={tc("copy")} />
      </div>
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-semibold text-slate-900 transition-transform active:scale-[0.98]"
        data-testid="wholesale-open"
      >
        {t("wholesaleOpen")}
        <ExternalLink className="h-4 w-4" />
      </a>
    </section>
  );
}
