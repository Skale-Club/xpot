// Inventory's and Distribution › Kits' organization filter (UXR-22): the real
// organizations, not every rep's personal workspace, but always the one in the
// URL (an Organizations tab can link to a personal one).

import { describe, expect, it } from "vitest";
import { organizationFilterOptions } from "../client/src/pages/admin/tags/pieces-shared";

const list = [
  { id: 1, name: "North", personal: false },
  { id: 2, name: "Ana Lima", personal: true },
  { id: 3, name: "South", personal: false },
];
const unknown = (id: string) => `Organization #${id}`;

describe("organizationFilterOptions", () => {
  it("lists the real organizations and leaves personal workspaces out", () => {
    expect(organizationFilterOptions(list, "", unknown)).toEqual([
      { value: "1", label: "North" },
      { value: "3", label: "South" },
    ]);
  });

  it("keeps the selected personal workspace, so the filter shows what the list is narrowed to", () => {
    expect(organizationFilterOptions(list, "2", unknown).map((o) => o.value)).toEqual(["1", "2", "3"]);
  });

  it("names an organization it does not know yet (still loading, or gone) by its number", () => {
    expect(organizationFilterOptions([], "7", unknown)).toEqual([{ value: "7", label: "Organization #7" }]);
  });
});
