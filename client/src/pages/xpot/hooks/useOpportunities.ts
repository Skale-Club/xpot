import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { workspaceForPath } from "@/lib/workspace";
import { useXpotQueries } from "./useXpotQueries";

/** Prefix of every deals query: invalidating it refreshes the person's own list and the team's alike. */
export const OPPORTUNITIES_KEY = "/api/xpot/opportunities";

/**
 * The Deals list. In the panel it asks for the whole team's (`?all=true`), the list the "Open deals" tile of Team results
 * counts: without it the platform's owner got only their own deals under a number that counted everyone's. The server
 * honours it for the platform's owner alone; an Organization's owner already gets their team's, a rep their own.
 */
export function useOpportunitiesQuery<T>() {
  const { xpotMeQuery } = useXpotQueries();
  const team = workspaceForPath(typeof window === "undefined" ? "" : window.location.pathname) === "management";
  return useQuery<T[]>({
    queryKey: [OPPORTUNITIES_KEY, team ? "team" : "own"],
    queryFn: async () => (await apiRequest("GET", `${OPPORTUNITIES_KEY}${team ? "?all=true" : ""}`)).json(),
    enabled: xpotMeQuery.isSuccess,
  });
}
