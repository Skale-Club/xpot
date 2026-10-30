// Which part of the app a screen belongs to drives the whole shell: the sidebar
// lists that module only, the top bar names it, the accent colour follows it. A
// wrong answer puts a Tags screen under Visits again (docs/MODULES.md).

import { describe, expect, it } from "vitest";
import {
  VISITS_TAB_ORDER,
  accountGroups,
  accountSection,
  activeVisitsTab,
  administrationItems,
  contextOfPath,
  moduleGroups,
  managementGroups,
  organizationPanelGroups,
  paletteExtras,
  platformItems,
  repScreenFor,
  visitsAdminSection,
  visitsScreen,
} from "../client/src/components/xpot/moduleNav";
import { tabs } from "../client/src/pages/xpot/utils";

const labels = { shell: (k: string) => k, tags: (k: string) => k, nav: (k: string) => k } as never;
const rep = { canManage: false, isAdmin: false };
const manager = { canManage: true, isAdmin: false };
const admin = { canManage: true, isAdmin: true };
const hrefs = (groups: ReturnType<typeof moduleGroups>) => groups.flatMap((g) => g.items.map((i) => i.href));
const panelNames = { home: "Home", tags: "Operations", visits: "Visits", team: "People", system: "Settings" };

describe("dedicated management navigation", () => {
  it("keeps personal work screens out of the panel", () => {
    const groups = managementGroups(["visits", "tags"], admin, labels, panelNames);
    const paths = hrefs(groups);
    expect(paths).toContain("/admin/tags/production");
    expect(paths).toContain("/admin/work/leads");
    expect(paths).not.toContain("/tags");
    expect(paths).not.toContain("/dashboard");
    expect(paths).not.toContain("/settings");
    expect(groups.find((group) => group.label === "Settings")?.collapsible).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
    expect(groups.flatMap((group) => group.items).filter((item) => item.match("/admin")).map((item) => item.href)).toEqual(["/admin"]);
  });
  it("keeps global tools out of a manager's panel and every panel out of a rep's navigation", () => {
    const paths = hrefs(managementGroups(["visits", "tags"], manager, labels, panelNames));
    expect(paths).toContain("/admin/tags/pieces");
    for (const path of ["/admin/tags/production", "/admin/tags/provisioners", "/admin/integrations", "/admin/branding", "/admin/health"]) expect(paths).not.toContain(path);
    expect(managementGroups(["visits", "tags"], rep, labels, panelNames)).toEqual([]);
  });
  it("has one place for people: People and Organizations, no Resellers destination", () => {
    const groups = managementGroups(["visits", "tags"], admin, labels, panelNames);
    expect(groups.find((group) => group.label === "People")?.items.map((item) => item.href)).toEqual(["/admin/reps", "/organizations"]);
    expect(hrefs(groups)).not.toContain("/admin/tags/team");
  });
  it("gives organization admins their scoped team tools without global setup", () => {
    expect(hrefs(organizationPanelGroups(["visits", "tags"], labels))).toEqual(["/organizations", "/admin/work/leads", "/admin/work/tasks", "/admin/work/sales"]);
    expect(hrefs(organizationPanelGroups(["tags"], labels))).toEqual(["/organizations"]);
  });
});

describe("contextOfPath", () => {
  it("puts the field screens in Visits", () => {
    for (const p of ["/dashboard", "/route", "/visits", "/visits/12", "/leads/3", "/prospecting", "/sales/stock", "/check-in"]) expect(contextOfPath(p)).toBe("visits");
  });
  it("puts the reseller app and the Tags management in Tags", () => {
    for (const p of ["/tags", "/tags/customers", "/tags/pieces/ABC", "/admin/tags", "/admin/tags/batches/x"]) expect(contextOfPath(p)).toBe("tags");
  });
  it("puts the Visits management in Visits, not in an Admin of its own", () => {
    for (const p of ["/admin", "/admin/overview", "/admin/products", "/admin/settings"]) expect(contextOfPath(p)).toBe("visits");
  });
  it("puts settings, Administration and Platform in the account", () => {
    // Xphere is an account integration; its old URL opens Integrations.
    for (const p of ["/settings", "/organizations", "/organizations/4", "/admin/reps", "/admin/integrations", "/admin/branding", "/admin/landing", "/admin/xphere", "/admin/health"]) expect(contextOfPath(p)).toBe("account");
  });
  it("does not mistake a prefix for a section", () => {
    expect(contextOfPath("/tagsx")).toBe("visits");
    expect(visitsAdminSection("/admin/settingsx")).toBeNull();
    expect(visitsAdminSection("/admin")).toBe("overview");
  });
});

describe("accountSection", () => {
  it("splits the account into Settings, Administration and Platform", () => {
    expect(accountSection("/settings")).toBe("settings");
    for (const p of ["/admin/reps", "/organizations", "/organizations/3"]) expect(accountSection(p)).toBe("administration");
    for (const p of ["/admin/integrations", "/admin/xphere", "/admin/branding", "/admin/landing", "/admin/health/runs"]) expect(accountSection(p)).toBe("platform");
    for (const p of ["/dashboard", "/admin/overview", "/admin/tags"]) expect(accountSection(p)).toBeNull();
  });
});

describe("visitsScreen", () => {
  it("names the history Visits and the active visit Visit, apart from Route and Dashboard", () => {
    expect(visitsScreen("/dashboard")).toBe("dashboard");
    expect(visitsScreen("/dashboard/history")).toBe("visits");
    expect(visitsScreen("/dashboard/history/12")).toBe("visits");
    expect(visitsScreen("/visits/12")).toBe("visits");
    expect(visitsScreen("/route/check-in")).toBe("visit");
    expect(visitsScreen("/check-in")).toBe("visit");
    for (const p of ["/route", "/prospecting", "/leads/prospecting/4", "/leads/prospects"]) expect(visitsScreen(p)).toBe("route");
    expect(visitsScreen("/leads/9")).toBe("leads");
    expect(visitsScreen("/admin/products")).toBe("manage");
    expect(visitsScreen("/somewhere")).toBe("dashboard");
  });

  it("lights Route on the phone only for the route itself", () => {
    expect(activeVisitsTab("/route")).toBe("route");
    expect(activeVisitsTab("/route/check-in")).toBeNull();
    expect(activeVisitsTab("/dashboard/history")).toBe("dashboard");
    expect(activeVisitsTab("/admin/overview")).toBe("manage");
    expect(activeVisitsTab("/sales/stock/3")).toBe("sales");
  });
});

describe("moduleGroups", () => {
  it("keeps production and legacy batch URLs in one navigation entry", () => {
    const items = moduleGroups("tags", admin, labels)[1].items;
    for (const path of ["/admin/tags/production", "/admin/tags/production/batches/id", "/admin/tags/batches/id"]) {
      expect(items.filter((item) => item.match(path)).map((item) => item.href)).toEqual(["/admin/tags/production"]);
    }
    expect(items.some((item) => item.href === "/admin/tags/batches")).toBe(false);
  });
  it("an open piece keeps My pieces selected, not the dashboard", () => {
    const [work] = moduleGroups("tags", rep, labels);
    const active = (path: string) => work.items.filter((item) => item.match(path)).map((item) => item.href);
    expect(active("/tags/t/A7K3P9X2")).toEqual(["/tags/pieces"]);
    expect(active("/tags/pieces/A7K3P9X2")).toEqual(["/tags/pieces"]);
    expect(active("/tags")).toEqual(["/tags"]);
    expect(active("/tags/direct")).toEqual(["/tags"]);
  });
  it("the Shop is a screen of its own in the rep's Tags menu", () => {
    const [work] = moduleGroups("tags", rep, labels);
    expect(work.items.map((item) => item.href)).toEqual(["/tags", "/tags/customers", "/tags/pieces", "/tags/shop"]);
    expect(work.items.filter((item) => item.match("/tags/shop")).map((item) => item.href)).toEqual(["/tags/shop"]);
  });
  it("a rep sees the module's screens and no Manage group", () => {
    expect(moduleGroups("tags", rep, labels)).toHaveLength(1);
    expect(hrefs(moduleGroups("visits", rep, labels))).toEqual(["/dashboard", "/route", "/leads", "/dashboard/history", "/tasks", "/sales"]);
  });
  it("the sidebar and the phone tab bar list Visits in the same order (the bar leaves Visits to the Dashboard)", () => {
    const sidebar = hrefs(moduleGroups("visits", rep, labels)).map((href) => href.slice(1));
    expect(tabs.map((tab) => tab.id)).toEqual([...VISITS_TAB_ORDER]);
    expect(sidebar.filter((id) => (VISITS_TAB_ORDER as readonly string[]).includes(id))).toEqual([...VISITS_TAB_ORDER]);
  });
  it("lights exactly one Visits item per screen", () => {
    const [work] = moduleGroups("visits", rep, labels);
    const active = (path: string) => work.items.filter((item) => item.match(path)).map((item) => item.href);
    expect(active("/dashboard")).toEqual(["/dashboard"]);
    expect(active("/dashboard/history/4")).toEqual(["/dashboard/history"]);
    expect(active("/route/check-in")).toEqual(["/dashboard/history"]);
    expect(active("/route")).toEqual(["/route"]);
    expect(active("/admin/reps")).toEqual([]);
  });
  it("a manager gets each module's own management, without the global admin's items", () => {
    const tags = hrefs(moduleGroups("tags", manager, labels));
    expect(tags).toEqual(expect.arrayContaining(["/admin/tags/overview", "/admin/tags/pieces", "/admin/tags/kits"]));
    expect(tags).not.toContain("/admin/tags/team");
    for (const href of ["/admin/tags/production", "/admin/tags/batches", "/admin/tags/shop", "/admin/tags/journey", "/admin/tags/provisioners"]) expect(tags).not.toContain(href);
    const visits = hrefs(moduleGroups("visits", manager, labels));
    expect(visits).toEqual(expect.arrayContaining(["/admin/overview", "/admin/products", "/admin/settings"]));
    expect(visits).not.toContain("/admin/xphere");
    expect(visits.some((h) => h.startsWith("/admin/tags"))).toBe(false);
  });
  it("orders Tags › Manage along a piece's life", () => {
    expect(moduleGroups("tags", admin, labels)[1].items.map((i) => i.href)).toEqual([
      "/admin/tags/overview",
      "/admin/tags/production",
      "/admin/tags/pieces",
      "/admin/tags/kits",
      "/admin/tags/shop",
      "/admin/tags/journey",
      "/admin/tags/provisioners",
    ]);
  });
  it("the global admin sees everything, and exactly those extra items carry the Xpot admin tag", () => {
    const extra = (m: "visits" | "tags") =>
      moduleGroups(m, admin, labels).flatMap((g) => g.items).filter((i) => i.adminOnly).map((i) => i.href);
    expect(extra("tags")).toEqual(["/admin/tags/production", "/admin/tags/shop", "/admin/tags/journey", "/admin/tags/provisioners"]);
    expect(extra("visits")).toEqual([]);
    // Platform is the Xpot admin's as a whole: one tag on the group, none on its items.
    expect(accountGroups(admin, labels).map((g) => Boolean(g.adminOnly))).toEqual([false, true]);
    expect([...administrationItems(labels), ...platformItems(labels)].some((i) => i.adminOnly)).toBe(false);
  });
  it("every Manage link stays in its own module", () => {
    for (const m of ["visits", "tags"] as const) {
      for (const href of hrefs(moduleGroups(m, admin, labels))) expect(contextOfPath(href)).toBe(m);
    }
  });
});

describe("accountGroups", () => {
  it("Administration for managers in management mode, Platform for the Xpot admin only", () => {
    expect(accountGroups(rep, labels)).toEqual([]);
    expect(accountGroups(manager, labels).map((g) => [g.label, g.items.map((i) => i.href)])).toEqual([
      ["navOrganization", ["/admin/reps", "/organizations"]],
    ]);
    expect(accountGroups(admin, labels).map((g) => [g.label, g.items.map((i) => i.href)])).toEqual([
      ["navOrganization", ["/admin/reps", "/organizations"]],
      ["navPlatform", ["/admin/integrations", "/admin/branding", "/admin/health"]],
    ]);
  });
  it("keeps every account link in the account, the old URLs lit under their new item", () => {
    for (const item of [...administrationItems(labels), ...platformItems(labels)]) expect(contextOfPath(item.href)).toBe("account");
    const lit = (path: string) => platformItems(labels).filter((i) => i.match(path)).map((i) => i.href);
    expect(lit("/admin/xphere")).toEqual(["/admin/integrations"]);
    expect(lit("/admin/landing")).toEqual(["/admin/branding"]);
    expect(lit("/admin/health/runs/3")).toEqual(["/admin/health"]);
  });
  it("the palette also offers the visit, a plain chip and the landing page editor", () => {
    expect(paletteExtras("visits", labels).map((i) => i.href)).toEqual(["/route/check-in"]);
    expect(paletteExtras("tags", labels).map((i) => i.href)).toEqual(["/tags/direct"]);
    expect(paletteExtras("platform", labels).map((i) => i.href)).toEqual(["/admin/landing"]);
  });
});

describe("repScreenFor", () => {
  it("leaving management lands on the same module's rep screen", () => {
    expect(repScreenFor("/admin/tags/pieces/12", "/x")).toBe("/tags/pieces");
    expect(repScreenFor("/admin/tags/kits", "/x")).toBe("/tags");
    expect(repScreenFor("/admin/tags/shop", "/x")).toBe("/tags/shop");
    expect(repScreenFor("/admin/tags", "/x")).toBe("/tags");
    expect(repScreenFor("/admin/products", "/x")).toBe("/sales");
    expect(repScreenFor("/admin/overview", "/x")).toBe("/dashboard");
    expect(repScreenFor("/admin", "/x")).toBe("/dashboard");
    expect(repScreenFor("/admin/reps", "/route")).toBe("/route");
    expect(repScreenFor("/admin/integrations", "/tags")).toBe("/tags");
  });
});
