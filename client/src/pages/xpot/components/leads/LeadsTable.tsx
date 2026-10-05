import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Building2, Loader2, Nfc, Send, Trash2, UserCheck } from "lucide-react";
import type { LeadTagSummary } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { formatCents } from "../../utils";
import type { FullSalesLead } from "../../types";

type SortKey = "name" | "city" | "sold" | "shelf" | "lastVisit";

function RowAction({ title, onClick, children, hover, disabled }: { title: string; onClick: () => void; children: ReactNode; hover: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-white/35 transition-colors disabled:opacity-40 ${hover}`}
    >
      {children}
    </button>
  );
}

/** Desktop list of leads or prospects, sortable, one row per company. */
export function LeadsTable({
  leads,
  isProspect,
  selectedId,
  onSelect,
  piecesFor,
  lastVisitFor,
  onDelete,
  onPromote,
  onSyncGhl,
  syncingId,
}: {
  leads: FullSalesLead[];
  isProspect: boolean;
  selectedId: number | null;
  onSelect: (lead: FullSalesLead) => void;
  piecesFor: (leadId: number) => LeadTagSummary | undefined;
  lastVisitFor: (leadId: number) => Date | null;
  onDelete: (lead: FullSalesLead) => void;
  onPromote: (lead: FullSalesLead) => void;
  onSyncGhl: (lead: FullSalesLead) => void;
  syncingId: number | null;
}) {
  const t = useT(leadsMessages);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const rows = useMemo(() => {
    const value = (l: FullSalesLead): string | number => {
      switch (sort.key) {
        case "name": return l.name.toLowerCase();
        case "city": return (l.locations?.[0]?.city ?? "").toLowerCase();
        case "sold": return l.salesLifetimeCents ?? 0;
        case "shelf": return l.unitsOnShelf ?? 0;
        case "lastVisit": return lastVisitFor(l.id)?.getTime() ?? 0;
      }
    };
    return [...leads].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [leads, sort, lastVisitFor]);

  const header = (key: SortKey, label: string, align: "left" | "right" = "left", className = "") => {
    const active = sort.key === key;
    return (
      <th className={`whitespace-nowrap px-3 py-2.5 font-semibold ${align === "right" ? "text-right" : ""} ${className}`} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" || key === "city" ? 1 : -1 }))}
          className={`inline-flex items-center gap-1 uppercase tracking-widest transition-colors ${active ? "text-white/70" : "hover:text-white/60"}`}
        >
          {label}
          {active && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <table className="w-full text-left text-sm" data-testid="leads-table">
        <thead className="border-b border-white/[0.07] text-[10px] text-white/35">
          <tr>
            {header("name", t("colName"))}
            {header("city", t("fieldCity"))}
            <th className="hidden whitespace-nowrap px-3 py-2.5 font-semibold uppercase tracking-widest 2xl:table-cell">{t("colPhone")}</th>
            {header("sold", t("colSold"), "right")}
            {header("shelf", t("colShelf"), "right", "hidden 2xl:table-cell")}
            {header("lastVisit", t("colLastVisit"))}
            <th className="px-3 py-2.5"><span className="sr-only">{t("colActions")}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((lead) => {
            const loc = lead.locations?.[0];
            const photo = lead.photos?.[0];
            const pieces = piecesFor(lead.id);
            const last = lastVisitFor(lead.id);
            const selected = selectedId === lead.id;
            return (
              <tr
                key={lead.id}
                tabIndex={0}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(lead)}
                onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(lead); } }}
                className={`group cursor-pointer outline-none transition-colors focus-visible:bg-white/[0.05] ${
                  selected ? "bg-blue-500/[0.12]" : "hover:bg-white/[0.03]"
                }`}
                data-testid={`lead-row-${lead.id}`}
              >
                <td className="max-w-0 px-3 py-2.5" style={{ width: "45%" }}>
                  <div className="flex items-center gap-3">
                    {photo ? (
                      <img src={photo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
                        <Building2 className="h-4 w-4 text-indigo-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-white">{lead.name}</span>
                        {lead.ghlContactId && (
                          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-400" style={{ background: "rgba(16,185,129,0.12)" }}>GHL</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 truncate text-[11px] text-white/35">
                        {lead.industry && <span className="truncate">{lead.industry}</span>}
                        {pieces && pieces.pieces > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-violet-300/80">
                            <Nfc className="h-3 w-3" /> {pieces.pieces}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-white/55">{[loc?.city, loc?.state].filter(Boolean).join(", ") || "—"}</td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-white/55 2xl:table-cell">{lead.phone || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-emerald-300/85">
                  {lead.salesLifetimeCents ? formatCents(lead.salesLifetimeCents) : <span className="text-white/20">—</span>}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-indigo-200/80 2xl:table-cell">
                  {lead.unitsOnShelf || <span className="text-white/20">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-white/55">
                  {last ? last.toLocaleDateString(t.locale, { month: "short", day: "numeric" }) : <span className="text-white/20">—</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <div className="flex items-center justify-end gap-0.5">
                    {isProspect && (
                      <RowAction title={t("promote")} onClick={() => onPromote(lead)} hover="hover:bg-purple-500/20 hover:text-purple-400">
                        <UserCheck className="h-3.5 w-3.5" />
                      </RowAction>
                    )}
                    {isProspect && (
                      <RowAction title={t("sendGhl")} onClick={() => onSyncGhl(lead)} disabled={syncingId === lead.id} hover="hover:bg-emerald-500/20 hover:text-emerald-400">
                        {syncingId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </RowAction>
                    )}
                    <RowAction title={t("delete")} onClick={() => onDelete(lead)} hover="hover:bg-red-500/20 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </RowAction>
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
