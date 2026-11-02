// Panel home ("Today"): the rows of what needs the person, each a count, a one-line description and the list behind
// it, by profile (shared/profiles.ts). Rows at zero are left out, so an empty list means "Nothing waiting". Pure,
// unit-tested (tests/admin-home.test.ts).
//   platform  block Platform: people waiting for approval, Stuscle orders to separate;
//             block My company: plates to print, files stuck, failed prints, then the Tags queues of the company.
//   partner   the same as My company, for their organization.
//   owner     team purchases still to arrive, then chips to write, scanned but not live, no product.

import type { PrintRequestItem } from "@shared/printProduction";
import { can, type Profile } from "@shared/profiles";
import type { TagQueueCounts } from "@shared/tagQueues";
import type { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import type { workspacesMessages } from "@/i18n/messages/workspaces";
import { needsActionQueues } from "./tags/overview-model";

type FlowKey = keyof (typeof adminTagsFlowMessages)["en"];
type HomeKey = keyof (typeof workspacesMessages)["en"];

export type TodayRowId = "peopleWaiting" | "platesToPrint" | "filesStuck" | "printsFailed" | "stuscleOrders" | "teamPurchases" | keyof TagQueueCounts;

export interface TodayRow {
  id: TodayRowId;
  count: number;
  /** Absolute path of the list the count opens. */
  href: string;
  /** The row's words live in the Panel (workspaces) or the Tags flow dictionary. */
  label: { dict: "home"; key: HomeKey } | { dict: "flow"; key: FlowKey };
  hint: { dict: "home"; key: HomeKey } | { dict: "flow"; key: FlowKey };
  /** Something broke: it goes first in its block, in red. The routine rows are what is simply next in line. */
  urgent?: boolean;
}

/** The platform's home has two blocks, with headings; everyone else's is a single list. */
export type TodayBlockId = "platform" | "company" | "organization";
export interface TodayBlock {
  id: TodayBlockId;
  rows: TodayRow[];
}

/** The Tags tab paths in the queue cards are relative to /admin/tags. */
const TAGS = "/admin/tags";

/** A plate still being generated after this long is stuck, not just "being generated" (the slicer takes minutes). */
export const FILES_STUCK_AFTER_HOURS = 2;

/** The newest attempt of each plate: a plate printed again keeps its failed attempt in the request, which no longer counts. */
function latestAttempts(requests: PrintRequestItem[] | undefined): PrintRequestItem["plates"] {
  return (requests ?? []).flatMap((request) => {
    const latest = new Map<number, PrintRequestItem["plates"][number]>();
    for (const plate of request.plates) {
      const seen = latest.get(plate.plateNumber);
      if (!seen || plate.createdAt >= seen.createdAt) latest.set(plate.plateNumber, plate);
    }
    return Array.from(latest.values());
  });
}

/**
 * Plates (printer beds) by where they are: ready to print now or being printed; files still being generated after
 * more than FILES_STUCK_AFTER_HOURS hours (`stuck`); and failed ones nobody has printed again.
 */
export function plateCounts(requests: PrintRequestItem[] | undefined, now = Date.now()) {
  const plates = latestAttempts(requests);
  const limit = FILES_STUCK_AFTER_HOURS * 3_600_000;
  const stale = (plate: PrintRequestItem["plates"][number]) => now - Date.parse(plate.updatedAt || plate.createdAt) > limit;
  return {
    toPrint: plates.filter((p) => p.status === "ready" || p.status === "printing").length,
    stuck: plates.filter((p) => (p.status === "requested" || p.status === "building") && stale(p)).length,
    failed: plates.filter((p) => p.status === "failed").length,
  };
}

export interface TodayInput {
  profile: Profile;
  /** All the print requests (platform and partner only); undefined while loading or when not allowed. */
  requests?: PrintRequestItem[];
  /** The Tags overview queues: the company's for the platform, the organization's for anyone else; undefined while loading or without Tags access. */
  queues?: TagQueueCounts;
  /** Platform: wholesale orders still pending, to separate. */
  pendingOrders?: number;
  /** Platform: people who signed up and wait to be approved. */
  pendingPeople?: number;
  /** Owner: purchases of the team still pending. */
  teamPurchases?: number;
  /** Where the team's purchases are listed (the organization's workspace). */
  teamPurchasesHref?: string;
  /** For the clock in tests. */
  now?: number;
}

/** A failed load worth reporting: a viewer without Tags access gets a 403, which is just no rows. */
export function todayFailure(error: unknown): unknown {
  return (error as { status?: number } | null)?.status === 403 ? null : error;
}

const home = (key: HomeKey) => ({ dict: "home", key }) as const;

/** The production rows (plates, files, failures, batches) and the Tags queues of one organization's pieces. */
function productionRows({ profile, requests, queues, now }: TodayInput): TodayRow[] {
  const plates = plateCounts(requests, now);
  const rows: TodayRow[] = [
    { id: "platesToPrint", count: plates.toPrint, href: `${TAGS}/production/queue`, label: home("todayPlatesToPrint"), hint: home("todayPlatesToPrintHint") },
    { id: "filesStuck", count: plates.stuck, href: `${TAGS}/production/queue`, label: home("todayFilesStuck"), hint: home("todayFilesStuckHint"), urgent: true },
    { id: "printsFailed", count: plates.failed, href: `${TAGS}/production/queue`, label: home("todayPrintsFailed"), hint: home("todayPrintsFailedHint"), urgent: true },
  ];
  rows.push(...queueRows(profile, queues, ["stuscleOrders"]));
  return rows;
}

/** The overview's queue cards the profile can open (batches are production's), except the ones listed in `skip`. */
function queueRows(profile: Profile, queues: TagQueueCounts | undefined, skip: ReadonlyArray<keyof TagQueueCounts>): TodayRow[] {
  if (!queues) return [];
  return needsActionQueues(queues, can(profile, "produce"))
    .filter((card) => !skip.includes(card.id))
    .map((card) => ({ id: card.id, count: card.count, href: `${TAGS}${card.href}`, label: { dict: "flow", key: card.labelKey }, hint: { dict: "flow", key: card.hintKey } }));
}

/** What needs this person, in the order it is worked, by block. Zero rows are dropped, and so are blocks left empty. */
export function todayBlocks(input: TodayInput): TodayBlock[] {
  const { profile } = input;
  const blocks: TodayBlock[] = [];
  if (profile === "platform") {
    blocks.push({ id: "platform", rows: [
      { id: "peopleWaiting", count: input.pendingPeople ?? 0, href: "/admin/reps?status=pending", label: home("todayPeopleWaiting"), hint: home("todayPeopleWaitingHint") },
      // The wholesale orders come from their own list, so the overview's identical queue is not counted twice.
      { id: "stuscleOrders", count: input.pendingOrders ?? 0, href: `${TAGS}/kits?view=orders`, label: { dict: "flow", key: "queueStuscleOrders" }, hint: { dict: "flow", key: "queueStuscleOrdersHint" } },
    ] });
    blocks.push({ id: "company", rows: productionRows(input) });
  } else if (profile === "partner") {
    blocks.push({ id: "organization", rows: productionRows(input) });
  } else if (profile === "owner") {
    blocks.push({ id: "organization", rows: [
      { id: "teamPurchases", count: input.teamPurchases ?? 0, href: input.teamPurchasesHref ?? "/organizations", label: home("todayTeamPurchases"), hint: home("todayTeamPurchasesHint") },
      ...queueRows(profile, input.queues, ["stuscleOrders"]),
    ] });
  }
  // What is broken first (a stable sort: the rest keeps the order it is worked in).
  const urgentFirst = (rows: TodayRow[]) => [...rows.filter((row) => row.urgent), ...rows.filter((row) => !row.urgent)];
  return blocks.map((block) => ({ ...block, rows: urgentFirst(block.rows.filter((row) => row.count > 0)) })).filter((block) => block.rows.length > 0);
}

/** Every row of every block, in order. */
export function todayRows(input: TodayInput): TodayRow[] {
  return todayBlocks(input).flatMap((block) => block.rows);
}
