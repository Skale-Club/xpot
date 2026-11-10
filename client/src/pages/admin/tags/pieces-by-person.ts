// The people chips on the stock list: one per active person with the pieces they hold and have sold, zero included.

/** What `GET /api/xpot/admin/tags/by-person` returns: people with neither held nor sold pieces are absent. */
export interface PersonPieceCount {
  repId: number;
  held: number;
  sold: number;
}

export interface PersonChip {
  /** The person's id as text: the value of the list's `rep` filter. */
  id: string;
  label: string;
  held: number;
  sold: number;
}

/** Active people, the most held first, then the most sold, then by name. A person the server has no count for has none. */
export function personChips(
  people: ReadonlyArray<{ id: number; displayName: string; isActive: boolean }>,
  counts: readonly PersonPieceCount[],
): PersonChip[] {
  const byRep = new Map(counts.map((c) => [c.repId, c]));
  return people
    .filter((p) => p.isActive)
    .map((p) => ({ id: String(p.id), label: p.displayName, held: byRep.get(p.id)?.held ?? 0, sold: byRep.get(p.id)?.sold ?? 0 }))
    .sort((a, b) => b.held - a.held || b.sold - a.sold || a.label.localeCompare(b.label));
}

/** Tapping the chosen person again clears the filter; tapping another one switches to them. */
export function nextPersonFilter(current: string, tapped: string): string {
  return current === tapped ? "" : tapped;
}
