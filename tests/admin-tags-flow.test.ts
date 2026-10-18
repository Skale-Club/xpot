// Phase 3c pure helpers of the Tags management screens: the Overview funnel, queues and activity feed; the Batches
// pipeline and stage stepper; the intake station's read outcomes; Distribution's code list and per-code messages.

import { describe, expect, it } from "vitest";
import { HAND_OUT_BLOCKERS, RECEIVE_BLOCKERS, SELL_BLOCKERS, TAKE_BACK_BLOCKERS } from "../shared/tagDistribution";
import { TAG_PIECE_QUEUES } from "../shared/tagQueues";
import { adminTagsFlowMessages } from "../client/src/i18n/messages/adminTagsFlow";
import { activityFeed, needsActionQueues, pieceQueueCard, stockFunnel } from "../client/src/pages/admin/tags/overview-model";
import {
  canMarkStep,
  groupBatchesByStage,
  intakeKey,
  isAwaitingPieces,
  readCode,
  readErrorStatus,
  splitReads,
  stageSteps,
} from "../client/src/pages/admin/tags/batches-model";
import {
  addCodes,
  distributionView,
  handOutHref,
  HAND_OUT_REASON_KEYS,
  RECEIVE_BLOCKER_KEYS,
  reasonKey,
  SELL_BLOCKER_KEYS,
  TAKE_BACK_REASON_KEYS,
} from "../client/src/pages/admin/tags/distribution-model";

const en = adminTagsFlowMessages.en as Record<string, string>;

describe("Overview stock funnel", () => {
  const steps = stockFunnel({ notReceived: 4, house: 10, withResellers: 7, sold: 3, live: 2 });

  it("is not received → house → resellers → sold → live, one shared stock number each", () => {
    expect(steps.map((s) => [s.id, s.metric, s.count])).toEqual([
      ["notReceived", "notReceived", 4],
      ["house", "house", 10],
      ["withResellers", "withResellers", 7],
      ["sold", "sold", 3],
      ["live", "live", 2],
    ]);
  });

  it("links each step to the Pieces filter that lists the same number", () => {
    // PiecesTab: stock=house|reps|sold are metrics; stock=pending is the stock status the notReceived metric is.
    expect(Object.fromEntries(steps.map((s) => [s.id, s.href]))).toEqual({
      notReceived: "/pieces?stock=pending",
      house: "/pieces?stock=house",
      withResellers: "/pieces?stock=reps",
      sold: "/pieces?stock=sold",
      live: "/pieces?status=active",
    });
    for (const s of steps) expect(en[s.labelKey] && en[s.hintKey]).toBeTruthy();
  });
});

describe("Overview needs-action queues", () => {
  const counts = { stuscleOrders: 1, batchesNotReceived: 2, chipPending: 3, scannedNotLive: 0, noProduct: 5 };

  it("gives managers every queue but the batches one (an admin screen)", () => {
    expect(needsActionQueues(counts, true).map((q) => q.id)).toEqual(["stuscleOrders", "batchesNotReceived", "chipPending", "scannedNotLive", "noProduct"]);
    expect(needsActionQueues(counts, false).map((q) => q.id)).toEqual(["stuscleOrders", "chipPending", "scannedNotLive", "noProduct"]);
  });

  it("opens the list that reproduces each count", () => {
    const hrefs = Object.fromEntries(needsActionQueues(counts, true).map((q) => [q.id, q.href]));
    expect(hrefs).toEqual({
      stuscleOrders: "/kits?view=orders",
      batchesNotReceived: "/batches?pending=1",
      chipPending: "/overview/chipPending",
      scannedNotLive: "/overview/scannedNotLive",
      noProduct: "/overview/noProduct",
    });
    for (const queue of TAG_PIECE_QUEUES) expect(pieceQueueCard(queue).href).toBe(`/overview/${queue}`);
  });
});

describe("Overview activity feed", () => {
  const overview = {
    recentEvents: [{ id: 1, tagId: "t1", publicCode: "A", productType: "keychain", face: null, batchCode: null, leadName: null, accessMethod: "qr", eventType: "redirect", deviceType: null, occurredAt: "2026-10-03T10:00:00.000Z" }],
    recentActivations: [{ id: "t2", publicCode: "B", productType: "keychain", face: null, batchCode: null, leadName: null, repName: null, activatedAt: "2026-10-05T10:00:00.000Z" }],
    recentChanges: [{ id: "h1", tagId: "t3", publicCode: "C", productType: "keychain", face: null, batchCode: null, previousUrl: null, newUrl: "https://x.test", previousDestinationType: null, newDestinationType: "website", changedByUserId: null, changedByEmail: null, reason: null, createdAt: "2026-10-04T10:00:00.000Z" }],
  };

  it("merges scans, activations and destination changes, newest first", () => {
    expect(activityFeed(overview).map((i) => i.kind)).toEqual(["activated", "destination", "scans"]);
  });

  it("filters by kind", () => {
    expect(activityFeed(overview, "scans").map((i) => i.key)).toEqual(["e1"]);
    expect(activityFeed(overview, "destination").map((i) => i.key)).toEqual(["ch1"]);
  });
});

describe("Batches pipeline", () => {
  const b = (stage: string, pendingCount = 0) => ({ stage, pendingCount });

  it("groups by stage in pipeline order, cancelled last, empty stages left out", () => {
    const groups = groupBatchesByStage([b("received"), b("issued", 3), b("cancelled", 2), b("receiving", 1), b("issued", 4)]);
    expect(groups.map((g) => [g.stage, g.batches.length])).toEqual([["issued", 2], ["receiving", 1], ["received", 1], ["cancelled", 1]]);
  });

  it("lists as awaiting pieces only live batches with codes not received", () => {
    expect([b("issued", 3), b("received"), b("cancelled", 2)].map(isAwaitingPieces)).toEqual([true, false, false]);
  });
});

describe("Batch stage stepper", () => {
  const states = (stage: string, codeSource = "issued") => stageSteps({ stage, codeSource }).map((s) => `${s.stage}:${s.state}`);

  it("marks steps up to the stage done and the next one current", () => {
    expect(states("issued")).toEqual(["issued:done", "built:current", "printed:todo", "receiving:todo", "received:todo"]);
    expect(states("printed")).toEqual(["issued:done", "built:done", "printed:done", "receiving:current", "received:todo"]);
    expect(states("receiving")).toEqual(["issued:done", "built:done", "printed:done", "receiving:current", "received:todo"]);
    expect(states("received")).toEqual(["issued:done", "built:done", "printed:done", "receiving:done", "received:done"]);
  });

  it("only receives a scanned batch, with nothing to mark by hand", () => {
    expect(states("receiving", "scanned")).toEqual(["receiving:current", "received:todo"]);
    expect(stageSteps({ stage: "receiving", codeSource: "scanned" }).every((s) => s.markAction === null)).toBe(true);
  });

  it("offers Mark as done for Print file ready and Printed until pieces come in", () => {
    const marks = (stage: string) => stageSteps({ stage, codeSource: "issued" }).filter((s) => canMarkStep(s, stage)).map((s) => s.markAction);
    expect(marks("issued")).toEqual(["art_built", "printed"]);
    expect(marks("built")).toEqual(["printed"]);
    expect(marks("printed")).toEqual([]);
    expect(marks("receiving")).toEqual([]);
  });
});

describe("Intake station reads", () => {
  it("reads a code from a bare code or an Xpot link, nothing from junk", () => {
    expect(readCode("a7k3p9x2")).toBe("A7K3P9X2");
    expect(readCode("https://xpot.place/q/A7K3P9X2")).toBe("A7K3P9X2");
    expect(readCode("hello world")).toBeNull();
  });

  it("splits pasted lists into reads, but keeps a typed phrase as one read", () => {
    expect(splitReads("A7K3P9X2\nB8M4Q1Z3, C9N5R2Y4")).toEqual(["A7K3P9X2", "B8M4Q1Z3", "C9N5R2Y4"]);
    expect(splitReads("A7K3P9X2 B8M4Q1Z3")).toEqual(["A7K3P9X2", "B8M4Q1Z3"]);
    expect(splitReads("not a code")).toEqual(["not a code"]);
  });

  it("keeps one idempotency key per batch and code", () => {
    expect(intakeKey("b1", "A7K3P9X2")).toBe(intakeKey("b1", "A7K3P9X2"));
    expect(intakeKey("b1", "A7K3P9X2")).not.toBe(intakeKey("b2", "A7K3P9X2"));
  });

  it("words a refusal by the server's code", () => {
    expect(readErrorStatus("piece_other_batch")).toBe("other_batch");
    expect(readErrorStatus("piece_not_in_batch")).toBe("other_batch");
    expect(readErrorStatus("batch_closed")).toBe("closed");
    expect(readErrorStatus(null, 400)).toBe("invalid");
    expect(readErrorStatus(null, 500)).toBe("error");
  });
});

describe("Distribution", () => {
  it("keeps the view in the URL, Hand out by default", () => {
    expect(distributionView("returns")).toBe("returns");
    expect(distributionView("nope")).toBe("handout");
    expect(distributionView(null)).toBe("handout");
    expect(handOutHref("b-1")).toBe("/kits?view=handout&batch=b-1");
  });

  it("adds codes once, in reading order, telling which were already there", () => {
    const first = addCodes([], ["A", "B", "A"]);
    expect(first).toEqual({ list: ["A", "B"], added: ["A", "B"], repeated: ["A"] });
    expect(addCodes(first.list, ["B", "C"])).toEqual({ list: ["A", "B", "C"], added: ["C"], repeated: ["B"] });
  });

  it("words every per-code reason, and every reseller blocker, in EN/PT/ES", () => {
    const keys = [
      ...HAND_OUT_BLOCKERS.map((r) => HAND_OUT_REASON_KEYS[r]),
      ...TAKE_BACK_BLOCKERS.map((r) => TAKE_BACK_REASON_KEYS[r]),
      ...RECEIVE_BLOCKERS.map((r) => RECEIVE_BLOCKER_KEYS[r]),
      ...SELL_BLOCKERS.map((r) => SELL_BLOCKER_KEYS[r]),
    ];
    for (const lang of ["en", "pt", "es"] as const) {
      const dict = adminTagsFlowMessages[lang] as Record<string, string>;
      for (const key of keys) expect(dict[key], `${lang}.${key}`).toBeTruthy();
    }
  });

  it("says why a code can't go, and the set-up case asks to remove the customer", () => {
    expect(reasonKey("handOut", null)).toBeNull();
    expect(en[reasonKey("handOut", "set_up")!]).toMatch(/remove the customer/i);
    expect(en[reasonKey("takeBack", "set_up")!]).toMatch(/remove the customer/i);
    expect(en[reasonKey("takeBack", "sold")!]).toMatch(/sold/i);
    expect(en[reasonKey("takeBack", "not_with_reseller")!]).toMatch(/not with a reseller/i);
    expect(en[reasonKey("handOut", "with_reseller")!]).toContain("{name}");
    expect(reasonKey("handOut", "something_new")).toBe("reasonUnknown");
  });
});
