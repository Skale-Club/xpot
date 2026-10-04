import { test } from "vitest";
import assert from "node:assert/strict";
import { mergeReadScope } from "../server/mcp/readScope.js";

test("read tools: top-level scope keys are kept, filters win, unknown keys are dropped", () => {
  assert.deepEqual(mergeReadScope({ batch: "REV-2026-001", limit: 50 }), { batch: "REV-2026-001", limit: 50 });
  assert.deepEqual(mergeReadScope({ filters: { batch: "IG-2026-001" } }), { batch: "IG-2026-001" });
  assert.deepEqual(mergeReadScope({ batch: "A", filters: { batch: "B", kind: "decision" } }), { batch: "B", kind: "decision" });
  assert.deepEqual(mergeReadScope({ nonsense: 1, order: "desc" }), { order: "desc" });
  assert.deepEqual(mergeReadScope({}), {});
});
