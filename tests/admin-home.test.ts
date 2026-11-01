// The panel home's "Today" rows (client/src/pages/admin/home-model.ts), by profile: zero rows are dropped, the
// platform gets two blocks (Platform, My company), a partner the company's production for their organization, an owner
// their team's purchases and the Tags queues; files are "stuck" only after two hours, failed plates not printed again
// show up, and a pending order is never counted twice.

import { describe, expect, it } from "vitest";
import type { PrintRequestItem } from "../shared/printProduction";
import type { TagQueueCounts } from "../shared/tagQueues";
import { FILES_STUCK_AFTER_HOURS, plateCounts, todayBlocks, todayFailure, todayRows } from "../client/src/pages/admin/home-model";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
/** A plate: status, its number in the request, how long ago it last changed and when it was made. */
const plate = (status: string, plateNumber = 1, updated = 0, created = updated) =>
  ({ status, plateNumber, updatedAt: hoursAgo(updated), createdAt: hoursAgo(created) }) as PrintRequestItem["plates"][number];
const request = (...plates: Array<PrintRequestItem["plates"][number] | string>) =>
  ({ plates: plates.map((item, index) => (typeof item === "string" ? plate(item, index + 1) : item)) }) as PrintRequestItem;
const queues = (over: Partial<TagQueueCounts> = {}): TagQueueCounts => ({ stuscleOrders: 0, batchesNotReceived: 0, chipPending: 0, scannedNotLive: 0, noProduct: 0, ...over });
const ids = (rows: ReturnType<typeof todayRows>) => rows.map((row) => row.id);

describe("plateCounts", () => {
  it("counts plates to print (ready, printing) and leaves the file still being generated alone", () => {
    const requests = [request("ready", "printing", "requested"), request("building", "ready", "printed")];
    expect(plateCounts(requests, NOW)).toEqual({ toPrint: 3, stuck: 0, failed: 0 });
    expect(plateCounts(undefined, NOW)).toEqual({ toPrint: 0, stuck: 0, failed: 0 });
  });

  it(`calls a file stuck only after ${FILES_STUCK_AFTER_HOURS} hours of requested or building`, () => {
    const requests = [request(plate("building", 1, 1), plate("building", 2, 3), plate("requested", 3, 2.5), plate("ready", 4, 9), plate("printed", 5, 9))];
    expect(plateCounts(requests, NOW).stuck).toBe(2);
    expect(plateCounts([request(plate("building", 1, FILES_STUCK_AFTER_HOURS))], NOW).stuck).toBe(0);
  });

  it("counts a failed plate until it is printed again, and not the cancelled ones", () => {
    expect(plateCounts([request(plate("failed", 1, 5), plate("cancelled", 2, 5), plate("printed", 3, 5))], NOW).failed).toBe(1);
    // Plate 1 failed, then was made again (a newer attempt): only the newest attempt counts.
    const redone = request(plate("failed", 1, 6, 6), plate("printing", 1, 1, 1));
    expect(plateCounts([redone], NOW)).toEqual({ toPrint: 1, stuck: 0, failed: 0 });
    const redoneAndFailedAgain = request(plate("failed", 1, 6, 6), plate("failed", 1, 1, 1));
    expect(plateCounts([redoneAndFailedAgain], NOW).failed).toBe(1);
  });
});

describe("todayRows: platform", () => {
  it("is empty when nothing waits", () => {
    expect(todayRows({ profile: "platform", requests: [], queues: queues(), pendingOrders: 0, pendingPeople: 0 })).toEqual([]);
  });

  it("splits Platform (people, Stuscle orders) from My company (print, queues), hiding zeros", () => {
    const blocks = todayBlocks({
      profile: "platform", now: NOW, pendingPeople: 3, pendingOrders: 2,
      requests: [request(plate("ready", 1), plate("building", 2, 4), plate("failed", 3, 1))],
      queues: queues({ chipPending: 4, batchesNotReceived: 1 }),
    });
    expect(blocks.map((block) => block.id)).toEqual(["platform", "company"]);
    expect(blocks[0].rows.map((row) => [row.id, row.count, row.href])).toEqual([
      ["peopleWaiting", 3, "/admin/reps?status=pending"],
      ["stuscleOrders", 2, "/admin/tags/kits?view=orders"],
    ]);
    expect(blocks[1].rows.map((row) => [row.id, row.count, row.href])).toEqual([
      ["platesToPrint", 1, "/admin/tags/production/queue"],
      ["filesStuck", 1, "/admin/tags/production/queue"],
      ["printsFailed", 1, "/admin/tags/production/queue"],
      ["batchesNotReceived", 1, "/admin/tags/batches?pending=1"],
      ["chipPending", 4, "/admin/tags/overview/chipPending"],
    ]);
  });

  it("drops a block that is left empty", () => {
    expect(todayBlocks({ profile: "platform", pendingPeople: 1, queues: queues() }).map((block) => block.id)).toEqual(["platform"]);
    expect(todayBlocks({ profile: "platform", queues: queues({ noProduct: 2 }) }).map((block) => block.id)).toEqual(["company"]);
  });

  it("counts the wholesale orders once, from the orders list, not from the overview's identical queue", () => {
    const rows = todayRows({ profile: "platform", queues: queues({ stuscleOrders: 9 }), pendingOrders: 2 });
    expect(rows.filter((row) => row.id === "stuscleOrders").map((row) => row.count)).toEqual([2]);
  });
});

describe("todayRows: partner", () => {
  it("gets the company's rows for their organization: production and queues, no people and no orders", () => {
    const blocks = todayBlocks({ profile: "partner", now: NOW, requests: [request("ready")], queues: queues({ stuscleOrders: 5, batchesNotReceived: 2, scannedNotLive: 1 }), pendingOrders: 7, pendingPeople: 4 });
    expect(blocks.map((block) => block.id)).toEqual(["organization"]);
    expect(ids(todayRows({ profile: "partner", now: NOW, requests: [request("ready")], queues: queues({ stuscleOrders: 5, batchesNotReceived: 2, scannedNotLive: 1 }), pendingOrders: 7, pendingPeople: 4 })))
      .toEqual(["platesToPrint", "batchesNotReceived", "scannedNotLive"]);
  });
});

describe("todayRows: owner", () => {
  it("gets team purchases first, then the queues they can open, without production or batches", () => {
    const rows = todayRows({ profile: "owner", requests: [request("ready")], queues: queues({ stuscleOrders: 3, batchesNotReceived: 5, noProduct: 1, chipPending: 2 }), teamPurchases: 4, teamPurchasesHref: "/organizations/7?tab=purchases" });
    expect(ids(rows)).toEqual(["teamPurchases", "chipPending", "noProduct"]);
    expect(rows[0]).toMatchObject({ count: 4, href: "/organizations/7?tab=purchases" });
  });

  it("falls back to the organizations list for the purchases link", () => {
    expect(todayRows({ profile: "owner", teamPurchases: 1 })[0].href).toBe("/organizations");
  });

  it("shows nothing for a viewer whose lists did not load", () => {
    expect(todayRows({ profile: "owner" })).toEqual([]);
    expect(todayRows({ profile: "partner" })).toEqual([]);
  });
});

describe("todayRows: member", () => {
  it("has no panel, so no rows", () => {
    expect(todayRows({ profile: "member", requests: [request("ready")], queues: queues({ chipPending: 3 }), teamPurchases: 2 })).toEqual([]);
  });
});

describe("todayFailure", () => {
  it("treats a 403 as no rows and reports any other failure", () => {
    const serverError = Object.assign(new Error("boom"), { status: 500 });
    expect(todayFailure(Object.assign(new Error("no"), { status: 403 }))).toBeNull();
    expect(todayFailure(serverError)).toBe(serverError);
    expect(todayFailure(null)).toBeNull();
  });
});
