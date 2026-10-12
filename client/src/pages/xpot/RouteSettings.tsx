import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, Home, Loader2, Search, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { settingsMessages } from "@/i18n/messages/settings";
import type { XpotMeResponse } from "./types";
import { usePlaceSearch } from "./usePlaceSearch";

type RoutePatch = { home?: { address: string; lat: number; lng: number } | null; routeReturnHome?: boolean };

/**
 * Settings › Route: the rep's home and whether today's prospecting route ends
 * there. The day always starts wherever the rep is; only the way back is planned.
 */
export function RouteSettings({ rep }: { rep: XpotMeResponse["rep"] }) {
  const t = useT(settingsMessages);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // No location bias: a home is searched by its own address, wherever the rep is now.
  const placeQuery = usePlaceSearch(search, dropdownOpen, {});
  const places = (placeQuery.data?.results ?? []).filter((place) => typeof place.lat === "number" && typeof place.lng === "number");
  const hasHome = Boolean(rep.homeAddress && rep.homeLat && rep.homeLng);

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
        <label className="text-sm font-medium text-white/55">{t("homeAddress")}</label>
        {hasHome ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
            <Home className="h-4 w-4 shrink-0 text-indigo-300" />
            <span className="min-w-0 flex-1 text-[15px] font-medium text-white/85 break-words">{rep.homeAddress}</span>
            <button
              type="button"
              onClick={() => save.mutate({ home: null })}
              disabled={save.isPending}
              aria-label={t("clearHome")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/10 hover:text-white/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              placeholder={t("homeAddressPlaceholder")}
              autoComplete="street-address"
              className="w-full rounded-2xl border border-white/5 bg-white/[0.03] py-3 pl-10 pr-10 text-[16px] font-medium text-white placeholder-white/20 outline-none transition-all focus:border-indigo-500/50 focus:bg-white/[0.05]"
            />
            {placeQuery.isFetching || save.isPending ? <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/30" /> : null}
            {dropdownOpen && places.length ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-[#0f111a] p-1 shadow-2xl">
                {places.map((place) => (
                  <button
                    key={place.placeId}
                    type="button"
                    onMouseDown={() => {
                      setDropdownOpen(false);
                      setSearch("");
                      save.mutate({ home: { address: place.address, lat: place.lat!, lng: place.lng! } });
                    }}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                  >
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{place.name}</span>
                      <span className="block text-xs text-white/40 break-words">{place.address}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <p className="px-1 text-xs text-white/35">{t("homeAddressHint")}</p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
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
