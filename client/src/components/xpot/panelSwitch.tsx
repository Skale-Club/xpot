import { MapPinned, Printer, ShieldCheck, type LucideIcon } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";
import { homeForModules, homeModule, useXpotModules } from "@/components/ModuleSwitch";
import { useViewerAccess } from "@/lib/adminMode";
import { rememberModuleRoute } from "@/lib/xpot";
import { contextOfPath } from "./moduleNav";
import { panelEntryPath, rememberPanelRoute } from "./panelRoute";
import { usePanelNames } from "./panelNames";
import { panelOfPath, panelsOf, type Panel } from "./panels";
import { MODULE_ACCENT } from "./surface";

// The way between the person's panels (components/xpot/panels.ts): a selector at the top of the desktop sidebar, and on a
// phone, which has no sidebar, a button per other panel in the shell header (Visits) and the amber bar (the others).

export type Accent = { solid: string; soft: string; strong: string; text: string };
/** Admin and the management surface are amber; Production wears the Tags violet and Visits its blue (components/xpot/surface.ts). */
export const MANAGEMENT_ACCENT: Accent = { solid: "#fbbf24", soft: "rgba(251,191,36,0.12)", strong: "rgba(251,191,36,0.2)", text: "text-amber-200" };
export const PANEL_ACCENT: Record<Panel, Accent> = { admin: MANAGEMENT_ACCENT, production: MODULE_ACCENT.tags, visits: MODULE_ACCENT.visits };
export const PANEL_ICON: Record<Panel, LucideIcon> = { admin: ShieldCheck, production: Printer, visits: MapPinned };

/** The person's panels, the one they are in, and the way to another. An owner has one (Visits), so no selector (docs/PANELS_EXECUTION_PLAN.md F4). */
export function usePanelSwitch() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const modules = useXpotModules();
  const { profile, panelChrome } = useViewerAccess();
  const { panelLabel } = usePanelNames();
  const panels = panelsOf(profile, modules);
  const here = `${location}${search ? `?${search}` : ""}`;
  const current: Panel = panelChrome ? panelOfPath(here, profile) : "visits";
  const go = (target: Panel) => {
    if (target === current) return;
    // Leave a note of where the person was, so coming back lands on the same screen.
    if (current === "visits") {
      const module = contextOfPath(location);
      rememberModuleRoute(module === "account" ? homeModule(modules) : module, here);
    } else rememberPanelRoute(here, current);
    navigateGuarded(target === "visits" ? homeForModules(modules) : panelEntryPath(target), navigate);
  };
  return { panels, current, go, label: panelLabel };
}

/**
 * The panel selector at the top of the sidebar: the twin of SidebarModuleSwitch, every panel the person has in its own
 * colour. With three, the name goes under the icon so "Production" fits the sidebar's width.
 */
export function SidebarPanelSelector({ collapsed }: { collapsed: boolean }) {
  const t = useT(workspacesMessages);
  const { panels, current, go, label } = usePanelSwitch();
  if (panels.length < 2) return null;
  const stacked = panels.length > 2 && !collapsed;
  return (
    <div
      role="tablist"
      aria-label={t("switchPanel")}
      className={`flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 ${collapsed ? "flex-col" : ""}`}
      data-testid="sidebar-panel-selector"
    >
      {panels.map((panel) => {
        const Icon = PANEL_ICON[panel];
        const accent = PANEL_ACCENT[panel];
        const active = panel === current;
        return (
          <button
            key={panel}
            type="button"
            role="tab"
            aria-selected={active}
            title={collapsed ? label(panel) : undefined}
            onClick={() => go(panel)}
            disabled={active}
            className={`relative flex min-w-0 flex-1 items-center justify-center rounded-xl font-semibold transition-colors disabled:cursor-default ${stacked ? "h-12 flex-col gap-0.5 px-1 text-[11px]" : "h-9 gap-2 text-sm"} ${active ? "text-white" : "text-white/45 hover:text-white/80"}`}
            data-testid={`sidebar-panel-${panel}`}
          >
            {active && <span className="absolute inset-0 rounded-xl" style={{ background: accent.strong }} />}
            <Icon className={`relative h-4 w-4 shrink-0 ${active ? accent.text : ""}`} />
            {!collapsed && <span className="relative max-w-full truncate">{label(panel)}</span>}
          </button>
        );
      })}
    </div>
  );
}
