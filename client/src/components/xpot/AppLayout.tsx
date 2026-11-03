import { Suspense, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ScreenLoader } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  Camera,
  ChevronRight,
  LogOut,
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
import { VISIT_MAX_SECONDS, visitTimeLimitReached } from "@shared/visit-time-limit";
import { checkinMessages } from "@/i18n/messages/checkin";
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
import { BRAND_GRADIENT, MODULE_ACCENT } from "./surface";
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
import { useOnline } from "@/hooks/use-online";
import { rememberPanelRoute } from "./panelRoute";
import { PanelTabBar } from "./PanelTabBar";
import { AdminModeBar } from "./AdminMode";
import { PanelDoorRow } from "./panelDoor";
import { SignOutConfirm } from "./SignOutConfirm";
import { InstallAppSidebarItem } from "./InstallApp";
import { UserGreeting } from "./UserGreeting";
import { useAvatarUpload } from "./useAvatarUpload";
import { ScreenErrorBoundary } from "./ScreenErrorBoundary";
import { usePanelNames } from "./panelNames";
import { PersistentRouteProgress } from "./PersistentRouteProgress";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";
import { subscribeToRoutePush } from "@/lib/pushNotifications";
import { useRememberedScroll } from "@/hooks/use-remembered-scroll";
import { usePageScroll } from "@/hooks/use-page-scroll";

// The frame around every rep screen. Below `lg` it is the phone column the app
// always had (the caller passes its header row and bottom nav). From `lg` up a
// sidebar and a top bar take over, and those mobile pieces are hidden. Two areas,
// told apart by colour: the modules, and the panel (amber), which has its own bar
// at the top; the way between them is a door at the foot of the sidebar and a
// round button on the phone header (ShellHeader).

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
 * The module switch at the top of the sidebar: the desktop twin of the phone's
 * ModuleSwitch. Both modules always visible, each in its own colour; a rep with
 * one module sees just its name.
 */
function SidebarModuleSwitch({ collapsed, module, modules, label }: {
  collapsed: boolean;
  module: XpotModule | null;
  modules: XpotModule[];
  label: (m: XpotModule) => string;
}) {
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  if (modules.length === 0) return null;
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
            data-preload-href={moduleEntryPath(m)}
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
  useEffect(() => {
    if (!holdsScreen || open) return;
    // Entering a group opens it for the rest of the session too. Otherwise
    // leaving its last active screen collapses the menu and clamps its scroll.
    setOpen(true);
    try { window.localStorage.setItem(key, "1"); } catch { /* Kept in state. */ }
  }, [holdsScreen, open, key]);
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
function ScrollingNav({ children, label, scrollKey }: { children: ReactNode; label: string; scrollKey: string }) {
  const { ref, remember } = useRememberedScroll<HTMLElement>(scrollKey);
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
      <nav ref={ref} onScroll={() => { remember(); measure(); }} onClickCapture={remember} className="h-full space-y-6 overflow-y-auto px-3 py-2" aria-label={label}>{children}</nav>
      {more ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0a0e1a] to-transparent" aria-hidden="true" data-testid="sidebar-more-below" /> : null}
    </div>
  );
}

function DesktopSidebar({ collapsed, onToggle, pending }: { collapsed: boolean; onToggle: () => void; pending: boolean }) {
  const t = useT(shellMessages);
  const [location] = useLocation();
  const { context, module, modules, groups, moduleLabel, me, panel } = useShellNav();
  const { panelName } = usePanelNames();
  const { profile } = useViewerAccess();
  const avatar = useAvatarUpload();
  const online = useOnline();
  const [, navigate] = useLocation();
  const [confirming, setConfirming] = useState(false);
  const name = me
    ? me.rep.displayName || [me.user.firstName, me.user.lastName].filter(Boolean).join(" ").trim() || me.user.email
    : "";
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const firstName = name.split(" ")[0] ?? "";
  const accent = panel ? MANAGEMENT_ACCENT : MODULE_ACCENT[module ?? "visits"];

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

      {!panel ? <div className="px-3 pb-3">
        <div className={`flex items-center ${collapsed ? "justify-center py-2" : "gap-3 px-2 py-2"}`}>
          <button
            type="button"
            onClick={avatar.pick}
            disabled={avatar.pending}
            title={avatar.label}
            aria-label={avatar.label}
            className="group relative shrink-0 touch-manipulation rounded-2xl transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 active:scale-95 disabled:cursor-wait"
          >
            {me?.rep.avatarUrl ? (
              <img src={me.rep.avatarUrl} alt="" className={`${collapsed ? "h-9 w-9 rounded-xl" : "h-12 w-12 rounded-[18px]"} border border-white/10 object-cover`} />
            ) : (
              <div
                className={`${collapsed ? "h-9 w-9 rounded-xl text-xs" : "h-12 w-12 rounded-[18px] text-base"} flex items-center justify-center font-bold text-white`}
                style={{ background: BRAND_GRADIENT }}
              >
                {initials}
              </div>
            )}
            <span className={`${collapsed ? "rounded-xl" : "rounded-[18px]"} absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${avatar.pending ? "opacity-100" : ""}`} aria-hidden="true">
              {avatar.pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Camera className="h-4 w-4 text-white" />}
            </span>
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#080c18] ${online ? "bg-emerald-400" : "bg-slate-500"}`} />
          </button>
          <input {...avatar.inputProps} />
          {!collapsed && <UserGreeting name={firstName} compact />}
        </div>
      </div> : null}

      <div className="space-y-2 px-3 pb-3">
        {panel ? <div className={`flex min-h-20 items-center gap-3 border-b border-amber-200/10 pb-4 text-amber-100 ${collapsed ? "justify-center" : "px-2"}`} title={panelName(profile)}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/10"><ShieldCheck className="h-5 w-5" /></span>{!collapsed && <span className="text-base font-semibold leading-snug">{panelName(profile)}</span>}</div> : <SidebarModuleSwitch collapsed={collapsed} module={module} modules={modules} label={moduleLabel} />}
        {module === "visits" && !panel && !pending ? <PersistentRouteProgress collapsed={collapsed} className={collapsed ? "mt-2" : "mt-2.5"} /> : null}
      </div>

      <ScrollingNav scrollKey={`sidebar.${me?.user.id ?? "guest"}.${panel ? "management" : module ?? "account"}.${collapsed ? "collapsed" : "expanded"}`} label={panel ? panelName(profile) : module ? moduleLabel(module) : t("navSettings")}>
        {groups.map((group, i) => {
          const items = group.items.map((item) => <SidebarLink key={item.href} item={item} collapsed={collapsed} active={item.match(location)} accent={accent} />);
          if (group.collapsible && !collapsed) return <CollapsibleGroup key={group.label || i} group={group}>{items}</CollapsibleGroup>;
          return <div key={group.label || i} className="space-y-1">
            {group.label && !collapsed ? <div className="flex items-center gap-2 px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35"><span className="truncate">{group.label}</span>{group.adminOnly && <AdminBadge className="ml-auto" />}</div> : null}
            {group.label && collapsed ? <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden="true" /> : null}
            {items}
          </div>;
        })}
      </ScrollingNav>

      <div className="space-y-1 border-t border-white/[0.07] px-3 py-3">
        {panel && !collapsed ? <p className="truncate px-3 pb-2 text-xs text-white/35">{name}</p> : null}
        <PanelDoorRow collapsed={collapsed} />
        {!panel && <InstallAppSidebarItem collapsed={collapsed} />}
        {!panel ? <SidebarLink item={{ href: "/settings", label: t("navSettings"), icon: Settings, match: starts("/settings") }} collapsed={collapsed} active={starts("/settings")(location)} accent={MODULE_ACCENT.visits} /> : null}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title={collapsed ? t("signOut") : undefined}
          aria-label={t("signOut")}
          className={`flex h-10 w-full items-center rounded-xl text-sm font-medium text-white/45 transition-colors hover:bg-red-500/10 hover:text-red-300 ${collapsed ? "justify-center" : "gap-3 px-3"}`}
          data-testid="sidebar-sign-out"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>{t("signOut")}</span>}
        </button>
        <SignOutConfirm open={confirming} onOpenChange={setConfirming} />
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
  const minutes = Math.min(VISIT_MAX_SECONDS / 60, Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000)));
  const h = Math.floor(minutes / 60);
  return h ? `${h}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}

/** Persistent resume strip while a visit is active, on phone and desktop. */
function ActiveVisitBanner() {
  const t = useT(shellMessages);
  const tc = useT(checkinMessages);
  const [location] = useLocation();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false, refetchInterval: (query) => query.state.data?.activeVisit ? 30_000 : false });
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
          {/* On a phone the company is what matters; "visit in progress" would push its name off the strip. */}
          {lead ? <><span className="sm:hidden">{lead}</span><span className="hidden sm:inline">{t("activeVisitAt", { lead })}</span></> : t("activeVisit")}
        </span>
        <span className="tabular-nums text-emerald-200/70">{visitTimeLimitReached(visit.checkedInAt) ? tc("visitLimitReached") : elapsedLabel(visit.checkedInAt)}</span>
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
  mobileColumnClassName = "pb-28 pt-5",
  mobileMaxWidth = "max-w-md",
  mobileColumnStyle,
  pending = false,
}: {
  /** Shown in the desktop top bar. */
  title: ReactNode;
  children: ReactNode;
  /** Phone-only row above the content (the shell header, module switch, offline notice…). */
  mobileHeader?: ReactNode;
  /** Phone-only bottom navigation. */
  mobileNav?: ReactNode;
  topBarActions?: ReactNode;
  /** Let the content use the full desktop width (redesigned screens). */
  wide?: boolean;
  /** Desktop content width; overrides `wide`. "medium" suits forms. */
  size?: "narrow" | "medium" | "wide";
  /** Width cap below `lg` (admin tables need more than a phone column on a tablet). */
  mobileMaxWidth?: string;
  /** Padding of the phone column; desktop padding is fixed. */
  mobileColumnClassName?: string;
  mobileColumnStyle?: CSSProperties;
  /** Loading a route or changing data scope: render chrome without scoped requests. */
  pending?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [location] = useLocation();
  const search = useSearch();
  const isDesktop = useIsDesktop();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((o) => !o), []);
  useDesktopShortcuts({ enabled: isDesktop, onPalette: togglePalette });
  const { pages, crumb: area, panel, module, groups, profile, me } = useShellNav();
  const mainRef = usePageScroll(me?.user.id ?? "guest", isDesktop, pending);
  // A screen named like its module shows the name once.
  const crumb = area && area.label !== title ? area : null;
  const Background = panel ? ManagementBackground : AppBackground;
  const tShell = useT(shellMessages);
  useEffect(() => {
    if (typeof title === "string") document.title = formatTitle(title, crumb?.label, "Xpot");
  }, [title, crumb?.label]);
  // The account menu's "My company" comes back to the screen the panel was left on.
  useEffect(() => {
    if (panel) rememberPanelRoute(`${location}${search ? `?${search}` : ""}`);
  }, [panel, location, search]);
  useEffect(() => {
    if (!pending && module === "visits" && "Notification" in window && Notification.permission === "granted") {
      void subscribeToRoutePush().catch((error) => console.error("[push subscription] failed:", error));
    }
  }, [module, pending]);
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

  return (
    <Background>
      <a
        href="#xpot-main-content"
        className="sr-only z-[1000] rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-xl focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {tShell("skipToContent")}
      </a>
      <DesktopSidebar collapsed={collapsed} onToggle={toggle} pending={pending} />
      <div className={`relative ${collapsed ? "lg:pl-[72px]" : "lg:pl-60"}`}>
        <AdminModeBar />
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
          {/* The panel has no shell header: the bar above names it, and the screen's title is said once here (a phone has no top bar). */}
          {panel ? <h1 className="mb-4 truncate text-lg font-bold tracking-tight text-white lg:hidden" data-testid="phone-title">{title}</h1> : null}
          {mobileHeader ? <div className="lg:hidden">{mobileHeader}</div> : null}
          <main ref={mainRef} id="xpot-main-content" tabIndex={-1} className="flex-1">
            <ScreenErrorBoundary resetKey={location}>
              <Suspense fallback={<ScreenLoader />}>{children}</Suspense>
            </ScreenErrorBoundary>
          </main>
          {panel ? <div className="h-20 shrink-0 lg:hidden" aria-hidden="true" /> : null}
        </div>
        {panel ? <div className="lg:hidden"><PanelTabBar groups={groups} profile={profile} /></div> : mobileNav ? <div className="lg:hidden">{mobileNav}</div> : null}
      </div>
      {isDesktop && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} pages={pages} />}
    </Background>
  );
}
