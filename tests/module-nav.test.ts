// Which part of the app a screen belongs to drives the whole shell: the sidebar
// lists that module only, the top bar names it, the accent colour follows it. A
// wrong answer puts a Tags screen under Visits again (docs/MODULES.md).

import { describe, expect, it } from "vitest";
import {
  VISITS_TAB_ORDER,
  activeVisitsTab,
  contextOfPath,
  moduleGroups,
  panelGroups,
  panelPhoneTabs,
  paletteExtras,
  platformItems,
  visitsAdminSection,
  visitsScreen,
  type PanelNames,
} from "../client/src/components/xpot/moduleNav";
import type { Profile } from "../shared/profiles";
import { shellMessages } from "../client/src/i18n/messages/shell";
import { tagsMessages } from "../client/src/i18n/messages/tags";
import { workspacesMessages } from "../client/src/i18n/messages/workspaces";
import { tabs } from "../client/src/pages/xpot/utils";

const labels = { shell: (k: string) => k, tags: (k: string) => k, nav: (k: string) => k } as never;
const rep = { canManage: false, isAdmin: false };
const manager = { canManage: true, isAdmin: false };
const admin = { canManage: true, isAdmin: true };
const hrefs = (groups: ReturnType<typeof moduleGroups>) => groups.flatMap((g) => g.items.map((i) => i.href));
const panelNames: PanelNames = {
  today: "Today", platform: "Platform", company: "My company", make: "Make", pieces: "Pieces", field: "Field", administration: "Administration",
  team: "Team", companies: "My companies", stock: "Stock", kits: "Hand out", purchases: "Team purchases", tagsOverview: "Pieces results",
};
const both = ["visits", "tags"] as const;
const groupsOf = (profile: Profile | null, modules: readonly ("visits" | "tags")[] = both, organizationId: number | null = 7) => panelGroups(profile, modules, labels, panelNames, organizationId);
const labelsOf = (groups: ReturnType<typeof panelGroups>) => groups.map((g) => g.label);
const itemHrefs = (groups: ReturnType<typeof panelGroups>, label: string) => groups.find((g) => g.label === label)?.items.map((i) => i.href);

describe("one panel per profile", () => {
  it("gives a member no panel at all", () => {
    expect(groupsOf("member")).toEqual([]);
    expect(groupsOf(null)).toEqual([]);
  });

  it("gives an owner Today and Team, then Pieces and Field, with no Production, no Settings and nothing of the platform", () => {
    const groups = groupsOf("owner");
    expect(labelsOf(groups)).toEqual(["", "Pieces", "Field"]);
    expect(itemHrefs(groups, "")).toEqual(["/admin", "/organizations/7?tab=team"]);
    expect(itemHrefs(groups, "Pieces")).toEqual(["/admin/tags/pieces", "/admin/tags/kits", "/organizations/7?tab=purchases", "/admin/tags/overview"]);
    expect(itemHrefs(groups, "Field")).toEqual(["/admin/work/leads", "/admin/work/tasks", "/admin/work/sales", "/admin/overview"]);
    const all = hrefs(groups);
    for (const href of ["/admin/tags/production", "/admin/tags/provisioners", "/admin/tags/journey", "/admin/tags/shop", "/admin/reps", "/admin/products", "/admin/settings", "/admin/integrations", "/admin/branding", "/admin/health", "/organizations/7?tab=settings"]) expect(all).not.toContain(href);
    expect(groups.some((g) => g.adminOnly)).toBe(false);
    expect(groups.flatMap((g) => g.items).some((i) => i.adminOnly)).toBe(false);
  });

  it("gives a partner the owner's panel plus a Make group in front of the pieces", () => {
    const groups = groupsOf("partner");
    expect(labelsOf(groups)).toEqual(["", "Make", "Pieces", "Field"]);
    expect(itemHrefs(groups, "Make")).toEqual(["/admin/tags/production", "/admin/tags/provisioners"]);
    expect(itemHrefs(groups, "Pieces")).toEqual(itemHrefs(groupsOf("owner"), "Pieces"));
    for (const href of ["/admin/reps", "/admin/integrations", "/admin/tags/shop", "/admin/tags/journey"]) expect(hrefs(groups)).not.toContain(href);
  });

  it("gives the platform its work by task, and Administration collapsible and closed", () => {
    const groups = groupsOf("platform");
    expect(labelsOf(groups)).toEqual(["", "Make", "Pieces", "Field", "Administration"]);
    expect(itemHrefs(groups, "")).toEqual(["/admin"]);
    expect(itemHrefs(groups, "Make")).toEqual(["/admin/tags/production", "/admin/tags/provisioners"]);
    expect(itemHrefs(groups, "Pieces")).toEqual(["/admin/tags/pieces", "/admin/tags/kits", "/admin/tags/overview"]);
    expect(itemHrefs(groups, "Field")).toEqual(["/admin/work/leads", "/admin/work/tasks", "/admin/work/sales", "/admin/overview"]);
    expect(itemHrefs(groups, "Administration")).toEqual([
      "/organizations", "/admin/reps", "/admin/products", "/admin/tags/shop",
      "/admin/integrations", "/admin/branding", "/admin/health", "/admin/settings",
    ]);
    const administration = groups.find((g) => g.label === "Administration")!;
    expect(administration.collapsible).toBe(true);
    expect(administration.defaultOpen).toBeUndefined();
    expect(administration.adminOnly).toBe(true);
    // Only the Administration group carries the tag, not each item.
    expect(groups.flatMap((g) => g.items).some((i) => i.adminOnly)).toBe(false);
    expect(groups.filter((g) => g.collapsible)).toHaveLength(1);
  });

  it("only the platform has Administration items; the other panels never list them", () => {
    const platformOnly = ["/organizations", "/admin/reps", "/admin/products", "/admin/integrations", "/admin/branding", "/admin/health", "/admin/settings", "/admin/tags/shop"];
    for (const profile of ["owner", "partner"] as const) {
      for (const href of platformOnly) expect(hrefs(groupsOf(profile, both, 7))).not.toContain(href);
      // The companies list is Team's door when there is no single workspace to open; nothing else of the platform's is.
      for (const href of platformOnly.filter((h) => h !== "/organizations")) expect(hrefs(groupsOf(profile, both, null))).not.toContain(href);
      expect(labelsOf(groupsOf(profile))).not.toContain("Administration");
    }
    // Without the one workspace to open, an owner of several companies reaches their list as "My companies", with no purchases item to duplicate it.
    const several = groupsOf("owner", both, null);
    expect(several[0].items.map((i) => [i.href, i.label])).toEqual([["/admin", "Today"], ["/organizations", "My companies"]]);
    expect(itemHrefs(several, "Pieces")).toEqual(["/admin/tags/pieces", "/admin/tags/kits", "/admin/tags/overview"]);
  });

  it("follows the modules: no Visits items without Visits, no Tags items without Tags", () => {
    const owner = (modules: readonly ("visits" | "tags")[]) => groupsOf("owner", modules).flatMap((g) => g.items.map((i) => i.href));
    expect(owner(["tags"])).toEqual(["/admin", "/organizations/7?tab=team", "/admin/tags/pieces", "/admin/tags/kits", "/organizations/7?tab=purchases", "/admin/tags/overview"]);
    expect(owner(["visits"])).toEqual(["/admin", "/organizations/7?tab=team", "/admin/work/leads", "/admin/work/tasks", "/admin/work/sales", "/admin/overview"]);
    expect(labelsOf(groupsOf("partner", ["visits"]))).not.toContain("Make");
  });

  it("keeps personal work screens out of every panel and lists each destination once", () => {
    for (const profile of ["platform", "partner", "owner"] as const) {
      const all = hrefs(groupsOf(profile));
      for (const href of ["/tags", "/dashboard", "/settings", "/route"]) expect(all).not.toContain(href);
      expect(new Set(all).size).toBe(all.length);
      expect(groupsOf(profile)[0].items[0].href).toBe("/admin");
    }
  });

  it("gives every item of a panel its own icon", () => {
    for (const profile of ["platform", "partner", "owner"] as const) {
      const icons = groupsOf(profile).flatMap((g) => g.items.map((i) => i.icon));
      expect(new Set(icons).size).toBe(icons.length);
    }
  });

  it("lights one item per screen: Today only on /admin, Production under its batches, Hand out also on the Stuscle orders tab", () => {
    const lit = (profile: Profile, path: string) => groupsOf(profile).flatMap((g) => g.items).filter((i) => i.match(path)).map((i) => i.href);
    expect(lit("owner", "/admin")).toEqual(["/admin"]);
    expect(lit("partner", "/admin/tags/batches/abc")).toEqual(["/admin/tags/production"]);
    expect(lit("platform", "/admin/tags/pieces/abc")).toEqual(["/admin/tags/pieces"]);
    // The Stuscle orders tab is Hand out's own: no second item for it, and Hand out stays lit there.
    expect(lit("platform", "/admin/tags/kits")).toEqual(["/admin/tags/kits"]);
    expect(lit("owner", "/admin/tags/kits")).toEqual(["/admin/tags/kits"]);
    expect(lit("platform", "/admin/xphere")).toEqual(["/admin/integrations"]);
    expect(lit("platform", "/organizations/4")).toEqual(["/organizations"]);
    // A person's page under the workspace belongs to Team; the team's tabs are told apart by ?tab= (read from the address bar in the browser).
    expect(lit("owner", "/organizations/7/people/3")).toEqual(["/organizations/7?tab=team"]);
    expect(lit("owner", "/admin/work/leads/4")).toEqual(["/admin/work/leads"]);
  });
});

describe("the phone's bottom bar in the panel", () => {
  const bar = (profile: Profile, organizationId: number | null = 7) => {
    const { tabs: picked, more } = panelPhoneTabs(groupsOf(profile, both, organizationId), profile);
    return { tabs: picked.map((i) => i.label), more: more.flatMap((g) => g.items.map((i) => i.label)) };
  };
  it("is Today and the four screens used most, and More holds all the rest, nothing twice", () => {
    expect(bar("owner").tabs).toEqual(["Today", "Stock", "Hand out", "Team"]);
    // (This test's labels are the message keys: manageProduction is "Production".)
    expect(bar("partner").tabs).toEqual(["Today", "manageProduction", "Stock", "Hand out"]);
    expect(bar("platform").tabs).toEqual(["Today", "manageProduction", "Stock", "Hand out"]);
    expect(bar("owner", null).tabs).toEqual(["Today", "Stock", "Hand out", "My companies"]);
    for (const profile of ["owner", "partner", "platform"] as const) {
      const { tabs: picked, more } = bar(profile);
      const all = groupsOf(profile).flatMap((g) => g.items.map((i) => i.label));
      expect([...picked, ...more].sort()).toEqual([...all].sort());
    }
  });
  it("fills the bar from the next screens when the usual ones are missing (an owner with only Visits)", () => {
    const owner = panelPhoneTabs(groupsOf("owner", ["visits"]), "owner").tabs.map((i) => i.href);
    expect(owner).toEqual(["/admin", "/organizations/7?tab=team", "/admin/work/leads", "/admin/work/tasks"]);
  });
});

describe("one name per screen", () => {
  // The real words, in every language: a name that repeats in one panel is two doors that look like one.
  for (const lang of ["en", "pt", "es"] as const) {
    const shell = shellMessages[lang] as Record<string, string>;
    const tagsText = tagsMessages[lang] as Record<string, string>;
    const ws = workspacesMessages[lang] as Record<string, string>;
    const real = {
      shell: (k: string) => shell[k] ?? k,
      tags: (k: string) => tagsText[k] ?? k,
      nav: (k: string) => k,
    } as never;
    const names: PanelNames = {
      today: ws.todayTitle, platform: ws.panelPlatform, company: ws.panelCompany, make: ws.groupMake, pieces: ws.groupPieces, field: ws.groupField, administration: ws.groupAdministration,
      team: ws.panelTeam, companies: ws.panelCompanies, stock: ws.panelStock, kits: ws.panelKits, purchases: ws.panelPurchases, tagsOverview: ws.panelTagsOverview,
    };
    for (const profile of ["platform", "partner", "owner"] as const) {
      it(`${profile} (${lang}): no label repeats in the panel, and no group is named like an item`, () => {
        const groups = panelGroups(profile, both, real, names, 7);
        const labels = groups.flatMap((g) => g.items.map((i) => i.label));
        expect(labels.filter((label, i) => labels.indexOf(label) !== i)).toEqual([]);
        expect(labels.every(Boolean)).toBe(true);
        for (const group of groups) expect(labels).not.toContain(group.label);
      });
    }
    it(`${lang}: the panel is not called Production, and the panel names differ`, () => {
      expect(ws.panelCompany).not.toBe(ws.panelPlatform);
      expect(ws.panelCompanies).not.toBe(ws.panelCompany);
      expect(ws.panelCompany.toLowerCase()).not.toContain("produ");
    });
    it(`${lang}: a screen has the same name in the panel and in the Tags module`, () => {
      const tagsManage = moduleGroups("tags", admin, real)[1].items;
      const byHref = new Map(tagsManage.map((i) => [i.href, i.label]));
      const panel = panelGroups("platform", both, real, names, 7).flatMap((g) => g.items);
      for (const href of ["/admin/tags/production", "/admin/tags/pieces", "/admin/tags/kits", "/admin/tags/overview", "/admin/tags/journey", "/admin/tags/provisioners"]) {
        expect(panel.find((i) => i.href === href)?.label).toBe(byHref.get(href));
      }
    });
    it(`${lang}: the visit history is History, not the module's name`, () => {
      expect(shell.tabVisits).not.toBe(shell.tabDashboard);
      expect(["History", "Histórico", "Historial"]).toContain(shell.tabVisits);
    });
  }
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
  it("puts settings and the platform's own screens in the account", () => {
    // Xphere is an account integration; its old URL opens Integrations.
    for (const p of ["/settings", "/organizations", "/organizations/4", "/admin/reps", "/admin/integrations", "/admin/branding", "/admin/landing", "/admin/xphere", "/admin/health"]) expect(contextOfPath(p)).toBe("account");
  });
  it("does not mistake a prefix for a section", () => {
    expect(contextOfPath("/tagsx")).toBe("visits");
    expect(visitsAdminSection("/admin/settingsx")).toBeNull();
    expect(visitsAdminSection("/admin")).toBe("overview");
  });
});

describe("visitsScreen", () => {
  it("names the history History and the active visit the current visit, apart from Route and Dashboard", () => {
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

  it("lights no phone tab for the history or the visit, and Route only for the route itself", () => {
    expect(activeVisitsTab("/route")).toBe("route");
    expect(activeVisitsTab("/route/check-in")).toBeNull();
    expect(activeVisitsTab("/dashboard/history")).toBeNull();
    expect(activeVisitsTab("/dashboard")).toBe("dashboard");
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
  it("the sidebar and the phone tab bar list Visits in the same order (the bar leaves History to the Dashboard)", () => {
    const sidebar = hrefs(moduleGroups("visits", rep, labels)).map((href) => href.slice(1));
    expect(tabs.map((tab) => tab.id)).toEqual([...VISITS_TAB_ORDER]);
    expect(sidebar.filter((id) => (VISITS_TAB_ORDER as readonly string[]).includes(id))).toEqual([...VISITS_TAB_ORDER]);
  });
  it("lights exactly one Visits item per screen, and none while a visit is open", () => {
    const [work] = moduleGroups("visits", rep, labels);
    const active = (path: string) => work.items.filter((item) => item.match(path)).map((item) => item.href);
    expect(active("/dashboard")).toEqual(["/dashboard"]);
    expect(active("/dashboard/history/4")).toEqual(["/dashboard/history"]);
    expect(active("/route/check-in")).toEqual([]);
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
    // The platform's own screens carry the tag once, on the group's heading: none on its items.
    expect(platformItems(labels).some((i) => i.adminOnly)).toBe(false);
  });
  it("every Manage link stays in its own module", () => {
    for (const m of ["visits", "tags"] as const) {
      for (const href of hrefs(moduleGroups(m, admin, labels))) expect(contextOfPath(href)).toBe(m);
    }
  });
});

describe("the platform's own screens", () => {
  it("keeps every link in the account, the old URLs lit under their new item", () => {
    for (const item of platformItems(labels)) expect(contextOfPath(item.href)).toBe("account");
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
