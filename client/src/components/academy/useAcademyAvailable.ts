import { useQuery } from "@tanstack/react-query";

export const ACADEMY_AVAILABILITY_KEY = ["/api/xpot/academy/availability"];

/**
 * Whether the Academy has anything to show for this person. The menu entries render only when this is true; while
 * it loads, fails or says no, there is no entry (no empty state, no "coming soon"). The server caches the answer
 * and never waits on Notion for long, so this is cheap on every screen.
 */
export function useAcademyAvailable(): { available: boolean; loading: boolean } {
  const query = useQuery<{ available: boolean }>({
    queryKey: ACADEMY_AVAILABILITY_KEY,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { available: query.data?.available === true, loading: query.isLoading };
}
