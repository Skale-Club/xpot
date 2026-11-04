// The stock list's people chips (client/src/pages/admin/tags/pieces-by-person.ts).

import { describe, expect, it } from "vitest";
import { nextPersonFilter, personChips } from "../client/src/pages/admin/tags/pieces-by-person";

const people = [
  { id: 1, displayName: "Pedro", isActive: true },
  { id: 2, displayName: "João", isActive: true },
  { id: 3, displayName: "Ana", isActive: true },
  { id: 4, displayName: "Gone", isActive: false },
];

describe("personChips", () => {
  it("counts what each person holds and sold, and keeps those with none", () => {
    const chips = personChips(people, [{ repId: 1, held: 4, sold: 6 }, { repId: 2, held: 5, sold: 0 }]);
    expect(chips).toEqual([
      { id: "2", label: "João", held: 5, sold: 0 },
      { id: "1", label: "Pedro", held: 4, sold: 6 },
      { id: "3", label: "Ana", held: 0, sold: 0 },
    ]);
  });

  it("sorts by held, then sold, then name", () => {
    const chips = personChips(people, [{ repId: 1, held: 3, sold: 1 }, { repId: 2, held: 3, sold: 7 }, { repId: 3, held: 0, sold: 2 }]);
    expect(chips.map((c) => c.id)).toEqual(["2", "1", "3"]);
  });

  it("leaves out inactive people and counts for people it does not list", () => {
    const chips = personChips(people, [{ repId: 4, held: 9, sold: 0 }, { repId: 99, held: 3, sold: 0 }]);
    expect(chips.map((c) => c.id)).toEqual(["3", "2", "1"]);
  });

  it("breaks ties by name", () => {
    expect(personChips(people, []).map((c) => c.label)).toEqual(["Ana", "João", "Pedro"]);
  });
});

describe("nextPersonFilter", () => {
  it("sets the person, switches to another, and clears on a second tap", () => {
    expect(nextPersonFilter("", "2")).toBe("2");
    expect(nextPersonFilter("2", "1")).toBe("1");
    expect(nextPersonFilter("2", "2")).toBe("");
  });
});
