import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  Clock3,
  DollarSign,
  Factory,
  Home,
  LayoutDashboard,
  Link2,
  MapPinned,
  Nfc,
  Package,
  PackageOpen,
  Palette,
  Plug,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Webhook,
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

export type NavItem = { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean };
export type NavGroup = { label: string; items: NavItem[] };

const starts = (prefix: string) => (path: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Admin sections that are really Visits management, and the ones that belong to the account. */
const VISITS_ADMIN = ["overview", "products", "settings", "xphere"] as const;
export const ORGANIZATION_SECTIONS = ["reps", "integrations", "branding"] as const;

/** Which part of the app a path belongs to. */
export function contextOfPath(path: string): ShellContext {
  if (starts("/tags")(path) || starts("/admin/tags")(path)) return "tags";
  if (starts("/settings")(path)) return "account";
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
  /** Tags app labels (navHome, navPieces, navDirect). */
  tags: (key: "navHome" | "navPieces" | "navDirect") => string;
};

type ShellKey =
  | "tabCheckIn"
  | "tabDashboard"
  | "tabVisits"
  | "tabLeads"
  | "tabSales"
  | "navManage"
  | "manageTeam"
  | "manageProducts"
  | "manageCheckInRules"
  | "manageXphere"
  | "manageOverview"
  | "managePieces"
  | "manageKits"
  | "manageBatches"
  | "manageJourney"
  | "manageResellers"
  | "manageWriters"
  | "orgPeople"
  | "orgIntegrations"
  | "orgBranding";

export type Viewer = {
  /** Manager or admin: sees each module's Manage group and the Organization pages. */
  canManage: boolean;
  /** Admin only (the Tags Journey). */
  isAdmin: boolean;
  /** A real computer: it cannot start a GPS check-in (docs/DESKTOP.md D1). */
  isComputer: boolean;
};

/** The screens of one module: what its people use, then (for managers) its Manage group. */
export function moduleGroups(module: XpotModule, viewer: Viewer, l: Labels): NavGroup[] {
  if (module === "visits") {
    const work: NavGroup = {
      label: "",
      items: [
        ...(viewer.isComputer ? [] : [{ href: "/check-in", label: l.shell("tabCheckIn"), icon: MapPinned, match: starts("/check-in") }]),
        { href: "/dashboard", label: l.shell("tabDashboard"), icon: Activity, match: starts("/dashboard") },
        { href: "/visits", label: l.shell("tabVisits"), icon: Clock3, match: starts("/visits") },
        { href: "/leads", label: l.shell("tabLeads"), icon: Building2, match: starts("/leads") },
        { href: "/sales", label: l.shell("tabSales"), icon: DollarSign, match: starts("/sales") },
      ],
    };
    if (!viewer.canManage) return [work];
    const section = (id: string) => (path: string) => visitsAdminSection(path) === id;
    return [
      work,
      {
        label: l.shell("navManage"),
        items: [
          { href: "/admin/overview", label: l.shell("manageTeam"), icon: LayoutDashboard, match: section("overview") },
          { href: "/admin/products", label: l.shell("manageProducts"), icon: Boxes, match: section("products") },
          { href: "/admin/settings", label: l.shell("manageCheckInRules"), icon: SlidersHorizontal, match: section("settings") },
          { href: "/admin/xphere", label: l.shell("manageXphere"), icon: Webhook, match: section("xphere") },
        ],
      },
    ];
  }

  const work: NavGroup = {
    label: "",
    items: [
      { href: "/tags", label: l.tags("navHome"), icon: Home, match: (p) => p === "/tags" || p.startsWith("/tags/t/") },
      { href: "/tags/pieces", label: l.tags("navPieces"), icon: Package, match: starts("/tags/pieces") },
      { href: "/tags/direct", label: l.tags("navDirect"), icon: Link2, match: starts("/tags/direct") },
    ],
  };
  if (!viewer.canManage) return [work];
  const tab = (id: string) => starts(`/admin/tags/${id}`);
  return [
    work,
    {
      label: l.shell("navManage"),
      items: [
        { href: "/admin/tags/overview", label: l.shell("manageOverview"), icon: BarChart3, match: (p) => p === "/admin/tags" || tab("overview")(p) },
        { href: "/admin/tags/pieces", label: l.shell("managePieces"), icon: Nfc, match: tab("pieces") },
        { href: "/admin/tags/batches", label: l.shell("manageBatches"), icon: Factory, match: tab("batches") },
        { href: "/admin/tags/kits", label: l.shell("manageKits"), icon: PackageOpen, match: tab("kits") },
        { href: "/admin/tags/team", label: l.shell("manageResellers"), icon: Users, match: tab("team") },
        ...(viewer.isAdmin ? [{ href: "/admin/tags/journey", label: l.shell("manageJourney"), icon: Route, match: tab("journey") }] : []),
        { href: "/admin/tags/provisioners", label: l.shell("manageWriters"), icon: ShieldCheck, match: tab("provisioners") },
      ],
    },
  ];
}

/** The account's Organization pages (managers and admins). */
export function organizationItems(l: Labels): NavItem[] {
  const section = (id: string) => starts(`/admin/${id}`);
  return [
    { href: "/admin/reps", label: l.shell("orgPeople"), icon: Users, match: section("reps") },
    { href: "/admin/integrations", label: l.shell("orgIntegrations"), icon: Plug, match: section("integrations") },
    { href: "/admin/branding", label: l.shell("orgBranding"), icon: Palette, match: section("branding") },
  ];
}
