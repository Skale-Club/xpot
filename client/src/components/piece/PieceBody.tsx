import { useRef, useState, type ReactNode } from "react";
import { BarChart3, ChevronDown, Nfc, Power, Printer, Settings2 } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { ActivitySection } from "./ActivitySection";
import { ChipSection } from "./ChipSection";
import { CustodyCard } from "./CustodyCard";
import { CustomerDestinationSection } from "./CustomerDestinationSection";
import { ManagementSection } from "./ManagementSection";
import { PerformanceSection } from "./PerformanceSection";
import { PieceStatusChips } from "./PieceHeader";
import { usePiece, type PieceCommands } from "./PieceContext";
import { SaleSection } from "./SaleSection";
import { pieceSections, pieceSituation, type PieceMainAction } from "./pieceView";

// The sections of the one piece screen, in the viewer's set (pieceSections),
// under one main action button (pieceSituation): the next step for this piece.
// `stack`: one column, the reseller screen (phone first, and the desktop pane).
// The customer shows when there is one or the main action is to set it up; the
// rest waits in a closed "More details" (still mounted, so nothing re-queries).
// `columns`: the admin page on a computer, the working sections on the left,
// Management on the right, Performance and Activity across the bottom.

const ACTION_ICON = { openPrint: Printer, viewPerformance: BarChart3, reactivate: Power, goLive: Power, writeChip: Nfc, configure: Settings2 } as const;

function ActionIcon({ kind }: { kind: keyof typeof ACTION_ICON }) {
  const Icon = ACTION_ICON[kind];
  return <Icon className="!size-5" />;
}

export function PieceBody({ layout, desktopWriter }: { layout: "stack" | "columns"; desktopWriter?: ReactNode }) {
  const { tag, viewer } = usePiece();
  const tp = useT(pieceScreenMessages);
  const [, navigate] = useLocation();
  // Sections fill these on render; the main button calls them (PieceCommands).
  const commands = useRef<PieceCommands>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const performanceRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);

  const situation = pieceSituation(tag, viewer);
  const action: PieceMainAction | null = situation.action;
  const receiveIsMain = action?.kind === "receive";

  const sections = new Set(pieceSections(viewer));
  const customer = sections.has("customer") ? <CustomerDestinationSection commands={commands} /> : null;
  const chip = sections.has("chip") ? <div ref={chipRef}><ChipSection desktopWriter={desktopWriter} commands={commands} /></div> : null;
  const sale = sections.has("sale") ? <SaleSection /> : null;
  const performance = sections.has("performance") ? <div ref={performanceRef}><PerformanceSection /></div> : null;
  const management = sections.has("management") ? <ManagementSection /> : null;
  const activity = sections.has("activity") ? <ActivitySection /> : null;

  const reveal = (target: React.RefObject<HTMLDivElement | null>) => {
    setDetailsOpen(true);
    // After the details open, so the section has a place to scroll to.
    requestAnimationFrame(() => target.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const run = () => {
    if (!action) return;
    switch (action.kind) {
      case "openPrint": return action.href ? navigate(action.href) : undefined;
      case "configure": return commands.current.configure?.();
      case "goLive":
      case "reactivate": return commands.current.toggle?.();
      case "writeChip":
        if (layout === "stack") reveal(chipRef);
        return commands.current.writeChip?.();
      case "viewPerformance": return reveal(performanceRef);
      case "receive": return undefined; // the receive panel below is the button
    }
  };

  // The receive panel is its own main action (it asks where to receive into); the other kinds are one button.
  const main = receiveIsMain ? (
    <CustodyCard />
  ) : action ? (
    <Button type="button" variant="brand" accent="tags" size="lg" onClick={run} className="w-full" data-testid="button-main-action" data-action={action.kind}>
      <ActionIcon kind={action.kind as keyof typeof ACTION_ICON} />
      {tp(`action${action.kind[0].toUpperCase()}${action.kind.slice(1)}` as "actionGoLive")}
    </Button>
  ) : null;
  const hint = situation.hint ? <p className="text-sm text-white/55" data-testid="piece-hint">{tp(situation.hint === "waitingPrint" ? "hintWaitingPrint" : "hintAskManager")}</p> : null;

  if (layout === "stack") {
    const customerOutside = !!tag.leadId || action?.kind === "configure";
    return (
      <div className="min-w-0 space-y-3" data-testid="piece-body">
        {main}
        {hint}
        {customerOutside ? customer : null}
        <details
          open={detailsOpen}
          onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
          className="group min-w-0 rounded-xl border border-white/[0.08]"
          data-testid="piece-more-details"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-white/70 hover:text-white [&::-webkit-details-marker]:hidden">
            {tp("moreDetails")}
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="min-w-0 space-y-3 p-3 pt-0">
            <PieceStatusChips tag={tag} />
            {receiveIsMain ? null : <CustodyCard />}
            {customerOutside ? null : customer}
            {chip}
            {sale}
            {performance}
            {management}
            {activity}
          </div>
        </details>
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-4" data-testid="piece-body">
      {main}
      {hint}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-4">
          <PieceStatusChips tag={tag} />
          {receiveIsMain ? null : <CustodyCard />}
          {customer}
          {chip}
          {sale}
        </div>
        {management ? <div className="min-w-0 space-y-4">{management}</div> : null}
      </div>
      {performance}
      {activity}
    </div>
  );
}
