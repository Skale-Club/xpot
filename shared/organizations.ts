export type PlatformRole = "admin" | "manager" | "rep";
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

/** The only user-facing platform roles. Rep Admin is an Organization role. */
export function platformRoleOf(viewer: OrganizationViewer): PlatformRole {
  if (viewer.user.isAdmin) return "admin";
  return viewer.rep.role === "manager" ? "manager" : "rep";
}

export function managesEveryOrganization(viewer: OrganizationViewer): boolean {
  const role = platformRoleOf(viewer);
  return role === "admin" || role === "manager";
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
