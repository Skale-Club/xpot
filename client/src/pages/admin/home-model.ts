// Panel home ("Today"): the rows of what needs the owner, each a count, a one-line description and the list behind
// it. Rows at zero are left out, so an empty list means "Nothing waiting". Pure, unit-tested (tests/admin-home.test.ts).

import type { PrintRequestItem } from "@shared/printProduction";
import type { TagQueueCounts } from "@shared/tagQueues";
import type { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import type { workspacesMessages } from "@/i18n/messages/workspaces";
import { needsActionQueues } from "./tags/overview-model";

type FlowKey = keyof (typeof adminTagsFlowMessages)["en"];
type HomeKey = keyof (typeof workspacesMessages)["en"];

export type TodayRowId = "platesToPrint" | "filesBuilding" | "stuscleOrders" | keyof TagQueueCounts;

export interface TodayRow {
  id: TodayRowId;
  count: number;
  /** Absolute path of the list the count opens. */
  href: string;
  /** The row's words live in the Panel (workspaces) or the Tags flow dictionary. */
  label: { dict: "home"; key: HomeKey } | { dict: "flow"; key: FlowKey };
  hint: { dict: "home"; key: HomeKey } | { dict: "flow"; key: FlowKey };
}

/** The Tags tab paths in the queue cards are relative to /admin/tags. */
const TAGS = "/admin/tags";

/** Plates (printer beds) by where they are: ready to print now or being printed, and files still being generated. */
export function plateCounts(requests: PrintRequestItem[] | undefined) {
  const plates = (requests ?? []).flatMap((r) => r.plates);
  return {
    toPrint: plates.filter((p) => p.status === "ready" || p.status === "printing").length,
    building: plates.filter((p) => p.status === "requested" || p.status === "building").length,
  };
}

export interface TodayInput {
  isSuperAdmin: boolean;
  /** Open print requests (super admin only); undefined while loading or when not allowed. */
  requests?: PrintRequestItem[];
  /** The Tags overview queues; undefined while loading or when the viewer has no Tags access. */
  queues?: TagQueueCounts;
  /** Wholesale orders still pending (super admin only). */
  pendingOrders?: number;
}

/** What needs the owner, in the order they are worked: print, fill orders, then the Tags queues. Zero rows are dropped. */
export function todayRows({ isSuperAdmin, requests, queues, pendingOrders }: TodayInput): TodayRow[] {
  const plates = plateCounts(requests);
  const rows: TodayRow[] = [];
  if (isSuperAdmin) {
    rows.push(
      { id: "platesToPrint", count: plates.toPrint, href: `${TAGS}/production/queue`, label: { dict: "home", key: "todayPlatesToPrint" }, hint: { dict: "home", key: "todayPlatesToPrintHint" } },
      { id: "filesBuilding", count: plates.building, href: `${TAGS}/production/queue`, label: { dict: "home", key: "todayFilesBuilding" }, hint: { dict: "home", key: "todayFilesBuildingHint" } },
      // The wholesale orders come from their own list, so the overview's identical queue is not counted twice.
      { id: "stuscleOrders", count: pendingOrders ?? 0, href: `${TAGS}/kits?view=orders`, label: { dict: "flow", key: "queueStuscleOrders" }, hint: { dict: "flow", key: "queueStuscleOrdersHint" } },
    );
  }
  if (queues) {
    for (const card of needsActionQueues(queues, isSuperAdmin)) {
      if (isSuperAdmin && card.id === "stuscleOrders") continue;
      rows.push({ id: card.id, count: card.count, href: `${TAGS}${card.href}`, label: { dict: "flow", key: card.labelKey }, hint: { dict: "flow", key: card.hintKey } });
    }
  }
  return rows.filter((row) => row.count > 0);
}
