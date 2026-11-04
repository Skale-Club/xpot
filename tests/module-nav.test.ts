// Which part of the app a screen belongs to drives the whole shell: the sidebar
// lists that module only, the top bar names it, the accent colour follows it. A
// wrong answer puts a Tags screen under Visits again (docs/MODULES.md).

import { describe, expect, it, vi } from "vitest";
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
import { panelOfPath, type Panel } from "../client/src/components/xpot/panels";
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
  today: "Today", companiesGroup: "Companies", platformGroup: "Platform", pieces: "Pieces", operation: "Operation",
  make: "Make", models: "Models", customers: "Customers",
  team: "Team", companies: "My companies", stock: "Stock", kits: "Distribution", tagsOverview: "Pieces results",
  company: "Company", companyOverview: "Overview", companyPieces: "Pieces", companyKits: "Give and take back", companyPurchases: "Purchases",
  companyResults: "Results", companyTeamResults: "Team results", companyCustomers: "Team customers", companyTasks: "Team tasks", companySales: "Team sales",
};
const both = ["visits", "tags"] as const;
const groupsOf = (profile: Profile | null, panel: Panel, modules: readonly ("visits" | "tags")[] = both, organizationId: number | null = 7) => panelGroups(profile, panel, modules, labels, panelNames, organizationId);
const labelsOf = (groups: ReturnType<typeof panelGroups>) => groups.map((g) => g.label);
const itemHrefs = (groups: ReturnType<typeof panelGroups>, label: string) => groups.find((g) => g.label === label)?.items.map((i) => i.href);
/** The items a path lights, with the address bar's query stubbed (the menu reads ?view= and ?tab= from it). */
const lit = (groups: ReturnType<typeof panelGroups>, path: string, search = "") => {
  vi.stubGlobal("window", { location: { search } });
  try { return groups.flatMap((g) => g.items).filter((i) => i.match(path)).map((i) => i.href); } finally { vi.unstubAllGlobals(); }
};

describe("the menu of each panel", () => {
  it("gives a member no panel at all, and Visits is not a menu of this kind", () => {
    for (const panel of ["admin", "production", "visits"] as const) expect(groupsOf("member", panel)).toEqual([]);
    expect(groupsOf(null, "admin")).toEqual([]);
    expect(groupsOf("platform", "visits")).toEqual([]);
    expect(groupsOf("partner", "visits")).toEqual([]);
  });

  it("gives an owner one group, Company, every screen the owner's panel had and nothing of Production or the platform", () => {
    const groups = groupsOf("owner", "visits");
    expect(labelsOf(groups)).toEqual(["Company"]);
    expect(groups[0].items.map((i) => [i.href, i.label])).toEqual([
      ["/admin", "Overview"],
      ["/organizations/7?tab=team", "Team"],
      ["/admin/tags/pieces", "Pieces"],
      ["/admin/tags/kits", "Give and take back"],
      ["/organizations/7?tab=purchases", "Purchases"],
      ["/admin/tags/overview", "Results"],
      ["/admin/overview", "Team results"],
      ["/admin/work/leads", "Team customers"],
      ["/admin/work/tasks", "Team tasks"],
      ["/admin/work/sales", "Team sales"],
    ]);
    const all = hrefs(groups);
    for (const href of ["/admin/tags/production", "/admin/tags/provisioners", "/admin/tags/journey", "/admin/tags/shop", "/admin/reps", "/admin/products", "/admin/settings", "/admin/integrations", "/admin/branding", "/admin/health", "/organizations/7?tab=settings"]) expect(all).not.toContain(href);
    expect(groups.some((g) => g.adminOnly)).toBe(false);
    expect(groups.flatMap((g) => g.items).some((i) => i.adminOnly)).toBe(false);
    // The owner has no panel of their own: whatever panel the shell passes, the group is the same.
    for (const panel of ["admin", "production"] as const) expect(groupsOf("owner", panel).map((g) => g.items.map((i) => i.href))).toEqual(groups.map((g) => g.items.map((i) => i.href)));
  });

  it("gives an owner of several companies the list of them as Team, with no purchases item to duplicate it", () => {
    const several = groupsOf("owner", "visits", both, null);
    expect(several[0].items.map((i) => [i.href, i.label])).toEqual([
      ["/admin", "Overview"], ["/organizations", "My companies"], ["/admin/tags/pieces", "Pieces"], ["/admin/tags/kits", "Give and take back"],
      ["/admin/tags/overview", "Results"], ["/admin/overview", "Team results"], ["/admin/work/leads", "Team customers"], ["/admin/work/tasks", "Team tasks"], ["/admin/work/sales", "Team sales"],
    ]);
  });

  it("gives only an owner the Company group: a member, a partner and the platform's panels have none", () => {
    const company = (groups: ReturnType<typeof panelGroups>) => groups.some((g) => g.label === "Company");
    for (const panel of ["admin", "production", "visits"] as const) {
      expect(company(groupsOf("member", panel)), `member ${panel}`).toBe(false);
      expect(company(groupsOf("partner", panel)), `partner ${panel}`).toBe(false);
      expect(company(groupsOf("platform", panel)), `platform ${panel}`).toBe(false);
    }
    // None of the owner's team-named screens turn up in anyone else's menu.
    const teamNamed = ["Team customers", "Team tasks", "Team sales", "Team results", "Give and take back", "Overview"];
    for (const [profile, panel] of [["platform", "admin"], ["platform", "production"], ["partner", "production"]] as const) {
      const labels = groupsOf(profile, panel).flatMap((g) => g.items.map((i) => i.label));
      for (const label of teamNamed) expect(labels, `${profile} ${panel}`).not.toContain(label);
    }
  });

  it("gives the platform's Admin Today, Companies and Platform, with Tasks, Sales and Stuscle orders out of the menu", () => {
    const groups = groupsOf("platform", "admin");
    expect(labelsOf(groups)).toEqual(["", "Companies", "Platform"]);
    expect(itemHrefs(groups, "")).toEqual(["/admin"]);
    expect(itemHrefs(groups, "Companies")).toEqual(["/organizations", "/admin/reps", "/admin/work/leads", "/admin/overview"]);
    expect(itemHrefs(groups, "Platform")).toEqual([
      "/admin/products", "/admin/tags/shop", "/admin/integrations", "/admin/branding", "/admin/health", "/admin/settings", "/admin/tags/journey",
    ]);
    const all = hrefs(groups);
    for (const href of ["/admin/work/tasks", "/admin/work/sales", "/admin/tags/production", "/admin/tags/pieces", "/admin/tags/provisioners", "/admin/tags/kits", "/admin/tags/kits?view=orders"]) expect(all).not.toContain(href);
    // The whole panel is the platform's: no group is collapsed or tagged, and no item carries the tag either.
    expect(groups.some((g) => g.collapsible || g.adminOnly)).toBe(false);
    expect(groups.flatMap((g) => g.items).some((i) => i.adminOnly)).toBe(false);
  });

  it("gives the platform's Production the pieces and the operation, with its own Models", () => {
    const groups = groupsOf("platform", "production");
    expect(labelsOf(groups)).toEqual(["Pieces", "Operation"]);
    expect(itemHrefs(groups, "Pieces")).toEqual(["/admin/tags/production", "/admin/tags/pieces", "/admin/tags/kits", "/admin/tags/overview"]);
    // No Team for the platform yet: its own operation is the Organizations screen in Admin.
    expect(itemHrefs(groups, "Operation")).toEqual(["/admin/tags/provisioners", "/admin/tags/production/models"]);
    expect(groups.flatMap((g) => g.items).some((i) => i.adminOnly)).toBe(false);
    expect(hrefs(groups)).not.toContain("/admin");
  });

  it("gives a partner's Production its team in the operation, no Models, and nothing of Admin or the field", () => {
    const groups = groupsOf("partner", "production");
    expect(labelsOf(groups)).toEqual(["Pieces", "Operation"]);
    expect(itemHrefs(groups, "Pieces")).toEqual(itemHrefs(groupsOf("platform", "production"), "Pieces"));
    expect(itemHrefs(groups, "Operation")).toEqual(["/organizations/7?tab=team", "/admin/tags/provisioners"]);
    for (const href of ["/admin", "/admin/reps", "/admin/integrations", "/admin/tags/shop", "/admin/tags/journey", "/admin/tags/production/models", "/admin/work/leads", "/admin/work/tasks", "/admin/work/sales", "/admin/overview"]) expect(hrefs(groups)).not.toContain(href);
    // A partner has no Admin panel at all.
    expect(groupsOf("partner", "admin")).toEqual([]);
    // Someone who runs several companies reaches their list through Team.
    expect(groupsOf("partner", "production", both, null)[1].items.map((i) => [i.href, i.label])).toEqual([["/organizations", "My companies"], ["/admin/tags/provisioners", "manageWriters"]]);
  });

  it("keeps Production to the platform and partners, and Admin to the platform", () => {
    expect(groupsOf("platform", "production")).not.toEqual([]);
    expect(hrefs(groupsOf("owner", "production"))).toEqual(hrefs(groupsOf("owner", "visits")));
    expect(groupsOf("partner", "admin")).toEqual([]);
  });

  it("follows the modules: no Visits items without Visits, no Tags items without Tags", () => {
    const admin = (modules: readonly ("visits" | "tags")[]) => hrefs(groupsOf("platform", "admin", modules));
    expect(admin(["tags"])).toEqual(["/admin", "/organizations", "/admin/reps", "/admin/tags/shop", "/admin/integrations", "/admin/branding", "/admin/health", "/admin/tags/journey"]);
    expect(admin(["visits"])).toEqual(["/admin", "/organizations", "/admin/reps", "/admin/work/leads", "/admin/overview", "/admin/products", "/admin/integrations", "/admin/branding", "/admin/health", "/admin/settings"]);
    expect(groupsOf("platform", "production", ["visits"])).toEqual([]);
    expect(hrefs(groupsOf("partner", "production", ["tags"]))).toContain("/admin/tags/production");
    const owner = (modules: readonly ("visits" | "tags")[]) => hrefs(groupsOf("owner", "visits", modules));
    expect(owner(["tags"])).toEqual(["/admin", "/organizations/7?tab=team", "/admin/tags/pieces", "/admin/tags/kits", "/organizations/7?tab=purchases", "/admin/tags/overview"]);
    expect(owner(["visits"])).toEqual(["/admin", "/organizations/7?tab=team", "/admin/overview", "/admin/work/leads", "/admin/work/tasks", "/admin/work/sales"]);
  });

  it("keeps personal work screens out of every panel and lists each destination once", () => {
    for (const [profile, panel] of [["platform", "admin"], ["platform", "production"], ["partner", "production"], ["owner", "visits"]] as const) {
      const all = hrefs(groupsOf(profile, panel));
      for (const href of ["/tags", "/dashboard", "/settings", "/route"]) expect(all).not.toContain(href);
      expect(new Set(all).size).toBe(all.length);
    }
    expect(groupsOf("platform", "admin")[0].items[0].href).toBe("/admin");
    expect(groupsOf("owner", "visits")[0].items[0].href).toBe("/admin");
  });

  it("gives every item of a panel its own icon", () => {
    for (const [profile, panel] of [["platform", "admin"], ["platform", "production"], ["partner", "production"], ["owner", "visits"]] as const) {
      const icons = groupsOf(profile, panel).flatMap((g) => g.items.map((i) => i.icon));
      expect(new Set(icons).size).toBe(icons.length);
    }
  });

  it("sends every item of a panel to a path that panel owns (so a click never changes panel)", () => {
    for (const profile of ["platform", "partner"] as const) {
      for (const panel of ["admin", "production"] as const) {
        for (const href of hrefs(groupsOf(profile, panel))) {
          if (panel === "admin" || profile === "platform") expect(panelOfPath(href, profile), `${profile} ${panel} ${href}`).toBe(panel);
        }
      }
    }
    // A partner's team lives in its production; the platform's is in Admin.
    expect(panelOfPath("/organizations/7?tab=team", "partner")).toBe("production");
  });

  it("lights one item per screen: Make only on the board and its sub-views, Printing and Models on their own", () => {
    const production = groupsOf("platform", "production");
    expect(lit(production, "/admin/tags/production")).toEqual(["/admin/tags/production"]);
    for (const path of ["/admin/tags/production/queue", "/admin/tags/production/jobs/9", "/admin/tags/production/batches/12", "/admin/tags/batches/12"]) expect(lit(production, path), path).toEqual(["/admin/tags/production"]);
    expect(lit(production, "/admin/tags/production/printing")).toEqual(["/admin/tags/production"]);
    expect(lit(production, "/admin/tags/production/models")).toEqual(["/admin/tags/production/models"]);
    expect(lit(production, "/admin/tags/production/models/plate")).toEqual(["/admin/tags/production/models"]);
    expect(lit(production, "/admin/tags/pieces/abc")).toEqual(["/admin/tags/pieces"]);
    expect(lit(production, "/admin/tags/overview/chipPending")).toEqual(["/admin/tags/overview"]);
    // A partner has no Models item: a model page opened from its orders lights nothing, rather than the board.
    expect(lit(groupsOf("partner", "production"), "/admin/tags/production/models/plate")).toEqual([]);
    expect(lit(groupsOf("partner", "production"), "/admin/tags/production/jobs/9")).toEqual(["/admin/tags/production"]);
  });

  it("lights Today only on /admin, the old integrations URL under Integrations, and an organization under Organizations", () => {
    const admin = groupsOf("platform", "admin");
    expect(lit(admin, "/admin")).toEqual(["/admin"]);
    expect(lit(admin, "/admin/xphere")).toEqual(["/admin/integrations"]);
    expect(lit(admin, "/organizations/4")).toEqual(["/organizations"]);
    expect(lit(admin, "/admin/work/leads/4")).toEqual(["/admin/work/leads"]);
    // Tasks and Sales still open by URL, with no item of their own.
    expect(lit(admin, "/admin/work/tasks")).toEqual([]);
    expect(lit(admin, "/admin/work/sales/stock/3")).toEqual([]);
  });

  it("keeps Distribution lit in Production whatever its ?view= (Stuscle orders included), and Admin has no item for it", () => {
    const admin = groupsOf("platform", "admin");
    const production = groupsOf("platform", "production");
    for (const search of ["", "?view=handout", "?view=orders"]) {
      expect(lit(production, "/admin/tags/kits", search), search).toEqual(["/admin/tags/kits"]);
      expect(lit(groupsOf("partner", "production"), "/admin/tags/kits", search), search).toEqual(["/admin/tags/kits"]);
      expect(lit(admin, "/admin/tags/kits", search), search).toEqual([]);
    }
  });

  it("lights an owner's Company items on their screens, and only those", () => {
    const owner = groupsOf("owner", "visits");
    expect(lit(owner, "/admin")).toEqual(["/admin"]);
    expect(lit(owner, "/admin/tags/kits")).toEqual(["/admin/tags/kits"]);
    expect(lit(owner, "/admin/tags/kits", "?view=orders")).toEqual(["/admin/tags/kits"]);
    expect(lit(owner, "/admin/tags/pieces/12")).toEqual(["/admin/tags/pieces"]);
    expect(lit(owner, "/admin/tags/overview/chipPending")).toEqual(["/admin/tags/overview"]);
    expect(lit(owner, "/admin/overview")).toEqual(["/admin/overview"]);
    expect(lit(owner, "/organizations/7/people/3")).toEqual(["/organizations/7?tab=team"]);
    expect(lit(owner, "/organizations/7", "?tab=purchases")).toEqual(["/organizations/7?tab=purchases"]);
    expect(lit(owner, "/admin/work/leads/4")).toEqual(["/admin/work/leads"]);
    expect(lit(owner, "/admin/work/tasks")).toEqual(["/admin/work/tasks"]);
    expect(lit(owner, "/admin/work/sales/stock/3")).toEqual(["/admin/work/sales"]);
  });

  it("lights none of the Company items on the person's own Visits and Tags screens, and none of those items on Company screens", () => {
    const owner = groupsOf("owner", "visits");
    for (const path of ["/dashboard", "/route", "/leads/4", "/tasks", "/sales", "/dashboard/history", "/tags", "/tags/pieces", "/tags/t/ABC", "/tags/shop", "/settings"]) expect(lit(owner, path), path).toEqual([]);
    const own = [...moduleGroups("visits", rep, labels), ...moduleGroups("tags", rep, labels)].flatMap((g) => g.items);
    for (const path of ["/admin", "/admin/overview", "/admin/work/leads", "/admin/work/tasks", "/admin/work/sales/stock/3", "/admin/tags/pieces", "/admin/tags/kits", "/admin/tags/overview", "/organizations/7/people/3"]) {
      expect(own.filter((item) => item.match(path)).map((item) => item.href), path).toEqual([]);
    }
  });

  it("sends every Company item to a path the owner's shell tells as Visits, and never names a team 'My team'", () => {
    for (const href of hrefs(groupsOf("owner", "visits"))) expect(panelOfPath(href, "owner"), href).toBe("visits");
    for (const lang of ["en", "pt", "es"] as const) {
      const ws = workspacesMessages[lang] as Record<string, string>;
      for (const text of Object.values(ws)) expect(text).not.toMatch(/my team|minha equipe|mi equipo/i);
    }
  });
});

describe("the phone's bottom bar in a panel", () => {
  const bar = (profile: Profile, panel: Panel, organizationId: number | null = 7) => {
    const { tabs: picked, more } = panelPhoneTabs(groupsOf(profile, panel, both, organizationId), panel);
    return { tabs: picked.map((i) => i.label), more: more.flatMap((g) => g.items.map((i) => i.label)) };
  };
  // (This test's labels are the message keys where the name comes from a dictionary.)
  it("is Admin's Today, Organizations and People, and More holds the rest", () => {
    expect(bar("platform", "admin").tabs).toEqual(["Today", "navOrganizations", "orgPeople"]);
  });
  it("is Production's Make, Stock, Distribution and the next screen", () => {
    expect(bar("platform", "production").tabs).toEqual(["Make", "Stock", "Distribution", "Pieces results"]);
    expect(bar("partner", "production").tabs).toEqual(["Make", "Stock", "Distribution", "Pieces results"]);
  });
  it("holds every screen of the panel exactly once between the bar and More", () => {
    for (const [profile, panel] of [["platform", "admin"], ["platform", "production"], ["partner", "production"]] as const) {
      const { tabs: picked, more } = bar(profile, panel);
      const all = groupsOf(profile, panel).flatMap((g) => g.items.map((i) => i.label));
      expect([...picked, ...more].sort()).toEqual([...all].sort());
    }
  });
  it("fills the bar from the next screens when the usual ones are missing", () => {
    const partner = panelPhoneTabs(groupsOf("partner", "production", ["tags"]), "production").tabs.map((i) => i.href);
    expect(partner).toEqual(["/admin/tags/production", "/admin/tags/pieces", "/admin/tags/kits", "/admin/tags/overview"]);
    const noTags = panelPhoneTabs(groupsOf("platform", "admin", ["visits"]), "admin").tabs.map((i) => i.href);
    expect(noTags).toEqual(["/admin", "/organizations", "/admin/reps"]);
  });
  it("gives an owner no panel bar: the Company group opens from the Visits and Tags bars, whole", () => {
    // The bars list the group's items in a sheet (companyNav.tsx), so the group must carry every screen of the owner's.
    const company = groupsOf("owner", "visits");
    expect(company).toHaveLength(1);
    expect(company[0].items.map((i) => i.label)).toEqual(["Overview", "Team", "Pieces", "Give and take back", "Purchases", "Results", "Team results", "Team customers", "Team tasks", "Team sales"]);
  });
});

describe("one name per screen", () => {
  // The real words, in every language: a name that repeats in one panel is two doors that look like one.
  const PANEL_WORDS = { en: ["Admin", "Production", "Visits"], pt: ["Admin", "Produção", "Visitas"], es: ["Admin", "Producción", "Visitas"] } as const;
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
      today: ws.todayTitle, companiesGroup: ws.groupCompanies, platformGroup: ws.groupPlatform, pieces: ws.groupPieces, operation: ws.groupOperation,
      make: ws.groupMake, models: ws.panelModels, customers: ws.panelCustomers,
      team: ws.panelTeam, companies: ws.panelCompanies, stock: ws.panelStock, kits: ws.panelKits, tagsOverview: ws.panelTagsOverview,
      company: ws.groupCompany, companyOverview: ws.companyOverview, companyPieces: ws.companyPieces, companyKits: ws.companyKits, companyPurchases: ws.companyPurchases,
      companyResults: ws.companyResults, companyTeamResults: ws.companyTeamResults, companyCustomers: ws.companyCustomers, companyTasks: ws.companyTasks, companySales: ws.companySales,
    };
    for (const [profile, panel] of [["platform", "admin"], ["platform", "production"], ["partner", "production"], ["owner", "visits"]] as const) {
      it(`${profile} ${panel} (${lang}): no label repeats in the panel, and no group is named like an item`, () => {
        const groups = panelGroups(profile, panel, both, real, names, 7);
        const labels = groups.flatMap((g) => g.items.map((i) => i.label));
        expect(labels.filter((label, i) => labels.indexOf(label) !== i)).toEqual([]);
        expect(labels.every(Boolean)).toBe(true);
        for (const group of groups) expect(labels).not.toContain(group.label);
      });
    }
    it(`${lang}: the panels are Admin, Production and Visits, and none is named after a company`, () => {
      expect([ws.panelAdmin, ws.panelProduction, ws.panelVisits]).toEqual(PANEL_WORDS[lang]);
      for (const word of [ws.panelAdmin, ws.panelProduction, ws.panelVisits, ws.groupCompany, ws.panelCompanies]) expect(word).not.toContain("Skale");
    });
    it(`${lang}: the owner's team is a Company group, not a panel of the three, and its screens do not read as the person's own`, () => {
      expect(["Company", "Empresa"]).toContain(ws.groupCompany);
      expect(PANEL_WORDS[lang]).not.toContain(ws.groupCompany);
      const company = panelGroups("owner", "visits", both, real, names, 7)[0].items.map((i) => i.label);
      expect(company).toHaveLength(10);
      // Next to the group sit the person's own Visits and Tags screens: no name is shared with them.
      const own = [...moduleGroups("visits", rep, real), ...moduleGroups("tags", rep, real)].flatMap((g) => g.items.map((i) => i.label));
      expect(company.filter((label) => own.includes(label))).toEqual([]);
      expect(company).toEqual(expect.arrayContaining([ws.companyCustomers, ws.companyTasks, ws.companySales]));
      expect([ws.companyCustomers, ws.companyTasks, ws.companySales]).not.toContain(shell.tabLeads);
    });
    it(`${lang}: a screen has the same name in its panel and in the Tags module (Make is Production's own word)`, () => {      const tagsManage = moduleGroups("tags", admin, real)[1].items;
      const byHref = new Map(tagsManage.map((i) => [i.href, i.label]));
      const panelItems = [...panelGroups("platform", "production", both, real, names, 7), ...panelGroups("platform", "admin", both, real, names, 7)].flatMap((g) => g.items);
      for (const href of ["/admin/tags/pieces", "/admin/tags/kits", "/admin/tags/overview", "/admin/tags/journey", "/admin/tags/provisioners", "/admin/tags/shop"]) {
        expect(panelItems.find((i) => i.href === href)?.label).toBe(byHref.get(href));
      }
      expect(panelItems.find((i) => i.href === "/admin/tags/production")?.label).toBe(ws.groupMake);
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
