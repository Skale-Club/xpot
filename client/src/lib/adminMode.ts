import { useQuery } from "@tanstack/react-query";
import { useLocation, useRouter } from "wouter";
// Relative imports: queryClient.ts and its tests load this module without app aliases.
import { canManage, isSuperAdmin } from "../../../shared/modules";
import { productionOrganizations } from "../../../shared/organizations";
import { profileOf, type Profile } from "../../../shared/profiles";
import { workspaceForPath, workspaceHeaders } from "./workspace";
import type { XpotMeResponse } from "../pages/xpot/types";

/** The server still authorizes every request; this header only selects the current page's data scope. */
export function viewHeaders(): Record<string, string> {
  return workspaceHeaders(typeof window === "undefined" ? "" : window.location?.pathname ?? "");
}

/** Which of the four panels this person gets (shared/profiles.ts); null until /me has loaded. */
export function profileOfMe(me: XpotMeResponse | null | undefined): Profile | null {
  return me?.user ? profileOf(me) : null;
}

export type ManagementReach = "everyone" | "organization";
/** Whose records the panel covers: the platform's, everyone's; an owner's or a partner's, their organization's. A member has no panel. */
export function managementReach(me: XpotMeResponse | null | undefined): ManagementReach | null {
  const profile = profileOfMe(me);
  if (!profile || profile === "member") return null;
  return profile === "platform" ? "everyone" : "organization";
}

/** A partner: owner of a branch that prints its own pieces, so Production (for that branch) is in their panel. */
export function printsForABranch(me: XpotMeResponse | null | undefined): boolean {
  return productionOrganizations(me?.organizations, false).length > 0;
}

/**
 * The teams someone owns: organizations they are the owner of, active, and not just their one-person workspace (unless
 * it prints its own pieces). What an owner's or a partner's panel is about.
 */
export function ownedOrganizations<T extends { isActive: boolean; membershipRole?: "admin" | "member" | null; personal?: boolean; printsOwnPieces?: boolean }>(organizations: readonly T[] | null | undefined): T[] {
  return (organizations ?? []).filter((organization) => organization.isActive && organization.membershipRole === "admin" && (!organization.personal || organization.printsOwnPieces));
}

/**
 * The one organization an owner or a partner runs, or null when they run none or several. The panel's Team, Purchases
 * and Settings open its workspace, and /organizations goes straight to it.
 */
export function ownedOrganizationId(me: XpotMeResponse | null | undefined): number | null {
  const profile = profileOfMe(me);
  if (profile !== "owner" && profile !== "partner") return null;
  const owned = ownedOrganizations(me?.organizations);
  return owned.length === 1 ? owned[0].id : null;
}

/** Remove the obsolete device preference on sign-out; it no longer controls permissions or lists. */
export function clearAdminMode() {
  try { window.localStorage.removeItem("xpot.adminMode"); } catch { /* Storage can be blocked. */ }
}

/** User screens always use personal data. Management is explicit in the URL and the panel navigation. */
export function useViewerAccess() {
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const [path] = useLocation();
  const router = useRouter();
  const hasAdminAccess = canManage(me);
  const reach = managementReach(me);
  const adminMode = reach !== null && workspaceForPath(`${router.base}${path}`) === "management";
  return { me, profile: profileOfMe(me), hasAdminAccess, reach, adminMode, canManage: hasAdminAccess && adminMode, isSuperAdmin: isSuperAdmin(me) && adminMode };
}
