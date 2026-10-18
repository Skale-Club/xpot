import { useMemo } from "react";
import { Ban, ChevronRight, DollarSign, History, Link2, Package, ScrollText } from "lucide-react";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { formatDateTime } from "@/lib/dates";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { formatCents } from "@/pages/xpot/utils";
import { useTagLabels } from "@/pages/admin/tags/labels";
import { useJourney } from "@/pages/admin/tags/journey-shared";
import { JourneyPanel } from "@/pages/admin/tags/JourneyPanel";
import { errorText } from "@/pages/tags/lib";
import { usePiece, usePieceActivity } from "./PieceContext";
import { mergePieceTimeline, type PieceTimelineEvent } from "./pieceView";

// Activity: one timeline, newest first, of everything that happened to the piece
// that the viewer may read: destination changes, sales and their cancels, stock
// movements (management) and the production log (the global admin). The admin
// still records journey entries and plans in the production log, folded below.

const ICON: Record<PieceTimelineEvent["kind"], typeof History> = {
  destination: Link2,
  sale: DollarSign,
  sale_cancelled: Ban,
  stock: Package,
  journey: ScrollText,
};

export function ActivitySection() {
  const { tag, viewer } = usePiece();
  const tc = useT(commonMessages);
  const tp = useT(pieceScreenMessages);
  const activity = usePieceActivity(tag.id, tag.updatedAt);
  const journey = useJourney({ tagId: tag.id }, viewer.isAdmin);
  const events = useMemo(
    () => mergePieceTimeline({
      history: tag.history,
      sales: activity.data?.sales ?? null,
      movements: activity.data?.movements ?? null,
      journey: viewer.isAdmin ? journey.data?.entries ?? null : null,
    }),
    [tag.history, activity.data, journey.data, viewer.isAdmin],
  );
  const loading = activity.isLoading || (viewer.isAdmin && journey.isLoading);

  return (
    <SectionCard accent="tags" icon={History} title={tp("activityTitle")} bodyClassName="px-4 py-2" testId="piece-activity">
      {activity.error ? (
        <ErrorState compact message={errorText(activity.error, tc("requestFailed"))} onRetry={() => void activity.refetch()} />
      ) : loading ? (
        <ListSkeleton rows={3} className="space-y-2 py-2" />
      ) : events.length === 0 ? (
        <EmptyState compact dense tone="tags" icon={History} title={tp("activityEmpty")} cardStyle={{}} />
      ) : (
        <ol className="divide-y divide-white/5" data-testid="piece-timeline">
          {events.map((event) => <TimelineRow key={event.id} event={event} />)}
        </ol>
      )}
      {viewer.isAdmin ? (
        <details className="group border-t border-white/10 py-3">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            {tp("productionLog")}
          </summary>
          <div className="mt-3">
            <JourneyPanel scope={{ tagId: tag.id }} />
          </div>
        </details>
      ) : null}
    </SectionCard>
  );
}

function TimelineRow({ event }: { event: PieceTimelineEvent }) {
  const tp = useT(pieceScreenMessages);
  const tm = useT(manageTagsPiecesMessages);
  const tg = useT(manageTagsMessages);
  const labels = useTagLabels();
  const Icon = ICON[event.kind];
  let title = "";
  let detail: string | null = null;
  let who: string | null = null;
  switch (event.kind) {
    case "destination": {
      const { entry } = event;
      title = !entry.newUrl ? tp("evDestinationCleared") : entry.previousUrl ? tp("evDestinationChanged") : tp("evDestinationSet");
      const after = entry.newUrl ? `${labels.destination(entry.newDestinationType)}: ${entry.newUrl}` : tm("historyCleared");
      detail = entry.previousUrl ? `${labels.destination(entry.previousDestinationType)}: ${entry.previousUrl} → ${after}` : after;
      who = entry.changedByEmail;
      if (entry.reason) detail += ` · “${entry.reason}”`;
      break;
    }
    case "sale":
      title = event.sale.priceCents != null ? tp("evSale", { amount: formatCents(event.sale.priceCents, event.sale.currency) }) : tg("stock_sold");
      who = event.sale.sellerName;
      detail = `#${event.sale.saleId}`;
      break;
    case "sale_cancelled":
      title = tp("evSaleCancelled", { id: event.sale.saleId });
      detail = event.sale.cancelReason ? `“${event.sale.cancelReason}”` : null;
      break;
    case "stock": {
      const m = event.movement;
      const key = `movement_${m.movementType}`;
      const named = m.movementType === "transfer"
        ? m.toCustodianName ? tp("movement_transfer", { name: m.toCustodianName }) : tp("movement_transfer_house")
        : tp(key as never);
      title = named === key ? tp("movementGeneric", { from: labels.stock(m.fromStockStatus ?? "—"), to: labels.stock(m.toStockStatus) }) : named;
      who = m.actorEmail;
      detail = m.reason;
      break;
    }
    case "journey":
      title = event.entry.title;
      who = event.entry.actorName ?? event.entry.actorEmail;
      detail = event.entry.content;
      break;
  }
  const tone = event.kind === "sale" ? "text-emerald-300" : event.kind === "sale_cancelled" ? "text-red-300" : "text-violet-300";
  return (
    <li className="flex gap-3 py-2.5" data-testid={`piece-event-${event.kind}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-white/90">{title}</p>
        {detail ? <p className="break-all text-xs text-white/50">{detail}</p> : null}
        <p className="text-xs text-white/35">
          {formatDateTime(event.at)}
          {who ? ` · ${tp("evBy", { name: who })}` : ""}
        </p>
      </div>
    </li>
  );
}
