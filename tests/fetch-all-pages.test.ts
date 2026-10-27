// The Companies list is loaded whole, page by page (security review A13): the
// screen searches, filters and counts what it holds, so stopping at the API's
// first page hid every company past it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllPages, getQueryFn, LIST_PAGE_SIZE } from "../client/src/lib/queryClient";

afterEach(() => vi.restoreAllMocks());

/** A server holding `total` rows, answering ?limit=&offset= like GET /api/xpot/leads. */
function serve(total: number) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input), "http://x.test");
    calls.push(`${url.pathname}${url.search}`);
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({ id: offset + i + 1 }));
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

describe("fetchAllPages", () => {
  it("reads every page, so a company past the first one is there to be searched", async () => {
    const calls = serve(LIST_PAGE_SIZE * 2 + 50);
    const rows = await fetchAllPages<{ id: number }>("/api/xpot/leads");
    expect(rows).toHaveLength(LIST_PAGE_SIZE * 2 + 50);
    expect(rows.at(-1)).toEqual({ id: LIST_PAGE_SIZE * 2 + 50 });
    expect(calls).toHaveLength(3);
  });

  it("keeps the query's own filters", async () => {
    const calls = serve(3);
    await fetchAllPages("/api/xpot/leads?organizationId=7");
    expect(calls).toEqual([`/api/xpot/leads?organizationId=7&limit=${LIST_PAGE_SIZE}&offset=0`]);
  });

  it("is what the bare Companies key loads, wherever it is read", async () => {
    serve(LIST_PAGE_SIZE + 1);
    const queryFn = getQueryFn<Array<{ id: number }>>({ on401: "throw" });
    const rows = await queryFn({ queryKey: ["/api/xpot/leads"] } as never);
    expect(rows).toHaveLength(LIST_PAGE_SIZE + 1);
  });
});
