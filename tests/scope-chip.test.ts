// The scope chip says exactly whose records a list shows (moduleNav.ts
// scopeChipState), and the server's filters for each scope match it
// (server/routes/xpot/middleware.ts recordFilters).
import { describe, expect, it, vi } from "vitest";
import { organizationWideList, scopeChipState } from "../client/src/components/xpot/moduleNav";
import { managementReach } from "../client/src/lib/adminMode";
import { runsATeam } from "../shared/organizations";

// recordFilters is pure; the middleware module only needs a db to load.
vi.mock("../server/db.js", () => ({ db: {}, pool: { end: async () => {} } }));
const { recordFilters } = await import("../server/routes/xpot/middleware");

const me = (overrides: { isAdmin?: boolean; role?: string; organizations?: Array<{ membershipRole?: "admin" | "member"; personal?: boolean }> }) => ({
  user: { id: "u", email: "", isAdmin: overrides.isAdmin ?? false },
  rep: { id: 7, displayName: "Rep", role: overrides.role ?? "rep" },
  organizations: (overrides.organizations ?? []).map((organization, index) => ({ id: index + 1, name: `Org ${index}`, slug: `org-${index}`, isActive: true, ...organization })),
  activeVisit: null,
});

describe("who has management mode", () => {
  it("a manager or the Xpot admin: everyone", () => {
    expect(managementReach(me({ role: "manager" }))).toBe("everyone");
    expect(managementReach(me({ isAdmin: true, role: "admin" }))).toBe("everyone");
  });

  it("a Rep Admin of a real team: their organization", () => {
    expect(managementReach(me({ organizations: [{ membershipRole: "admin" }] }))).toBe("organization");
  });

  it("nobody else: admin of their own one-person workspace or a plain member", () => {
    expect(managementReach(me({ organizations: [{ membershipRole: "admin", personal: true }, { membershipRole: "member" }] }))).toBeNull();
    expect(runsATeam(undefined)).toBe(false);
  });
});

describe("scope chip", () => {
  it("says only me with management mode off, for everyone who has the mode", () => {
    for (const reach of ["everyone", "organization"] as const) {
      expect(scopeChipState("/leads", reach, false, false)).toEqual({ label: "mine", toggles: true });
      expect(scopeChipState("/sales", reach, false, false)).toEqual({ label: "mine", toggles: true });
    }
  });

  it("says everyone for a manager in management mode", () => {
    expect(scopeChipState("/leads", "everyone", true, false)).toEqual({ label: "everyone", toggles: true });
    expect(scopeChipState("/dashboard/history", "everyone", true, false)).toEqual({ label: "everyone", toggles: true });
    expect(scopeChipState("/tags", "everyone", true, false)).toEqual({ label: "everyone", toggles: true });
  });

  it("says my organization for a Rep Admin on the lists their mode widens", () => {
    for (const path of ["/leads", "/leads/4", "/sales", "/sales/sales/3", "/sales/stock"]) {
      expect(scopeChipState(path, "organization", true, false)).toEqual({ label: "organization", toggles: true });
    }
  });

  it("says only me, and is no switch, where a Rep Admin's mode widens nothing", () => {
    for (const path of ["/dashboard/history", "/sales/pipeline", "/tags", "/tags/customers"]) {
      expect(organizationWideList(path)).toBe(false);
      expect(scopeChipState(path, "organization", true, false)).toEqual({ label: "mine", toggles: false });
    }
  });

  it("on Tasks follows the Whole team filter", () => {
    expect(scopeChipState("/tasks", "organization", true, false)?.label).toBe("mine");
    expect(scopeChipState("/tasks", "organization", true, true)?.label).toBe("organization");
    expect(scopeChipState("/tasks", "everyone", true, true)?.label).toBe("everyone");
  });

  it("is not there without management mode or off the lists", () => {
    expect(scopeChipState("/leads", null, false, false)).toBeNull();
    expect(scopeChipState("/dashboard", "everyone", true, false)).toBeNull();
    expect(scopeChipState("/tags/pieces", "organization", true, false)).toBeNull();
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
