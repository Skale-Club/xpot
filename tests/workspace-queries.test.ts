import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { clearWorkspaceQueries } from "../client/src/lib/workspaceQueries";

describe("workspace query isolation", () => {
  it("keeps the session and removes every scoped record before another workspace mounts", async () => {
    const client = new QueryClient();
    const session = { user: { isAdmin: true }, rep: { id: 1 } };
    client.setQueryData(["/api/xpot/me"], session);
    client.setQueryData(["/api/xpot/leads"], [{ id: "team-record" }]);
    client.setQueryData(["tags", "list", null, null], [{ id: "other-person-piece" }]);
    await clearWorkspaceQueries(client);
    expect(client.getQueryData(["/api/xpot/me"])).toBe(session);
    expect(client.getQueryData(["/api/xpot/leads"])).toBeUndefined();
    expect(client.getQueryData(["tags", "list", null, null])).toBeUndefined();
    client.clear();
  });
  it("does not let a late response from the previous workspace overwrite the new workspace", async () => {
    const client = new QueryClient();
    let finish!: (rows: string[]) => void;
    const oldResponse = new Promise<string[]>((resolve) => { finish = resolve; });
    const request = client.fetchQuery({ queryKey: ["/api/xpot/leads"], queryFn: () => oldResponse }).catch(() => undefined);
    await clearWorkspaceQueries(client);
    client.setQueryData(["/api/xpot/leads"], ["personal-record"]);
    finish(["team-record"]);
    await request;
    expect(client.getQueryData(["/api/xpot/leads"])).toEqual(["personal-record"]);
    client.clear();
  });
});
