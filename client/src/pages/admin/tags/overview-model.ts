// Overview: the "Needs action" queues and the activity feed. Each number links to the list that reproduces it: piece
// queues open /overview/<queue> (GET /api/xpot/tags?queue=). Pure, unit-tested (tests/admin-tags-overview.test.ts).

import type { TagPieceQueue, TagQueueCounts } from "@shared/tagQueues";
import type { TagOverview } from "@shared/tagsApi";
import type { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";

type FlowKey = keyof (typeof adminTagsFlowMessages)["en"];

export type QueueId = keyof TagQueueCounts;

export interface QueueCard {
  id: QueueId;
  count: number;
  href: string;
  labelKey: FlowKey;
  hintKey: FlowKey;
}

const QUEUES: ReadonlyArray<Omit<QueueCard, "count"> & { adminOnly?: boolean }> = [
  { id: "stuscleOrders", href: "/kits?view=orders", labelKey: "queueStuscleOrders", hintKey: "queueStuscleOrdersHint" },
  // Batches are the global admin's; a manager does not get the card (the list would be a 403).
  { id: "batchesNotReceived", href: "/batches?pending=1", labelKey: "queueBatchesNotReceived", hintKey: "queueBatchesNotReceivedHint", adminOnly: true },
  { id: "chipPending", href: "/overview/chipPending", labelKey: "queueChipPending", hintKey: "queueChipPendingHint" },
  { id: "scannedNotLive", href: "/overview/scannedNotLive", labelKey: "queueScannedNotLive", hintKey: "queueScannedNotLiveHint" },
  { id: "noProduct", href: "/overview/noProduct", labelKey: "queueNoProduct", hintKey: "queueNoProductHint" },
];

/** The queue cards this viewer gets, in a fixed order (an empty queue still shows, as "nothing to do"). */
export function needsActionQueues(counts: TagQueueCounts, isAdmin: boolean): QueueCard[] {
  return QUEUES.filter((q) => isAdmin || !q.adminOnly).map(({ adminOnly: _adminOnly, ...q }) => ({ ...q, count: counts[q.id] }));
}

/** The labels of a piece queue's own list page. */
export function pieceQueueCard(queue: TagPieceQueue): Omit<QueueCard, "count"> {
  const { adminOnly: _adminOnly, ...card } = QUEUES.find((q) => q.id === queue)!;
  return card;
}

// ─── Activity feed ────────────────────────────────────────────────────────────

export const ACTIVITY_FILTERS = ["all", "scans", "activated", "destination"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export type ActivityItem =
  | { kind: "scans"; key: string; at: string; event: TagOverview["recentEvents"][number] }
  | { kind: "activated"; key: string; at: string; activation: TagOverview["recentActivations"][number] }
  | { kind: "destination"; key: string; at: string; change: TagOverview["recentChanges"][number] };

/** Rows the feed shows at most. */
export const ACTIVITY_LIMIT = 12;

/** One feed of the latest scans, activations and destination changes, newest first (at most ACTIVITY_LIMIT). */
export function activityFeed(overview: Pick<TagOverview, "recentEvents" | "recentActivations" | "recentChanges">, filter: ActivityFilter = "all"): ActivityItem[] {
  const items: ActivityItem[] = [
    ...overview.recentEvents.map((event) => ({ kind: "scans" as const, key: `e${event.id}`, at: event.occurredAt, event })),
    ...overview.recentActivations.map((activation) => ({ kind: "activated" as const, key: `a${activation.id}`, at: activation.activatedAt, activation })),
    ...overview.recentChanges.map((change) => ({ kind: "destination" as const, key: `c${change.id}`, at: change.createdAt, change })),
  ];
  return items
    .filter((item) => filter === "all" || item.kind === filter)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, ACTIVITY_LIMIT);
}
