import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Home, MapPin, Search, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "@/components/ui/loader";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { settingsMessages } from "@/i18n/messages/settings";
import { prospectingMessages } from "@/i18n/messages/prospecting";
import type { XpotMeResponse } from "./types";
import { usePlaceSearch } from "./usePlaceSearch";
import { FloatingSuggestions, SuggestionOption, SuggestionStatus } from "./components/PlaceSuggestions";

type RoutePatch = { home?: { address: string; lat: number; lng: number } | null; routeReturnHome?: boolean };

/**
 * Settings › Route: the rep's home and whether today's prospecting route ends
 * there. The day always starts wherever the rep is; only the way back is planned.
 */
export function RouteSettings({ rep }: { rep: XpotMeResponse["rep"] }) {
  const t = useT(settingsMessages);
  const tp = useT(prospectingMessages);
  const { toast } = useToast();
  const inputId = useId();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // No location bias: a home is searched by its own address, wherever the rep is now.
  const placeQuery = usePlaceSearch(search, dropdownOpen, {});
  const places = (placeQuery.data?.results ?? []).filter((place) => typeof place.lat === "number" && typeof place.lng === "number");
  const hasHome = Boolean(rep.homeAddress && rep.homeLat && rep.homeLng);
  const suggestionsOpen = dropdownOpen && search.trim().length >= 2 && (placeQuery.isFetching || placeQuery.isError || places.length > 0);

  const save = useMutation({
    mutationFn: async (patch: RoutePatch) => (await apiRequest("PATCH", "/api/xpot/me", patch)).json(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
      toast({ title: t("routeSaved") });
    },
    onError: (err: Error) => toast({ title: t("saveFailed"), description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor={hasHome ? undefined : inputId} className="block text-xs font-semibold text-white/60">{t("homeAddress")}</label>
        {hasHome ? (
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${GLASS_CLASS}`}>
            <Home className="h-4 w-4 shrink-0 text-blue-300" />
            <span className="min-w-0 flex-1 text-[15px] font-medium text-white/85 break-words">{rep.homeAddress}</span>
            <button
              type="button"
              onClick={() => save.mutate({ home: null })}
              disabled={save.isPending}
              aria-label={t("clearHome")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/10 hover:text-white/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              id={inputId}
              ref={inputRef}
              value={search}
              onChange={(event) => { setSearch(event.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              placeholder={t("homeAddressPlaceholder")}
              autoComplete="street-address"
              role="combobox"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded={suggestionsOpen}
              className={`${FIELD_CONTROL} py-2 pl-10 pr-10`}
            />
            {save.isPending ? <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /> : null}
            <FloatingSuggestions anchorRef={inputRef} id={listId} open={suggestionsOpen}>
              <SuggestionStatus
                loading={placeQuery.isFetching && !places.length}
                error={placeQuery.isError}
                loadingLabel={tp("googleSuggestions")}
                errorLabel={tp("googleUnavailable")}
              />
              {places.map((place) => (
                <SuggestionOption
                  key={place.placeId}
                  icon={MapPin}
                  title={place.name}
                  subtitle={place.address}
                  onPick={() => {
                    setDropdownOpen(false);
                    setSearch("");
                    save.mutate({ home: { address: place.address, lat: place.lat!, lng: place.lng! } });
                  }}
                />
              ))}
            </FloatingSuggestions>
          </div>
        )}
        <p className="text-xs text-white/40">{t("homeAddressHint")}</p>
      </div>

      <div className={`flex items-start justify-between gap-4 rounded-2xl p-4 ${GLASS_CLASS}`}>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-white/85">{t("returnHome")}</div>
          <p className="mt-1 text-xs leading-5 text-white/40">{hasHome ? t("returnHomeHint") : t("returnHomeNeedsAddress")}</p>
        </div>
        <Switch
          checked={Boolean(rep.routeReturnHome) && hasHome}
          disabled={!hasHome || save.isPending}
          onCheckedChange={(checked) => save.mutate({ routeReturnHome: checked })}
          aria-label={t("returnHome")}
        />
      </div>
    </div>
  );
}
