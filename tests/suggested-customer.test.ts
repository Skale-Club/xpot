import { describe, expect, it } from "vitest";
import { suggestedCustomer } from "../client/src/pages/tags/suggestedCustomer";

const sellTo = { leadId: 4, name: "Pho Saigon Corner", placeId: "place-4" };
const visitLead = { id: 9, name: "Blue Harbor Seafood", googlePlaceId: "place-9" };

describe("suggestedCustomer", () => {
  it.each([
    ["an open visit offers its business", { sellTo: null, visitLead }, { leadId: 9, name: "Blue Harbor Seafood", placeId: "place-9" }],
    ["a visit's business with no Google place", { sellTo: null, visitLead: { id: 9, name: "Blue Harbor Seafood" } }, { leadId: 9, name: "Blue Harbor Seafood", placeId: null }],
    ["who they are selling to wins over the visit", { sellTo, visitLead }, sellTo],
    ["selling to, with no visit", { sellTo, visitLead: null }, sellTo],
    ["neither: the field stays empty", { sellTo: null, visitLead: null }, null],
    ["a visit still loading", { sellTo: null, visitLead: undefined }, null],
  ] as const)("%s", (_case, input, expected) => {
    expect(suggestedCustomer(input)).toEqual(expected);
  });
});
