import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  DollarSign,
  Factory,
  FileText,
  HeartPulse,
  LayoutDashboard,
  ListTodo,
  Nfc,
  Package,
  PackageOpen,
  Palette,
  Plug,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { XpotModule } from "@shared/modules";

// Where every screen lives. The app is two modules, Visits (field sales) and
// Tags (QR/NFC pieces), plus the account pages outside both. Each module carries
// its own screens and, for managers, its own "Manage" group, so the management of
// Tags sits inside Tags instead of in an "Admin" next to it. The sidebar, the
// command palette and the admin screens all read this one map (docs/MODULES.md).

/** The part of the app a screen belongs to; the account pages belong to neither module. */
export type ShellContext = XpotModule | "account";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  /** Only the global admin sees it, and it shows the "Admin" tag (AdminBadge). */
  adminOnly?: boolean;
};
export type NavGroup = { label: string; items: NavItem[] };

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

export type Labels = {
  shell: (key: ShellKey) => string;
  /** Tags app labels used by the shared shell. */
  tags: (key: "navHome" | "navCustomers" | "navPieces" | "navDirect") => string;
};

type ShellKey =
  | "tabCheckIn"
  | "tabDashboard"
  | "tabVisits"
  | "tabLeads"
  | "tabSales"
  | "tabRoute"
  | "tabTasks"
  | "navManage"
  | "manageTeam"
  | "manageProducts"
  | "manageCheckInRules"
  | "manageOverview"
  | "managePieces"
  | "manageKits"
  | "manageBatches"
  | "manageJourney"
  | "manageResellers"
  | "manageWriters"
  | "orgPeople"
  | "orgIntegrations"
  | "orgBranding"
  | "orgLanding"
  | "orgSystemHealth";

export type Viewer = {
  /** Manager or admin: sees each module's Manage group and the Organization pages. */
  canManage: boolean;
  /** The global admin (isSuperAdmin): sees the items marked adminOnly. */
  isAdmin: boolean;
};

/** The items this viewer may see: adminOnly ones only for the global admin, grouped at the end. */
function visibleTo(viewer: Pick<Viewer, "isAdmin">, items: NavItem[]): NavItem[] {
  const shared = items.filter((i) => !i.adminOnly);
  return viewer.isAdmin ? [...shared, ...items.filter((i) => i.adminOnly)] : shared;
}

/** The screens of one module: what its people use, then (for managers) its Manage group. */
export function moduleGroups(module: XpotModule, viewer: Viewer, l: Labels): NavGroup[] {
  if (module === "visits") {
    const work: NavGroup = {
      label: "",
      items: [
        { href: "/dashboard", label: l.shell("tabDashboard"), icon: Activity, match: (path) => starts("/dashboard")(path) || starts("/visits")(path) },
        { href: "/route", label: l.shell("tabRoute"), icon: Route, match: (path) => starts("/route")(path) || starts("/prospecting")(path) || starts("/check-in")(path) },
        { href: "/leads", label: l.shell("tabLeads"), icon: Building2, match: starts("/leads") },
        { href: "/tasks", label: l.shell("tabTasks"), icon: ListTodo, match: starts("/tasks") },
        { href: "/sales", label: l.shell("tabSales"), icon: DollarSign, match: starts("/sales") },
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
      // Writing a chip without Xpot (/tags/direct) is reached from the dashboard, not the nav.
      { href: "/tags", label: l.tags("navHome"), icon: LayoutDashboard, match: (p) => p === "/tags" || p.startsWith("/tags/direct") },
      { href: "/tags/customers", label: l.tags("navCustomers"), icon: Building2, match: starts("/tags/customers") },
      // A piece (/tags/t/<code>) belongs to My pieces, wherever it was opened from.
      { href: "/tags/pieces", label: l.tags("navPieces"), icon: Package, match: (p) => starts("/tags/pieces")(p) || p.startsWith("/tags/t/") },
    ],
  };
  if (!viewer.canManage) return [work];
  const tab = (id: string) => starts(`/admin/tags/${id}`);
  return [
    work,
    {
      label: l.shell("navManage"),
      items: visibleTo(viewer, [
        { href: "/admin/tags/overview", label: l.shell("manageOverview"), icon: BarChart3, match: (p) => p === "/admin/tags" || tab("overview")(p) },
        { href: "/admin/tags/pieces", label: l.shell("managePieces"), icon: Nfc, match: tab("pieces") },
        { href: "/admin/tags/kits", label: l.shell("manageKits"), icon: PackageOpen, match: tab("kits") },
        { href: "/admin/tags/team", label: l.shell("manageResellers"), icon: Users, match: tab("team") },
        { href: "/admin/tags/batches", label: l.shell("manageBatches"), icon: Factory, match: tab("batches"), adminOnly: true },
        { href: "/admin/tags/journey", label: l.shell("manageJourney"), icon: Route, match: tab("journey"), adminOnly: true },
        { href: "/admin/tags/provisioners", label: l.shell("manageWriters"), icon: ShieldCheck, match: tab("provisioners"), adminOnly: true },
      ]),
    },
  ];
}

/** The account's Organization pages (managers; Integrations and Branding for the global admin only). */
export function organizationItems(l: Labels, viewer: Pick<Viewer, "isAdmin">): NavItem[] {
  const section = (id: string) => starts(`/admin/${id}`);
  return visibleTo(viewer, [
    { href: "/admin/reps", label: l.shell("orgPeople"), icon: Users, match: section("reps") },
    { href: "/admin/integrations", label: l.shell("orgIntegrations"), icon: Plug, match: (p) => section("integrations")(p) || section("xphere")(p), adminOnly: true },
    { href: "/admin/branding", label: l.shell("orgBranding"), icon: Palette, match: section("branding"), adminOnly: true },
    { href: "/admin/landing", label: l.shell("orgLanding"), icon: FileText, match: section("landing"), adminOnly: true },
    { href: "/admin/health", label: l.shell("orgSystemHealth"), icon: HeartPulse, match: section("health"), adminOnly: true },
  ]);
}
