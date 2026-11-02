import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  ChevronRight,
  MapPinned,
  Nfc,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { XpotModule } from "@shared/modules";
import { formatTitle } from "@shared/seo";
import { ownedOrganizationId, useViewerAccess } from "@/lib/adminMode";
import { AdminBadge } from "./AdminBadge";
import { rememberModule, useXpotModules } from "@/components/ModuleSwitch";
import { LAST_MODULE_KEY, MODULE_HOME, moduleEntryPath, rememberModuleRoute } from "@/lib/xpot";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { navIaMessages } from "@/i18n/messages/navIa";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { workspaceForPath } from "@/lib/workspace";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AppBackground } from "./AppBackground";
import { CommandPalette } from "./CommandPalette";
import { useDesktopShortcuts } from "./useDesktopShortcuts";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { MODULE_ACCENT } from "./surface";
import {
  panelGroups,
  contextOfPath,
  moduleGroups,
  paletteExtras,
  starts,
  visitsScreen,
  type NavGroup,
  type NavItem,
  type ShellContext,
} from "./moduleNav";
import { XpotLogo } from "./XpotLogo";
import { AccountMenu, useOnline } from "./AccountMenu";
import { AreaSwitch, rememberPanelRoute } from "./AreaSwitch";
import { PanelTabBar } from "./PanelTabBar";
import { PhoneTopBar } from "./PhoneTopBar";
import { ScreenErrorBoundary } from "./ScreenErrorBoundary";
import { usePanelNames } from "./panelNames";
import { dashboardMessages } from "@/i18n/messages/dashboard";
import { PersistentRouteProgress } from "./PersistentRouteProgress";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";
import { subscribeToRoutePush } from "@/lib/pushNotifications";

// The frame around every rep screen. Below `lg` it is the phone column the app
// always had (the caller passes its bottom nav; the top bar and the panel's bar
// are the frame's). From `lg` up a sidebar and a top bar take over. Two areas,
// told apart by colour: "My work" (the modules) and "My company" (the panel,
// amber); one switch between them, and the person's own things in the avatar menu.

const COLLAPSED_KEY = "xpot.sidebar.collapsed";
const GROUP_KEY = "xpot.nav.group.";

export type { NavGroup, NavItem } from "./moduleNav";

/**
 * The phone column of both modules' screens. Visits and Tags must use exactly
 * the same spacing above the top bar and module switch: any difference
 * shows as the header jumping when switching modules.
 */
export const MODULE_COLUMN = "pb-28 pt-[calc(env(safe-area-inset-top)+20px)]";

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

const MODULE_ICON: Record<XpotModule, LucideIcon> = { visits: MapPinned, tags: Nfc };

/** The module used last, if the person still has it: what Settings (which belongs to neither) lists in its sidebar. */
function lastModule(modules: XpotModule[]): XpotModule | null {
  let last: string | null = null;
  try { last = window.localStorage.getItem(LAST_MODULE_KEY); } catch { last = null; }
  return modules.find((m) => m === last) ?? modules[0] ?? null;
}

/**
 * Where the current screen sits: its part of the app, the module whose screens
 * the sidebar lists, the groups, and every screen for the command palette,
 * each under one name.
 */
function useShellNav() {
  const t = useT(shellMessages);
  const tc = useT(commonMessages);
  const tt = useT(tagsMessages);
  const tn = useT(navIaMessages);
  const [location] = useLocation();
  // The panel lights its items by a query too (?tab=, ?view=): listening to it re-renders the sidebar when only that changes.
  useSearch();
  const modules = useXpotModules();
  const access = useViewerAccess();
  const { panelName: nameOf, names } = usePanelNames();
  const me = access.me;
  const panel = access.adminMode;
  const panelName = nameOf(access.profile);
  const labels = { shell: t, tags: tt, nav: tn };
  const context = contextOfPath(location);
  const settingsItem: NavItem = { href: "/settings", label: t("navSettings"), icon: Settings, match: starts("/settings") };
  const module: XpotModule | null = panel ? null : context !== "account" && modules.includes(context) ? context : lastModule(modules);
  const groupsFor = (target: XpotModule) => {
    const listed = moduleGroups(target, { canManage: false, isAdmin: false }, labels);
    if (target !== "tags" || !modules.includes("visits")) return listed;
    return listed.map((group) => ({ ...group, items: group.items.filter((item) => item.href !== "/tags/customers") }));
  };
  const groups = panel
    ? panelGroups(access.profile, modules, labels, names, ownedOrganizationId(me))
    : module ? groupsFor(module) : [];
  const moduleLabel = (m: XpotModule) => tc(m === "visits" ? "moduleVisits" : "moduleTags");
  const order = module ? [module, ...modules.filter((m) => m !== module)] : modules;
  const pages = panel
    ? [
      ...groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))),
      ...(access.profile === "platform" ? paletteExtras("platform", labels).map((item) => ({ ...item, group: names.administration })) : []),
    ]
    : [
      // The panel's door first, then the modules, then Settings: a group of one item has no heading.
      ...(access.reach ? [{ href: "/admin", label: panelName, icon: ShieldCheck, match: () => false, group: "" }] : []),
      ...order.flatMap((m) => [...groupsFor(m).flatMap((group) => group.items), ...paletteExtras(m, labels)].map((item) => ({ ...item, group: moduleLabel(m) }))),
      { ...settingsItem, group: "" },
    ];
  // The module's name before the title says which one this is; the panel and Settings need no such name (one title per screen).
  const crumb = !panel && context !== "account" && module ? { label: moduleLabel(module), context: module as ShellContext } : null;
  return { context, module, modules, groups, pages, moduleLabel, me, crumb, panel, profile: access.profile };
}
type Accent = { solid: string; soft: string; strong: string; text: string };
const MANAGEMENT_ACCENT: Accent = { solid: "#fbbf24", soft: "rgba(251,191,36,0.12)", strong: "rgba(251,191,36,0.2)", text: "text-amber-200" };

/** The management panel has a separate surface from the personal app's dot grid. */
function ManagementBackground({ children }: { children: ReactNode }) {
  return <div className="min-h-screen text-white" style={{ background: "linear-gradient(150deg, #191810 0%, #101317 35%, #0c1015 100%)" }} data-testid="management-background">{children}</div>;
}

function SidebarLink({ item, collapsed, active, accent, warningLabel }: { item: NavItem; collapsed: boolean; active: boolean; accent: Accent; warningLabel?: string }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-10 items-center gap-3 rounded-xl text-sm font-medium transition-colors ${
        collapsed ? "justify-center px-0" : "px-3"
      } ${active ? "text-white" : "text-white/50 hover:bg-white/[0.04] hover:text-white/85"}`}
    >
      {active && <span className="absolute inset-0 rounded-xl" style={{ background: accent.soft }} />}
      <Icon className={`relative h-[18px] w-[18px] shrink-0 ${active ? accent.text : ""}`} />
      {!collapsed && <span className="relative truncate">{item.label}</span>}
      {warningLabel ? (
        <span
          className={`${collapsed ? "absolute right-2 top-2" : "relative ml-auto"} h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.65)] ring-4 ring-amber-400/10`}
          title={warningLabel}
          aria-label={warningLabel}
          role="img"
        />
      ) : null}
      {item.adminOnly && (collapsed ? <AdminBadge dot className="absolute right-1.5 top-1.5" /> : <AdminBadge compact className="relative ml-auto" />)}
    </Link>
  );
}

/**
 * The module switch under the area switch: the desktop twin of the phone's
 * ModuleSwitch. Both modules visible, each in its own colour. With one module
 * there is nothing to switch, so it is not shown.
 */
function SidebarModuleSwitch({ collapsed, module, modules, label }: {
  collapsed: boolean;
  module: XpotModule | null;
  modules: XpotModule[];
  label: (m: XpotModule) => string;
}) {
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  if (modules.length < 2) return null;
  const go = (m: XpotModule) => {
    if (m === module) return;
    if (module) rememberModuleRoute(module, `${window.location.pathname}${window.location.search}`);
    rememberModule(m);
    navigateGuarded(moduleEntryPath(m), navigate);
  };
  return (
    <div
      role="tablist"
      aria-label={tc("switchModule")}
      className={`flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 ${collapsed ? "flex-col" : ""}`}
      data-testid="sidebar-module-switch"
    >
      {modules.map((m) => {
        const Icon = MODULE_ICON[m];
        const active = m === module;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            title={collapsed ? label(m) : undefined}
            onClick={() => go(m)}
            disabled={active}
            className={`relative flex h-9 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:cursor-default ${
              active ? "text-white" : "text-white/45 hover:text-white/80"
            }`}
            data-testid={`sidebar-module-${m}`}
          >
            {active && <span className="absolute inset-0 rounded-xl" style={{ background: MODULE_ACCENT[m].strong }} />}
            <Icon className={`relative h-4 w-4 ${active ? MODULE_ACCENT[m].text : ""}`} />
            {!collapsed && <span className="relative">{label(m)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A group the person opens and closes; the choice is remembered, and a screen inside it keeps it open. */
function CollapsibleGroup({ group, children }: { group: NavGroup; children: ReactNode }) {
  const key = `${GROUP_KEY}${group.label}`;
  const [open, setOpen] = useState(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) return saved === "1";
    } catch { /* Not remembered. */ }
    return !!group.defaultOpen;
  });
  const [location] = useLocation();
  const holdsScreen = group.items.some((item) => item.match(location));
  const toggle = () => {
    const next = !(open || holdsScreen);
    setOpen(next);
    try { window.localStorage.setItem(key, next ? "1" : "0"); } catch { /* Not remembered. */ }
  };
  const shown = open || holdsScreen;
  return (
    <div className="space-y-1">
      <button type="button" onClick={toggle} aria-expanded={shown} className="flex min-h-10 w-full items-center justify-between gap-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40 hover:text-white/60">
        <span className="truncate">{group.label}</span>
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${shown ? "rotate-90" : ""}`} aria-hidden="true" />
      </button>
      {shown ? children : null}
    </div>
  );
}

/** The sidebar's list: when more is hidden below the fold, a shade at its foot says so. */
function ScrollingNav({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver !== "undefined" && ref.current ? new ResizeObserver(measure) : null;
    if (observer && ref.current) { observer.observe(ref.current); Array.from(ref.current.children).forEach((child) => observer.observe(child)); }
    return () => { window.removeEventListener("resize", measure); observer?.disconnect(); };
  });
  return (
    <div className="relative min-h-0 flex-1">
      <nav ref={ref} onScroll={measure} className="h-full space-y-6 overflow-y-auto px-3 py-2" aria-label={label}>{children}</nav>
      {more ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0a0e1a] to-transparent" aria-hidden="true" data-testid="sidebar-more-below" /> : null}
    </div>
  );
}

function DesktopSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useT(shellMessages);
  const td = useT(dashboardMessages);
  const [location] = useLocation();
  const { context, module, modules, groups, moduleLabel, panel } = useShellNav();
  const { panelName } = usePanelNames();
  const { profile } = useViewerAccess();
  const accent = panel ? MANAGEMENT_ACCENT : MODULE_ACCENT[module ?? "visits"];
  const routesQuery = useQuery<Array<{ routeDate: string; status: string }>>({
    queryKey: ["/api/xpot/prospecting/routes"],
    enabled: !panel && module === "visits",
  });
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const routeMissingToday = routesQuery.isSuccess && !routesQuery.data.some((route) => route.routeDate === todayKey && route.status !== "cancelled");

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r ${panel ? "border-amber-200/10" : "border-white/[0.07]"} lg:flex ${collapsed ? "w-[72px]" : "w-60"}`}
      style={{ background: panel ? "#171a1e" : "rgba(8, 12, 24, 0.92)", backdropFilter: "blur(20px)" }}
      data-testid="desktop-sidebar"
      data-context={context}
      data-workspace={panel ? "management" : "work"}
    >
      {/* Where you are, as a coloured line along the top. */}
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: panel ? MANAGEMENT_ACCENT.solid : MODULE_ACCENT[module ?? "visits"].solid }} aria-hidden="true" />
      <div className={`flex h-16 shrink-0 items-center ${collapsed ? "justify-center" : "justify-between px-4"}`}>
        {!collapsed && (
          <Link href={panel ? "/admin" : MODULE_HOME[module ?? modules[0] ?? "visits"]} className="flex items-center" aria-label="Xpot">
            <XpotLogo className="h-7 w-auto" decorative />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className="space-y-2 px-3 pb-3">
        <AreaSwitch collapsed={collapsed} narrow module={module} />
        {!panel ? <SidebarModuleSwitch collapsed={collapsed} module={module} modules={modules} label={moduleLabel} /> : null}
        {module === "visits" && !panel ? <PersistentRouteProgress collapsed={collapsed} className={collapsed ? "mt-2" : "mt-2.5"} /> : null}
      </div>

      <ScrollingNav label={panel ? panelName(profile) : module ? moduleLabel(module) : t("navSettings")}>
        {groups.map((group, i) => {
          const items = group.items.map((item) => <SidebarLink key={item.href} item={item} collapsed={collapsed} active={item.match(location)} accent={accent} warningLabel={item.href === "/route" && routeMissingToday ? td("noRouteToday") : undefined} />);
          if (group.collapsible && !collapsed) return <CollapsibleGroup key={group.label || i} group={group}>{items}</CollapsibleGroup>;
          return <div key={group.label || i} className="space-y-1">
            {group.label && !collapsed ? <div className="flex items-center gap-2 px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35"><span className="truncate">{group.label}</span>{group.adminOnly && <AdminBadge className="ml-auto" />}</div> : null}
            {group.label && collapsed ? <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden="true" /> : null}
            {items}
          </div>;
        })}
      </ScrollingNav>

      <div className="border-t border-white/[0.07] px-3 py-3">
        <AccountMenu variant="sidebar" collapsed={collapsed} />
      </div>
    </aside>
  );
}

function DesktopTopBar({ title, crumb, actions, onSearch, management = false }: {
  title: ReactNode;
  /** The module ("Tags") in its colour, before the title; none in the panel and in Settings. */
  crumb: { label: string; context: ShellContext } | null;
  actions?: ReactNode;
  onSearch: () => void;
  management?: boolean;
}) {
  const t = useT(shellMessages);
  const online = useOnline();
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header
      className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-white/[0.07] px-8 lg:flex"
      style={{ background: management ? "rgba(23, 26, 30, 0.94)" : "rgba(6, 9, 18, 0.8)", backdropFilter: "blur(20px)" }}
    >
      <h1 className="flex min-w-0 flex-1 items-center gap-2 truncate text-lg font-bold tracking-tight text-white" data-testid="top-bar-title">
        {crumb && (
          <>
            <span className={`shrink-0 ${MODULE_ACCENT[crumb.context].text}`}>{crumb.label}</span>
            <span className="shrink-0 text-white/25" aria-hidden="true">›</span>
          </>
        )}
        <span className="truncate">{title}</span>
      </h1>
      {actions}
      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 w-64 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/40 transition-colors hover:border-white/20 hover:text-white/60"
        data-testid="open-command-palette"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">{t("searchEverything")}</span>
        <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 font-sans text-[10px] text-white/40">{mac ? "⌘" : "Ctrl"} K</kbd>
      </button>
      <span className={`flex items-center gap-1.5 text-xs ${online ? "text-white/40" : "text-red-300"}`}>
        <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} />
        {online ? t("online") : t("offline")}
      </span>
    </header>
  );
}

function elapsedLabel(since: string | Date | null | undefined) {
  if (!since) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  return h ? `${h}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}

/** Persistent resume strip while a visit is active, on phone and desktop. */
function ActiveVisitBanner() {
  const t = useT(shellMessages);
  const [location] = useLocation();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const visit = me?.activeVisit;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!visit) return;
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [visit]);

  // Everywhere but the visit screen itself, the route planner included (it is not the visit).
  if (!visit || workspaceForPath(location) === "management" || visitsScreen(location) === "visit") return null;
  const lead = visit.lead?.name;
  return (
    <div className="px-4 pt-4 lg:px-8">
      <Link
        href="/route/check-in"
        className="mx-auto flex max-w-[1400px] items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-2.5 text-sm text-emerald-100 transition-colors hover:bg-emerald-400/[0.12]"
        data-testid="active-visit-banner"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {lead ? t("activeVisitAt", { lead }) : t("activeVisit")}
        </span>
        <span className="tabular-nums text-emerald-200/70">{elapsedLabel(visit.checkedInAt)}</span>
        <span className="shrink-0 font-semibold text-emerald-300">{t("openVisit")} →</span>
      </Link>
    </div>
  );
}

export function AppLayout({
  title,
  children,
  mobileHeader,
  mobileNav,
  topBarActions,
  wide = false,
  size,
  phoneBar,
  mobileColumnClassName = "pb-28 pt-5",
  mobileMaxWidth = "max-w-md",
  mobileColumnStyle,
}: {
  /** Shown in the desktop top bar. */
  title: ReactNode;
  children: ReactNode;
  /** Phone-only row below the top bar (offline notice, route progress…). */
  mobileHeader?: ReactNode;
  /** Phone-only bottom navigation. */
  mobileNav?: ReactNode;
  topBarActions?: ReactNode;
  /** Let the content use the full desktop width (redesigned screens). */
  wide?: boolean;
  /** Desktop content width; overrides `wide`. "medium" suits forms. */
  size?: "narrow" | "medium" | "wide";
  /** The phone's top bar (areas, modules, account). On by default in the panel; off for a screen that has its own back and title. */
  phoneBar?: boolean;
  /** Width cap below `lg` (admin tables need more than a phone column on a tablet). */
  mobileMaxWidth?: string;
  /** Padding of the phone column; desktop padding is fixed. */
  mobileColumnClassName?: string;
  mobileColumnStyle?: CSSProperties;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [location] = useLocation();
  const search = useSearch();
  const isDesktop = useIsDesktop();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((o) => !o), []);
  useDesktopShortcuts({ enabled: isDesktop, onPalette: togglePalette });
  const { pages, crumb: area, panel, module, groups, profile } = useShellNav();
  // A screen named like its module shows the name once.
  const crumb = area && area.label !== title ? area : null;
  const Background = panel ? ManagementBackground : AppBackground;
  const tShell = useT(shellMessages);
  useEffect(() => {
    if (typeof title === "string") document.title = formatTitle(title, crumb?.label, "Xpot");
  }, [title, crumb?.label]);
  // "My company" comes back to the screen it was left on.
  useEffect(() => {
    if (panel) rememberPanelRoute(`${location}${search ? `?${search}` : ""}`);
  }, [panel, location, search]);
  useEffect(() => {
    if (module === "visits" && "Notification" in window && Notification.permission === "granted") {
      void subscribeToRoutePush().catch((error) => console.error("[push subscription] failed:", error));
    }
  }, [module]);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // Not remembered; the sidebar opens expanded next time.
      }
      return !c;
    });
  };
  const showPhoneBar = phoneBar ?? panel;

  return (
    <Background>
      <a
        href="#xpot-main-content"
        className="sr-only z-[1000] rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-xl focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {tShell("skipToContent")}
      </a>
      <DesktopSidebar collapsed={collapsed} onToggle={toggle} />
      <div className={`relative ${collapsed ? "lg:pl-[72px]" : "lg:pl-60"}`}>
        <DesktopTopBar
          title={title}
          crumb={crumb}
          actions={topBarActions}
          onSearch={() => setPaletteOpen(true)}
          management={panel}
        />
        <ActiveVisitBanner />
        <div
          className={`relative mx-auto flex min-h-screen w-full ${mobileMaxWidth} flex-col px-4 ${mobileColumnClassName} lg:min-h-0 lg:px-8 lg:pb-12 lg:pt-6 ${
            { narrow: "lg:max-w-2xl", medium: "lg:max-w-5xl", wide: "lg:max-w-[1400px]" }[size ?? (wide ? "wide" : "narrow")]
          }`}
          style={mobileColumnStyle}
        >
          {showPhoneBar ? <PhoneTopBar module={module} title={title} /> : null}
          {mobileHeader ? <div className="lg:hidden">{mobileHeader}</div> : null}
          <main id="xpot-main-content" tabIndex={-1} className="flex-1">
            <ScreenErrorBoundary resetKey={location}>{children}</ScreenErrorBoundary>
          </main>
          {panel ? <div className="h-20 shrink-0 lg:hidden" aria-hidden="true" /> : null}
        </div>
        {panel ? <div className="lg:hidden"><PanelTabBar groups={groups} profile={profile} /></div> : mobileNav ? <div className="lg:hidden">{mobileNav}</div> : null}
      </div>
      {isDesktop && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} pages={pages} />}
    </Background>
  );
}
