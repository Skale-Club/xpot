/**
 * A visit's status is also its outcome: checking out stores the result the
 * rep picked (sale_made, follow_up, …) as the status, and "completed" is just
 * one of those results. Counting only "completed" as finished dropped the
 * busiest outcomes from every "completed visits" number.
 */
export const VISIT_OUTCOME_STATUSES = [
  "sale_made",
  "follow_up",
  "came_back_later",
  "no_answer",
  "not_interested",
  "completed",
] as const;

export type VisitOutcomeStatus = (typeof VISIT_OUTCOME_STATUSES)[number];

/** A finished visit: checked out with any outcome (not planned, in progress, cancelled or invalid). */
export function isFinishedVisitStatus(status: string | null | undefined): status is VisitOutcomeStatus {
  return (VISIT_OUTCOME_STATUSES as readonly string[]).includes(status ?? "");
}
