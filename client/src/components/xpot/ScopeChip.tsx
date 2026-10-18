import { Building2, User, Users } from "lucide-react";
import { useLocation, useSearchParams } from "wouter";
import { useT } from "@/i18n";
import { navIaMessages } from "@/i18n/messages/navIa";
import { useViewerAccess } from "@/lib/adminMode";
import { scopeChipState } from "./moduleNav";

// "Viewing: everyone / my organization / only me" on every list that
// management mode widens (Companies, Visits, Sales, Tasks, the Tags dashboard
// and customers), so the same URL never shows the team's records without
// saying so. Only people with management mode see it: managers (everyone) and
// Rep Admins (the organizations they run). For them it is also the switch:
// tapping it turns management mode on or off where they stand (on Tasks it is
// the "Whole team" filter, which only exists in management mode). On a list
// the mode doesn't widen for a Rep Admin it only says "only me".
// scopeChipState (moduleNav.ts) decides; AppLayout places it.

const CHIP = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors";
const QUIET = "border-white/10 bg-white/[0.04] text-white/60";

export function ScopeChip({ className = "" }: { className?: string }) {
  const t = useT(navIaMessages);
  const [location] = useLocation();
  const [params, setParams] = useSearchParams();
  const { reach, adminMode, setAdminMode } = useViewerAccess();
  const tasks = location.split("?")[0].startsWith("/tasks");
  const state = scopeChipState(location, reach, adminMode, params.get("team") === "1");
  if (!state) return null;

  const wide = state.label !== "mine";
  const label = state.label === "everyone" ? t("scopeEveryone") : state.label === "organization" ? t("scopeOrganization") : t("scopeOnlyMe");
  const Icon = state.label === "everyone" ? Users : state.label === "organization" ? Building2 : User;
  if (!state.toggles) {
    return (
      <span className={`${CHIP} ${QUIET} ${className}`} data-testid="scope-chip" data-scope="mine">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </span>
    );
  }

  const setTeam = (on: boolean) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (on) next.set("team", "1");
      else next.delete("team");
      return next;
    }, { replace: true });
  const toggle = () => {
    if (wide) {
      if (tasks) setTeam(false);
      else setAdminMode(false);
      return;
    }
    setAdminMode(true);
    if (tasks) setTeam(true);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={wide}
      title={wide ? t("scopeToOnlyMe") : reach === "organization" ? t("scopeToOrganization") : t("scopeToEveryone")}
      className={`${CHIP} ${
        wide
          ? "border-amber-400/35 bg-amber-400/[0.12] text-amber-200 hover:bg-amber-400/20"
          : `${QUIET} hover:bg-white/[0.08] hover:text-white/80`
      } ${className}`}
      data-testid="scope-chip"
      data-scope={state.label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
