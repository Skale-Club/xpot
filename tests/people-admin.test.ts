// Account › People: refused sign-ups are told apart from blocked partners, and
// the list can be searched and filtered.

import { describe, expect, it } from "vitest";
import { blockNote, isRefusal, refusalReason } from "../shared/repAccess";
import { filterPeople, NO_PEOPLE_FILTERS, peopleFiltersFromParams, personStatus } from "../client/src/pages/admin/peopleFilters";

describe("refusals", () => {
  it("are marked in the block reason, with the admin's note after it", () => {
    expect(refusalReason(null)).toBe("Sign-up refused");
    expect(refusalReason("  no car ")).toBe("Sign-up refused: no car");
    expect(isRefusal(refusalReason("no car"))).toBe(true);
    expect(blockNote(refusalReason("no car"))).toBe("no car");
    expect(blockNote(refusalReason(null))).toBeNull();
  });

  it("recognise the older refusals saved in the admin's language", () => {
    expect(isRefusal("Cadastro recusado")).toBe(true);
    expect(isRefusal("Registro rechazado")).toBe(true);
  });

  it("leave a plain block alone", () => {
    expect(isRefusal("Partnership ended")).toBe(false);
    expect(isRefusal("Sign-up refusedness")).toBe(false);
    expect(isRefusal(null)).toBe(false);
    expect(blockNote("Partnership ended")).toBe("Partnership ended");
    expect(blockNote(null)).toBeNull();
  });
});

describe("people filters", () => {
  const person = (over: Record<string, unknown>) => ({
    displayName: "Ana Souza",
    email: null,
    phone: null,
    loginPhone: "+13055550142",
    team: null,
    role: "rep",
    modules: ["visits", "tags"],
    access: "active" as const,
    refused: false,
    ...over,
  });
  const people = [
    person({ displayName: "Ana Souza", modules: ["tags"] }),
    person({ displayName: "Bruno Lima", email: "bruno@x.test", loginPhone: "+5511999990000", role: "manager", modules: ["tags"] }),
    person({ displayName: "Carla Dias", access: "pending", loginPhone: null }),
    person({ displayName: "Davi Reis", access: "blocked" }),
    person({ displayName: "Eva Melo", access: "blocked", refused: true }),
  ];
  const names = (list: typeof people) => list.map((p) => p.displayName);

  it("keeps everyone with no filter", () => {
    expect(filterPeople(people, NO_PEOPLE_FILTERS)).toHaveLength(5);
  });

  it("searches names, emails and phone digits", () => {
    expect(names(filterPeople(people, { ...NO_PEOPLE_FILTERS, search: "bruno@" }))).toEqual(["Bruno Lima"]);
    expect(names(filterPeople(people, { ...NO_PEOPLE_FILTERS, search: "souza" }))).toEqual(["Ana Souza"]);
    expect(names(filterPeople(people, { ...NO_PEOPLE_FILTERS, search: "(305) 555" }))).toEqual(["Ana Souza", "Davi Reis", "Eva Melo"]);
  });

  it("tells refused from blocked", () => {
    expect(personStatus(people[3])).toBe("blocked");
    expect(personStatus(people[4])).toBe("refused");
    expect(names(filterPeople(people, { ...NO_PEOPLE_FILTERS, status: "blocked" }))).toEqual(["Davi Reis"]);
    expect(names(filterPeople(people, { ...NO_PEOPLE_FILTERS, status: "refused" }))).toEqual(["Eva Melo"]);
  });

  it("filters by role and by module (managers use every module)", () => {
    expect(names(filterPeople(people, { ...NO_PEOPLE_FILTERS, role: "manager" }))).toEqual(["Bruno Lima"]);
    expect(names(filterPeople(people, { ...NO_PEOPLE_FILTERS, module: "visits" }))).toEqual(["Bruno Lima", "Carla Dias", "Davi Reis", "Eva Melo"]);
  });

  it("read from the URL, so other screens can link to a filtered list", () => {
    expect(peopleFiltersFromParams({})).toEqual(NO_PEOPLE_FILTERS);
    expect(peopleFiltersFromParams({ q: "ana", status: "active", role: "rep", module: "visits" }))
      .toEqual({ search: "ana", status: "active", role: "rep", module: "visits" });
    // Anything unknown is "all", never a filter that matches nobody.
    expect(peopleFiltersFromParams({ status: "gone", role: "boss", module: "maps" })).toEqual(NO_PEOPLE_FILTERS);
  });
});
