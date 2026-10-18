import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin, Search, Star, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DotsLoader } from "@/components/ui/spinner";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { EmptyState } from "@/components/xpot/EmptyState";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { EYEBROW } from "@/components/xpot/surface";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GoogleLogo } from "@/components/ui/google-logo";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { usePlaceSearch } from "../../usePlaceSearch";
import type { FullSalesLead, GoogleBusinessProfile } from "../../types";

const searchField = `${FIELD_CONTROL} py-2 pl-10`;

export function CompanyGoogleProfileButton({ lead }: { lead: FullSalesLead }) {
  const t = useT(leadsMessages);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
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
          {profile.isLoading ? <DotsLoader size="xs" tone="muted" /> : (
            <>
              {p?.rating != null ? <strong className="flex items-center gap-1 tabular-nums"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{p.rating.toFixed(1)}</strong> : null}
              {p?.reviewCount != null ? <span className="text-white/50">{t.plural("googleProfileReviews", p.reviewCount)}</span> : null}
              {p?.mapsUrl ? <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={t("googleProfileMaps")} title={t("googleProfileMaps")} className="text-blue-300/65 transition hover:text-blue-200"><ExternalLink className="h-3.5 w-3.5" /></a> : null}
            </>
          )}
          <button type="button" disabled={savePlace.isPending} onClick={() => setConfirmUnlink(true)} aria-label={t("googleProfileUnlink")} title={t("googleProfileUnlink")} className="-my-1 ml-0.5 flex h-8 w-8 items-center justify-center rounded-full text-white/35 transition hover:text-red-300 disabled:opacity-40">
            <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <GoogleLogo className="h-3.5 w-3.5" />
          {t("googleProfileLink")}
        </Button>
      )}

      <ConfirmDialog
        open={confirmUnlink}
        onOpenChange={setConfirmUnlink}
        title={t("googleProfileUnlinkTitle")}
        description={t("googleProfileUnlinkDesc")}
        confirmLabel={t("googleProfileUnlinkConfirm")}
        cancelLabel={t("googleProfileKeep")}
        destructive
        pending={savePlace.isPending && savePlace.variables === null}
        onConfirm={() => savePlace.mutateAsync(null)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2 text-base"><GoogleLogo className="h-5 w-5" />{t("googleProfile")}</DialogTitle>
          </DialogHeader>

          <p className="text-sm leading-6 text-white/50">{t("googleProfileNone")}</p>

          <div>
            <p className={`mb-2 ${EYEBROW}`}>{t("googleProfileLink")}</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input type="search" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("googleProfileSearch")} aria-label={t("googleProfileSearch")} className={searchField} data-testid="input-company-google-search" />
            </div>
            <div className="mt-3 max-h-[42vh] space-y-1.5 overflow-y-auto">
              {results.isFetching && !results.data ? <ListSkeleton rows={3} rowClassName="h-14 rounded-xl" className="space-y-1.5" /> : results.isError ? (
                <InlineAlert tone="error">{t("googleProfileSearchFailed")}</InlineAlert>
              ) : results.data?.results.length ? results.data.results.map((place) => (
                <button key={place.placeId} type="button" disabled={savePlace.isPending} onClick={() => savePlace.mutate(place.placeId)} className="flex min-h-11 w-full items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left transition hover:border-blue-300/20 hover:bg-blue-400/[0.07] disabled:opacity-50">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{place.name}</span><span className="block truncate text-xs text-white/45">{place.address}</span></span>
                  {savePlace.isPending && savePlace.variables === place.placeId ? <DotsLoader size="xs" tone="muted" className="ml-auto mt-1.5 shrink-0" /> : null}
                </button>
              )) : search.trim().length >= 2 && !results.isFetching ? <EmptyState compact dense icon={Search} title={t("googleProfileNoResults")} /> : null}
            </div>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
}
