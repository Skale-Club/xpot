import { describe, expect, it } from "vitest";
import { leadAccess } from "../client/src/pages/xpot/leadAccess";

// The company screens hide what the server refuses (server/routes/xpot/middleware.ts
// ownsLead / loadAccessibleLead "records"); these cases mirror its rules.

const rep = (id: number, memberships: Array<{ organizationId: number; role: "admin" | "member"; isActive?: boolean; blockedAt?: string | null }> = []) => ({
  user: { isAdmin: false },
  rep: { id, role: "rep" },
  organizationMemberships: memberships.map((m) => ({ isActive: true, blockedAt: null, ...m })),
});

describe("leadAccess", () => {
  it("lets the owner, inside the company's organization, do everything", () => {
    expect(leadAccess(rep(5, [{ organizationId: 1, role: "member" }]), { ownerRepId: 5, organizationId: 1 })).toEqual({ owner: true, records: true });
  });

  it("lets a Rep Admin of the organization act as the owner", () => {
    expect(leadAccess(rep(6, [{ organizationId: 1, role: "admin" }]), { ownerRepId: 5, organizationId: 1 })).toEqual({ owner: true, records: true });
  });

  it("lets a member who is not the owner record sales but not delete", () => {
    expect(leadAccess(rep(6, [{ organizationId: 1, role: "member" }]), { ownerRepId: 5, organizationId: 1 })).toEqual({ owner: false, records: true });
  });

  it("refuses both to a piece holder outside the organization", () => {
    expect(leadAccess(rep(6, [{ organizationId: 2, role: "admin" }]), { ownerRepId: 5, organizationId: 1 })).toEqual({ owner: false, records: false });
  });

  it("does not count a blocked or inactive membership", () => {
    expect(leadAccess(rep(5, [{ organizationId: 1, role: "member", blockedAt: "2026-10-01T00:00:00Z" }]), { ownerRepId: 5, organizationId: 1 }).owner).toBe(false);
    expect(leadAccess(rep(5, [{ organizationId: 1, role: "member", isActive: false }]), { ownerRepId: 5, organizationId: 1 }).records).toBe(false);
  });

  it("gives managers and admins everything, whatever the organization", () => {
    expect(leadAccess({ ...rep(9), rep: { id: 9, role: "manager" } }, { ownerRepId: 5, organizationId: 1 })).toEqual({ owner: true, records: true });
    expect(leadAccess({ ...rep(9), user: { isAdmin: true } }, { ownerRepId: 5, organizationId: 1 })).toEqual({ owner: true, records: true });
  });

  it("falls back to ownership for a company without an organization", () => {
    expect(leadAccess(rep(5), { ownerRepId: 5, organizationId: null })).toEqual({ owner: true, records: true });
    expect(leadAccess(rep(6), { ownerRepId: 5, organizationId: null })).toEqual({ owner: false, records: false });
  });

  it("leaves the decision to the server while the viewer or the company is unknown", () => {
    expect(leadAccess(null, { ownerRepId: 5, organizationId: 1 })).toEqual({ owner: true, records: true });
    expect(leadAccess(rep(6), undefined)).toEqual({ owner: true, records: true });
  });
});
