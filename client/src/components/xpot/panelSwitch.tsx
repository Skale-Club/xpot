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

// The way between the person's panels (components/xpot/panels.ts). The app is the visits platform; going to Production or
// Admin is a choice to change page, so it sits at the foot of the desktop sidebar, never as tabs at its top (those belong
// to Visits | Tags). A phone, which has no sidebar, has a row per other panel in Settings (from Visits) and a button on the
// amber bar (the others).

export type Accent = { solid: string; soft: string; strong: string; text: string };
/** Admin and the management surface are amber; Production wears the Tags violet and Visits its blue (components/xpot/surface.ts). */
export const MANAGEMENT_ACCENT: Accent = { solid: "#fbbf24", soft: "rgba(251,191,36,0.12)", strong: "rgba(251,191,36,0.2)", text: "text-amber-200" };
export const PANEL_ACCENT: Record<Panel, Accent> = { admin: MANAGEMENT_ACCENT, production: MODULE_ACCENT.tags, visits: MODULE_ACCENT.visits };
export const PANEL_ICON: Record<Panel, LucideIcon> = { admin: ShieldCheck, production: Printer, visits: MapPinned };

/** The person's panels, the one they are in, and the way to another. An owner has one (Visits), so no way out (docs/PANELS_EXECUTION_PLAN.md F4). */
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

/** A row of the sidebar's foot per other panel the person has, in the style of the Settings row under them. */
export function SidebarPanelRows({ collapsed }: { collapsed: boolean }) {
  const t = useT(workspacesMessages);
  const { panels, current, go, label } = usePanelSwitch();
  const others = panels.filter((panel) => panel !== current);
  if (others.length === 0) return null;
  return (
    <nav aria-label={t("switchPanel")} className="space-y-1" data-testid="sidebar-panels">
      {others.map((panel) => {
        const Icon = PANEL_ICON[panel];
        return (
          <button
            key={panel}
            type="button"
            onClick={() => go(panel)}
            title={collapsed ? label(panel) : undefined}
            aria-label={label(panel)}
            className={`flex h-10 w-full items-center rounded-xl text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/85 ${collapsed ? "justify-center" : "gap-3 px-3"}`}
            data-testid={`sidebar-panel-${panel}`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{label(panel)}</span>}
          </button>
        );
      })}
    </nav>
  );
}
