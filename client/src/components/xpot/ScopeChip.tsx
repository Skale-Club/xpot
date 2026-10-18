import { User, Users } from "lucide-react";
import { useLocation, useSearchParams } from "wouter";
import { useT } from "@/i18n";
import { navIaMessages } from "@/i18n/messages/navIa";
import { useViewerAccess } from "@/lib/adminMode";
import { managementScope } from "./moduleNav";

// "Viewing: everyone / only me" on every list that management mode widens
// (Companies, Visits, Sales, Tasks, the Tags dashboard and customers), so the
// same URL never shows the team's records without saying so. Only people who
// can manage see it; for them it is also the switch: tapping it turns
// management mode on or off where they stand (on Tasks it is the "Whole
// team" filter, which only exists in management mode). AppLayout places it.

export function ScopeChip({ className = "" }: { className?: string }) {
  const t = useT(navIaMessages);
  const [location] = useLocation();
  const [params, setParams] = useSearchParams();
  const { hasAdminAccess, adminMode, setAdminMode } = useViewerAccess();
  const scope = managementScope(location);
  if (!hasAdminAccess || !scope) return null;

  const tasks = scope === "tasks";
  const everyone = adminMode && (!tasks || params.get("team") === "1");
  const setTeam = (on: boolean) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (on) next.set("team", "1");
      else next.delete("team");
      return next;
    }, { replace: true });
  const toggle = () => {
    if (everyone) {
      if (tasks) setTeam(false);
      else setAdminMode(false);
      return;
    }
    setAdminMode(true);
    if (tasks) setTeam(true);
  };
  const Icon = everyone ? Users : User;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={everyone}
      title={everyone ? t("scopeToOnlyMe") : t("scopeToEveryone")}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
        everyone
          ? "border-amber-400/35 bg-amber-400/[0.12] text-amber-200 hover:bg-amber-400/20"
          : "border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80"
      } ${className}`}
      data-testid="scope-chip"
      data-scope={everyone ? "everyone" : "mine"}
    >
      <Icon className="h-3.5 w-3.5" />
      {everyone ? t("scopeEveryone") : t("scopeOnlyMe")}
    </button>
  );
}
