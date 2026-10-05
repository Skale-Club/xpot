import type { LucideIcon } from "lucide-react";
import type { XpotModule } from "@shared/modules";
import { MODULE_ACCENT } from "./surface";

export type MobileTab = { id: string; label: string; icon: LucideIcon; testId?: string };

/** The phone's floating bottom tab bar (Visits and Tags modules), in the module's colour. */
export function MobileTabBar({ tabs, activeId, onSelect, module }: { tabs: MobileTab[]; activeId: string; onSelect: (id: string) => void; module: XpotModule }) {
  const accent = MODULE_ACCENT[module];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pt-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
      <div
        className="mx-auto flex max-w-md items-center gap-1 rounded-2xl border border-white/10 px-2 py-1.5"
        style={{ background: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(20px)" }}
      >
        {tabs.map(({ id, label, icon: Icon, testId }) => {
          const isActive = activeId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              style={{ WebkitTapHighlightColor: "transparent" }}
              data-testid={testId}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-w-0 flex-1 touch-manipulation flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-all ${
                isActive ? "text-white" : "text-white/35 hover:text-white/60"
              }`}
            >
              {isActive && <span className="absolute inset-0 rounded-xl" style={{ background: accent.soft }} />}
              <Icon className={`relative h-[18px] w-[18px] transition-all ${isActive ? accent.text : ""}`} />
              <span className="relative truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
