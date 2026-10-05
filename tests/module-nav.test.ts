// Which part of the app a screen belongs to drives the whole shell: the sidebar
// lists that module only, the top bar names it, the accent colour follows it. A
// wrong answer puts a Tags screen under Visits again (docs/MODULES.md).

import { describe, expect, it } from "vitest";
import { contextOfPath, moduleGroups, organizationItems, visitsAdminSection } from "../client/src/components/xpot/moduleNav";

const labels = { shell: (k: string) => k, tags: (k: string) => k } as never;
const rep = { canManage: false, isAdmin: false, isComputer: false };
const manager = { canManage: true, isAdmin: false, isComputer: true };
const admin = { canManage: true, isAdmin: true, isComputer: true };
const hrefs = (groups: ReturnType<typeof moduleGroups>) => groups.flatMap((g) => g.items.map((i) => i.href));

describe("contextOfPath", () => {
  it("puts the field screens in Visits", () => {
    for (const p of ["/dashboard", "/visits", "/visits/12", "/leads/3", "/sales/stock", "/check-in"]) expect(contextOfPath(p)).toBe("visits");
  });
  it("puts the reseller app and the Tags management in Tags", () => {
    for (const p of ["/tags", "/tags/pieces/ABC", "/admin/tags", "/admin/tags/batches/x"]) expect(contextOfPath(p)).toBe("tags");
  });
  it("puts the Visits management in Visits, not in an Admin of its own", () => {
    for (const p of ["/admin", "/admin/overview", "/admin/products", "/admin/settings", "/admin/xphere"]) expect(contextOfPath(p)).toBe("visits");
  });
  it("puts settings and the organization in the account", () => {
    for (const p of ["/settings", "/admin/reps", "/admin/integrations", "/admin/branding"]) expect(contextOfPath(p)).toBe("account");
  });
  it("does not mistake a prefix for a section", () => {
    expect(contextOfPath("/tagsx")).toBe("visits");
    expect(visitsAdminSection("/admin/settingsx")).toBeNull();
    expect(visitsAdminSection("/admin")).toBe("overview");
  });
});

describe("moduleGroups", () => {
  it("a rep sees the module's screens and no Manage group", () => {
    expect(moduleGroups("tags", rep, labels)).toHaveLength(1);
    expect(hrefs(moduleGroups("visits", rep, labels))).toContain("/check-in");
  });
  it("a computer cannot start a check-in", () => {
    expect(hrefs(moduleGroups("visits", manager, labels))).not.toContain("/check-in");
  });
  it("a manager gets each module's own management, and the Journey stays admin-only", () => {
    const tags = hrefs(moduleGroups("tags", manager, labels));
    expect(tags).toEqual(expect.arrayContaining(["/admin/tags/pieces", "/admin/tags/batches", "/admin/tags/kits"]));
    expect(tags).not.toContain("/admin/tags/journey");
    expect(hrefs(moduleGroups("tags", admin, labels))).toContain("/admin/tags/journey");
    const visits = hrefs(moduleGroups("visits", manager, labels));
    expect(visits).toEqual(expect.arrayContaining(["/admin/overview", "/admin/products", "/admin/settings"]));
    expect(visits.some((h) => h.startsWith("/admin/tags"))).toBe(false);
  });
  it("every Manage link stays in its own module", () => {
    for (const m of ["visits", "tags"] as const) {
      for (const href of hrefs(moduleGroups(m, admin, labels))) expect(contextOfPath(href)).toBe(m);
    }
    for (const item of organizationItems(labels)) expect(contextOfPath(item.href)).toBe("account");
  });
});
