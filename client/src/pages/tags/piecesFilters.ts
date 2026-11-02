// "My pieces" keeps the search and the status chips in view; the rest sits behind "More filters". The panel opens by
// itself while any of those is narrowing the list (a link like ?chip=missing, the back button), so nothing hides.

/** The filters behind "More filters" and what each one reads when it narrows nothing. */
export const MORE_PIECE_FILTER_DEFAULTS = { sale: "all", chip: "", company: "", face: "", scan: "all" } as const;

export type MorePieceFilter = keyof typeof MORE_PIECE_FILTER_DEFAULTS;

export const MORE_PIECE_FILTERS = Object.keys(MORE_PIECE_FILTER_DEFAULTS) as MorePieceFilter[];

/** How many of the hidden filters differ from their default in these URL values. */
export function countMorePieceFilters(values: Partial<Record<string, string>>): number {
  return MORE_PIECE_FILTERS.filter((key) => (values[key] ?? MORE_PIECE_FILTER_DEFAULTS[key]) !== MORE_PIECE_FILTER_DEFAULTS[key]).length;
}

/** The panel is open when the person opened it, or whenever a hidden filter is active. */
export function morePiecesOpen(opened: boolean, activeCount: number): boolean {
  return opened || activeCount > 0;
}
