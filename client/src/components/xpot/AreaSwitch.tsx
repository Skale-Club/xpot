import { useLocation } from "wouter";
import { Briefcase, ShieldCheck } from "lucide-react";
import type { XpotModule } from "@shared/modules";
import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { useViewerAccess } from "@/lib/adminMode";
import { homeForModules, useXpotModules } from "@/components/ModuleSwitch";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";
import { usePanelNames } from "./panelNames";
import { MODULE_ACCENT } from "./surface";

// The one door between the two areas: "My work" (the modules) and "My company"
// (the panel; "Platform" for the platform, "My companies" for an owner of
// several). It sits in the same place on both areas and both devices, and each
// side returns to the last screen used there. Someone without a panel has no
// area to switch to and never sees it.

const PANEL_ROUTE_KEY = "xpot.route.v1.panel";
const AMBER = { solid: "#fbbf24", strong: "rgba(251,191,36,0.2)", text: "text-amber-200" };

/** Remember the panel screen in use (this browser session), so "My company" comes back to it. */
export function rememberPanelRoute(route: string): void {
  try { window.sessionStorage.setItem(PANEL_ROUTE_KEY, route); } catch { /* The panel opens on Today. */ }
}

/** The last panel screen used, or Today. */
export function panelEntryPath(): string {
  try {
    const route = window.sessionStorage.getItem(PANEL_ROUTE_KEY);
    if (route && /^\/(?:admin|organizations)(?:[/?]|$)/.test(route)) return route;
  } catch { /* Storage blocked. */ }
  return "/admin";
}

export function clearPanelRoute(): void {
  try { window.sessionStorage.removeItem(PANEL_ROUTE_KEY); } catch { /* Nothing to clear. */ }
}

/** `narrow`: the sidebar's 208px: the names alone, in two lines when they need them, with no icon; collapsed it is the icons alone. */
export function AreaSwitch({ collapsed = false, narrow = false, module = null, className = "" }: { collapsed?: boolean; narrow?: boolean; module?: XpotModule | null; className?: string }) {
  const tw = useT(workspacesMessages);
  const [, navigate] = useLocation();
  const modules = useXpotModules();
  const { reach, adminMode, profile } = useViewerAccess();
  const { panelName } = usePanelNames();
  if (!reach) return null;
  const work = MODULE_ACCENT[module ?? "visits"];
  const sides = [
    { id: "work", label: tw("userArea"), icon: Briefcase, active: !adminMode, accent: work },
    { id: "panel", label: panelName(profile), icon: ShieldCheck, active: adminMode, accent: AMBER },
  ] as const;
  const go = (side: (typeof sides)[number]["id"]) => {
    if (side === "work" ? !adminMode : adminMode) return;
    const here = `${window.location.pathname}${window.location.search}`;
    if (side === "work") {
      rememberPanelRoute(here);
      navigateGuarded(homeForModules(modules), navigate);
    } else {
      navigateGuarded(panelEntryPath(), navigate);
    }
  };
  return (
    <div
      role="tablist"
      aria-label={tw("areaSwitchLabel")}
      className={`flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 ${collapsed ? "flex-col" : ""} ${className}`}
      data-testid="area-switch"
    >
      {sides.map(({ id, label, icon: Icon, active, accent }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active}
          title={collapsed ? label : undefined}
          onClick={() => go(id)}
          className={`relative flex min-w-0 flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl px-2 font-semibold transition-colors ${narrow && !collapsed ? "min-h-10 text-[13px] leading-tight" : "h-10 text-sm"} ${active ? "text-white" : "text-white/45 hover:text-white/80"}`}
          data-testid={`area-${id}`}
        >
          {active ? <span className="absolute inset-0 rounded-xl" style={{ background: accent.strong }} /> : null}
          {!collapsed ? null : <Icon className={`relative h-4 w-4 shrink-0 ${active ? accent.text : ""}`} aria-hidden="true" />}
          {!collapsed ? <span className={`relative ${narrow ? "text-center" : "truncate"}`}>{label}</span> : null}
        </button>
      ))}
    </div>
  );
}
