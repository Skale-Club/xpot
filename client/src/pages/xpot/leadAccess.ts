import { useQuery } from "@tanstack/react-query";
import { canManage } from "@shared/modules";
import { canManageOrganization, canViewOrganization, type OrganizationAccess } from "@shared/organizations";
import type { XpotMeResponse } from "./types";

// What the viewer may do to a company beyond reading and editing its details,
// so the screens hide what the server would refuse. Mirrors canAccessLead /
// ownsLead / loadAccessibleLead(…, "records") in server/routes/xpot/middleware.ts:
// a rep who only holds a Tags piece at a company can open and edit it, but only
// its owner, a Rep Admin of its organization or a manager may delete it or change
// its stage (lead_owner_only), and sales and stock recorded there are filed under
// its organization, so only its members may record them (lead_other_organization).

export type LeadOwnership = { ownerRepId: number | null; organizationId: number | null };

type Viewer = {
  user: { isAdmin: boolean };
  rep: { id: number; role: string };
  organizationMemberships?: readonly OrganizationAccess[];
};

export type LeadAccess = {
  /** Delete the company, change its stage or owner, remove its photos. */
  owner: boolean;
  /** Record a sale or leave stock there. */
  records: boolean;
};

const FULL: LeadAccess = { owner: true, records: true };

export function leadAccess(viewer: Viewer | null | undefined, lead: LeadOwnership | null | undefined): LeadAccess {
  // Unknown viewer or company: show the controls and let the server decide.
  if (!viewer || !lead) return FULL;
  // Managers and admins, in either view (the server checks the role, not the mode).
  if (canManage(viewer)) return FULL;
  if (!lead.organizationId) {
    const owner = lead.ownerRepId === viewer.rep.id;
    return { owner, records: owner };
  }
  const memberships = viewer.organizationMemberships ?? [];
  const member = canViewOrganization(viewer, memberships, lead.organizationId);
  const owner = member && (lead.ownerRepId === viewer.rep.id || canManageOrganization(viewer, memberships, lead.organizationId));
  return { owner, records: member };
}

/** leadAccess for the signed-in person. */
export function useLeadAccess(lead: LeadOwnership | null | undefined): LeadAccess {
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  return leadAccess(me, lead);
}
