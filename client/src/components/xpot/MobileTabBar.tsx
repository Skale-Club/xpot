import type { LucideIcon } from "lucide-react";
import type { XpotModule } from "@shared/modules";
import { MODULE_ACCENT } from "./surface";

export type MobileTab = { id: string; label: string; icon: LucideIcon; testId?: string };

/** Keep each module's home dashboard in the same first position. */
export function orderMobileTabs(tabs: MobileTab[], module: XpotModule): MobileTab[] {
  const homeId = module === "visits" ? "dashboard" : "/tags";
  const home = tabs.find((tab) => tab.id === homeId);
  return home ? [home, ...tabs.filter((tab) => tab.id !== homeId)] : tabs;
}

/**
 * The phone's bottom tab bar (Visits and Tags modules), in the module's colour.
 * Docked edge to edge like Xtimator's: equal-width tabs, 10px labels that
 * truncate instead of spilling, and a short accent bar under the active tab.
 */
export function MobileTabBar({ tabs, activeId, onSelect, module }: { tabs: MobileTab[]; activeId: string; onSelect: (id: string) => void; module: XpotModule }) {
  const accent = MODULE_ACCENT[module];
  const orderedTabs = orderMobileTabs(tabs, module);
  return (
    // Hidden while the keyboard is up (index.css), so it never covers the field being typed in.
    // The bottom padding is the safe-area inset minus 14px: the full inset leaves a dead strip
    // under the tabs on an iOS PWA; max() keeps 0 where there is no inset.
    <nav
      data-hide-on-keyboard
      className="fixed inset-x-0 bottom-0 z-50 flex items-center border-t border-white/[0.07] pb-[max(calc(env(safe-area-inset-bottom,_0px)_-_14px),0px)]"
      style={{ background: "#070b15" }}
    >
      {orderedTabs.map(({ id, label, icon: Icon, testId }) => {
        const isActive = activeId === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            style={{ WebkitTapHighlightColor: "transparent" }}
            data-testid={testId}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-[44px] min-w-0 flex-1 basis-0 touch-manipulation flex-col items-center justify-center px-1 py-2 transition-colors duration-150 ${
              isActive ? "text-white" : "text-white/45 hover:text-white/70"
            }`}
          >
            <Icon className={`h-5 w-5 ${isActive ? accent.text : ""}`} />
            <span className="mt-1 max-w-full truncate text-[10px] font-medium leading-none">{label}</span>
            {/* Rendered on every tab (transparent when inactive) so all tabs keep the same height. */}
            <span className="mt-1 h-[3px] w-6 rounded-full" style={{ background: isActive ? accent.solid : "transparent" }} />
          </button>
        );
      })}
    </nav>
  );
}
