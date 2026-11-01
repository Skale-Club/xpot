// The four profiles (shared/profiles.ts): who is who, and the contract of docs/PROFILES_EXECUTION_PLAN.md section 4.

import { describe, expect, it } from "vitest";
import { can, profileOf, reach, type Capability, type Profile } from "../shared/profiles";

const org = (over: Record<string, unknown> = {}) => ({ slug: "acme", isActive: true, printsOwnPieces: false, membershipRole: "admin" as const, personal: false, ...over });
const viewer = (isAdmin: boolean, organizations: ReturnType<typeof org>[] = []) => ({ user: { isAdmin }, organizations });

describe("profileOf", () => {
  it("is the platform for the global admin, whatever they belong to", () => {
    expect(profileOf(viewer(true))).toBe("platform");
    expect(profileOf(viewer(true, [org({ membershipRole: "member" })]))).toBe("platform");
  });

  it("is a partner for the owner of an active organization that prints its own pieces", () => {
    expect(profileOf(viewer(false, [org({ printsOwnPieces: true })]))).toBe("partner");
  });

  it("is not a partner for an employee of a printing organization, or for an inactive one", () => {
    expect(profileOf(viewer(false, [org({ printsOwnPieces: true, membershipRole: "member" })]))).toBe("member");
    expect(profileOf(viewer(false, [org({ printsOwnPieces: true, isActive: false })]))).toBe("owner");
  });

  it("is an owner for the owner of a team, and a member for someone selling alone or an employee", () => {
    expect(profileOf(viewer(false, [org()]))).toBe("owner");
    expect(profileOf(viewer(false, [org({ personal: true })]))).toBe("member");
    expect(profileOf(viewer(false, [org({ membershipRole: "member" })]))).toBe("member");
    expect(profileOf(viewer(false))).toBe("member");
  });
});

describe("the contract", () => {
  const table: Record<Capability, Profile[]> = {
    managePlatform: ["platform"],
    manageEveryOrganization: ["platform"],
    managePeople: ["platform"],
    editCatalog: ["platform"],
    grantOwner: ["platform"],
    fulfillStuscleOrders: ["platform"],
    produce: ["platform", "partner"],
    useManagementPanel: ["platform", "partner", "owner"],
    manageTeam: ["platform", "partner", "owner"],
    manageStock: ["platform", "partner", "owner"],
    viewTeamPurchases: ["platform", "partner", "owner"],
    viewOrganizationReports: ["platform", "partner", "owner"],
    workOwnPieces: ["platform", "partner", "owner", "member"],
    buyPieces: ["platform", "owner", "member"],
  };

  it("gives each capability to exactly the profiles the plan lists", () => {
    for (const [capability, allowed] of Object.entries(table) as Array<[Capability, Profile[]]>) {
      for (const profile of ["platform", "partner", "owner", "member"] as Profile[]) {
        expect(can(profile, capability), `${profile} ${capability}`).toBe(allowed.includes(profile));
      }
    }
  });

  it("lets an employee buy but never produce", () => {
    expect(can("member", "buyPieces")).toBe(true);
    expect(can("member", "produce")).toBe(false);
  });

  it("reaches every organization only for the platform", () => {
    expect(reach("platform")).toBe("everyone");
    expect(reach("partner")).toBe("organization");
    expect(reach("owner")).toBe("organization");
    expect(reach("member")).toBe("own");
  });
});
