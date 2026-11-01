export type PlatformRole = "admin" | "rep";
export type OrganizationRole = "admin" | "member";

export type OrganizationViewer = {
  user: { isAdmin: boolean };
  rep: { id: number; role: string };
};

export type OrganizationAccess = {
  organizationId: number;
  role: OrganizationRole;
  isActive: boolean;
  blockedAt?: Date | string | null;
};

/** The only platform roles: the owners, and everyone else. Owner and employee are Organization roles. */
export function platformRoleOf(viewer: OrganizationViewer): PlatformRole {
  return viewer.user.isAdmin ? "admin" : "rep";
}

export function managesEveryOrganization(viewer: OrganizationViewer): boolean {
  return viewer.user.isAdmin;
}

/**
 * A Rep Admin of a real team: admin of an organization that is not just their
 * own one-person workspace (`personal`, isPersonalOrganization). Their
 * management mode widens their lists to the organizations they run, and no
 * further (server/routes/xpot/middleware.ts listScope). `organizations` is
 * /api/xpot/me's list, which carries the person's role in each.
 */
export function runsATeam(
  organizations: readonly { membershipRole?: OrganizationRole | null; personal?: boolean }[] | null | undefined,
): boolean {
  return (organizations ?? []).some((organization) => organization.membershipRole === "admin" && !organization.personal);
}

/**
 * Who handles an organization's orders (organizations.distribution, migrations/0070): `xpot` is Xpot (Stuscle, fulfilled
 * from the company's stock; the US), `own` is the partner (outside the US; their house stock, to the organizations the
 * platform linked to them). What each one means is server/tags/distribution.ts.
 */
export const DISTRIBUTIONS = ["xpot", "own"] as const;
export type Distribution = (typeof DISTRIBUTIONS)[number];

/** The company organization (Boston): every piece printed before branches existed, and parts, are its. */
export const COMPANY_ORGANIZATION_SLUG = "xpot-company";

type ProductionCandidate = {
  slug: string;
  isActive: boolean;
  printsOwnPieces?: boolean | null;
  membershipRole?: OrganizationRole | null;
};

/**
 * Who Tags › Production prints for, as the server decides it (server/tags/access.ts requireProductionUser): for the
 * global admin the company and every active branch that prints its own pieces; for anyone else the branches like
 * that they are a Rep Admin of. The company comes first. Empty: no access to Production. `organizations` is
 * /api/xpot/me's list (every organization for an admin, their own for anyone else).
 */
export function productionOrganizations<T extends ProductionCandidate>(organizations: readonly T[] | null | undefined, isAdmin: boolean): T[] {
  const printing = (organization: T) => organization.isActive && !!organization.printsOwnPieces;
  const list = (organizations ?? []).filter((organization) => isAdmin
    ? organization.slug === COMPANY_ORGANIZATION_SLUG || printing(organization)
    : organization.membershipRole === "admin" && printing(organization));
  return [...list].sort((a, b) => Number(b.slug === COMPANY_ORGANIZATION_SLUG) - Number(a.slug === COMPANY_ORGANIZATION_SLUG));
}

export function activeOrganizationAccess(
  memberships: readonly OrganizationAccess[],
  organizationId: number,
): OrganizationAccess | undefined {
  return memberships.find((membership) =>
    membership.organizationId === organizationId && membership.isActive && !membership.blockedAt
  );
}

export function canViewOrganization(
  viewer: OrganizationViewer,
  memberships: readonly OrganizationAccess[],
  organizationId: number,
): boolean {
  return managesEveryOrganization(viewer) || !!activeOrganizationAccess(memberships, organizationId);
}

export function canManageOrganization(
  viewer: OrganizationViewer,
  memberships: readonly OrganizationAccess[],
  organizationId: number,
): boolean {
  return managesEveryOrganization(viewer) || activeOrganizationAccess(memberships, organizationId)?.role === "admin";
}

/**
 * The one-person workspace every new rep gets automatically
 * (server/organizations/service.ts ensureOrganizationForRep names it after
 * them, with the slug "rep-<their id>"), for as long as it still holds only
 * that person, or nobody. Once someone else joins it is a real organization.
 * The Organizations list hides these behind "Show personal workspaces".
 */
export function isPersonalOrganization(organization: { slug: string; memberCount: number; soleMemberRepId?: number | null }): boolean {
  const owner = /^rep-(\d+)$/.exec(organization.slug);
  if (!owner) return false;
  if (organization.memberCount === 0) return true;
  return organization.memberCount === 1 && organization.soleMemberRepId === Number(owner[1]);
}
