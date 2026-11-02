import { describe, expect, it } from "vitest";
import { firstStepsOf } from "../client/src/pages/tags/whoToAsk";

const team = { name: "Lindgren Local Growth", isActive: true, personal: false, membershipRole: "member" };
const alone = { name: "Rafael's workspace", isActive: true, personal: true, membershipRole: "admin" };

describe("firstStepsOf", () => {
  it.each([
    ["an employee of a team: greets by first name, sends them to the team", { user: { firstName: "Rafael" }, rep: { displayName: "Rafael Costa" }, organizations: [team] }, { name: "Rafael", company: "Lindgren Local Growth" }],
    ["no first name on the user: the first word of the rep's name", { user: { firstName: null }, rep: { displayName: "Rafael Costa" }, organizations: [team] }, { name: "Rafael", company: "Lindgren Local Growth" }],
    ["someone selling alone has no company to ask: they buy in the Shop", { user: { firstName: "Ana" }, organizations: [alone] }, { name: "Ana", company: null }],
    ["a team that is turned off is not a company to ask", { user: { firstName: "Ana" }, organizations: [{ ...team, isActive: false }] }, { name: "Ana", company: null }],
    ["a team they are not a member of is not theirs", { user: { firstName: "Ana" }, organizations: [{ ...team, membershipRole: null }] }, { name: "Ana", company: null }],
    ["the team wins over their own workspace", { user: { firstName: "Ana" }, organizations: [alone, team] }, { name: "Ana", company: "Lindgren Local Growth" }],
    ["nothing loaded yet", undefined, { name: null, company: null }],
    ["a blank name is no name", { user: { firstName: "  " }, rep: { displayName: " " } }, { name: null, company: null }],
  ] as const)("%s", (_case, me, expected) => {
    expect(firstStepsOf(me as never)).toEqual(expected);
  });
});
