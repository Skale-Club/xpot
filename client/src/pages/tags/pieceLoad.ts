// What the piece screen shows while it looks a piece up, as a rule with a table of cases (tests/piece-load.test.ts).
// No signal is not "not found": the first sends the person to try again, the second to check the code. A query that
// starts offline is paused by React Query (fetchStatus "paused"): it has no data and no error yet, which the screen
// used to read as "no such piece".

export type PieceLookup =
  | { kind: "ok" }
  | { kind: "limited" }
  | { kind: "not_found" }
  | { kind: "not_yours" };

export type PieceLoadView = "loading" | "offline" | "failed" | PieceLookup["kind"];

/** fetch rejects with a TypeError when there is no signal (Chrome "Failed to fetch", Safari "Load failed", Firefox "NetworkError…"). */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
}

export function pieceLoadView(q: {
  data: PieceLookup | undefined;
  error: unknown;
  fetchStatus: "fetching" | "paused" | "idle";
}): PieceLoadView {
  if (q.data) return q.data.kind;
  if (q.error) return isNetworkFailure(q.error) ? "offline" : "failed";
  return q.fetchStatus === "paused" ? "offline" : "loading";
}
