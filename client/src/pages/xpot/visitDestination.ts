// Where the visit screen goes once the active visit is cancelled. A stop of a
// route goes back to its route (the stop is skipped, the next one is up);
// any other visit goes back where it was started from (the Dashboard, a
// company page…), read from the in-app history like the company page's Back
// (lib/inAppHistory.ts), and to the Dashboard when that is not known. Finishing
// a visit is different: it opens the visit's summary (useVisits).

import { visitsScreen } from "@/components/xpot/moduleNav";

export type VisitExit = { path: string; back: boolean };

/**
 * `routeId`: the route the cancelled visit was a stop of (the cancel answer
 * carries it). `previous`: the app screen Back would land on (previousInAppPath).
 * `back` means "go back in history to `path`", so Back from there does not
 * return to the visit screen.
 */
export function cancelledVisitExit(routeId: number | null | undefined, previous: string | null): VisitExit {
  if (routeId) return { path: `/route?routeId=${routeId}`, back: false };
  const from = previous?.split(/[?#]/, 1)[0];
  // Another visit screen is no place to land on: the visit is gone.
  if (previous && from && visitsScreen(from) !== "visit") return { path: previous, back: true };
  return { path: "/dashboard", back: false };
}
