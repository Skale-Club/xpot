import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  LogOut,
  MapPinned,
  Nfc,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Building2,
  Camera,
  type LucideIcon,
} from "lucide-react";
import type { XpotModule } from "@shared/modules";
import { formatTitle } from "@shared/seo";
import { useViewerAccess } from "@/lib/adminMode";
import { AdminBadge } from "./AdminBadge";
import { rememberModule, useXpotModules } from "@/components/ModuleSwitch";
import { MODULE_HOME, moduleEntryPath, rememberModuleRoute } from "@/lib/xpot";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { signOut } from "@/lib/signOut";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AppBackground } from "./AppBackground";
import { CommandPalette } from "./CommandPalette";
import { useDesktopShortcuts } from "./useDesktopShortcuts";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { BRAND_GRADIENT, MODULE_ACCENT } from "./surface";
import { contextOfPath, moduleGroups, organizationItems, starts, type NavGroup, type NavItem, type ShellContext } from "./moduleNav";
import { XpotLogo } from "./XpotLogo";
import { InstallAppSidebarItem } from "./InstallApp";
import { AdminModeBar, AdminModeSidebarItem } from "./AdminMode";
import { ScreenErrorBoundary } from "./ScreenErrorBoundary";
import { UserGreeting } from "./UserGreeting";
import { dashboardMessages } from "@/i18n/messages/dashboard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// The frame around every rep screen. Below `lg` it is the phone column the app
// always had (the caller passes its header row and bottom nav). From `lg` up a
// sidebar and a top bar take over, and those mobile pieces are hidden.

const COLLAPSED_KEY = "xpot.sidebar.collapsed";

export type { NavGroup, NavItem } from "./moduleNav";

/**
 * The phone column of both modules' screens. Visits and Tags must use exactly
 * the same spacing above the shell header and module switch: any difference
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

/**
 * Where the current screen sits: its part of the app, the module whose screens
 * the sidebar lists (on an account page, the last module used), and the groups.
 */
function useShellNav() {
  const t = useT(shellMessages);
  const tc = useT(commonMessages);
  const tt = useT(tagsMessages);
  const [location] = useLocation();
  const modules = useXpotModules();
  // Management items follow admin mode: off, a manager sees the app as a rep does.
  const access = useViewerAccess();
  const me = access.me;
  const viewer = {
    canManage: access.canManage,
    isAdmin: access.isSuperAdmin,
  };
  const labels = { shell: t, tags: tt };

  const context = contextOfPath(location);
  const workspaceItem: NavItem = { href: "/organizations", label: t("navOrganization"), icon: Building2, match: starts("/organizations") };
  const managementItems = viewer.canManage ? organizationItems(labels, viewer) : [];
  const organization = me ? [workspaceItem, ...managementItems] : [];
  const settingsItem: NavItem = { href: "/settings", label: t("navSettings"), icon: Settings, match: starts("/settings") };
  // On an account page no module is current: the sidebar lists the account itself.
  const module: XpotModule | null = context === "account" ? null : modules.includes(context) ? context : modules[0] ?? null;
  const groups: NavGroup[] = context === "account"
    ? [{ label: "", items: [settingsItem] }, ...(organization.length ? [{ label: t("navOrganization"), items: organization }] : [])]
    : module
      ? moduleGroups(module, viewer, labels)
      : [];
  const moduleLabel = (m: XpotModule) => (m === "visits" ? tc("moduleVisits") : tc("moduleTags"));

  // Every screen for the command palette, grouped by where it lives, this module first.
  const order = module ? [module, ...modules.filter((m) => m !== module)] : modules;
  const pages = [
    ...order.flatMap((m) => moduleGroups(m, viewer, labels).flatMap((g) => g.items.map((i) => ({ ...i, group: moduleLabel(m) })))),
    { ...settingsItem, group: t("moduleAccount") },
    ...organization.map((i) => ({ ...i, group: t("moduleAccount") })),
  ];

  return { context, module, modules, groups, organization, pages, moduleLabel, me };
}

type Accent = (typeof MODULE_ACCENT)[ShellContext];

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
      {item.adminOnly && (collapsed ? <AdminBadge dot className="absolute right-1.5 top-1.5" /> : <AdminBadge className="relative ml-auto" />)}
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
  const [location, navigate] = useLocation();
  if (modules.length === 0) return null;
  const go = (m: XpotModule) => {
    if (m === module) return;
    if (module) rememberModuleRoute(module, `${window.location.pathname}${window.location.search}`);
    rememberModule(m);
    navigate(moduleEntryPath(m));
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

function DesktopSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useT(shellMessages);
  const td = useT(dashboardMessages);
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [location, navigate] = useLocation();
  const { context, module, modules, groups, moduleLabel, me } = useShellNav();
  const accent = MODULE_ACCENT[module ?? "account"];
  const online = useOnline();
  const routesQuery = useQuery<Array<{ routeDate: string; status: string }>>({
    queryKey: ["/api/xpot/prospecting/routes"],
    enabled: module === "visits",
  });
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const routeMissingToday = routesQuery.isSuccess && !routesQuery.data.some((route) => route.routeDate === todayKey && route.status !== "cancelled");

  const name = me
    ? me.rep.displayName || [me.user.firstName, me.user.lastName].filter(Boolean).join(" ").trim() || me.user.email
    : "";
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const firstName = name.split(" ")[0] ?? "";

  const avatarMutation = useMutation({
    mutationFn: async (imageData: string) => {
      const response = await apiRequest("POST", "/api/xpot/me/avatar", { imageData });
      return response.json() as Promise<{ avatarUrl: string }>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
      toast({ title: td("photoUpdated") });
    },
    onError: (error: Error) => toast({ title: td("uploadFailed"), description: error.message, variant: "destructive" }),
  });

  const onAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => avatarMutation.mutate(reader.result as string);
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  // One door to the account (profile, and the Organization for managers); its pages list the rest.
  const footer: NavItem[] = context === "account"
    ? []
    : [{ href: "/settings", label: t("moduleAccount"), icon: Settings, match: () => false }];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.07] lg:flex ${collapsed ? "w-[72px]" : "w-60"}`}
      style={{ background: "rgba(8, 12, 24, 0.92)", backdropFilter: "blur(20px)" }}
      data-testid="desktop-sidebar"
      data-context={context}
    >
      {/* Where you are, as a coloured line along the top. */}
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: MODULE_ACCENT[context].solid }} aria-hidden="true" />
      <div className={`flex h-16 shrink-0 items-center ${collapsed ? "justify-center" : "justify-between px-4"}`}>
        {!collapsed && (
          <Link href={MODULE_HOME[module ?? modules[0] ?? "visits"]} className="flex items-center" aria-label="Xpot">
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

      <div className="px-3 pb-3">
        <div className={`flex items-center ${collapsed ? "justify-center py-2" : "gap-3 px-2 py-2"}`}>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarMutation.isPending}
            title={td("changePhoto")}
            aria-label={td("changePhoto")}
            className="group relative shrink-0 touch-manipulation rounded-2xl transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 active:scale-95 disabled:cursor-wait"
          >
            {me?.rep.avatarUrl ? (
              <img src={me.rep.avatarUrl} alt="" className={`${collapsed ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-2xl"} border border-white/10 object-cover`} />
            ) : (
              <div
                className={`${collapsed ? "h-9 w-9 rounded-xl text-xs" : "h-11 w-11 rounded-2xl text-sm"} flex items-center justify-center font-bold text-white`}
                style={{ background: BRAND_GRADIENT }}
              >
                {initials}
              </div>
            )}
            <span className={`${collapsed ? "rounded-xl" : "rounded-2xl"} absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${avatarMutation.isPending ? "opacity-100" : ""}`} aria-hidden="true">
              {avatarMutation.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Camera className="h-4 w-4 text-white" />}
            </span>
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#080c18] ${online ? "bg-emerald-400" : "bg-slate-500"}`} />
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
          {!collapsed && <UserGreeting name={firstName} compact />}
        </div>
      </div>

      <div className="px-3 pb-3">
        <SidebarModuleSwitch collapsed={collapsed} module={module} modules={modules} label={moduleLabel} />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label={module ? moduleLabel(module) : t("moduleAccount")}>
        {context === "account" && !collapsed && (
          <div className="px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("moduleAccount")}</div>
        )}
        {groups.map((group, i) => (
          <div key={group.label || i} className="space-y-1">
            {group.label && !collapsed && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">{group.label}</div>
            )}
            {group.label && collapsed && <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden="true" />}
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                active={item.match(location)}
                accent={accent}
                warningLabel={item.href === "/route" && routeMissingToday ? td("noRouteToday") : undefined}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/[0.07] px-3 py-3">
        <AdminModeSidebarItem collapsed={collapsed} />
        <InstallAppSidebarItem collapsed={collapsed} />
        {footer.map((item) => (
          <SidebarLink key={item.href} item={item} collapsed={collapsed} active={item.match(location)} accent={MODULE_ACCENT.account} />
        ))}
        <button
          type="button"
          onClick={() => void signOut(navigate)}
          title={collapsed ? t("signOut") : undefined}
          aria-label={t("signOut")}
          className={`flex h-10 w-full items-center rounded-xl text-sm font-medium text-white/45 transition-colors hover:bg-red-500/10 hover:text-red-300 ${collapsed ? "justify-center" : "gap-3 px-3"}`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>{t("signOut")}</span>}
        </button>
      </div>
    </aside>
  );
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function DesktopTopBar({ title, crumb, actions, onSearch }: {
  title: ReactNode;
  /** The part of the app ("Tags", "Account"), in its colour, before the title. */
  crumb: { label: string; context: ShellContext } | null;
  actions?: ReactNode;
  onSearch: () => void;
}) {
  const t = useT(shellMessages);
  const online = useOnline();
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header
      className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-white/[0.07] px-8 lg:flex"
      style={{ background: "rgba(6, 9, 18, 0.8)", backdropFilter: "blur(20px)" }}
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

  if (!visit || location.startsWith("/route") || location.startsWith("/leads/prospecting") || location.startsWith("/check-in")) return null;
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
  mobileColumnClassName = "pb-28 pt-5",
  mobileMaxWidth = "max-w-md",
  mobileColumnStyle,
}: {
  /** Shown in the desktop top bar. */
  title: ReactNode;
  children: ReactNode;
  /** Phone-only row above the content (module switch, offline notice…). */
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
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [location] = useLocation();
  const isDesktop = useIsDesktop();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((o) => !o), []);
  useDesktopShortcuts({ enabled: isDesktop, onPalette: togglePalette });
  const { pages, context, module, moduleLabel } = useShellNav();
  const tShell = useT(shellMessages);
  const crumb = context === "account"
    ? { label: tShell("moduleAccount"), context }
    : module
      ? { label: moduleLabel(module), context: module as ShellContext }
      : null;
  useEffect(() => {
    if (typeof title === "string") document.title = formatTitle(title, crumb?.label, "Xpot");
  }, [title, crumb?.label]);
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
    <AppBackground>
      <a
        href="#xpot-main-content"
        className="fixed left-4 top-4 z-[1000] -translate-y-24 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform focus:translate-y-0"
      >
        {tShell("skipToContent")}
      </a>
      <DesktopSidebar collapsed={collapsed} onToggle={toggle} />
      <div className={`relative ${collapsed ? "lg:pl-[72px]" : "lg:pl-60"}`}>
        <AdminModeBar />
        <DesktopTopBar title={title} crumb={crumb} actions={topBarActions} onSearch={() => setPaletteOpen(true)} />
        <ActiveVisitBanner />
        <div
          className={`relative mx-auto flex min-h-screen w-full ${mobileMaxWidth} flex-col px-4 ${mobileColumnClassName} lg:min-h-0 lg:px-8 lg:pb-12 lg:pt-6 ${
            { narrow: "lg:max-w-2xl", medium: "lg:max-w-5xl", wide: "lg:max-w-[1400px]" }[size ?? (wide ? "wide" : "narrow")]
          }`}
          style={mobileColumnStyle}
        >
          {mobileHeader ? <div className="lg:hidden">{mobileHeader}</div> : null}
          <main id="xpot-main-content" tabIndex={-1} className="flex-1">
            <ScreenErrorBoundary resetKey={location}>{children}</ScreenErrorBoundary>
          </main>
        </div>
        {mobileNav ? <div className="lg:hidden">{mobileNav}</div> : null}
      </div>
      {isDesktop && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} pages={pages} />}
    </AppBackground>
  );
}
