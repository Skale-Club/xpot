import { Building2, Mic, Sparkles } from "lucide-react";
import { useT } from "@/i18n";
import { visitsMessages } from "@/i18n/messages/visits";
import { leadsMessages } from "@/i18n/messages/leads";
import { formatDuration } from "../utils";
import { StatusBadge } from "./VisitStatus";
import type { EnrichedSalesVisit } from "../types";

/** Desktop list of visits, newest first, one row each. */
export function VisitsTable({
  visits,
  selectedId,
  onSelect,
}: {
  visits: EnrichedSalesVisit[];
  selectedId: number | null;
  onSelect: (visit: EnrichedSalesVisit) => void;
}) {
  const t = useT(visitsMessages);
  const tl = useT(leadsMessages);

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <table className="w-full text-left text-sm" data-testid="visits-table">
        <thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-widest text-white/35">
          <tr>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">{t("colWhen")}</th>
            <th className="px-3 py-2.5 font-semibold">{t("colCompany")}</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">{t("colOutcome")}</th>
            <th className="hidden whitespace-nowrap px-3 py-2.5 text-right font-semibold 2xl:table-cell">{t("colDuration")}</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold"><span className="sr-only">{t("colNotes")}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {visits.map((visit) => {
            const selected = selectedId === visit.id;
            const when = visit.checkedInAt ? new Date(visit.checkedInAt) : null;
            const lead = visit.lead as (typeof visit.lead & { photos?: string[] | null; locations?: { city?: string | null }[] }) | undefined;
            const photo = lead?.photos?.[0];
            const city = lead?.locations?.[0]?.city;
            return (
              <tr
                key={visit.id}
                tabIndex={0}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(visit)}
                onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(visit); } }}
                className={`cursor-pointer outline-none transition-colors focus-visible:bg-white/[0.05] ${selected ? "bg-blue-500/[0.12]" : "hover:bg-white/[0.03]"}`}
                data-testid={`visit-row-${visit.id}`}
              >
                <td className="whitespace-nowrap px-3 py-2.5">
                  {when ? (
                    <>
                      <div className="font-medium text-white/85">{when.toLocaleDateString(t.locale, { month: "short", day: "numeric" })}</div>
                      <div className="text-[11px] text-white/35">{when.toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" })}</div>
                    </>
                  ) : (
                    <span className="text-white/25">—</span>
                  )}
                </td>
                <td className="max-w-0 px-3 py-2.5" style={{ width: "50%" }}>
                  <div className="flex items-center gap-3">
                    {photo ? (
                      <img src={photo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
                        <Building2 className="h-4 w-4 text-indigo-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{lead?.name || tl("leadNumber", { id: visit.leadId })}</div>
                      {city && <div className="truncate text-[11px] text-white/35">{city}</div>}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5"><StatusBadge status={visit.status} /></td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-white/55 2xl:table-cell">
                  {visit.durationSeconds ? formatDuration(visit.durationSeconds) : <span className="text-white/20">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1.5 text-white/35">
                    {visit.note?.summary && <Sparkles className="h-3.5 w-3.5 text-indigo-300" aria-label={t("hasSummary")} />}
                    {visit.note?.audioUrl && <Mic className="h-3.5 w-3.5" aria-label={t("hasAudio")} />}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
