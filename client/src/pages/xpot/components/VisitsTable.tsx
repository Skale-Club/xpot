import { Building2, Mic, Sparkles } from "lucide-react";
import { useT } from "@/i18n";
import { visitsMessages } from "@/i18n/messages/visits";
import { leadsMessages } from "@/i18n/messages/leads";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { formatDuration, formatVisitWhen } from "../utils";
import { LocationExceptionBadge, StatusBadge } from "./VisitStatus";
import type { EnrichedSalesVisit } from "../types";
import { fileSrc } from "@/lib/files";

type VisitLead = EnrichedSalesVisit["lead"] & { photos?: string[] | null; locations?: { city?: string | null }[] };

/** Desktop list of visits, newest first, one row each (the kit's CompactDataTable). */
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

  const columns: CompactDataColumn<EnrichedSalesVisit>[] = [
    {
      key: "when",
      label: t("colWhen"),
      cellClassName: "whitespace-nowrap",
      render: (visit) => {
        const when = formatVisitWhen(visit);
        return when ? (
          <>
            <div className="font-medium text-white/85">{when.date}</div>
            <div className="text-[11px] text-white/40">{when.time}</div>
          </>
        ) : <span className="text-white/25">—</span>;
      },
    },
    {
      key: "company",
      label: t("colCompany"),
      width: "50%",
      cellClassName: "max-w-0",
      render: (visit) => {
        const lead = visit.lead as VisitLead | undefined;
        const photo = lead?.photos?.[0];
        const city = lead?.locations?.[0]?.city;
        return (
          <div className="flex items-center gap-3">
            {photo ? (
              <img src={fileSrc(photo)} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                <Building2 className="h-4 w-4 text-white/40" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate font-semibold text-white">{lead?.name || tl("leadNumber", { id: visit.leadId })}</div>
              {city && <div className="truncate text-[11px] text-white/40">{city}</div>}
            </div>
          </div>
        );
      },
    },
    {
      key: "outcome",
      label: t("colOutcome"),
      cellClassName: "whitespace-nowrap",
      render: (visit) => <div className="flex items-center gap-1.5"><StatusBadge status={visit.status} /><LocationExceptionBadge visit={visit} /></div>,
    },
    {
      key: "duration",
      label: t("colDuration"),
      align: "right",
      headerClassName: "hidden 2xl:table-cell",
      cellClassName: "hidden whitespace-nowrap text-white/55 2xl:table-cell",
      render: (visit) => (visit.durationSeconds ? formatDuration(visit.durationSeconds) : <span className="text-white/20">—</span>),
    },
    {
      key: "notes",
      label: <span className="sr-only">{t("colNotes")}</span>,
      cellClassName: "whitespace-nowrap",
      render: (visit) => <VisitNoteMarks visit={visit} />,
    },
  ];

  return (
    <CompactDataTable
      testId="visits-table"
      columns={columns}
      rows={visits}
      getRowKey={(visit) => visit.id}
      selectedKey={selectedId}
      onRowClick={onSelect}
      getRowTestId={(visit) => `visit-row-${visit.id}`}
    />
  );
}

/** The summary / voice-note marks of a visit, shown on the phone card and the desktop row alike. */
export function VisitNoteMarks({ visit }: { visit: { note?: { summary?: string | null; audioUrl?: string | null } | null } }) {
  const t = useT(visitsMessages);
  if (!visit.note?.summary && !visit.note?.audioUrl) return null;
  return (
    <div className="flex items-center justify-end gap-1.5 text-white/40">
      {visit.note?.summary && <Sparkles className="h-3.5 w-3.5 text-blue-300" aria-label={t("hasSummary")} />}
      {visit.note?.audioUrl && <Mic className="h-3.5 w-3.5" aria-label={t("hasAudio")} />}
    </div>
  );
}
