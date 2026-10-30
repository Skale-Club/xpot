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
  Nfc,
  Package,
  PackageOpen,
  Palette,
  PenLine,
  Printer,
  Plug,
  Route,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { XpotModule } from "@shared/modules";
import { parseSalesPath } from "../../pages/xpot/salesPath";

// Where every screen lives. The app is two modules, Visits (field sales) and
// Tags (QR/NFC pieces), plus the account pages outside both. Each module carries
// its own screens and, for managers, its own "Manage" group, so the management of
// Tags sits inside Tags instead of in an "Admin" next to it. The account is the
// person's Settings, the managers' Administration (People, Organizations) and
// the Xpot admin's Platform. The sidebar, the phone tab bars, the command
// palette, the top bar and the admin screens all read this one map, so a screen
// has one name everywhere (docs/MODULES.md).

/** The part of the app a screen belongs to; the account pages belong to neither module. */
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
  /** Secondary setup tools start collapsed in the management panel. */
  collapsible?: boolean;
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

/**
 * Where an account page sits: personal Settings, the managers' Administration
 * (People, Organizations) or the Xpot admin's Platform. Null outside the account.
 */
export function accountSection(path: string): "settings" | "administration" | "platform" | null {
  if (contextOfPath(path) !== "account") return null;
  if (starts("/settings")(path)) return "settings";
  if (starts("/organizations")(path) || starts("/admin/reps")(path)) return "administration";
  return "platform";
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
 * old /visits) is "Visits"; the active visit (/route/check-in, the old
 * /check-in) is "Visit", not Route; unknown paths fall back to the dashboard,
 * as the app does.
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
 * phone bar (seven with Manage), so Visits (the history) is the one left out:
 * it stays one tap away on the Dashboard, and in the sidebar and the palette.
 */
export const VISITS_TAB_ORDER = ["dashboard", "route", "leads", "tasks", "sales"] as const;
export type VisitsTabId = (typeof VISITS_TAB_ORDER)[number] | "manage";

/** The phone tab lit for a path: the history sits under Dashboard, the active visit under none. */
export function activeVisitsTab(path: string): VisitsTabId | null {
  const screen = visitsScreen(path);
  if (screen === "visits") return "dashboard";
  if (screen === "visit") return null;
  return screen;
}

export type Labels = {
  shell: (key: ShellKey) => string;
  /** Tags app labels used by the shared shell. */
  tags: (key: "navHome" | "navCustomers" | "navPieces" | "navShop" | "navDirect") => string;
  /** This shell's own labels (i18n/messages/navIa.ts). */
  nav: (key: "navPlatform" | "visitScreen") => string;
};

type ShellKey =
  | "tabDashboard"
  | "tabVisits"
  | "tabLeads"
  | "tabSales"
  | "tabRoute"
  | "tabTasks"
  | "navManage"
  | "navOrganization"
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
  /** Manager or admin, in management mode: sees each module's Manage group and Administration. */
  canManage: boolean;
  /** The global admin (isSuperAdmin): sees the items marked adminOnly, and Platform. */
  isAdmin: boolean;
};

/** The items this viewer may see, in their order: adminOnly ones only for the global admin. */
function visibleTo(viewer: Pick<Viewer, "isAdmin">, items: NavItem[]): NavItem[] {
  return viewer.isAdmin ? items : items.filter((i) => !i.adminOnly);
}

/** The screens of one module: what its people use, then (for managers) its Manage group. */
export function moduleGroups(module: XpotModule, viewer: Viewer, l: Labels): NavGroup[] {
  if (module === "visits") {
    const screen = (id: VisitsScreen) => (path: string) => visitsScreen(path) === id;
    const work: NavGroup = {
      label: "",
      items: [
        { href: "/dashboard", label: l.shell("tabDashboard"), icon: Activity, match: (p) => starts("/dashboard")(p) && screen("dashboard")(p) },
        { href: "/route", label: l.shell("tabRoute"), icon: Route, match: screen("route") },
        { href: "/leads", label: l.shell("tabLeads"), icon: Building2, match: screen("leads") },
        // The history, and the visit being run (it is one of them).
        { href: "/dashboard/history", label: l.shell("tabVisits"), icon: History, match: (p) => screen("visits")(p) || screen("visit")(p) },
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
          { href: "/admin/overview", label: l.shell("manageTeam"), icon: LayoutDashboard, match: section("overview") },
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
        { href: "/admin/tags/pieces", label: l.shell("managePieces"), icon: Nfc, match: tab("pieces") },
        { href: "/admin/tags/kits", label: l.shell("manageKits"), icon: PackageOpen, match: tab("kits") },
        // The showcase the resellers see in Tags › Shop: the Xpot admin keeps it.
        { href: "/admin/tags/shop", label: l.shell("manageShop"), icon: ShoppingBag, match: tab("shop"), adminOnly: true },
        { href: "/admin/tags/journey", label: l.shell("manageJourney"), icon: Route, match: tab("journey"), adminOnly: true },
        { href: "/admin/tags/provisioners", label: l.shell("manageWriters"), icon: ShieldCheck, match: tab("provisioners"), adminOnly: true },
      ]),
    },
  ];
}

/** Administration, for managers in management mode: the people and the organizations. */
export function administrationItems(l: Labels): NavItem[] {
  return [
    { href: "/admin/reps", label: l.shell("orgPeople"), icon: Users, match: starts("/admin/reps") },
    { href: "/organizations", label: l.shell("navOrganizations"), icon: Building2, match: starts("/organizations") },
  ];
}

/**
 * Platform, the Xpot admin's own: integrations, the brand and public site, the
 * system status. Only the global admin gets the group (accountGroups), which
 * carries the "Xpot admin" tag once, on its heading.
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

/** The account's groups after Settings: Administration for managers, Platform for the Xpot admin. */
export function accountGroups(viewer: Viewer, l: Labels): NavGroup[] {
  if (!viewer.canManage) return [];
  return [
    { label: l.shell("navOrganization"), items: administrationItems(l) },
    ...(viewer.isAdmin ? [{ label: l.nav("navPlatform"), items: platformItems(l), adminOnly: true }] : []),
  ];
}

/** A panel lists management destinations only; the personal application's navigation stays outside it. */
export function managementGroups(modules: readonly XpotModule[], viewer: Viewer, l: Labels, names: {
  home: string; tags: string; visits: string; team: string; system: string;
}): NavGroup[] {
  if (!viewer.canManage) return [];
  const groups: NavGroup[] = [{ label: "", items: [{ href: "/admin", label: names.home, icon: LayoutDashboard, match: (path) => path === "/admin" }] }];
  const tags = modules.includes("tags") ? moduleGroups("tags", viewer, l).slice(1).flatMap((group) => group.items) : [];
  const visits = modules.includes("visits") ? moduleGroups("visits", viewer, l).slice(1).flatMap((group) => group.items) : [];
  const operations = ["/admin/tags/production", "/admin/tags/pieces", "/admin/tags/kits", "/admin/tags/overview"];
  if (tags.length) groups.push({ label: names.tags, items: operations.flatMap((href) => tags.filter((item) => item.href === href)) });
  if (modules.includes("visits")) groups.push({ label: names.visits, collapsible: viewer.isAdmin, items: [
    { href: "/admin/work/leads", label: l.shell("tabLeads"), icon: Building2, match: starts("/admin/work/leads") },
    { href: "/admin/work/tasks", label: l.shell("tabTasks"), icon: ListTodo, match: starts("/admin/work/tasks") },
    { href: "/admin/work/sales", label: l.shell("tabSales"), icon: DollarSign, match: starts("/admin/work/sales") },
    ...visits.filter((item) => item.href === "/admin/overview").map((item) => ({ ...item, match: starts(item.href) })),
  ] });
  groups.push({ label: names.team, collapsible: viewer.isAdmin, items: administrationItems(l) });
  groups.push({ label: names.system, collapsible: true, items: [
    ...visits.filter((item) => item.href !== "/admin/overview"),
    ...tags.filter((item) => !operations.includes(item.href)),
    ...(viewer.isAdmin ? platformItems(l) : []),
  ] });
  return groups.filter((group) => group.items.length > 0);
}

/** Organization Rep Admins keep their team tools, without global admin destinations. */
export function organizationPanelGroups(modules: readonly XpotModule[], l: Labels): NavGroup[] {
  return [{ label: l.shell("navOrganization"), items: [
    ...administrationItems(l).filter((item) => item.href === "/organizations"),
    ...(modules.includes("visits") ? [
      { href: "/admin/work/leads", label: l.shell("tabLeads"), icon: Building2, match: starts("/admin/work/leads") },
      { href: "/admin/work/tasks", label: l.shell("tabTasks"), icon: ListTodo, match: starts("/admin/work/tasks") },
      { href: "/admin/work/sales", label: l.shell("tabSales"), icon: DollarSign, match: starts("/admin/work/sales") },
    ] : []),
  ] }];
}

/** Screens the palette offers that no sidebar lists: the visit, a plain chip, the landing page editor. */
export function paletteExtras(area: XpotModule | "platform", l: Labels): NavItem[] {
  if (area === "visits") return [{ href: "/route/check-in", label: l.nav("visitScreen"), icon: MapPin, match: (p) => visitsScreen(p) === "visit" }];
  if (area === "tags") return [{ href: "/tags/direct", label: l.tags("navDirect"), icon: PenLine, match: starts("/tags/direct") }];
  return [{ href: "/admin/landing", label: l.shell("orgLanding"), icon: FileText, match: starts("/admin/landing") }];
}

/**
 * The lists a Rep Admin's management mode widens to the organizations they run
 * (server/routes/xpot/middleware.ts listScope): Companies, Tasks (its "Whole
 * team") and Sales' summary, sales and consignments. Visits, the pipeline and
 * Tags have no organization: a Rep Admin's own in every mode.
 */
export function organizationWideList(path: string): boolean {
  if (contextOfPath(path) !== "visits") return false;
  const screen = visitsScreen(path);
  if (screen === "leads" || screen === "tasks") return true;
  return screen === "sales" && parseSalesPath(path).tab !== "pipeline";
}

/**
 * Where leaving management mode on a management screen lands: the rep screen
 * of the same module that matches it best (Inventory → My pieces, Products →
 * Sales…). Administration and Platform pages have no rep twin: `fallback`.
 */
export function repScreenFor(path: string, fallback: string): string {
  if (starts("/admin/tags/shop")(path)) return "/tags/shop";
  if (starts("/admin/tags")(path)) return starts("/admin/tags/pieces")(path) ? "/tags/pieces" : "/tags";
  const section = visitsAdminSection(path);
  if (section === "products") return "/sales";
  if (section) return "/dashboard";
  return fallback;
}
