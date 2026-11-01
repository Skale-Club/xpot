// The four kinds of people Xpot is built around, each with its own panel (docs/PROFILES_EXECUTION_PLAN.md). One rule,
// read by the server (enforcement) and the app (what to show):
//   platform  the platform's owners (users.is_admin): every organization, and their own company's production.
//   partner   owner of an organization that prints its own pieces (organizations.prints_own_pieces): that one only.
//   owner     owner of a selling organization with a team: sees all of it, makes no pieces.
//   member    an employee, or someone selling alone: their own pieces and customers. Buys pieces, never prints.
// Someone selling alone already owns their one-person organization and can invite people; the owner's panel appears
// when the second person joins (runsATeam).

import { productionOrganizations, runsATeam, type OrganizationRole } from "./organizations.js";

export const PROFILES = ["platform", "partner", "owner", "member"] as const;
export type Profile = (typeof PROFILES)[number];

export type ProfileViewer = {
  user: { isAdmin: boolean };
  organizations?: ReadonlyArray<{
    slug: string;
    isActive: boolean;
    printsOwnPieces?: boolean | null;
    membershipRole?: OrganizationRole | null;
    personal?: boolean;
  }> | null;
};

export function profileOf(viewer: ProfileViewer): Profile {
  if (viewer.user.isAdmin) return "platform";
  if (productionOrganizations(viewer.organizations, false).length > 0) return "partner";
  return runsATeam(viewer.organizations) ? "owner" : "member";
}

/** The panels' contract (the plan's section 4). Whether a capability reaches every organization or one is `reach`. */
const CAPABILITIES = {
  // The platform
  managePlatform: ["platform"],
  manageEveryOrganization: ["platform"],
  managePeople: ["platform"],
  editCatalog: ["platform"],
  grantOwner: ["platform"],
  fulfillStuscleOrders: ["platform"],
  // Production
  produce: ["platform", "partner"],
  // The organization
  useManagementPanel: ["platform", "partner", "owner"],
  manageTeam: ["platform", "partner", "owner"],
  manageStock: ["platform", "partner", "owner"],
  viewTeamPurchases: ["platform", "partner", "owner"],
  viewOrganizationReports: ["platform", "partner", "owner"],
  // Everyone
  workOwnPieces: ["platform", "partner", "owner", "member"],
  buyPieces: ["platform", "owner", "member"],
} as const satisfies Record<string, readonly Profile[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(profile: Profile, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Profile[]).includes(profile);
}

/** Whose records a capability covers: the platform's reach every organization, anyone else's their own. */
export function reach(profile: Profile): "everyone" | "organization" | "own" {
  if (profile === "platform") return "everyone";
  return profile === "member" ? "own" : "organization";
}
