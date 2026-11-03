import { ArrowLeft, ShieldCheck, type LucideIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";
import { useViewerAccess } from "@/lib/adminMode";
import { homeForModules, homeModule, useXpotModules } from "@/components/ModuleSwitch";
import { panelEntryPath, rememberPanelRoute } from "./panelRoute";
import { usePanelNames } from "./panelNames";

/**
 * The door between the person's app and their panel, for someone who has a panel (nobody else sees it): from the app it
 * opens the panel, named as it is ("Platform", "My company", "My companies"), and comes back to where the panel was
 * left; inside the panel it is an arrow back to the module last used ("Tags", "Visits").
 */
export function usePanelDoor(): { label: string; Icon: LucideIcon; inPanel: boolean; go: () => void } | null {
  const [, navigate] = useLocation();
  const modules = useXpotModules();
  const { reach, adminMode, profile } = useViewerAccess();
  const { panelName } = usePanelNames();
  const tc = useT(commonMessages);
  if (!reach) return null;
  const go = () => {
    if (adminMode) {
      rememberPanelRoute(`${window.location.pathname}${window.location.search}`);
      navigateGuarded(homeForModules(modules), navigate);
    } else {
      navigateGuarded(panelEntryPath(), navigate);
    }
  };
  const moduleName = tc(homeModule(modules) === "tags" ? "moduleTags" : "moduleVisits");
  return { label: adminMode ? moduleName : panelName(profile), Icon: adminMode ? ArrowLeft : ShieldCheck, inPanel: adminMode, go };
}

/** The door as a row of the desktop sidebar's foot, in the style of the Settings row under it. */
export function PanelDoorRow({ collapsed }: { collapsed: boolean }) {
  const door = usePanelDoor();
  if (!door) return null;
  const { Icon } = door;
  return (
    <button
      type="button"
      onClick={door.go}
      title={collapsed ? door.label : undefined}
      aria-label={door.label}
      className={`flex h-10 w-full items-center rounded-xl text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/85 ${collapsed ? "justify-center" : "gap-3 px-3"}`}
      data-testid="sidebar-panel-door"
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{door.label}</span>}
    </button>
  );
}
