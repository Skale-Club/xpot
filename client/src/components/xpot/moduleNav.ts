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
  ShoppingBag,
  SlidersHorizontal,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { XpotModule } from "@shared/modules";
import { can, type Profile } from "@shared/profiles";

// Where every screen lives. The app is two areas: "My work" (the modules Visits,
// field sales, and Tags, QR/NFC pieces) and "My company" (the panel: Platform
// for the platform's own people). The person's Settings and Sign out are not an
// area: they sit in the avatar menu. The sidebar, the phone bars, the command
// palette, the top bar and the admin screens all read this one map, so a screen
// has one name everywhere (docs/MODULES.md).

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

/**
 * The screens inside something (a piece, a company, a visit) show their own back
 * arrow and title: the phone's top bar (the area switch, the avatar menu) is for
 * the screens you start from.
 */
export function phoneBarHidden(path: string): boolean {
  if (/^\/tags\/(?:t|pieces|customers)\/[^/]+/.test(path)) return true;
  if (/^\/leads\/[^/]+/.test(path) && !/^\/leads\/prospect/.test(path)) return true;
  return /^\/dashboard\/history\/[^/]+/.test(path) || visitsScreen(path) === "visit";
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

/** The words only the panels have: the group headings and the organization's own screens (i18n/messages/workspaces.ts). */
export type PanelNames = {
  /** The panel's first item, "Today". */
  today: string;
  /** The platform's own name ("Platform"), for the area switch and its Today. */
  platform: string;
  /** The platform's own company, the heading of its Today block. */
  company: string;
  /** Group headings: a piece's life, the field work, the platform's controls. */
  make: string;
  pieces: string;
  field: string;
  administration: string;
  /** Items. */
  team: string;
  /** An owner of several companies: Team opens the list of them. */
  companies: string;
  stock: string;
  kits: string;
  purchases: string;
  tagsOverview: string;
};

/** The `?name=` of the page in the address bar: a path match cannot see it. Null outside a browser. */
function searchParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
}

const ADMIN_VIEWER: Viewer = { canManage: true, isAdmin: true };

/**
 * One panel per profile (shared/profiles.ts, docs/PROFILES_EXECUTION_PLAN.md section 6); a member has none. Groups are
 * by task, not by who owns the data:
 *   owner     Today and Team, then Pieces (Stock, Hand out, Team purchases, Pieces results) and Field (Companies,
 *             Tasks, Sales: Visits).
 *   partner   the owner's, with a Make group (Production, Chip writers) in front.
 *   platform  Today; Make (Production, Chip writers, History); Pieces (Stock, Hand out, Pieces results); Field
 *             (Companies, Tasks, Sales, Team results); and Administration, collapsible: organizations, people,
 *             products, shop, integrations, brand, status, check-in rules.
 * `organizationId`: the one organization an owner or a partner runs, so Team and Purchases open its workspace; without
 * one (someone who runs several), Team is the list of their companies.
 * The hrefs are the ones the app always had (docs/MODULES.md: URLs never change).
 */
export function panelGroups(profile: Profile | null | undefined, modules: readonly XpotModule[], l: Labels, names: PanelNames, organizationId: number | null = null): NavGroup[] {
  if (!profile || !can(profile, "useManagementPanel")) return [];
  const visits = modules.includes("visits");
  const tags = modules.includes("tags");
  const tagItems = tags ? moduleGroups("tags", ADMIN_VIEWER, l).slice(1).flatMap((group) => group.items) : [];
  // The group carries the Platform tag where it needs one, so the items lose the one the Tags module puts on each.
  const tagItem = (href: string, label?: string): NavItem[] => tagItems.filter((item) => item.href === href).map((item) => ({ ...item, label: label ?? item.label, adminOnly: false }));
  const today: NavItem = { href: "/admin", label: names.today, icon: LayoutDashboard, match: (path) => path === "/admin" };
  const work: NavItem[] = visits ? [
    { href: "/admin/work/leads", label: l.shell("tabLeads"), icon: Building2, match: starts("/admin/work/leads") },
    { href: "/admin/work/tasks", label: l.shell("tabTasks"), icon: ListTodo, match: starts("/admin/work/tasks") },
    { href: "/admin/work/sales", label: l.shell("tabSales"), icon: DollarSign, match: starts("/admin/work/sales") },
  ] : [];
  // A piece's life in the order it happens: made, in stock, handed out, then how it is checked.
  const production = tagItem("/admin/tags/production");
  const stations = tagItem("/admin/tags/provisioners");
  const stock = tagItem("/admin/tags/pieces", names.stock);
  const overview = tagItem("/admin/tags/overview", names.tagsOverview);
  // Stuscle's orders are a tab of Hand out (?view=orders, the admin's), so Hand out stays lit there.
  const kits = tagItem("/admin/tags/kits", names.kits);
  const groups = (list: NavGroup[]) => list.filter((group) => group.items.length > 0);

  if (profile === "platform") {
    return groups([
      { label: "", items: [today] },
      { label: names.make, items: [...production, ...stations, ...tagItem("/admin/tags/journey")] },
      { label: names.pieces, items: [...stock, ...kits, ...overview] },
      { label: names.field, items: [...work, ...(visits ? [{ href: "/admin/overview", label: l.shell("manageTeam"), icon: TrendingUp, match: starts("/admin/overview") }] : [])] },
      {
        // The platform's controls start collapsed, and stay as the person leaves them (the group opens on a screen in it).
        label: names.administration, adminOnly: true, collapsible: true, items: [
          { href: "/organizations", label: l.shell("navOrganizations"), icon: Network, match: starts("/organizations") },
          { href: "/admin/reps", label: l.shell("orgPeople"), icon: Users, match: starts("/admin/reps") },
          ...(visits ? [{ href: "/admin/products", label: l.shell("manageProducts"), icon: Boxes, match: starts("/admin/products") }] : []),
          ...tagItem("/admin/tags/shop"),
          ...platformItems(l),
          ...(visits ? [{ href: "/admin/settings", label: l.shell("manageCheckInRules"), icon: SlidersHorizontal, match: starts("/admin/settings") }] : []),
        ],
      },
    ]);
  }

  // Team and purchases are tabs of the organization's workspace (/organizations/<id>?tab=); the path alone cannot tell them apart.
  const workspaceItem = (tab: string, label: string, icon: LucideIcon, ...tabs: Array<string | null>): NavItem => organizationId
    ? { href: `/organizations/${organizationId}?tab=${tab}`, label, icon, match: (path) => (/^\/organizations\/\d+\/?$/.test(path) && tabs.includes(searchParam("tab"))) || (tab === "team" && /^\/organizations\/\d+\/people\//.test(path)) }
    : { href: "/organizations", label, icon, match: starts("/organizations") };
  return groups([
    { label: "", items: [today, workspaceItem("team", organizationId ? names.team : names.companies, Users, null, "overview", "team", "settings")] },
    // A partner's production comes first: it is what the panel is for.
    ...(profile === "partner" ? [{ label: names.make, items: [...production, ...stations] }] : []),
    {
      label: names.pieces, items: [
        ...stock, ...kits,
        // Without one workspace to open (someone who runs several), the companies list is the one door.
        ...(organizationId && tags && can(profile, "viewTeamPurchases") ? [workspaceItem("purchases", names.purchases, ShoppingBag, "purchases")] : []),
        ...overview,
      ],
    },
    // What each person on the team did: an owner's and a partner's own copy of the platform's Team results.
    { label: names.field, items: [...work, ...(visits ? [{ href: "/admin/overview", label: l.shell("manageTeam"), icon: TrendingUp, match: starts("/admin/overview") }] : [])] },
  ]);
}

/**
 * What the phone's bottom bar shows of the panel: Today and the screens used most (Stock, Hand out, and Team or
 * Production), then whatever comes next until there are four; "More" opens the rest.
 */
export function panelPhoneTabs(groups: NavGroup[], profile: Profile | null | undefined): { tabs: NavItem[]; more: NavGroup[] } {
  const all = groups.flatMap((group) => group.items);
  const wanted = profile === "owner"
    ? ["/admin", "/admin/tags/pieces", "/admin/tags/kits", "/organizations"]
    : ["/admin", "/admin/tags/production", "/admin/tags/pieces", "/admin/tags/kits"];
  const tabs = wanted.map((href) => all.find((item) => item.href === href || item.href.startsWith(`${href}?`) || (href === "/organizations" && item.href.startsWith("/organizations/")))).filter((item): item is NavItem => !!item);
  for (const item of all) if (tabs.length < 4 && !tabs.includes(item)) tabs.push(item);
  const more = groups.map((group) => ({ ...group, items: group.items.filter((item) => !tabs.includes(item)) })).filter((group) => group.items.length > 0);
  return { tabs, more };
}

/** Screens the palette offers that no sidebar lists: the visit, a plain chip, the landing page editor. */
export function paletteExtras(area: XpotModule | "platform", l: Labels): NavItem[] {
  if (area === "visits") return [{ href: "/route/check-in", label: l.nav("visitScreen"), icon: MapPin, match: (p) => visitsScreen(p) === "visit" }];
  if (area === "tags") return [{ href: "/tags/direct", label: l.tags("navDirect"), icon: PenLine, match: starts("/tags/direct") }];
  return [{ href: "/admin/landing", label: l.shell("orgLanding"), icon: FileText, match: starts("/admin/landing") }];
}
