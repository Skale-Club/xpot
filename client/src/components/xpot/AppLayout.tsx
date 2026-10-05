import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Building2,
  Clock3,
  DollarSign,
  Home,
  Link2,
  LogOut,
  MapPinned,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useXpotModules } from "@/components/ModuleSwitch";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { signOut } from "@/lib/signOut";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AppBackground } from "./AppBackground";
import { BRAND_GRADIENT } from "./surface";

// The frame around every rep screen. Below `lg` it is the phone column the app
// always had (the caller passes its header row and bottom nav). From `lg` up a
// sidebar and a top bar take over, and those mobile pieces are hidden.

const COLLAPSED_KEY = "xpot.sidebar.collapsed";

export type NavItem = { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean };
export type NavGroup = { label: string; items: NavItem[] };

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function canAdminister(me: XpotMeResponse | undefined | null) {
  return !!me && (me.user.isAdmin || ["admin", "manager"].includes(me.rep.role));
}

function useNavGroups(): Array<{ label: string; items: NavItem[] }> {
  const t = useT(shellMessages);
  const tc = useT(commonMessages);
  const tt = useT(tagsMessages);
  const modules = useXpotModules();
  const groups: Array<{ label: string; items: NavItem[] }> = [];
  const starts = (prefix: string) => (path: string) => path === prefix || path.startsWith(`${prefix}/`);

  if (modules.includes("visits")) {
    groups.push({
      label: tc("moduleVisits"),
      items: [
        { href: "/dashboard", label: t("tabDashboard"), icon: Activity, match: starts("/dashboard") },
        { href: "/visits", label: t("tabVisits"), icon: Clock3, match: starts("/visits") },
        { href: "/leads", label: t("tabLeads"), icon: Building2, match: starts("/leads") },
        { href: "/sales", label: t("tabSales"), icon: DollarSign, match: starts("/sales") },
      ],
    });
  }
  if (modules.includes("tags")) {
    groups.push({
      label: tc("moduleTags"),
      items: [
        { href: "/tags", label: tt("navHome"), icon: Home, match: (p) => p === "/tags" || p.startsWith("/tags/t/") },
        { href: "/tags/pieces", label: tt("navPieces"), icon: Package, match: starts("/tags/pieces") },
        { href: "/tags/direct", label: tt("navDirect"), icon: Link2, match: starts("/tags/direct") },
      ],
    });
  }
  return groups;
}

function SidebarLink({ item, collapsed, active }: { item: NavItem; collapsed: boolean; active: boolean }) {
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
      {active && (
        <span
          className="absolute inset-0 rounded-xl"
          style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(99,102,241,0.22) 100%)" }}
        />
      )}
      <Icon className={`relative h-[18px] w-[18px] shrink-0 ${active ? "text-blue-300" : ""}`} />
      {!collapsed && <span className="relative truncate">{item.label}</span>}
    </Link>
  );
}

function DesktopSidebar({ collapsed, onToggle, extraGroups = [] }: { collapsed: boolean; onToggle: () => void; extraGroups?: NavGroup[] }) {
  const t = useT(shellMessages);
  const [location, navigate] = useLocation();
  const groups = [...useNavGroups(), ...extraGroups];
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });

  const name = me
    ? me.rep.displayName || [me.user.firstName, me.user.lastName].filter(Boolean).join(" ").trim() || me.user.email
    : "";
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const footer: NavItem[] = [
    { href: "/settings", label: t("navSettings"), icon: Settings, match: (p) => p.startsWith("/settings") },
    ...(canAdminister(me)
      ? [{ href: "/admin/overview", label: t("navAdmin"), icon: Shield, match: (p: string) => p.startsWith("/admin") }]
      : []),
  ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.07] lg:flex ${collapsed ? "w-[72px]" : "w-60"}`}
      style={{ background: "rgba(8, 12, 24, 0.92)", backdropFilter: "blur(20px)" }}
      data-testid="desktop-sidebar"
    >
      <div className={`flex h-16 shrink-0 items-center ${collapsed ? "justify-center" : "justify-between px-4"}`}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm" style={{ background: BRAND_GRADIENT }}>
              <MapPinned className="h-4 w-4" />
            </span>
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

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            {!collapsed && groups.length > 1 && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">{group.label}</div>
            )}
            {group.items.map((item) => (
              <SidebarLink key={item.href} item={item} collapsed={collapsed} active={item.match(location)} />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/[0.07] px-3 py-3">
        {footer.map((item) => (
          <SidebarLink key={item.href} item={item} collapsed={collapsed} active={item.match(location)} />
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

function DesktopTopBar({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  const t = useT(shellMessages);
  const online = useOnline();
  return (
    <header
      className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-white/[0.07] px-8 lg:flex"
      style={{ background: "rgba(6, 9, 18, 0.8)", backdropFilter: "blur(20px)" }}
    >
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-white">{title}</h1>
      {actions}
      <span className={`flex items-center gap-1.5 text-xs ${online ? "text-white/40" : "text-red-300"}`}>
        <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} />
        {online ? t("online") : t("offline")}
      </span>
      <LanguagePicker compact />
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
  extraNavGroups,
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
  /** Extra sidebar groups for this screen (the admin sections). */
  extraNavGroups?: NavGroup[];
  /** Width cap below `lg` (admin tables need more than a phone column on a tablet). */
  mobileMaxWidth?: string;
  /** Padding of the phone column; desktop padding is fixed. */
  mobileColumnClassName?: string;
  mobileColumnStyle?: CSSProperties;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
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
      <DesktopSidebar collapsed={collapsed} onToggle={toggle} extraGroups={extraNavGroups} />
      <div className={`relative ${collapsed ? "lg:pl-[72px]" : "lg:pl-60"}`}>
        <DesktopTopBar title={title} actions={topBarActions} />
        <ActiveVisitBanner />
        <div
          className={`relative mx-auto flex min-h-screen w-full ${mobileMaxWidth} flex-col px-4 ${mobileColumnClassName} lg:min-h-0 lg:px-8 lg:pb-12 lg:pt-6 ${
            { narrow: "lg:max-w-2xl", medium: "lg:max-w-5xl", wide: "lg:max-w-[1400px]" }[size ?? (wide ? "wide" : "narrow")]
          }`}
          style={mobileColumnStyle}
        >
          {mobileHeader ? <div className="lg:hidden">{mobileHeader}</div> : null}
          <main className="flex-1">{children}</main>
        </div>
        {mobileNav ? <div className="lg:hidden">{mobileNav}</div> : null}
      </div>
    </AppBackground>
  );
}
