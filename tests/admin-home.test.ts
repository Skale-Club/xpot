// The panel home's "Today" rows (client/src/pages/admin/home-model.ts): zero rows are dropped, the super admin
// gets print and wholesale rows, a manager only the Tags queues, and a pending order is never counted twice.

import { describe, expect, it } from "vitest";
import type { PrintRequestItem } from "../shared/printProduction";
import type { TagQueueCounts } from "../shared/tagQueues";
import { plateCounts, todayRows } from "../client/src/pages/admin/home-model";

const plate = (status: string) => ({ status }) as PrintRequestItem["plates"][number];
const request = (...statuses: string[]) => ({ plates: statuses.map(plate) }) as PrintRequestItem;
const queues = (over: Partial<TagQueueCounts> = {}): TagQueueCounts => ({ stuscleOrders: 0, batchesNotReceived: 0, chipPending: 0, scannedNotLive: 0, noProduct: 0, ...over });
const ids = (rows: ReturnType<typeof todayRows>) => rows.map((row) => row.id);

describe("plateCounts", () => {
  it("splits plates into to print (ready, printing) and being generated (requested, building)", () => {
    const requests = [request("ready", "printing", "requested"), request("building", "ready", "printed")];
    expect(plateCounts(requests)).toEqual({ toPrint: 3, building: 2 });
    expect(plateCounts(undefined)).toEqual({ toPrint: 0, building: 0 });
  });
});

describe("todayRows", () => {
  it("is empty when nothing waits", () => {
    expect(todayRows({ isSuperAdmin: true, requests: [], queues: queues(), pendingOrders: 0 })).toEqual([]);
    expect(todayRows({ isSuperAdmin: false, queues: queues() })).toEqual([]);
  });

  it("gives the super admin print, orders and queue rows with their links, hiding zeros", () => {
    const rows = todayRows({ isSuperAdmin: true, requests: [request("ready", "building")], queues: queues({ chipPending: 4, batchesNotReceived: 1 }), pendingOrders: 2 });
    expect(rows.map((row) => [row.id, row.count, row.href])).toEqual([
      ["platesToPrint", 1, "/admin/tags/production/queue"],
      ["filesBuilding", 1, "/admin/tags/production/queue"],
      ["stuscleOrders", 2, "/admin/tags/kits?view=orders"],
      ["batchesNotReceived", 1, "/admin/tags/batches?pending=1"],
      ["chipPending", 4, "/admin/tags/overview/chipPending"],
    ]);
  });

  it("counts the wholesale orders once for the super admin, from the orders list", () => {
    const rows = todayRows({ isSuperAdmin: true, queues: queues({ stuscleOrders: 9 }), pendingOrders: 2 });
    expect(rows.filter((row) => row.id === "stuscleOrders").map((row) => row.count)).toEqual([2]);
  });

  it("gives a manager the queues they can open, without production or batches", () => {
    const rows = todayRows({ isSuperAdmin: false, requests: [request("ready")], queues: queues({ stuscleOrders: 3, batchesNotReceived: 5, noProduct: 1 }), pendingOrders: 7 });
    expect(ids(rows)).toEqual(["stuscleOrders", "noProduct"]);
    expect(rows[0].count).toBe(3);
  });

  it("shows nothing for a viewer whose overview did not load", () => {
    expect(todayRows({ isSuperAdmin: false })).toEqual([]);
  });
});
