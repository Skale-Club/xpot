import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  LogOut,
  MapPinned,
  Nfc,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { canManage, isSuperAdmin, type XpotModule } from "@shared/modules";
import { AdminBadge } from "./AdminBadge";
import { LanguagePicker } from "@/components/LanguagePicker";
import { rememberModule, useXpotModules } from "@/components/ModuleSwitch";
import { MODULE_HOME } from "@/lib/xpot";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { signOut } from "@/lib/signOut";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AppBackground } from "./AppBackground";
import { CommandPalette } from "./CommandPalette";
import { useDesktopShortcuts } from "./useDesktopShortcuts";
import { useIsComputer, useIsDesktop } from "@/hooks/use-is-desktop";
import { BRAND_GRADIENT, MODULE_ACCENT } from "./surface";
import { contextOfPath, moduleGroups, organizationItems, starts, type NavGroup, type NavItem, type ShellContext } from "./moduleNav";
import { XpotMark } from "./XpotMark";
import { InstallAppSidebarItem } from "./InstallApp";
import { ScreenErrorBoundary } from "./ScreenErrorBoundary";

// The frame around every rep screen. Below `lg` it is the phone column the app
// always had (the caller passes its header row and bottom nav). From `lg` up a
// sidebar and a top bar take over, and those mobile pieces are hidden.

const COLLAPSED_KEY = "xpot.sidebar.collapsed";

export type { NavGroup, NavItem } from "./moduleNav";

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function canAdminister(me: XpotMeResponse | undefined | null) {
  return canManage(me);
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
  // A tablet at desktop width can still check in (decision D1 is about computers).
  const isComputer = useIsComputer();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const viewer = {
    canManage: canAdminister(me),
    isAdmin: isSuperAdmin(me),
    isComputer,
  };
  const labels = { shell: t, tags: tt };

  const context = contextOfPath(location);
  const organization = viewer.canManage ? organizationItems(labels, viewer) : [];
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

function SidebarLink({ item, collapsed, active, accent }: { item: NavItem; collapsed: boolean; active: boolean; accent: Accent }) {
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
    rememberModule(m);
    navigate(MODULE_HOME[m]);
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
  const [location, navigate] = useLocation();
  const { context, module, modules, groups, moduleLabel, me } = useShellNav();
  const accent = MODULE_ACCENT[module ?? "account"];

  const name = me
    ? me.rep.displayName || [me.user.firstName, me.user.lastName].filter(Boolean).join(" ").trim() || me.user.email
    : "";
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

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
          <Link href={MODULE_HOME[module ?? modules[0] ?? "visits"]} className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
            <XpotMark />
            Xpot
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
              <SidebarLink key={item.href} item={item} collapsed={collapsed} active={item.match(location)} accent={accent} />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/[0.07] px-3 py-3">
        <InstallAppSidebarItem collapsed={collapsed} />
        {footer.map((item) => (
          <SidebarLink key={item.href} item={item} collapsed={collapsed} active={item.match(location)} accent={MODULE_ACCENT.account} />
        ))}
        <div className={`mt-2 flex items-center gap-3 rounded-xl py-2 ${collapsed ? "flex-col px-0" : "px-2"}`}>
          {me?.rep.avatarUrl ? (
            <img src={me.rep.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl border border-white/10 object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold" style={{ background: BRAND_GRADIENT }}>
              {initials}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{name}</div>
              {me?.user.email && <div className="truncate text-[11px] text-white/35">{me.user.email}</div>}
            </div>
          )}
          <button
            type="button"
            onClick={() => void signOut(navigate)}
            title={t("signOut")}
            aria-label={t("signOut")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
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
      <LanguagePicker compact />
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

/** Desktop strip for a visit that was started on the phone. */
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

  if (!visit || location.startsWith("/check-in")) return null;
  const lead = visit.lead?.name;
  return (
    <div className="hidden px-8 pt-4 lg:block">
      <Link
        href="/check-in"
        className="flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-2.5 text-sm text-emerald-100 transition-colors hover:bg-emerald-400/[0.12]"
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
        <span className="font-semibold text-emerald-300">{t("openVisit")} →</span>
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
    if (typeof title === "string") document.title = crumb ? `${title} · ${crumb.label} · Xpot` : `${title} · Xpot`;
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
      <DesktopSidebar collapsed={collapsed} onToggle={toggle} />
      <div className={`relative ${collapsed ? "lg:pl-[72px]" : "lg:pl-60"}`}>
        <DesktopTopBar title={title} crumb={crumb} actions={topBarActions} onSearch={() => setPaletteOpen(true)} />
        <ActiveVisitBanner />
        <div
          className={`relative mx-auto flex min-h-screen w-full ${mobileMaxWidth} flex-col px-4 ${mobileColumnClassName} lg:min-h-0 lg:px-8 lg:pb-12 lg:pt-6 ${
            { narrow: "lg:max-w-2xl", medium: "lg:max-w-5xl", wide: "lg:max-w-[1400px]" }[size ?? (wide ? "wide" : "narrow")]
          }`}
          style={mobileColumnStyle}
        >
          {mobileHeader ? <div className="lg:hidden">{mobileHeader}</div> : null}
          <main className="flex-1">
            <ScreenErrorBoundary resetKey={location}>{children}</ScreenErrorBoundary>
          </main>
        </div>
        {mobileNav ? <div className="lg:hidden">{mobileNav}</div> : null}
      </div>
      {isDesktop && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} pages={pages} />}
    </AppBackground>
  );
}
