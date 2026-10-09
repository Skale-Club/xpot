import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canManageOrganization,
  canViewOrganization,
  managesEveryOrganization,
  platformRoleOf,
  type OrganizationAccess,
} from "../shared/organizations.js";

const admin = { user: { isAdmin: true }, rep: { id: 1, role: "admin" } };
const manager = { user: { isAdmin: false }, rep: { id: 2, role: "manager" } };
const rep = { user: { isAdmin: false }, rep: { id: 3, role: "rep" } };
const memberships: OrganizationAccess[] = [
  { organizationId: 10, role: "admin", isActive: true },
  { organizationId: 20, role: "member", isActive: true },
  { organizationId: 30, role: "admin", isActive: false },
  { organizationId: 40, role: "admin", isActive: true, blockedAt: new Date() },
];

describe("Organization role separation", () => {
  it("exposes only Admin, Manager, and Rep as platform roles", () => {
    expect(platformRoleOf(admin)).toBe("admin");
    expect(platformRoleOf(manager)).toBe("manager");
    expect(platformRoleOf(rep)).toBe("rep");
  });

  it("lets Admin and Manager operate across Organizations", () => {
    for (const viewer of [admin, manager]) {
      expect(managesEveryOrganization(viewer)).toBe(true);
      expect(canManageOrganization(viewer, [], 999)).toBe(true);
      expect(canViewOrganization(viewer, [], 999)).toBe(true);
    }
  });

  it("lets a Rep Admin manage only their own active Organization", () => {
    expect(canManageOrganization(rep, memberships, 10)).toBe(true);
    expect(canManageOrganization(rep, memberships, 20)).toBe(false);
    expect(canManageOrganization(rep, memberships, 30)).toBe(false);
    expect(canManageOrganization(rep, memberships, 40)).toBe(false);
    expect(canManageOrganization(rep, memberships, 999)).toBe(false);
  });

  it("lets a Rep view, but not manage, their own active Organization", () => {
    expect(canViewOrganization(rep, memberships, 20)).toBe(true);
    expect(canManageOrganization(rep, memberships, 20)).toBe(false);
    expect(canViewOrganization(rep, memberships, 999)).toBe(false);
  });
});

describe("Organization migration", () => {
  const sql = readFileSync(new URL("../migrations/0024_organizations.sql", import.meta.url), "utf8");

  it("separates membership roles and records sensitive changes", () => {
    expect(sql).toMatch(/organization_member_role[\s\S]*'member'[\s\S]*'admin'/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "organization_memberships"/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "organization_audit_log"/);
  });

  it("backfills customers, kits, and pieces before requiring Organization IDs", () => {
    for (const table of ["sales_leads", "tag_kits", "tags"]) {
      expect(sql).toMatch(new RegExp(`UPDATE "${table}"[\\s\\S]*ALTER TABLE "${table}" ALTER COLUMN "organization_id" SET NOT NULL`));
    }
  });
});
