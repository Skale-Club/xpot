import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Star } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { GoogleLogo } from "@/components/ui/google-logo";
import type { FullSalesLead, GoogleBusinessProfile } from "@/pages/xpot/types";
import { usePlaceSearch } from "@/pages/xpot/usePlaceSearch";
import { errorText, type BannerState } from "./lib";
import { PlacePicker } from "./PlacePicker";
import { BottomSheet, Spinner } from "./ui";
import { Panel } from "./CustomerPanel";

/** The company's Google Business Profile: live rating when linked, a search to link it when not. */
export function GoogleProfile({ lead, onDone, banner }: { lead: FullSalesLead; onDone: (text: string, ok: boolean) => void; banner: BannerState }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(Boolean(lead.googlePlaceId));
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const profile = useQuery<GoogleBusinessProfile>({
    queryKey: ["/api/xpot/leads", lead.id, "google-profile"],
    enabled: connected,
    staleTime: 5 * 60_000,
  });
  const results = usePlaceSearch(search, picking, {});

  useEffect(() => {
    setConnected(Boolean(lead.googlePlaceId));
  }, [lead.googlePlaceId]);

  const savePlace = async (placeId: string | null) => {
    setBusy(true);
    try {
      const response = await apiRequest("POST", `/api/xpot/leads/${lead.id}/google-profile`, { placeId });
      const data = await response.json() as { profile: GoogleBusinessProfile };
      setConnected(Boolean(placeId));
      qc.setQueryData(["/api/xpot/leads", lead.id, "google-profile"], data.profile);
      await qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      await qc.invalidateQueries({ queryKey: ["/api/xpot/leads", lead.id, "google-profile"] });
      setPicking(false);
      setSearch("");
      onDone(placeId ? t("customerGoogleSaved") : t("customerGoogleRemoved"), true);
    } catch (err) {
      onDone(errorText(err, tc("requestFailed")), false);
    } finally {
      setBusy(false);
    }
  };

  const p = profile.data;
  return (
    <Panel
      title={<span className="flex items-center gap-1.5"><GoogleLogo className="h-3.5 w-3.5" />{t("customerGoogle")}</span>}
      right={connected ? (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmUnlink(true)} className="text-white/45 hover:text-red-300">
          {t("customerGoogleUnlink")}
        </Button>
      ) : null}
    >
      {connected ? (
        profile.isLoading ? (
          <div className="flex justify-center py-3 text-white/40"><Spinner /></div>
        ) : profile.isError ? (
          // Google is read live: when it does not answer the card says so, instead of showing only a title.
          <div className="space-y-3" data-testid="google-profile-error">
            <p className="text-sm text-white/55">{t("customerGoogleFailed")}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void profile.refetch()}>
              {tc("retry")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {p?.rating != null && (
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                <strong className="text-2xl font-extrabold tabular-nums text-white">{p.rating.toFixed(1)}</strong>
                {p.reviewCount != null && <span className="text-sm text-white/45">{t.plural("customerGoogleReviews", p.reviewCount)}</span>}
              </div>
            )}
            {p?.openNow != null && (
              <p className={`text-xs font-semibold ${p.openNow ? "text-emerald-300" : "text-white/40"}`}>
                {p.openNow ? t("customerGoogleOpen") : t("customerGoogleClosed")}
              </p>
            )}
            {p?.mapsUrl && (
              <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300 hover:text-violet-200">
                {t("customerGoogleMaps")} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )
      ) : (
        <>
          <p className="text-sm text-white/45">{t("customerGoogleNone")}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => { setSearch(lead.name); setPicking(true); }}>
            <GoogleLogo className="h-4 w-4" />
            {t("customerGoogleLink")}
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirmUnlink}
        onOpenChange={setConfirmUnlink}
        tone="danger"
        title={t("customerGoogleUnlinkTitle")}
        description={t("customerGoogleUnlinkHint")}
        confirmLabel={t("customerGoogleUnlink")}
        onConfirm={() => savePlace(null)}
      />

      <BottomSheet open={picking} onClose={() => setPicking(false)} title={t("customerGoogleLink")} banner={banner}>
        {/* The same business picker as the review-link search. */}
        <PlacePicker
          query={search}
          onQuery={setSearch}
          placeholder={t("customerGoogleSearch")}
          autoFocus
          inputTestId="input-google-search"
          loading={results.isFetching}
          places={results.data ? results.data.results.map((place) => ({ ...place, key: place.placeId })) : null}
          emptyText={search.trim().length >= 2 && !results.isFetching ? t("customerGoogleNoResults") : undefined}
          disabled={busy}
          onPick={(place) => void savePlace(place.placeId)}
        />
        <Button type="button" variant="ghost" size="lg" onClick={() => setPicking(false)} className="mt-4 w-full">
          {tc("cancel")}
        </Button>
      </BottomSheet>
    </Panel>
  );
}
