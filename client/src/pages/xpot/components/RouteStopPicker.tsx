import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DotsLoader } from "@/components/ui/spinner";
import { GoogleLogo } from "@/components/ui/google-logo";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { prospectingMessages } from "@/i18n/messages/prospecting";
import { formatDistance } from "@/lib/format";
import { placeTypeLabel } from "@/lib/placeTypes";
import type { ProspectingRouteStopSource } from "@shared/prospecting";
import { usePlaceSearch } from "../usePlaceSearch";
import { useLeadLookup } from "../hooks/useLeadLookup";
import { matchSavedLead } from "../utils";
import { leftoverCandidates, metersBetween } from "../prospectingUi";
import type { FullSalesLead, GooglePlaceResult } from "../types";

/** Where the picked business goes: in place of a stop, right after one, or last. */
export type StopPickerTarget =
  | { kind: "replace"; stop: PickerStop }
  | { kind: "after"; stop: PickerStop }
  | { kind: "end"; stop: PickerStop };

type PickerStop = { id: number; name: string; lat: string; lng: string };
type RouteBusiness = { candidateId?: number | null; leadId: number | null; googlePlaceId: string | null };
type JobCandidate = {
  id: number;
  status: string;
  name: string;
  address: string | null;
  score: number;
  exclusionReason: string | null;
  lat: string | null;
  lng: string | null;
};

const LEFTOVERS_SHOWN = 8;

/**
 * Picks the business for a swap or a new stop. Empty, it offers what the
 * route's own search found and left out, nearest first. Typing searches the
 * rep's companies and Google around the stop being edited, so any kind of
 * business (a nail salon on a barbershop route) can go in.
 */
export function RouteStopPicker({
  target,
  jobId,
  routeStops,
  pending,
  onPick,
  onClose,
}: {
  target: StopPickerTarget | null;
  jobId: number | null;
  routeStops: RouteBusiness[];
  pending: boolean;
  onPick: (source: ProspectingRouteStopSource, name: string) => void;
  onClose: () => void;
}) {
  const t = useT(prospectingMessages);
  const [query, setQuery] = useState("");
  useEffect(() => { if (target) setQuery(""); }, [target]);

  const anchor = target ? { lat: Number(target.stop.lat), lng: Number(target.stop.lng) } : null;
  const typing = query.trim().length >= 2;
  const placeQuery = usePlaceSearch(query, target !== null && typing, anchor ?? {});
  const leadQuery = useLeadLookup(query, target !== null && typing);
  const jobQuery = useQuery<{ candidates: JobCandidate[] }>({
    queryKey: ["/api/xpot/prospecting/jobs", jobId],
    enabled: target !== null && jobId !== null,
  });

  const onRouteLeads = new Set(routeStops.flatMap((stop) => stop.leadId ? [stop.leadId] : []));
  const onRoutePlaces = new Set(routeStops.flatMap((stop) => stop.googlePlaceId ? [stop.googlePlaceId] : []));

  const away = (lat: number | string | null | undefined, lng: number | string | null | undefined) => {
    if (!anchor || lat == null || lng == null) return null;
    const meters = metersBetween(anchor, { lat: Number(lat), lng: Number(lng) });
    return Number.isFinite(meters) ? t("distanceAway", { distance: formatDistance(meters, t.locale) }) : null;
  };

  const leftovers = useMemo(() => (anchor
    ? leftoverCandidates(jobQuery.data?.candidates ?? [], routeStops.flatMap((stop) => stop.candidateId ? [stop.candidateId] : []), anchor, LEFTOVERS_SHOWN)
    : []
  // The anchor is a fresh object every render; its coordinates are what matter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [jobQuery.data, anchor?.lat, anchor?.lng, routeStops]);

  const leads = (leadQuery.data ?? []).filter((lead) => lead.locations.some((location) => location.lat && location.lng)).slice(0, 4);
  // Nearest to the stop first: Google ranks by relevance, the rep is choosing what is on the way.
  const places = (placeQuery.data?.results ?? [])
    .filter((place) => typeof place.lat === "number" && typeof place.lng === "number")
    .sort((a, b) => (anchor ? metersBetween(anchor, { lat: a.lat!, lng: a.lng! }) - metersBetween(anchor, { lat: b.lat!, lng: b.lng! }) : 0));
  const searching = typing && (placeQuery.isFetching || leadQuery.isFetching);

  const title = !target ? "" : target.kind === "replace"
    ? t("pickerReplaceTitle", { name: target.stop.name })
    : target.kind === "after" ? t("pickerAddAfterTitle", { name: target.stop.name }) : t("pickerAddTitle");

  const row = "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50";
  const onRoutePill = <Pill tone="slate" bordered className="shrink-0">{t("pickerOnRoute")}</Pill>;

  const pickLead = (lead: FullSalesLead) => onPick({ kind: "lead", leadId: lead.id }, lead.name);
  const pickPlace = (place: GooglePlaceResult) => {
    const saved = matchSavedLead(place, leadQuery.data ?? []);
    if (saved) return pickLead(saved);
    onPick({
      kind: "place",
      place: {
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        lat: place.lat!,
        lng: place.lng!,
        phone: place.phone || undefined,
        website: place.website || undefined,
        industry: place.primaryTypeName || undefined,
      },
    }, place.name);
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <div className="border-b border-white/[0.08] px-5 pb-4 pt-6 sm:px-6">
          <DialogTitle className="pr-8 text-lg font-bold leading-tight text-white">{title}</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm leading-5 text-white/55">{t("pickerBody")}</DialogDescription>
          <label className="relative mt-4 flex min-h-12 items-center rounded-xl border border-white/15 bg-black/20 transition focus-within:border-indigo-300/70">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-white/40" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("pickerPlaceholder")}
              aria-label={t("pickerPlaceholder")}
              className="h-12 min-w-0 flex-1 bg-transparent pl-10 pr-3 text-base text-white outline-none placeholder:text-white/30"
              autoFocus
            />
            {searching ? <DotsLoader className="mr-3" /> : null}
          </label>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-2 py-3 sm:px-3">
          {!typing ? (
            <section>
              <h3 className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{t("pickerLeftovers")}</h3>
              {jobQuery.isLoading ? <div className="px-3 py-4"><DotsLoader /></div> : leftovers.length ? leftovers.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  disabled={pending}
                  onClick={() => onPick({ kind: "candidate", candidateId: candidate.id }, candidate.name)}
                  className={row}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white/90">{candidate.name}</span>
                    <span className="block truncate text-xs leading-5 text-white/55">{candidate.address || t("noAddress")}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-white/50">
                    <span className="block font-bold tabular-nums text-white/75">{t("scoreLabel", { score: candidate.score })}</span>
                    {away(candidate.lat, candidate.lng)}
                  </span>
                </button>
              )) : <p className={`mx-1 rounded-xl px-3 py-3 text-xs leading-5 text-white/55 ${GLASS_SUBTLE_CLASS}`}>{t("pickerNoLeftovers")}</p>}
            </section>
          ) : (
            <>
              {leads.length ? (
                <section className="mb-3">
                  <h3 className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{t("pickerSavedLeads")}</h3>
                  {leads.map((lead) => {
                    const location = lead.locations.find((item) => item.isPrimary) ?? lead.locations[0];
                    const taken = onRouteLeads.has(lead.id);
                    return (
                      <button key={lead.id} type="button" disabled={pending || taken} onClick={() => pickLead(lead)} className={row}>
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white/90">{lead.name}</span>
                          <span className="block truncate text-xs leading-5 text-white/55">{location?.addressLine1 || t("noAddress")}</span>
                        </span>
                        {taken ? onRoutePill : <span className="shrink-0 text-xs text-white/50">{away(location?.lat, location?.lng)}</span>}
                      </button>
                    );
                  })}
                </section>
              ) : null}
              <section>
                <h3 className="flex items-center gap-1.5 px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                  <GoogleLogo className="h-3 w-3" />{t("pickerGoogle")}
                </h3>
                {places.length ? places.map((place) => {
                  const taken = onRoutePlaces.has(place.placeId);
                  const typeLabel = placeTypeLabel(place.primaryType, t.lang, place.primaryTypeName);
                  return (
                    <button key={place.placeId} type="button" disabled={pending || taken} onClick={() => pickPlace(place)} className={row}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white/90">{place.name}</span>
                        <span className="block truncate text-xs leading-5 text-white/55">{[typeLabel, place.address].filter(Boolean).join(" · ")}</span>
                      </span>
                      {taken ? onRoutePill : <span className="shrink-0 text-xs text-white/50">{away(place.lat, place.lng)}</span>}
                    </button>
                  );
                }) : searching
                  ? <p className="px-3 py-3 text-xs text-white/50">{t("pickerSearching")}</p>
                  : <p className="px-3 py-3 text-xs text-white/50">{t("pickerNoResults")}</p>}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
