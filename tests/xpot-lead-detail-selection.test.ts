import { expect, test } from "vitest";
import { selectLeadForDetail } from "../client/src/pages/xpot/lead-detail-selection.js";
import type { FullSalesLead } from "../client/src/pages/xpot/types.js";

test("a prospect created by a route can be opened directly before its first check-in", () => {
  const prospect = { id: 7, name: "J&L Hair Studio", status: "prospect" } as FullSalesLead;

  expect(selectLeadForDetail([prospect], prospect.id)).toBe(prospect);
});
