// Who may do what with tags — pure rules shared by the server (enforcement)
// and the app (what to show).
//
// Skale Club supplies the pieces; resellers (reps) buy kits and sell them to
// businesses. A reseller works only with the pieces in their own kit and with
// their own customers (leads). Managers and admins see everything.

export interface TagActor {
  userId: string;
  /** The actor's sales_reps.id. */
  repId: number;
  /** Manager or admin: full access to every tag, kit and report. */
  isManager: boolean;
}

/**
 * A reseller reaches a piece only when it is in their kit (tags.rep_id). House
 * stock (no rep yet) is out of reach until an admin hands it over in a kit.
 */
export function canWorkOnTag(actor: TagActor, tag: { repId: number | null }): boolean {
  return actor.isManager || (tag.repId !== null && tag.repId === actor.repId);
}

/** A reseller sees the leads they own; managers see every lead. */
export function canUseLead(actor: TagActor, lead: { ownerRepId: number | null }): boolean {
  return actor.isManager || (lead.ownerRepId !== null && lead.ownerRepId === actor.repId);
}

/**
 * Sale credit when a piece goes live for a customer. The reseller holding the
 * piece gets it; a house piece an admin activates is credited to that admin.
 * The sale date is the first activation and never moves afterwards.
 */
export function saleCredit(
  tag: { repId: number | null; soldAt: Date | null },
  actorRepId: number,
  now: Date,
): { repId: number; soldAt: Date } {
  return { repId: tag.repId ?? actorRepId, soldAt: tag.soldAt ?? now };
}
