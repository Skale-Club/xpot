// Xpot Tags Journey: the story of the physical pieces. What was done to a
// batch, a kit or a tag (executions), what was decided and learned along the
// way (decisions, insights, observations, risks, results) and what is planned
// (plans). Ported from Skale Club's Smart Tags Journey.
//
// Entries are append-only: only their review status moves (a proposed entry
// is approved, a wrong one is superseded by a new one). The allowed values
// below mirror the CHECK constraints in migrations/0014_tag_journey.sql.
// Admin-only: resellers never read the journey, though what they do in the
// field app is recorded automatically (source "field").

export const JOURNEY_ENTRY_KINDS = ["execution", "decision", "insight", "observation", "risk", "result"] as const;
export type JourneyEntryKind = (typeof JOURNEY_ENTRY_KINDS)[number];

export const JOURNEY_ENTRY_KIND_LABELS: Record<JourneyEntryKind, string> = {
  execution: "Execution",
  decision: "Decision",
  insight: "Insight",
  observation: "Observation",
  risk: "Risk",
  result: "Result",
};

export const JOURNEY_ENTRY_STATUSES = ["active", "needs_review", "archived", "superseded"] as const;
export type JourneyEntryStatus = (typeof JOURNEY_ENTRY_STATUSES)[number];

/**
 * Where an entry came from: the system itself, an admin in the panel, a
 * reseller in the field app, or an MCP client (an AI session).
 */
export const JOURNEY_SOURCES = ["system", "admin", "field", "mcp"] as const;
export type JourneySource = (typeof JOURNEY_SOURCES)[number];

export const JOURNEY_ACTORS = ["human", "ai", "system"] as const;
export type JourneyActor = (typeof JOURNEY_ACTORS)[number];

export function actorForSource(source: JourneySource): JourneyActor {
  if (source === "admin" || source === "field") return "human";
  if (source === "mcp") return "ai";
  return "system";
}

/**
 * Machine name of what an execution did. Written by the server for every
 * mutation it makes; production steps outside the site (art, slicing,
 * printing, assembly) are recorded by whoever did them with the same shape.
 * Free text is allowed as long as it is a short snake_case word.
 */
export const JOURNEY_SYSTEM_ACTIONS = [
  "batch_created",
  "batch_status_changed",
  "tag_created",
  "kit_delivered",
  "returned_to_house",
  "reseller_changed",
  "tag_assigned",
  "tag_activated",
  "tag_disabled",
  "tag_retired",
  "tag_restored",
  "tag_unassigned",
  "destination_changed",
  "nfc_verified",
  "nfc_written",
  "nfc_failed",
  "direct_write",
  "plan_created",
  "plan_status_changed",
] as const;

/** Production steps the 3D-printing workflow records (suggested, not enforced). */
export const JOURNEY_PRODUCTION_ACTIONS = [
  "art_built",
  "plate_built",
  "sliced",
  "printed",
  "nfc_inserted",
  "assembled",
  "tested",
  "delivered",
] as const;

export const JOURNEY_ACTION_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** Product labels for titles written on the server (same wording as the admin UI). */
export const JOURNEY_PRODUCT_LABELS: Record<string, string> = {
  large_stand: "Large Stand",
  small_stand: "Small Stand",
  large_sign: "Large Sign",
  small_sign: "Small Sign",
  large_plate: "Large Plate",
  small_plate: "Small Plate",
  google_review_sign: "Google Review sign",
  business_card: "Business card",
  keychain: "Keychain",
  safety_tag: "Safety tag",
  menu_tag: "Menu tag",
  booking_tag: "Booking tag",
  custom: "Custom",
};

export const PLAN_KINDS = ["strategy", "hypothesis", "experiment", "target", "task"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  strategy: "Strategy",
  hypothesis: "Hypothesis",
  experiment: "Experiment",
  target: "Target",
  task: "Task",
};

export const PLAN_STATUSES = ["draft", "active", "paused", "validated", "invalidated", "done", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  validated: "Validated",
  invalidated: "Invalidated",
  done: "Done",
  cancelled: "Cancelled",
};

export const OPEN_PLAN_STATUSES: readonly PlanStatus[] = ["draft", "active", "paused"];

export function isClosedPlanStatus(status: string): boolean {
  return !OPEN_PLAN_STATUSES.includes(status as PlanStatus);
}

/** How far ahead of the server clock a caller-supplied occurredAt may be (clock skew). */
export const JOURNEY_MAX_FUTURE_MS = 5 * 60_000;

const TAG_ACTION_VERB: Record<string, string> = {
  assign: "assigned",
  activate: "activated",
  disable: "disabled",
  retire: "retired",
  restore: "restored",
  unassign: "unassigned",
};

/** The journey entry for a tag lifecycle action (assign, activate, disable, ...). */
export function tagActionEntry(
  action: string,
  publicCode: string,
  fromStatus: string,
  toStatus: string,
  extra?: string | null,
): { action: string; title: string; before: string; after: string } {
  const verb = TAG_ACTION_VERB[action] ?? action;
  return {
    action: `tag_${verb}`,
    title: `Tag ${publicCode} ${verb}${extra ? ` ${extra}` : ""}`,
    before: fromStatus,
    after: toStatus,
  };
}

/**
 * The entry written when a plan changes status: closing it as validated,
 * invalidated or done is a result; anything else is a decision.
 */
export function planStatusEntry(
  plan: { title: string; kind: string },
  to: string,
): { kind: JourneyEntryKind; action: string; title: string } {
  const closing = to === "validated" || to === "invalidated" || to === "done";
  const label = PLAN_STATUS_LABELS[to as PlanStatus] ?? to;
  return {
    kind: closing ? "result" : "decision",
    action: "plan_status_changed",
    title: `${PLAN_KIND_LABELS[plan.kind as PlanKind] ?? "Plan"} ${label.toLowerCase()}: ${plan.title}`.slice(0, 200),
  };
}
