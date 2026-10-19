import { createContext, useCallback, useContext, useEffect, useState } from "react";

// A screen made of cards that each save on their own (Integrations: every
// provider card, every Xphere row). Each card reports whether it has unsaved
// edits; the screen guards leaving while any does (useUnsavedChangesGuard).

/** `ids` with `id` marked dirty or clean; the same set when nothing changes, so React skips the render. */
export function withDirty(ids: ReadonlySet<string>, id: string, dirty: boolean): ReadonlySet<string> {
  if (ids.has(id) === dirty) return ids;
  const next = new Set(ids);
  if (dirty) next.add(id);
  else next.delete(id);
  return next;
}

/** The screen's side: whether any card has unsaved edits, and the `report` its cards call (through the context). */
export function useUnsavedEdits() {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback((id: string, dirty: boolean) => setIds((current) => withDirty(current, id, dirty)), []);
  return { dirty: ids.size > 0, report };
}

export const UnsavedEditsContext = createContext<(id: string, dirty: boolean) => void>(() => {});

/** A card's side: tells the screen whether it has unsaved edits; a card that goes away counts as clean. */
export function useReportUnsaved(id: string, dirty: boolean) {
  const report = useContext(UnsavedEditsContext);
  useEffect(() => {
    report(id, dirty);
  }, [report, id, dirty]);
  useEffect(() => () => report(id, false), [report, id]);
}
