// The Tags admin journey folds runs of the same automatic entry ("24 pieces received") into one row,
// so a batch's timeline does not grow thousands of pixels tall. Presentation only: every entry is kept.

import { describe, expect, it } from "vitest";
import type { TagJourneyEntryItem } from "../shared/tagsApi";
import { groupJourneyRows, journeyGroupKey } from "../client/src/pages/admin/tags/journey-group";

let next = 0;
function entry(patch: Partial<TagJourneyEntryItem> = {}): TagJourneyEntryItem {
  next += 1;
  return {
    id: `e${next}`,
    kind: "execution",
    action: "piece_scanned_into_batch",
    status: "active",
    actor: "human",
    title: `Piece ${next} received`,
    content: null,
    ...patch,
  } as TagJourneyEntryItem;
}

const shape = (rows: ReturnType<typeof groupJourneyRows>) => rows.map((r) => (r.type === "group" ? `group:${r.entries.length}` : "entry"));

describe("journeyGroupKey", () => {
  it("groups server-written executions only", () => {
    expect(journeyGroupKey(entry())).toBe("human|piece_scanned_into_batch");
    expect(journeyGroupKey(entry({ kind: "decision" }))).toBeNull();
    expect(journeyGroupKey(entry({ action: null }))).toBeNull();
    expect(journeyGroupKey(entry({ action: "printed" }))).toBeNull(); // a production step someone recorded
    expect(journeyGroupKey(entry({ status: "needs_review" }))).toBeNull();
    expect(journeyGroupKey(entry({ content: "a note" }))).toBeNull();
  });
});

describe("groupJourneyRows", () => {
  it("folds three or more consecutive entries of the same kind, keeping order and every entry", () => {
    const list = [entry({ kind: "decision" }), entry(), entry(), entry(), entry(), entry({ action: "kit_delivered" })];
    const rows = groupJourneyRows(list);
    expect(shape(rows)).toEqual(["entry", "group:4", "entry"]);
    const flat = rows.flatMap((r) => (r.type === "group" ? r.entries : [r.entry]));
    expect(flat.map((e) => e.id)).toEqual(list.map((e) => e.id));
  });

  it("leaves short runs alone", () => {
    expect(shape(groupJourneyRows([entry(), entry(), entry({ kind: "risk" })]))).toEqual(["entry", "entry", "entry"]);
  });

  it("breaks a run on another actor or action", () => {
    const rows = groupJourneyRows([entry(), entry(), entry(), entry({ actor: "ai" }), entry({ actor: "ai" }), entry({ actor: "ai" })]);
    expect(shape(rows)).toEqual(["group:3", "group:3"]);
  });

  it("handles an empty list", () => {
    expect(groupJourneyRows([])).toEqual([]);
  });
});
