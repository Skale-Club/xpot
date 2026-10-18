import { JOURNEY_PRODUCTION_ACTIONS } from "@shared/tagJourney";
import type { TagJourneyEntryItem } from "@shared/tagsApi";

// Presentation only: a batch intake writes one journey entry per piece ("Piece X received into stock"),
// so a 500-piece batch made the timeline thousands of pixels tall. Runs of the same automatic entry
// fold into one row ("24 similar entries") that opens on demand. Nothing is hidden from the data.

export type JourneyRow =
  | { type: "entry"; entry: TagJourneyEntryItem }
  | { type: "group"; key: string; entries: TagJourneyEntryItem[] };

/** Fewer than this many in a row stay as they are. */
export const JOURNEY_GROUP_MIN = 3;

const PRODUCTION = new Set<string>(JOURNEY_PRODUCTION_ACTIONS);

/**
 * What makes entries "the same automatic entry": an execution the server wrote for an action (not a
 * production step someone recorded by hand), still active, with no note of its own, by the same actor.
 * Anything else (a decision, a risk, an entry to review) always shows on its own.
 */
export function journeyGroupKey(entry: TagJourneyEntryItem): string | null {
  if (entry.kind !== "execution" || !entry.action || PRODUCTION.has(entry.action)) return null;
  if (entry.status !== "active" || entry.content) return null;
  return `${entry.actor}|${entry.action}`;
}

/** Fold runs of at least JOURNEY_GROUP_MIN consecutive entries with the same group key; order is kept. */
export function groupJourneyRows(entries: readonly TagJourneyEntryItem[], min = JOURNEY_GROUP_MIN): JourneyRow[] {
  const rows: JourneyRow[] = [];
  let run: TagJourneyEntryItem[] = [];
  let runKey: string | null = null;
  const flush = () => {
    if (runKey && run.length >= min) rows.push({ type: "group", key: `${runKey}|${run[0].id}`, entries: run });
    else for (const entry of run) rows.push({ type: "entry", entry });
    run = [];
    runKey = null;
  };
  for (const entry of entries) {
    const key = journeyGroupKey(entry);
    if (key && key === runKey) {
      run.push(entry);
      continue;
    }
    flush();
    run = [entry];
    runKey = key;
  }
  flush();
  return rows;
}
