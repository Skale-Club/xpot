// Who has management mode, which lists a Rep Admin's mode widens
// (moduleNav.ts organizationWideList), and the server's filters for each scope
// (server/routes/xpot/middleware.ts recordFilters).
import { describe, expect, it, vi } from "vitest";
import { organizationWideList } from "../client/src/components/xpot/moduleNav";
import { managementReach, ownedOrganizationId } from "../client/src/lib/adminMode";
import { runsATeam } from "../shared/organizations";

// recordFilters is pure; the middleware module only needs a db to load.
vi.mock("../server/db.js", () => ({ db: {}, pool: { end: async () => {} } }));
const { recordFilters } = await import("../server/routes/xpot/middleware");

const me = (overrides: { isAdmin?: boolean; role?: string; organizations?: Array<{ membershipRole?: "admin" | "member"; personal?: boolean; printsOwnPieces?: boolean; isActive?: boolean }> }) => ({
  user: { id: "u", email: "", isAdmin: overrides.isAdmin ?? false },
  rep: { id: 7, displayName: "Rep", role: overrides.role ?? "rep" },
  organizations: (overrides.organizations ?? []).map((organization, index) => ({ id: index + 1, name: `Org ${index}`, slug: `org-${index}`, isActive: true, ...organization })),
  activeVisit: null,
});

describe("who has management mode", () => {
  it("the Xpot admin: everyone", () => {
    expect(managementReach(me({ isAdmin: true, role: "admin" }))).toBe("everyone");
  });

  it("a leftover role=manager row is a plain rep: no management mode", () => {
    expect(managementReach(me({ role: "manager" }))).toBeNull();
  });

  it("a Rep Admin of a real team: their organization", () => {
    expect(managementReach(me({ organizations: [{ membershipRole: "admin" }] }))).toBe("organization");
  });

  it("nobody else: admin of their own one-person workspace or a plain member", () => {
    expect(managementReach(me({ organizations: [{ membershipRole: "admin", personal: true }, { membershipRole: "member" }] }))).toBeNull();
    expect(runsATeam(undefined)).toBe(false);
  });
});

describe("which organization an owner's or a partner's panel opens", () => {
  const org = (overrides: Record<string, unknown>) => overrides as { membershipRole?: "admin" | "member"; personal?: boolean; printsOwnPieces?: boolean; isActive?: boolean };
  const withOrganizations = (...list: Array<Record<string, unknown>>) => me({ organizations: list.map(org) as never });

  it("the only team they own: its id", () => {
    expect(ownedOrganizationId(withOrganizations({ membershipRole: "admin" }))).toBe(1);
    expect(ownedOrganizationId(withOrganizations({ membershipRole: "member" }, { membershipRole: "admin" }))).toBe(2);
  });

  it("none or several: none, so the panel opens the organizations list", () => {
    expect(ownedOrganizationId(withOrganizations({ membershipRole: "admin" }, { membershipRole: "admin" }))).toBeNull();
    expect(ownedOrganizationId(withOrganizations({ membershipRole: "member" }))).toBeNull();
    expect(ownedOrganizationId(withOrganizations({ membershipRole: "admin", isActive: false }))).toBeNull();
  });

  it("a partner working alone: their one-person workspace counts when it prints its own pieces", () => {
    expect(ownedOrganizationId(withOrganizations({ membershipRole: "admin", personal: true, printsOwnPieces: true }))).toBe(1);
    expect(ownedOrganizationId(withOrganizations({ membershipRole: "admin", personal: true }))).toBeNull();
  });

  it("the platform has no single organization to open", () => {
    expect(ownedOrganizationId(me({ isAdmin: true, organizations: [{ membershipRole: "admin" }] }))).toBeNull();
  });
});

describe("lists a Rep Admin's management mode widens", () => {
  it("Companies, Tasks and Sales except the pipeline", () => {
    for (const path of ["/leads", "/leads/4", "/tasks", "/sales", "/sales/sales/3", "/sales/stock"]) expect(organizationWideList(path)).toBe(true);
  });

  it("not visits, the pipeline or Tags: those stay their own", () => {
    for (const path of ["/dashboard/history", "/sales/pipeline", "/tags", "/tags/customers"]) expect(organizationWideList(path)).toBe(false);
  });
});

describe("the server's filters per scope", () => {
  const actor = { rep: { id: 7 } } as any;

  it("own: the person, in the organizations they are active in", () => {
    expect(recordFilters({ kind: "own", activeOrganizationIds: [1, 2] }, actor, 9, 3)).toEqual({ repId: 7, organizationIds: [1, 2] });
    expect(recordFilters({ kind: "own", activeOrganizationIds: null }, actor)).toEqual({ repId: 7, organizationIds: undefined });
  });

  it("organizations: the ones they run, narrowed to a teammate on request, never widened", () => {
    const scope = { kind: "organizations" as const, organizationIds: [1], activeOrganizationIds: [1, 2] };
    expect(recordFilters(scope, actor)).toEqual({ repId: undefined, organizationIds: [1] });
    expect(recordFilters(scope, actor, 9, 5)).toEqual({ repId: 9, organizationIds: [1] });
    // Their own repId (the Dashboard) is their own records, as with the mode off.
    expect(recordFilters(scope, actor, 7)).toEqual({ repId: 7, organizationIds: [1, 2] });
  });

  it("everyone: optional person and organization", () => {
    expect(recordFilters({ kind: "everyone" }, actor)).toEqual({ repId: undefined, organizationIds: undefined });
    expect(recordFilters({ kind: "everyone" }, actor, 9, 5)).toEqual({ repId: 9, organizationIds: [5] });
  });
});
