import { useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GooglePlaceResult } from "./types";

type PlaceSearchResponse = { results: GooglePlaceResult[] };

export function usePlaceSearch(
  search: string,
  enabled: boolean,
  geoState: { lat?: number; lng?: number },
) {
  const deferredSearch = useDeferredValue(search.trim());

  return useQuery<PlaceSearchResponse>({
    queryKey: ["/api/xpot/place-search", deferredSearch, geoState.lat ?? "", geoState.lng ?? ""],
    enabled: enabled && deferredSearch.length >= 2,
    queryFn: async () => {
      const params = new URLSearchParams({ q: deferredSearch });
      if (typeof geoState.lat === "number" && typeof geoState.lng === "number") {
        params.set("lat", String(geoState.lat));
        params.set("lng", String(geoState.lng));
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
