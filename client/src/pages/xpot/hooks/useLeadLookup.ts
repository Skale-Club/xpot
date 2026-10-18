import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { PLACE_SEARCH_DEBOUNCE_MS, useDebouncedValue } from "../usePlaceSearch";
import type { FullSalesLead } from "../types";

const RECENT = 6;
const MATCHES = 8;

/**
 * The rep's saved companies for the check-in search, asked of the server.
 * The full list (/api/xpot/leads) is one page of 100: searching it locally
 * missed every older company, and loading it made the Dashboard fetch the
 * whole page just to render a search box. With nothing typed this is the most
 * recently touched companies. Lives under the /api/xpot/leads key, so saving a
 * company refreshes it with everything else.
 */
export function useLeadLookup(search: string, enabled: boolean) {
  const query = useDebouncedValue(search.trim(), PLACE_SEARCH_DEBOUNCE_MS);
  return useQuery<FullSalesLead[]>({
    queryKey: ["/api/xpot/leads", "lookup", query],
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(query ? MATCHES : RECENT) });
      if (query) params.set("search", query);
      return (await apiRequest("GET", `/api/xpot/leads?${params.toString()}`)).json();
    },
  });
}
