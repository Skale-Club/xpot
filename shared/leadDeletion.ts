// Deleting a company (DELETE /api/xpot/leads/:id). Visits, follow-up tasks, deals and contacts go with it. A sale or a
// consignment is a financial record the database refuses to orphan, and a piece would be left with no customer, so a
// company holding any of those is kept. The server decides with this rule (checked before anything is deleted) and the app
// hides Delete with it, so what the screen offers is what the server accepts. Pure, no I/O.

/** What hangs off one company, counted the way deleteLeadRows removes it. */
export interface LeadDeletionCounts {
  sales: number;
  consignments: number;
  /** Pieces (tags) set up for it as their customer. */
  pieces: number;
  orders?: number;
  visits: number;
  /** Follow-ups on the company, its visits or its deals. */
  tasks: number;
  deals: number;
}

export const LEAD_DELETE_BLOCKERS = ["sales", "consignments", "pieces", "orders"] as const;
export type LeadDeleteBlocker = (typeof LEAD_DELETE_BLOCKERS)[number];

export const LEAD_DELETE_ALONGSIDE = ["visits", "tasks", "deals"] as const;
export type LeadDeleteAlongside = (typeof LEAD_DELETE_ALONGSIDE)[number];

export const EMPTY_LEAD_DELETION: LeadDeletionCounts = { sales: 0, consignments: 0, pieces: 0, visits: 0, tasks: 0, deals: 0 };

export interface LeadDeletionVerdict {
  /** Why it is kept: the records that block it, with how many. Empty when it can be deleted. */
  blockers: Array<{ kind: LeadDeleteBlocker; count: number }>;
  /** What goes with it when it is deleted: the records removed along with the company. */
  alongside: Array<{ kind: LeadDeleteAlongside; count: number }>;
  canDelete: boolean;
}

export function leadDeletionVerdict(counts: LeadDeletionCounts): LeadDeletionVerdict {
  const blockers = LEAD_DELETE_BLOCKERS.map((kind) => ({ kind, count: counts[kind] ?? 0 })).filter((b) => b.count > 0);
  const alongside = LEAD_DELETE_ALONGSIDE.map((kind) => ({ kind, count: counts[kind] })).filter((a) => a.count > 0);
  return { blockers, alongside, canDelete: blockers.length === 0 };
}

const NOUNS: Record<LeadDeleteBlocker | LeadDeleteAlongside, [string, string]> = {
  sales: ["sale", "sales"],
  consignments: ["consignment", "consignments"],
  pieces: ["piece", "pieces"],
  orders: ["customer order", "customer orders"],
  visits: ["visit", "visits"],
  tasks: ["task", "tasks"],
  deals: ["deal", "deals"],
};

/** "2 sales and 1 piece": the English sentence the API sends (the app words it in the user's language). */
export function leadDeletionList(parts: Array<{ kind: LeadDeleteBlocker | LeadDeleteAlongside; count: number }>): string {
  const items = parts.map(({ kind, count }) => `${count} ${NOUNS[kind][count === 1 ? 0 : 1]}`);
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function leadDeletionBlockedMessage(counts: LeadDeletionCounts): string {
  return `This company can't be deleted because it has ${leadDeletionList(leadDeletionVerdict(counts).blockers)}.`;
}
