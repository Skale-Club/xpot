import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  DollarSign,
  FileText,
  HeartPulse,
  History,
  LayoutDashboard,
  ListTodo,
  MapPin,
  Network,
  Nfc,
  Package,
  PackageOpen,
  Palette,
  PenLine,
  Printer,
  Plug,
  Route,
  Shapes,
  ShoppingBag,
  SlidersHorizontal,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { XpotModule } from "@shared/modules";
import { can, type Profile } from "@shared/profiles";
import type { Panel } from "./panels";

// Where every screen lives. The app is three panels (panels.ts): Visits (the
// modules Visits, field sales, and Tags, QR/NFC pieces), Production (the pieces
// to print and where they are) and Admin (every company and the platform); an
// owner has no panel, their team is the Company group of Visits' sidebar (and of
// Tags'). The person's Settings and Sign out
// are not a panel: they sit in the avatar menu. The sidebar, the phone bars, the
// command palette, the top bar and the admin screens all read this one map, so a
// screen has one name everywhere (docs/MODULES.md).

/** The part of the app a screen belongs to; Settings belongs to neither module. */
export type ShellContext = XpotModule | "account";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  /** Only the global admin sees it, and it shows the "Xpot admin" tag (AdminBadge). */
  adminOnly?: boolean;
};
export type NavGroup = {
  label: string;
  items: NavItem[];
  /** The whole group is the global admin's: the "Xpot admin" tag sits on its heading, not on each item. */
  adminOnly?: boolean;
  /** The heading opens and closes the group in the management panel; it starts collapsed unless a screen in it is open. */
  collapsible?: boolean;
  /** A collapsible group that starts open anywhere in the panel. */
  defaultOpen?: boolean;
};

/** Matches a path and everything under it ("/tags" matches "/tags/pieces", not "/tagsx"). */
export const starts = (prefix: string) => (path: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Admin sections that are really Visits management, and the ones that belong to the account. */
const VISITS_ADMIN = ["overview", "products", "settings"] as const;
export const ORGANIZATION_SECTIONS = ["reps", "integrations", "branding", "landing", "xphere", "health"] as const;

/** Which part of the app a path belongs to. */
export function contextOfPath(path: string): ShellContext {
  if (starts("/tags")(path) || starts("/admin/tags")(path)) return "tags";
  if (starts("/settings")(path) || starts("/organizations")(path)) return "account";
  const admin = /^\/admin(?:\/([^/]+))?/.exec(path);
  if (admin) return (ORGANIZATION_SECTIONS as readonly string[]).includes(admin[1] ?? "") ? "account" : "visits";
  return "visits";
}

/** The Visits admin section a path shows, or null; "/admin" alone is the team overview. */
export function visitsAdminSection(path: string): (typeof VISITS_ADMIN)[number] | null {
  const m = /^\/admin(?:\/([^/]+))?\/?$/.exec(path);
  if (!m) return null;
  const section = m[1] ?? "overview";
  return (VISITS_ADMIN as readonly string[]).includes(section) ? (section as (typeof VISITS_ADMIN)[number]) : null;
}

/** The Visits screens, as the shell names them (title, sidebar, phone tab). */
export type VisitsScreen = "dashboard" | "route" | "leads" | "visits" | "visit" | "tasks" | "sales" | "manage";

/**
 * Which Visits screen a path shows. The visit history (/dashboard/history, the
 * old /visits) is "History"; the active visit (/route/check-in, the old
 * /check-in) is "Current visit", not Route; unknown paths fall back to the
 * dashboard, as the app does.
 */
export function visitsScreen(path: string): VisitsScreen {
  if (starts("/dashboard/history")(path) || starts("/visits")(path)) return "visits";
  if (starts("/route/check-in")(path) || starts("/check-in")(path)) return "visit";
  if (starts("/route")(path) || starts("/prospecting")(path) || starts("/leads/prospecting")(path) || path === "/leads/prospects") return "route";
  if (starts("/leads")(path)) return "leads";
  if (starts("/tasks")(path)) return "tasks";
  if (starts("/sales")(path)) return "sales";
  if (visitsAdminSection(path)) return "manage";
  return "dashboard";
}

/**
 * The phone tab bar of Visits, in the sidebar's order. Six screens don't fit a
 * phone bar (seven with Manage), so History is the one left out: it stays one
 * tap away on the Dashboard, and in the sidebar and the palette.
 */
export const VISITS_TAB_ORDER = ["dashboard", "route", "leads", "tasks", "sales"] as const;
export type VisitsTabId = (typeof VISITS_TAB_ORDER)[number] | "manage";

/** The phone tab lit for a path: the history and the active visit are on none (no tab is told it is where you are). */
export function activeVisitsTab(path: string): VisitsTabId | null {
  const screen = visitsScreen(path);
  if (screen === "visits" || screen === "visit") return null;
  return screen;
}

export type Labels = {
  shell: (key: ShellKey) => string;
  /** Tags app labels used by the shared shell. */
  tags: (key: "navHome" | "navCustomers" | "navPieces" | "navShop" | "navDirect") => string;
  /** This shell's own labels (i18n/messages/navIa.ts). */
  nav: (key: "visitScreen") => string;
};

type ShellKey =
  | "tabDashboard"
  | "tabVisits"
  | "tabLeads"
  | "tabSales"
  | "tabRoute"
  | "tabTasks"
  | "navManage"
  | "navOrganizations"
  | "manageTeam"
  | "manageProducts"
  | "manageCheckInRules"
  | "manageOverview"
  | "managePieces"
  | "manageKits"
  | "manageBatches"
  | "manageProduction"
  | "manageJourney"
  | "manageShop"
  | "manageWriters"
  | "orgPeople"
  | "orgIntegrations"
  | "orgBranding"
  | "orgLanding"
  | "orgSystemHealth";

export type Viewer = {
  /** In the panel: sees each module's Manage group. */
  canManage: boolean;
  /** The global admin (isSuperAdmin): sees the items marked adminOnly, and Platform. */
  isAdmin: boolean;
};

/** The items this viewer may see, in their order: adminOnly ones only for the global admin. */
function visibleTo(viewer: Pick<Viewer, "isAdmin">, items: NavItem[]): NavItem[] {
  return viewer.isAdmin ? items : items.filter((i) => !i.adminOnly);
}

/** The screens of one module: what its people use, then (in the panel) its Manage group. */
export function moduleGroups(module: XpotModule, viewer: Viewer, l: Labels): NavGroup[] {
  if (module === "visits") {
    const screen = (id: VisitsScreen) => (path: string) => visitsScreen(path) === id;
    const work: NavGroup = {
      label: "",
      items: [
        { href: "/dashboard", label: l.shell("tabDashboard"), icon: Activity, match: (p) => starts("/dashboard")(p) && screen("dashboard")(p) },
        { href: "/route", label: l.shell("tabRoute"), icon: Route, match: screen("route") },
        { href: "/leads", label: l.shell("tabLeads"), icon: Building2, match: screen("leads") },
        { href: "/dashboard/history", label: l.shell("tabVisits"), icon: History, match: screen("visits") },
        { href: "/tasks", label: l.shell("tabTasks"), icon: ListTodo, match: screen("tasks") },
        { href: "/sales", label: l.shell("tabSales"), icon: DollarSign, match: screen("sales") },
      ],
    };
    if (!viewer.canManage) return [work];
    const section = (id: string) => (path: string) => visitsAdminSection(path) === id;
    return [
      work,
      {
        label: l.shell("navManage"),
        items: visibleTo(viewer, [
          { href: "/admin/overview", label: l.shell("manageTeam"), icon: TrendingUp, match: section("overview") },
          { href: "/admin/products", label: l.shell("manageProducts"), icon: Boxes, match: section("products") },
          { href: "/admin/settings", label: l.shell("manageCheckInRules"), icon: SlidersHorizontal, match: section("settings") },
        ]),
      },
    ];
  }

  const work: NavGroup = {
    label: "",
    items: [
      // Writing a chip without Xpot (/tags/direct) is reached from the dashboard and the palette.
      { href: "/tags", label: l.tags("navHome"), icon: LayoutDashboard, match: (p) => p === "/tags" || p.startsWith("/tags/direct") },
      { href: "/tags/customers", label: l.tags("navCustomers"), icon: Building2, match: starts("/tags/customers") },
      // A piece (/tags/t/<code>) belongs to My pieces, wherever it was opened from.
      { href: "/tags/pieces", label: l.tags("navPieces"), icon: Package, match: (p) => starts("/tags/pieces")(p) || p.startsWith("/tags/t/") },
      // What Skale Club sells; every button opens the Stuscle store (the sales engine).
      { href: "/tags/shop", label: l.tags("navShop"), icon: ShoppingBag, match: starts("/tags/shop") },
    ],
  };
  if (!viewer.canManage) return [work];
  const tab = (id: string) => starts(`/admin/tags/${id}`);
  return [
    work,
    {
      label: l.shell("navManage"),
      // A piece's life: made (Batches), in stock (Inventory), handed out
      // (Distribution), sold by resellers; then the Xpot admin's tools.
      items: visibleTo(viewer, [
        { href: "/admin/tags/overview", label: l.shell("manageOverview"), icon: BarChart3, match: (p) => p === "/admin/tags" || tab("overview")(p) },
        // What the house prints: the catalog of models and the print queue (docs/PRINT_EXECUTION_PLAN.md).
        { href: "/admin/tags/production", label: l.shell("manageProduction"), icon: Printer, match: (p) => tab("production")(p) || tab("batches")(p), adminOnly: true },
        { href: "/admin/tags/pieces", label: l.shell("managePieces"), icon: Package, match: tab("pieces") },
        { href: "/admin/tags/kits", label: l.shell("manageKits"), icon: PackageOpen, match: tab("kits") },
        // The showcase the resellers see in Tags › Shop: the Xpot admin keeps it.
        { href: "/admin/tags/shop", label: l.shell("manageShop"), icon: ShoppingBag, match: tab("shop"), adminOnly: true },
        { href: "/admin/tags/journey", label: l.shell("manageJourney"), icon: History, match: tab("journey"), adminOnly: true },
        { href: "/admin/tags/provisioners", label: l.shell("manageWriters"), icon: Nfc, match: tab("provisioners"), adminOnly: true },
      ]),
    },
  ];
}

/**
 * The platform's own screens: integrations, the brand and public site, the
 * system status. They sit in the panel's Administration group, which carries
 * the "Xpot admin" tag once, on its heading.
 */
export function platformItems(l: Labels): NavItem[] {
  const section = (id: string) => starts(`/admin/${id}`);
  return [
    { href: "/admin/integrations", label: l.shell("orgIntegrations"), icon: Plug, match: (p) => section("integrations")(p) || section("xphere")(p) },
    // The landing page editor is part of the brand and public site.
    { href: "/admin/branding", label: l.shell("orgBranding"), icon: Palette, match: (p) => section("branding")(p) || section("landing")(p) },
    { href: "/admin/health", label: l.shell("orgSystemHealth"), icon: HeartPulse, match: section("health") },
  ];
}

/** The words only the panels have: the group headings and the screens that are not the modules' (i18n/messages/workspaces.ts). */
export type PanelNames = {
  /** The first item of Admin, "Today". */
  today: string;
  /** Group headings: Admin's companies and platform; Production's pieces and operation. */
  companiesGroup: string;
  platformGroup: string;
  pieces: string;
  operation: string;
  /** Items. */
  make: string;
  models: string;
  customers: string;
  team: string;
  /** An owner of several companies: Team opens the list of them. */
  companies: string;
  stock: string;
  kits: string;
  tagsOverview: string;
  /** The owner's Company group of Visits and Tags: its heading and its items, named apart from the person's own screens above it. */
  company: string;
  companyOverview: string;
  companyPieces: string;
  companyKits: string;
  companyPurchases: string;
  companyResults: string;
  companyTeamResults: string;
  companyCustomers: string;
  companyTasks: string;
  companySales: string;
};

/** The `?name=` of the page in the address bar: a path match cannot see it. Null outside a browser. */
function searchParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
}

const ADMIN_VIEWER: Viewer = { canManage: true, isAdmin: true };

/**
 * The menu of a panel (components/xpot/panels.ts), for someone who has it; Visits is the modules' own menu, not this.
 *   Admin       the platform's: Today; Companies (organizations, people, customers, team results);
 *               Platform (products, shop, integrations, brand, status, check-in rules, history).
 *   Production  the platform's and a partner's: Pieces (Make, Printing, Stock, Distribution, Results); Operation (Team
 *               for a partner, Computers, Models for the platform).
 *   owner       no panel: the one group Company, which Visits and Tags both list below their own screens (AppLayout):
 *               Overview, Team, Pieces, Give and take back, Purchases, Results, Team results, and the team's customers,
 *               tasks and sales (named apart from the person's own).
 * Stuscle orders are not an item: they are a view of Distribution (Production's), and Admin's Today row opens them there.
 * `organizationId`: the one organization an owner or a partner runs, so Team and Purchases open its workspace; without
 * one (someone who runs several), Team is the list of their companies.
 * The hrefs are the ones the app always had (docs/MODULES.md: URLs never change).
 */
export function panelGroups(profile: Profile | null | undefined, panel: Panel, modules: readonly XpotModule[], l: Labels, names: PanelNames, organizationId: number | null = null): NavGroup[] {
  if (!profile || !can(profile, "useManagementPanel")) return [];
  const visits = modules.includes("visits");
  const tags = modules.includes("tags");
  const tagItems = tags ? moduleGroups("tags", ADMIN_VIEWER, l).slice(1).flatMap((group) => group.items) : [];
  // A panel is the platform's as a whole, so the items lose the "Xpot admin" tag the Tags module puts on each.
  const tagItem = (href: string, label?: string): NavItem[] => tagItems.filter((item) => item.href === href).map((item) => ({ ...item, label: label ?? item.label, adminOnly: false }));
  const today: NavItem = { href: "/admin", label: names.today, icon: LayoutDashboard, match: (path) => path === "/admin" };
  const groups = (list: NavGroup[]) => list.filter((group) => group.items.length > 0);
  // Team and purchases are tabs of the organization's workspace (/organizations/<id>?tab=); the path alone cannot tell them apart.
  const workspaceItem = (tab: string, label: string, icon: LucideIcon, ...tabs: Array<string | null>): NavItem => organizationId
    ? { href: `/organizations/${organizationId}?tab=${tab}`, label, icon, match: (path) => (/^\/organizations\/\d+\/?$/.test(path) && tabs.includes(searchParam("tab"))) || (tab === "team" && /^\/organizations\/\d+\/people\//.test(path)) }
    : { href: "/organizations", label, icon, match: starts("/organizations") };
  const stock = tagItem("/admin/tags/pieces", names.stock);
  const overview = tagItem("/admin/tags/overview", names.tagsOverview);
  const team = (): NavItem => workspaceItem("team", organizationId ? names.team : names.companies, Users, null, "overview", "team", "settings");

  if (profile === "owner") {
    // The team's own work, organization-wide: named "Team ..." so they do not read as the person's own Companies, Tasks
    // and Sales just above the group.
    const work: NavItem[] = visits ? [
      { href: "/admin/work/leads", label: names.companyCustomers, icon: Building2, match: starts("/admin/work/leads") },
      { href: "/admin/work/tasks", label: names.companyTasks, icon: ListTodo, match: starts("/admin/work/tasks") },
      { href: "/admin/work/sales", label: names.companySales, icon: DollarSign, match: starts("/admin/work/sales") },
    ] : [];
    return groups([
      {
        label: names.company, items: [
          { href: "/admin", label: names.companyOverview, icon: LayoutDashboard, match: (path) => path === "/admin" },
          team(),
          ...tagItem("/admin/tags/pieces", names.companyPieces),
          ...tagItem("/admin/tags/kits", names.companyKits),
          // Without one workspace to open (someone who runs several), the companies list is the one door.
          ...(organizationId && tags && can(profile, "viewTeamPurchases") ? [workspaceItem("purchases", names.companyPurchases, ShoppingBag, "purchases")] : []),
          ...tagItem("/admin/tags/overview", names.companyResults),
          // What each person on the team did: an owner's own copy of the platform's Team results.
          ...(visits ? [{ href: "/admin/overview", label: names.companyTeamResults, icon: TrendingUp, match: starts("/admin/overview") }] : []),
          ...work,
        ],
      },
    ]);
  }

  if (panel === "admin" && profile === "platform") {
    return groups([
      { label: "", items: [today] },
      {
        label: names.companiesGroup, items: [
          { href: "/organizations", label: l.shell("navOrganizations"), icon: Network, match: starts("/organizations") },
          { href: "/admin/reps", label: l.shell("orgPeople"), icon: Users, match: starts("/admin/reps") },
          ...(visits ? [{ href: "/admin/work/leads", label: names.customers, icon: Building2, match: starts("/admin/work/leads") }] : []),
          ...(visits ? [{ href: "/admin/overview", label: l.shell("manageTeam"), icon: TrendingUp, match: starts("/admin/overview") }] : []),
        ],
      },
      {
        label: names.platformGroup, items: [
          ...(visits ? [{ href: "/admin/products", label: l.shell("manageProducts"), icon: Boxes, match: starts("/admin/products") }] : []),
          ...tagItem("/admin/tags/shop"),
          ...platformItems(l),
          ...(visits ? [{ href: "/admin/settings", label: l.shell("manageCheckInRules"), icon: SlidersHorizontal, match: starts("/admin/settings") }] : []),
          // The production log: looked up when something needs explaining, not part of making pieces.
          ...tagItem("/admin/tags/journey"),
        ],
      },
    ]);
  }

  if (panel === "production" && can(profile, "produce")) {
    const models = starts("/admin/tags/production/models");
    // The one screen and its sub-views (a job, the orders queue, a batch), but not Models: that is an item of its own.
    const make = tagItem("/admin/tags/production", names.make).map((item) => ({ ...item, match: (path: string) => item.match(path) && !models(path) }));
    return groups([
      {
        label: names.pieces, items: [
          ...make,
          // Distribution is one screen for everyone, Stuscle orders (?view=orders) included.
          ...stock, ...tagItem("/admin/tags/kits", names.kits), ...overview,
        ],
      },
      {
        label: names.operation, items: [
          // The platform's own operation is the Organizations screen in Admin; a partner's is its organization's team.
          ...(profile === "partner" ? [team()] : []),
          ...tagItem("/admin/tags/provisioners"),
          ...(profile === "platform" && tags ? [{ href: "/admin/tags/production/models", label: names.models, icon: Shapes, match: models }] : []),
        ],
      },
    ]);
  }

  return [];
}

/**
 * What the phone's bottom bar shows of a panel: its first screens (Admin: Today, Organizations, People; Production: Make,
 * Printing, Stock, Distribution), then whatever comes next until the bar is full; "More" opens the rest, and the way to
 * the person's other panels (PanelTabBar). An owner has no panel bar: their Company group opens from the Visits and
 * Tags bars (CompanySheet).
 */
export function panelPhoneTabs(groups: NavGroup[], panel: Panel = "visits"): { tabs: NavItem[]; more: NavGroup[] } {
  const all = groups.flatMap((group) => group.items);
  const wanted = panel === "admin"
    ? ["/admin", "/organizations", "/admin/reps"]
    : ["/admin/tags/production", "/admin/tags/pieces", "/admin/tags/kits"];
  // Admin keeps three: the fourth place of the bar is "More".
  const limit = panel === "admin" ? 3 : 4;
  const tabs = wanted.map((href) => all.find((item) => item.href === href || item.href.startsWith(`${href}?`))).filter((item): item is NavItem => !!item);
  for (const item of all) if (tabs.length < limit && !tabs.includes(item)) tabs.push(item);
  const more = groups.map((group) => ({ ...group, items: group.items.filter((item) => !tabs.includes(item)) })).filter((group) => group.items.length > 0);
  return { tabs, more };
}

/** Screens the palette offers that no sidebar lists: the visit, a plain chip, the landing page editor. */
export function paletteExtras(area: XpotModule | "platform", l: Labels): NavItem[] {
  if (area === "visits") return [{ href: "/route/check-in", label: l.nav("visitScreen"), icon: MapPin, match: (p) => visitsScreen(p) === "visit" }];
  if (area === "tags") return [{ href: "/tags/direct", label: l.tags("navDirect"), icon: PenLine, match: starts("/tags/direct") }];
  return [{ href: "/admin/landing", label: l.shell("orgLanding"), icon: FileText, match: starts("/admin/landing") }];
}
