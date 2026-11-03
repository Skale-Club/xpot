import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Building2, DollarSign, LogIn, MoreVertical, Nfc, Trash2 } from "lucide-react";
import type { LeadTagSummary } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { visitsUiMessages } from "@/i18n/messages/visitsUi";
import { Button } from "@/components/ui/button";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { Pill } from "@/components/xpot/StatusPill";
import { displayPhone, formatShortDate } from "../../utils";
import { followUpDueTime } from "../../visitRules";
import type { FullSalesLead } from "../../types";
import { fileSrc } from "@/lib/files";
import { LeadStatePill } from "./LeadStatePill";

type SortKey = "name" | "city" | "shelf" | "lastVisit";

/**
 * A follow-up as a pill, on every company the "Follow-up" filter lists: red once its date is past, amber for today or
 * later, plain grey ("Follow-up") when the visit asked to come back but no date was set.
 */
export function FollowUpDuePill({ lead, followUp = true }: { lead: FullSalesLead; followUp?: boolean }) {
  const t = useT(visitsUiMessages);
  const due = followUpDueTime(lead);
  if (!Number.isFinite(due)) return followUp ? <Pill tone="slate">{t("followUpPlain")}</Pill> : null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return <Pill tone={due < startOfToday.getTime() ? "red" : "amber"}>{t("followUpDue", { date: formatShortDate(new Date(due)) })}</Pill>;
}

/**
 * The core facts of a company row, the same on the phone card and the
 * desktop table: its state, the follow-up due and the last visit.
 */
export function LeadRowFacts({ lead, lastVisit, showLastVisit = true, worked, followUp = false }: { lead: FullSalesLead; lastVisit: Date | null; showLastVisit?: boolean; worked?: boolean; followUp?: boolean }) {
  const t = useT(visitsUiMessages);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <LeadStatePill status={lead.status} worked={worked} />
      <FollowUpDuePill lead={lead} followUp={followUp} />
      {showLastVisit && lastVisit ? <span className="text-[11px] text-white/40">{t("lastVisit", { date: formatShortDate(lastVisit) })}</span> : null}
    </span>
  );
}

export type LeadRowActions = {
  onSell: (lead: FullSalesLead) => void;
  onCheckIn: (lead: FullSalesLead) => void;
  /** The company of the visit in progress, if any: that row says "Back to visit" and no other row offers a check-in. */
  activeVisitLeadId?: number | null;
  onBackToVisit?: () => void;
  onDelete: (lead: FullSalesLead) => void;
  /** Whether the viewer may delete this company (leadAccess owner); Delete is left out when not. */
  canDelete?: (lead: FullSalesLead) => boolean;
};

export function RowAction({ title, onClick, children, className = "" }: { title: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`h-9 w-9 text-white/45 ${className}`}
    >
      {children}
    </Button>
  );
}

/** The row's less used actions behind one menu, so a delete or a take-back is never next to the main action. */
export function RowMenu({ label, items }: { label: string; items: Array<{ key: string; label: string; icon: typeof Trash2; run: () => void; danger?: boolean }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <RowAction title={label} onClick={() => setOpen((value) => !value)} className="hover:text-white/80">
        <MoreVertical aria-hidden="true" />
      </RowAction>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-white/10 bg-[#0d1322] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
          {items.map(({ key, label: itemLabel, icon: Icon, run, danger }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={(event) => { event.stopPropagation(); setOpen(false); run(); }}
              className={`flex min-h-10 w-full items-center gap-2.5 px-3 text-left text-sm ${danger ? "text-red-300 hover:bg-red-500/10" : "text-white/80 hover:bg-white/[0.06]"}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />{itemLabel}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The company's door into a visit. A visit can't start while another is open (the server answers 409), so the company
 * of the open visit says "Back to visit" and the others offer nothing.
 */
export function CheckInAction({
  lead, activeVisitLeadId, onCheckIn, onBackToVisit, variant = "brand",
}: { lead: FullSalesLead; activeVisitLeadId: number | null; onCheckIn: (lead: FullSalesLead) => void; onBackToVisit?: () => void; variant?: "brand" | "secondary" }) {
  const t = useT(leadsMessages);
  if (activeVisitLeadId === lead.id && onBackToVisit) {
    return (
      <Button type="button" variant={variant} size="sm" onClick={(e) => { e.stopPropagation(); onBackToVisit(); }} data-testid={`lead-${lead.id}-back-to-visit`}>
        <LogIn aria-hidden="true" /> {t("backToVisit")}
      </Button>
    );
  }
  if (activeVisitLeadId !== null) return null;
  return (
    <Button type="button" variant={variant} size="sm" onClick={(e) => { e.stopPropagation(); onCheckIn(lead); }} data-testid={`lead-${lead.id}-check-in`}>
      <LogIn aria-hidden="true" /> {t("checkIn")}
    </Button>
  );
}

/** Desktop list of visited leads, sortable, one row per company (the kit's CompactDataTable). */
export function LeadsTable({
  leads,
  selectedId,
  onSelect,
  piecesFor,
  lastVisitFor,
  worked = true,
  isFollowUp,
  onSell,
  onCheckIn,
  activeVisitLeadId = null,
  onBackToVisit,
  onDelete,
  canDelete,
}: {
  leads: FullSalesLead[];
  selectedId: number | null;
  onSelect: (lead: FullSalesLead) => void;
  piecesFor: (leadId: number) => LeadTagSummary | undefined;
  lastVisitFor: (leadId: number) => Date | null;
  /** The list is the worked companies (not the "To visit" ones), so a visited prospect reads "In talks". */
  worked?: boolean;
  isFollowUp?: (lead: FullSalesLead) => boolean;
} & LeadRowActions) {
  const t = useT(leadsMessages);
  const tu = useT(visitsUiMessages);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const rows = useMemo(() => {
    const value = (l: FullSalesLead): string | number => {
      switch (sort.key) {
        case "name": return l.name.toLowerCase();
        case "city": return (l.locations?.[0]?.city ?? "").toLowerCase();
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

  const sortable = (key: SortKey, label: string): Pick<CompactDataColumn<FullSalesLead>, "label" | "ariaSort"> => {
    const active = sort.key === key;
    return {
      ariaSort: active ? (sort.dir === 1 ? "ascending" : "descending") : undefined,
      label: (
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" || key === "city" ? 1 : -1 }))}
          className={`inline-flex min-h-8 items-center gap-1 uppercase transition-colors ${active ? "text-white/70" : "hover:text-white/60"}`}
        >
          {label}
          {active && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
        </button>
      ),
    };
  };

  const columns: CompactDataColumn<FullSalesLead>[] = [
    {
      key: "name",
      ...sortable("name", t("colName")),
      width: "40%",
      cellClassName: "max-w-0",
      render: (lead) => {
        const photo = lead.photos?.[0];
        const pieces = piecesFor(lead.id);
        return (
          <div className="flex items-center gap-3">
            {photo ? (
              <img src={fileSrc(photo)} alt="" loading="lazy" decoding="async" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                <Building2 className="h-4 w-4 text-white/40" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-white">{lead.name}</span>
                {lead.ghlContactId && <Pill tone="slate" className="shrink-0">GHL</Pill>}
              </div>
              <div className="flex items-center gap-2 truncate text-[11px] text-white/40">
                {lead.industry && <span className="truncate">{lead.industry}</span>}
                {pieces && pieces.pieces > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-violet-300/80">
                    <Nfc className="h-3 w-3" aria-hidden="true" /> {t.plural("piecesCount", pieces.pieces)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "state",
      label: tu("colState"),
      cellClassName: "whitespace-nowrap",
      render: (lead) => <LeadRowFacts lead={lead} lastVisit={null} showLastVisit={false} worked={worked} followUp={isFollowUp?.(lead) ?? false} />,
    },
    {
      key: "city",
      ...sortable("city", t("fieldCity")),
      headerClassName: "hidden xl:table-cell",
      cellClassName: "hidden whitespace-nowrap text-white/55 xl:table-cell",
      render: (lead) => [lead.locations?.[0]?.city, lead.locations?.[0]?.state].filter(Boolean).join(", ") || "—",
    },
    {
      key: "phone",
      label: t("colPhone"),
      headerClassName: "hidden 2xl:table-cell",
      cellClassName: "hidden whitespace-nowrap text-white/55 2xl:table-cell",
      render: (lead) => displayPhone(lead.phone) || "—",
    },
    {
      key: "shelf",
      ...sortable("shelf", t("colShelf")),
      align: "right",
      headerClassName: "hidden 2xl:table-cell",
      cellClassName: "hidden whitespace-nowrap text-white/70 2xl:table-cell",
      render: (lead) => lead.unitsOnShelf || <span className="text-white/20">—</span>,
    },
    {
      key: "lastVisit",
      ...sortable("lastVisit", t("colLastVisit")),
      cellClassName: "whitespace-nowrap text-white/55",
      render: (lead) => {
        const last = lastVisitFor(lead.id);
        return last ? formatShortDate(last) : <span className="text-white/20">—</span>;
      },
    },
    {
      key: "actions",
      label: <span className="sr-only">{t("colActions")}</span>,
      cellClassName: "w-px whitespace-nowrap !px-2 !py-1.5",
      render: (lead) => (
        <div className="grid grid-cols-[2.25rem_auto_2.25rem] items-center gap-1">
          <RowAction title={t("salesAndConsignment")} onClick={() => onSell(lead)} className="hover:text-emerald-300">
            <DollarSign aria-hidden="true" />
          </RowAction>
          <div className="[&>button]:w-full">
            <CheckInAction lead={lead} activeVisitLeadId={activeVisitLeadId} onCheckIn={onCheckIn} onBackToVisit={onBackToVisit} variant="secondary" />
          </div>
          <div className="h-9 w-9">
            {!canDelete || canDelete(lead) ? (
              <RowMenu label={t("moreActions")} items={[{ key: "delete", label: t("deleteCompany"), icon: Trash2, run: () => onDelete(lead), danger: true }]} />
            ) : null}
          </div>
        </div>
      ),
    },
  ];

  return (
    <CompactDataTable
      testId="leads-table"
      columns={columns}
      rows={rows}
      getRowKey={(lead) => lead.id}
      selectedKey={selectedId}
      onRowClick={onSelect}
      getRowTestId={(lead) => `lead-row-${lead.id}`}
    />
  );
}
