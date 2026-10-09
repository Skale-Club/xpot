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
 * Operational credit when a piece goes live. Activation does not create a
 * financial sale; the tag sale service owns soldAt and money.
 */
export function activationCredit(
  tag: { repId: number | null },
  actorRepId: number,
): { repId: number } {
  return { repId: tag.repId ?? actorRepId };
}
