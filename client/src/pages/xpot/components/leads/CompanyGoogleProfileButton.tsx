import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle, MapPin, Search, Star, Unlink } from "lucide-react";
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
  const [connected, setConnected] = useState(Boolean(lead.googlePlaceId));
  const profile = useQuery<GoogleBusinessProfile>({
    queryKey: ["/api/xpot/leads", lead.id, "google-profile"],
    enabled: connected,
    staleTime: 5 * 60_000,
  });
  const results = usePlaceSearch(search, open, {});

  useEffect(() => {
    if (!open) setSearch(lead.name);
  }, [lead.name, open]);

  useEffect(() => {
    setConnected(Boolean(lead.googlePlaceId));
  }, [lead.googlePlaceId]);

  const savePlace = useMutation({
    mutationFn: async (googlePlaceId: string | null) => {
      const response = await apiRequest("POST", `/api/xpot/leads/${lead.id}/google-profile`, { placeId: googlePlaceId });
      return response.json() as Promise<{ profile: GoogleBusinessProfile }>;
    },
    onSuccess: async (data, googlePlaceId) => {
      setConnected(Boolean(googlePlaceId));
      queryClient.setQueryData(["/api/xpot/leads", lead.id, "google-profile"], data.profile);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads", lead.id, "google-profile"] });
      toast({ title: googlePlaceId ? t("googleProfileSaved") : t("googleProfileRemoved"), variant: "success" });
      if (googlePlaceId) setOpen(false);
    },
    onError: (error: Error) => toast({
      title: t("googleProfileSaveFailed"),
      description: error.message,
      variant: "destructive",
    }),
  });

  const p = profile.data;

  return (
    <>
      {connected ? (
        <div className="inline-flex min-h-9 flex-wrap items-center gap-2 rounded-lg border border-blue-300/15 bg-blue-400/[0.06] px-3 py-1.5 text-xs text-blue-100" data-testid="company-google-profile-summary">
          <GoogleLogo className="h-3.5 w-3.5" />
          {profile.isLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-white/35" /> : (
            <>
              {p?.rating != null ? <strong className="flex items-center gap-1 tabular-nums"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{p.rating.toFixed(1)}</strong> : null}
              {p?.reviewCount != null ? <span className="text-white/50">{t.plural("googleProfileReviews", p.reviewCount)}</span> : null}
              {p?.mapsUrl ? <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={t("googleProfileMaps")} title={t("googleProfileMaps")} className="text-blue-300/65 transition hover:text-blue-200"><ExternalLink className="h-3.5 w-3.5" /></a> : null}
            </>
          )}
          <button type="button" disabled={savePlace.isPending} onClick={() => savePlace.mutate(null)} aria-label={t("googleProfileUnlink")} title={t("googleProfileUnlink")} className="ml-0.5 text-white/20 transition hover:text-red-300 disabled:opacity-40">
            {savePlace.isPending && savePlace.variables === null ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs font-semibold text-white/75 transition hover:border-blue-300/20 hover:bg-blue-400/[0.08] hover:text-white">
          <GoogleLogo className="h-3.5 w-3.5" />
          {t("googleProfileLink")}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-white/10 bg-[#0b1020] text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><GoogleLogo className="h-5 w-5" />{t("googleProfile")}</DialogTitle>
          </DialogHeader>

          <p className="text-sm leading-6 text-white/45">{t("googleProfileNone")}</p>

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{t("googleProfileLink")}</p>
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

        </DialogContent>
      </Dialog>
    </>
  );
}
