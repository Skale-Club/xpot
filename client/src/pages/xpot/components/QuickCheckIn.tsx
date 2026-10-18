import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LocateFixed, LocateOff, MapPinned } from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { quickCheckInMessages } from "@/i18n/messages/quickCheckIn";
import { useIsComputer } from "@/hooks/use-is-desktop";
import { useXpotShared } from "../hooks/useXpotShared";
import { usePlaceToLead } from "../hooks/usePlaceToLead";
import { formatMeters } from "../utils";
import { PlaceLeadSearch, type PlaceLeadSearchHandle } from "./PlaceLeadSearch";
import { CreateLeadDialog } from "./CreateLeadDialog";
import type { XpotMeResponse } from "../types";

// Up to this, a fix is good enough to validate a 150 m geofence.
const PRECISE_METERS = 100;

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.05] px-1.5 font-sans text-[10px] font-semibold text-white/55">
      {children}
    </kbd>
  );
}

/** Where the rep's location stands, and the one tap that fixes it when it can. */
function LocationChip() {
  const t = useT(quickCheckInMessages);
  const isComputer = useIsComputer();
  const { geoState, hasLocation, isLocating, permission, loadCurrentLocation } = useXpotShared();
  const base = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors";

  if (isLocating && !hasLocation) {
    return <span className={`${base} border-white/[0.08] bg-white/[0.04] text-white/50`}><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("locLocating")}</span>;
  }
  if (hasLocation && typeof geoState.accuracy === "number") {
    const precise = geoState.accuracy <= PRECISE_METERS;
    const label = t(precise ? "locPrecise" : "locApprox", { accuracy: formatMeters(geoState.accuracy) });
    return (
      <button
        type="button"
        onClick={() => void loadCurrentLocation()}
        title={precise ? label : `${label}. ${t("locApproxHint")}`}
        className={`${base} ${precise ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200 hover:bg-emerald-400/[0.12]" : "border-amber-400/20 bg-amber-400/[0.08] text-amber-200 hover:bg-amber-400/[0.12]"}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${precise ? "bg-emerald-400" : "bg-amber-400"}`} />
        {/* Phones show just the figure, so the title next to it is not cut off. */}
        <span className="tabular-nums sm:hidden">±{formatMeters(geoState.accuracy)}</span>
        <span className="hidden sm:inline">{label}</span>
      </button>
    );
  }
  if (permission === "denied") {
    return <span title={t("locBlockedHint")} className={`${base} border-red-400/20 bg-red-500/[0.08] text-red-200`}><LocateOff className="h-3.5 w-3.5" />{t("locBlocked")}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => void loadCurrentLocation()}
      title={isComputer ? t("locApproxHint") : undefined}
      className={`${base} border-indigo-400/25 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/15`}
    >
      <LocateFixed className="h-3.5 w-3.5" />{t("locOff")}
    </button>
  );
}

/**
 * The top of the Visits dashboard: find where you are (a saved customer or any
 * business on Google) and go straight to its check-in. Picking only chooses the
 * place; the check-in screen still does the location check and the slider, so
 * validation lives in one spot. Hidden while a visit is open: the active-visit
 * banner above takes its place.
 */
export function QuickCheckIn() {
  const t = useT(quickCheckInMessages);
  const tCheckin = useT(checkinMessages);
  const [, navigate] = useLocation();
  const isComputer = useIsComputer();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const { geoState, loadCurrentLocation } = useXpotShared();
  const { resolvePlace } = usePlaceToLead();
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const searchRef = useRef<PlaceLeadSearchHandle>(null);

  const openCheckIn = (leadId: number) => navigate(`/route/check-in?leadId=${leadId}`);

  // "/" jumps to the search from anywhere on the dashboard, like most web apps.
  useEffect(() => {
    if (!isComputer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isComputer]);

  if (me?.activeVisit) return null;

  return (
    <section
      className="relative z-20 rounded-[22px] border border-white/[0.08]"
      style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.07) 42%, rgba(255,255,255,0.025) 100%)" }}
      data-testid="quick-check-in"
    >
      <div className="p-4 lg:px-6 lg:py-5">
        <div className="flex items-center justify-between gap-3 lg:mb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20">
              <MapPinned className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-white lg:text-base">{t("title")}</h2>
              <p className="hidden truncate text-xs text-white/45 sm:block">{t("subtitle")}</p>
            </div>
          </div>
          <LocationChip />
        </div>

        <div className="mt-3.5 lg:mt-0">
          <PlaceLeadSearch
            ref={searchRef}
            value={search}
            onChange={setSearch}
            geoState={geoState}
            placeholder={t("placeholder")}
            busy={opening}
            trailing={isComputer ? <span className="mr-1 hidden lg:inline-flex"><Kbd>/</Kbd></span> : null}
            onPickLead={(lead) => openCheckIn(lead.id)}
            onPickPlace={async (place, match) => {
              setOpening(true);
              try {
                const lead = await resolvePlace(place, match);
                openCheckIn(lead.id);
              } catch {
                // useLeads already raised a toast for a failed import.
              } finally {
                setOpening(false);
              }
            }}
            onCreate={() => setCreateOpen(true)}
            onNearby={() => { void loadCurrentLocation(); setSearch(tCheckin("nearbyQuery")); }}
          />
        </div>

        {isComputer ? (
          <div className="mt-3 hidden items-center gap-4 text-[11px] text-white/35 lg:flex">
            {opening ? (
              <span className="flex items-center gap-1.5 text-indigo-200/80"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("opening")}</span>
            ) : (
              <>
                <span className="flex items-center gap-1.5"><Kbd>/</Kbd>{t("hintFocus")}</span>
                <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>{t("hintNavigate")}</span>
                <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd>{t("hintOpen")}</span>
              </>
            )}
          </div>
        ) : null}
      </div>

      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialName={search.trim() === tCheckin("nearbyQuery") ? "" : search.trim()}
        onCreated={(leadId) => openCheckIn(leadId)}
      />
    </section>
  );
}
