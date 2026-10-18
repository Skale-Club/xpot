import type { ReactNode } from "react";
import { ActivitySection } from "./ActivitySection";
import { ChipSection } from "./ChipSection";
import { CustomerDestinationSection } from "./CustomerDestinationSection";
import { ManagementSection } from "./ManagementSection";
import { PerformanceSection } from "./PerformanceSection";
import { usePiece } from "./PieceContext";
import { SaleSection } from "./SaleSection";
import { pieceSections } from "./pieceView";

// The sections of the one piece screen, in the viewer's set (pieceSections).
// `stack`: one column, the reseller screen (phone first, and the desktop pane).
// `columns`: the admin page on a computer, the working sections on the left,
// Management on the right, Performance and Activity across the bottom.

export function PieceBody({ layout, desktopWriter }: { layout: "stack" | "columns"; desktopWriter?: ReactNode }) {
  const { viewer } = usePiece();
  const sections = new Set(pieceSections(viewer));
  const customer = sections.has("customer") ? <CustomerDestinationSection /> : null;
  const chip = sections.has("chip") ? <ChipSection desktopWriter={desktopWriter} /> : null;
  const sale = sections.has("sale") ? <SaleSection /> : null;
  const performance = sections.has("performance") ? <PerformanceSection /> : null;
  const management = sections.has("management") ? <ManagementSection /> : null;
  const activity = sections.has("activity") ? <ActivitySection /> : null;

  if (layout === "stack") {
    return (
      <div className="min-w-0 space-y-3" data-testid="piece-body">
        {customer}
        {chip}
        {sale}
        {performance}
        {management}
        {activity}
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-4" data-testid="piece-body">
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-4">
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
