import { useQuery } from "@tanstack/react-query";
import { MapPinned, Nfc } from "lucide-react";
import { useLocation } from "wouter";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { repModules, type XpotModule } from "@shared/modules";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { LAST_MODULE_KEY, MODULE_HOME } from "@/lib/xpot";
import { MODULE_ACCENT } from "@/components/xpot/surface";


const HOME: Record<XpotModule, string> = MODULE_HOME;

/** The module the signed-in rep may use (managers: both). */
export function useXpotModules(): XpotModule[] {
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  if (!me) return [];
  return repModules({ role: me.user.isAdmin ? "admin" : me.rep.role, modules: me.rep.modules });
}

export function rememberModule(module: XpotModule) {
  try {
    window.localStorage.setItem(LAST_MODULE_KEY, module);
  } catch {
    // Not remembered; the default applies next time.
  }
}

/** Where to land after sign-in: the last module used, if still allowed. */
export function homeForModules(modules: XpotModule[]): string {
  let last: string | null = null;
  try {
    last = window.localStorage.getItem(LAST_MODULE_KEY);
  } catch {
    last = null;
  }
  const preferred = modules.find((m) => m === last) ?? modules[0] ?? "visits";
  return HOME[preferred];
}

/**
 * Visits | Tags segmented switch at the top of both modules. Hidden when the
 * rep has only one module (e.g. a reseller who only sells tags).
 */
export function ModuleSwitch({ current }: { current: XpotModule }) {
  const t = useT(commonMessages);
  const [, setLocation] = useLocation();
  const modules = useXpotModules();
  if (modules.length < 2) return null;

  const items: Array<{ id: XpotModule; label: string; icon: typeof Nfc }> = [
    { id: "visits", label: t("moduleVisits"), icon: MapPinned },
    { id: "tags", label: t("moduleTags"), icon: Nfc },
  ];

  return (
    <div
      role="tablist"
      aria-label={t("switchModule")}
      className="flex rounded-2xl border border-white/10 p-1"
      style={{ background: "rgba(15, 23, 42, 0.7)" }}
      data-testid="module-switch"
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = id === current;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (active) return;
              rememberModule(id);
              setLocation(HOME[id]);
            }}
            data-testid={`module-${id}`}
            className={`relative flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
              active ? "text-white" : "text-white/45 hover:text-white/75"
            }`}
          >
            {active && <span className="absolute inset-0 rounded-xl" style={{ background: MODULE_ACCENT[id].strong }} />}
            <Icon className={`relative h-4 w-4 ${active ? MODULE_ACCENT[id].text : ""}`} />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
