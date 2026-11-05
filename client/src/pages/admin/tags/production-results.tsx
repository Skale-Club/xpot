import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Factory, PackageCheck, PackageX, Percent, Printer } from "lucide-react";
import { printProblemRate, type PrintQualitySummary } from "@shared/printProduction";
import { KpiTile, SectionCard } from "@/components/xpot/DashboardKit";
import { FilterChips } from "@/components/xpot/filters";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { productionResultsMessages } from "@/i18n/messages/productionResults";
import { ADMIN_TAGS_KEY, getJson } from "./api";

// How production is going, on Pieces results: what was printed, what was lost and why, what went live. It adds up the
// answers given when a print is marked printed. Only who produces gets the numbers; for anyone else the card is not drawn.

const PERIODS = [30, 90, 365] as const;

export function ProductionResults({ activated }: { activated: number }) {
  const r = useT(productionResultsMessages);
  const t = useT(productionMessages);
  const [days, setDays] = useState<number>(90);
  const { data } = useQuery({
    queryKey: [ADMIN_TAGS_KEY, "production", "quality", days],
    queryFn: () => getJson<PrintQualitySummary>(`/api/xpot/admin/print-quality?days=${days}`),
    retry: false,
  });
  if (!data) return null;
  const rate = printProblemRate(data);
  const lost = data.withProblem + data.failedPieces;
  return (
    <SectionCard
      accent="tags"
      icon={Factory}
      title={r("title")}
      actions={<FilterChips items={PERIODS.map((period) => ({ id: String(period), label: r("days", { days: period }) }))} value={String(days)} onChange={(next) => setDays(Number(next))} ariaLabel={r("period")} accent="tags" />}
      testId="production-results"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile accent="violet" icon={Printer} label={r("printed")} value={data.pieces} />
          <KpiTile accent="amber" icon={PackageX} label={r("lost")} value={lost} detail={data.failedPrints > 0 ? r.plural("failedPrints", data.failedPrints) : undefined} />
          <KpiTile accent="amber" icon={Percent} label={r("rate")} value={rate === null ? "-" : `${rate}%`} />
          <KpiTile accent="emerald" icon={PackageCheck} label={r("activated")} value={activated} detail={r("allTime")} />
        </div>
        {data.byProblem.length ? (
          <div data-testid="production-results-problems">
            <h3 className="mb-2 text-xs font-semibold text-white/60">{r("whyLost")}</h3>
            <ul className="space-y-1.5 text-sm">
              {data.byProblem.map(({ problem, count }) => (
                <li key={problem} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 truncate text-white/70">{t(`pieceProblem_${problem}` as never)}</span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className="block h-full rounded-full bg-amber-400/70" style={{ width: `${Math.round((count / data.withProblem) * 100)}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right font-medium tabular-nums text-white">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
