import { useDeferredValue } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { GooglePlaceResult } from "./types";

type PlaceSearchResponse = { results: GooglePlaceResult[] };

// The coordinates only bias the search toward the rep's area, so ~110m of
// precision is plenty. Anything finer turns GPS jitter into queryKey churn:
// with live tracking on (the check-in screen), every watchPosition tick moved
// lat/lng by a few metres, which meant a new key, a refetch, and a billed
// Places call every ~2s — the search UI blinked in step with the GPS.
export const roundSearchBias = (n: number) => Math.round(n * 1e3) / 1e3;

export function usePlaceSearch(
  search: string,
  enabled: boolean,
  geoState: { lat?: number; lng?: number },
) {
  const deferredSearch = useDeferredValue(search.trim());
  const lat = typeof geoState.lat === "number" ? roundSearchBias(geoState.lat) : undefined;
  const lng = typeof geoState.lng === "number" ? roundSearchBias(geoState.lng) : undefined;

  return useQuery<PlaceSearchResponse>({
    queryKey: ["/api/xpot/place-search", deferredSearch, lat ?? "", lng ?? ""],
    enabled: enabled && deferredSearch.length >= 2,
    // When the key does change (typing, or moving a block), keep the previous
    // results on screen instead of collapsing the dropdown to a spinner.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({ q: deferredSearch });
      if (typeof lat === "number" && typeof lng === "number") {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
      }

      const response = await fetch(`/api/xpot/place-search?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(text);
      }

      return response.json();
    },
  });
}
