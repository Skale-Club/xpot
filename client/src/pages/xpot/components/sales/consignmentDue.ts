// When a consignment's settlement is due, computed once for the phone cards,
// the phone "Settlement overdue" group and the desktop table. Kept free of
// app imports so the tests can load it.

const DAY_MS = 24 * 60 * 60 * 1000;

export type ConsignmentDue = {
  closed: boolean;
  /** Past its settlement date and still open. A closed agreement is never overdue. */
  overdue: boolean;
  /** Whole days overdue (at least 1) when overdue. */
  daysOverdue: number;
  /** Due within the next 7 days (0 = today), when open and not overdue. */
  dueInDays: number | null;
};

export function consignmentDue(
  consignment: { status: string; nextVisitDueAt?: string | Date | null },
  now = Date.now(),
): ConsignmentDue {
  const closed = consignment.status === "closed";
  const dueAt = consignment.nextVisitDueAt ? new Date(consignment.nextVisitDueAt).getTime() : NaN;
  if (closed || Number.isNaN(dueAt)) return { closed, overdue: false, daysOverdue: 0, dueInDays: null };
  if (dueAt < now) return { closed, overdue: true, daysOverdue: Math.max(1, Math.ceil((now - dueAt) / DAY_MS)), dueInDays: null };
  const days = Math.round((dueAt - now) / DAY_MS);
  return { closed, overdue: false, daysOverdue: 0, dueInDays: days <= 7 ? days : null };
}
