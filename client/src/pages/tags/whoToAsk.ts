// What someone with no pieces yet is told, and whom to look for. The company is the real one on the person's record
// (the team they belong to), never a made-up contact: organizations carry no phone, so there is no "call" button.

type Me = {
  user?: { firstName?: string | null } | null;
  rep?: { displayName?: string | null } | null;
  organizations?: ReadonlyArray<{ name: string; isActive: boolean; personal?: boolean; membershipRole?: string | null }> | null;
};

export type FirstSteps = {
  /** First name, for the greeting; null when the record has none. */
  name: string | null;
  /** The team the person belongs to and gets pieces from; null for someone selling alone, who buys them in the Shop. */
  company: string | null;
};

export function firstStepsOf(me: Me | null | undefined): FirstSteps {
  const first = me?.user?.firstName?.trim() || me?.rep?.displayName?.trim().split(/\s+/)[0] || null;
  const team = me?.organizations?.find((organization) => organization.isActive && !organization.personal && organization.membershipRole);
  return { name: first, company: team?.name ?? null };
}
