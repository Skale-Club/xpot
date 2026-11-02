import { useViewerAccess } from "@/lib/adminMode";

/**
 * Whether the viewer sees what products cost and what is left over. A rep sells and collects; profit and cost
 * are the number of whoever owns the business: an owner, a partner or the platform. False until the profile loads.
 */
export function useShowProfit(): boolean {
  const { profile } = useViewerAccess();
  return profile !== null && profile !== "member";
}
