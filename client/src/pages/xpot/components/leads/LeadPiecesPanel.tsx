import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight, ExternalLink, ScanLine } from "lucide-react";
import type { LeadTagSummary, TagListItem } from "@shared/tagsApi";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { tagsMessages } from "@/i18n/messages/tags";
import { leadPiecesPath, tagsGet } from "@/pages/tags/lib";
import { useViewerAccess } from "@/lib/adminMode";

function compactUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-400/[0.09] text-emerald-300",
  assigned: "bg-blue-400/[0.09] text-blue-300",
  inventory: "bg-violet-400/[0.09] text-violet-300",
  disabled: "bg-white/[0.06] text-white/45",
  retired: "bg-white/[0.06] text-white/35",
  damaged: "bg-red-400/[0.09] text-red-300",
};

export function LeadPiecesPanel({ leadId, leadName, summary }: {
  leadId: number;
  leadName: string;
  summary: LeadTagSummary;
}) {
  const tl = useT(leadsMessages);
  const tt = useT(tagsMessages);
  const pieces = useQuery<TagListItem[]>({
    queryKey: ["tags", "lead-pieces", leadId],
    queryFn: () => tagsGet<TagListItem[]>(`/api/xpot/tags?leadId=${leadId}&limit=2000`),
    staleTime: 15_000,
  });
  const items = pieces.data ?? [];
  // Same scope as the counts above: everyone's pieces in management mode.
  const { canManage } = useViewerAccess();
  const allHref = leadPiecesPath(leadId, leadName, canManage);

  return (
    <div className="space-y-3" data-testid="lead-pieces-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-[11px] text-white/38">
        <span>{[tl.plural("piecesCount", summary.pieces), tl("piecesLive", { n: summary.live }), tl("piecesScans", { n: summary.scansLast30 })].join(" · ")}</span>
        <Link href={allHref} className="inline-flex items-center gap-1 font-semibold text-violet-300/75 transition-colors hover:text-violet-200">
          {tl("openPieces")}<ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {pieces.isLoading ? (
        <div className="space-y-1.5">
          {[0, 1].map((item) => <div key={item} className="h-[68px] animate-pulse rounded-xl bg-white/[0.035]" />)}
        </div>
      ) : pieces.isError ? (
        <Link href={allHref} className="flex min-h-12 items-center justify-between rounded-xl border border-violet-300/10 bg-violet-400/[0.06] px-3 text-xs font-semibold text-violet-200">
          {tl("openPieces")}<ChevronRight className="h-4 w-4" />
        </Link>
      ) : items.length === 0 ? (
        <Link href={allHref} className="flex min-h-12 items-center justify-between rounded-xl border border-violet-300/10 bg-violet-400/[0.06] px-3 text-xs font-semibold text-violet-200">
          {tl("openPieces")}<ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <div className="max-h-[430px] divide-y divide-white/[0.055] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/[0.1]">
          {items.map((piece) => {
            const scans = piece.qrInteractions + piece.nfcInteractions;
            return (
              <Link
                key={piece.id}
                href={`/tags/pieces/${encodeURIComponent(piece.publicCode)}`}
                className="group grid min-h-[70px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.035]"
                data-testid={`lead-piece-${piece.publicCode}`}
              >
                <span className="min-w-0">
                  <TagPieceMention publicCode={piece.publicCode} productType={piece.productType} face={piece.face} batchCode={piece.batchCode} className="max-w-full" />
                  {(piece.label || piece.destinationUrl) ? <span className="mt-1 block truncate pl-12 text-[11px] text-white/35">{[piece.label, piece.destinationUrl && compactUrl(piece.destinationUrl)].filter(Boolean).join(" · ")}</span> : null}
                </span>
                <span className="flex flex-col items-end gap-1.5">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${STATUS_STYLE[piece.status] ?? STATUS_STYLE.disabled}`}>{tt(`status_${piece.status}` as "status_active")}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-white/35"><ScanLine className="h-3 w-3" />{scans}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-300" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
