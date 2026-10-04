import type { LucideIcon } from "lucide-react";

export type MobileTab = { id: string; label: string; icon: LucideIcon; testId?: string };

/** The phone's floating bottom tab bar (Visits and Tags modules). */
export function MobileTabBar({ tabs, activeId, onSelect }: { tabs: MobileTab[]; activeId: string; onSelect: (id: string) => void }) {
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
              {isActive && (
                <span
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.25) 0%, rgba(99,102,241,0.25) 100%)" }}
                />
              )}
              <Icon className={`relative h-[18px] w-[18px] transition-all ${isActive ? "drop-shadow-[0_0_6px_rgba(99,102,241,0.8)]" : ""}`} />
              <span className="relative truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
