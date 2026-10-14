import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle, MapPin, Search, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GoogleLogo } from "@/components/ui/google-logo";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePlaceSearch } from "../../usePlaceSearch";
import type { FullSalesLead, GoogleBusinessProfile } from "../../types";

const searchField = "w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-indigo-400/60";

export function CompanyGoogleProfileButton({ lead }: { lead: FullSalesLead }) {
  const t = useT(leadsMessages);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(lead.name);
  const profile = useQuery<GoogleBusinessProfile>({
    queryKey: ["/api/xpot/leads", lead.id, "google-profile"],
    enabled: Boolean(lead.googlePlaceId),
    staleTime: 5 * 60_000,
  });
  const results = usePlaceSearch(search, open, {});

  useEffect(() => {
    if (!open) setSearch(lead.name);
  }, [lead.name, open]);

  const savePlace = useMutation({
    mutationFn: async (googlePlaceId: string | null) => {
      const response = await apiRequest("PATCH", `/api/xpot/leads/${lead.id}`, { googlePlaceId });
      return response.json();
    },
    onSuccess: async (_data, googlePlaceId) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads", lead.id, "google-profile"] });
      toast({ title: googlePlaceId ? t("googleProfileSaved") : t("googleProfileRemoved"), variant: "success" });
      if (googlePlaceId) setOpen(false);
    },
    onError: () => toast({ title: t("googleProfileSaveFailed"), variant: "destructive" }),
  });

  const connected = Boolean(lead.googlePlaceId);
  const p = profile.data;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${connected ? "border-blue-300/20 bg-blue-400/[0.08] text-blue-100 hover:bg-blue-400/[0.13]" : "border-white/10 bg-white/[0.035] text-white/75 hover:border-blue-300/20 hover:bg-blue-400/[0.08] hover:text-white"}`}
      >
        <GoogleLogo className="h-3.5 w-3.5" />
        {connected ? t("googleProfile") : t("googleProfileLink")}
        {p?.rating != null ? <span className="flex items-center gap-1 border-l border-white/10 pl-2 tabular-nums"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating.toFixed(1)}</span> : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-white/10 bg-[#0b1020] text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><GoogleLogo className="h-5 w-5" />{t("googleProfile")}</DialogTitle>
          </DialogHeader>

          {connected ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
              {profile.isLoading ? <div className="flex justify-center py-4"><LoaderCircle className="h-5 w-5 animate-spin text-white/35" /></div> : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {p?.rating != null ? <span className="flex items-center gap-2"><Star className="h-5 w-5 fill-amber-400 text-amber-400" /><strong className="text-xl tabular-nums">{p.rating.toFixed(1)}</strong></span> : null}
                  {p?.reviewCount != null ? <span className="text-sm text-white/45">{t.plural("googleProfileReviews", p.reviewCount)}</span> : null}
                  {p?.openNow != null ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.openNow ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.06] text-white/45"}`}>{p.openNow ? t("googleProfileOpen") : t("googleProfileClosed")}</span> : null}
                  {p?.mapsUrl ? <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 hover:text-blue-200">{t("googleProfileMaps")}<ExternalLink className="h-3.5 w-3.5" /></a> : null}
                </div>
              )}
            </div>
          ) : <p className="text-sm leading-6 text-white/45">{t("googleProfileNone")}</p>}

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{connected ? t("googleProfileChange") : t("googleProfileLink")}</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input type="search" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("googleProfileSearch")} aria-label={t("googleProfileSearch")} className={searchField} data-testid="input-company-google-search" />
            </div>
            <div className="mt-3 max-h-[42vh] space-y-1.5 overflow-y-auto">
              {results.isFetching && !results.data ? <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 animate-spin text-white/35" /></div> : results.isError ? (
                <p className="py-6 text-center text-sm text-red-300/80">{t("googleProfileSearchFailed")}</p>
              ) : results.data?.results.length ? results.data.results.map((place) => (
                <button key={place.placeId} type="button" disabled={savePlace.isPending} onClick={() => savePlace.mutate(place.placeId)} className="flex w-full items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-left transition hover:border-blue-300/20 hover:bg-blue-400/[0.07] disabled:opacity-50">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{place.name}</span><span className="block truncate text-xs text-white/45">{place.address}</span></span>
                  {savePlace.isPending && savePlace.variables === place.placeId ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-white/35" /> : null}
                </button>
              )) : search.trim().length >= 2 && !results.isFetching ? <p className="py-6 text-center text-sm text-white/40">{t("googleProfileNoResults")}</p> : null}
            </div>
          </div>

          {connected ? <button type="button" disabled={savePlace.isPending} onClick={() => savePlace.mutate(null)} className="w-fit text-xs font-semibold text-red-300/55 transition hover:text-red-300 disabled:opacity-40">{t("googleProfileUnlink")}</button> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
