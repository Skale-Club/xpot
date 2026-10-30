import { describe, expect, it } from "vitest";
import {
  bedPosition,
  canMarkPrinted,
  nextPrintBatchCode,
  planPrintJobTransition,
  printModelInputSchema,
  printVersionInputSchema,
} from "../../shared/printProduction";

describe("print batch codes", () => {
  it("takes the number after the highest one used this year, and ignores other prefixes and years", () => {
    expect(nextPrintBatchCode("LPLATE", 2026, [])).toBe("LPLATE-2026-001");
    expect(nextPrintBatchCode("LPLATE", 2026, ["LPLATE-2026-001", "LPLATE-2026-006", "LPLATE-2026-004"])).toBe("LPLATE-2026-007");
    expect(nextPrintBatchCode("LPLATE", 2027, ["LPLATE-2026-006"])).toBe("LPLATE-2027-001");
    expect(nextPrintBatchCode("REV", 2026, ["REVX-2026-009", "REV-2026-002"])).toBe("REV-2026-003");
  });
});

describe("print order state machine", () => {
  it("allows the production path and refuses jumps", () => {
    expect(planPrintJobTransition("requested", "claim")).toEqual({ ok: true, status: "building" });
    expect(planPrintJobTransition("building", "complete")).toEqual({ ok: true, status: "ready" });
    expect(planPrintJobTransition("ready", "start")).toEqual({ ok: true, status: "printing" });
    expect(planPrintJobTransition("printing", "printed")).toEqual({ ok: true, status: "printed" });
    expect(planPrintJobTransition("ready", "printed")).toEqual({ ok: true, status: "printed" });
    expect(planPrintJobTransition("building", "release")).toEqual({ ok: true, status: "requested" });
    expect(planPrintJobTransition("requested", "printed")).toEqual({ ok: true, status: "printed" });
    expect(planPrintJobTransition("building", "printed")).toMatchObject({ ok: false, code: "print_job_state" });
    expect(planPrintJobTransition("printed", "cancel")).toMatchObject({ ok: false, error: "A printed print order cannot be cancelled" });
    expect(planPrintJobTransition("printing", "cancel").ok).toBe(false);
    expect(planPrintJobTransition("failed", "fail").ok).toBe(false);
  });

  it("lets a plate printed by hand without a file be marked printed, but not one a bench is building", () => {
    expect(["requested", "building", "ready", "printing", "printed", "failed", "cancelled"].filter(canMarkPrinted))
      .toEqual(["requested", "ready", "printing"]);
  });
});

describe("print schemas", () => {
  const bed = { label: "x4", copies: 4, positions: ["front-left", "front-right", "back-left", "back-right"] };

  it("wants one position per copy and distinct bed labels", () => {
    expect(printVersionInputSchema.safeParse({ beds: [bed] }).success).toBe(true);
    expect(printVersionInputSchema.safeParse({ beds: [{ ...bed, positions: ["front-left"] }] }).success).toBe(false);
    expect(printVersionInputSchema.safeParse({ beds: [bed, { ...bed, label: "X4" }] }).success).toBe(false);
    expect(printVersionInputSchema.safeParse({ beds: [] }).success).toBe(false);
  });

  it("takes one bed slot per copy, each an offset in mm and an optional turn", () => {
    const slots = [{ offset: [-72.5, -53.5] }, { offset: [72.5, -53.5], rotation: 90 }, { offset: [-72.5, 53.5] }, { offset: [72.5, 53.5] }];
    expect(printVersionInputSchema.safeParse({ beds: [{ ...bed, slots }] }).success).toBe(true);
    expect(printVersionInputSchema.safeParse({ beds: [{ ...bed, slots: slots.slice(1) }] }).success).toBe(false);
    expect(printVersionInputSchema.safeParse({ beds: [{ ...bed, slots: [{ offset: [0] }, ...slots.slice(1)] }] }).success).toBe(false);
  });

  it("asks a serialized model for its product, sales product and prefix, and not a part", () => {
    expect(printModelInputSchema.safeParse({ slug: "base-large", kind: "part", title: "Base" }).success).toBe(true);
    expect(printModelInputSchema.safeParse({ slug: "plate", kind: "serialized", title: "Plate" }).success).toBe(false);
    const ok = printModelInputSchema.parse({
      slug: "Plate-Large-Menu", kind: "serialized", title: "Plate", productType: "large_plate", salesProductId: 9, batchPrefix: "lplate",
    });
    expect(ok).toMatchObject({ slug: "plate-large-menu", batchPrefix: "LPLATE" });
    expect(printModelInputSchema.safeParse({ slug: "has spaces", kind: "part", title: "X" }).success).toBe(false);
  });
});

describe("bed positions", () => {
  it("repeats the bed's positions for every plate of an order", () => {
    const bed = { copies: 4, positions: ["front-left", "front-right", "back-left", "back-right"] };
    expect(bedPosition(bed, 1)).toBe("front-left");
    expect(bedPosition(bed, 4)).toBe("back-right");
    expect(bedPosition(bed, 6)).toBe("front-right");
    expect(bedPosition({ copies: 4 }, 2)).toBeNull();
    expect(bedPosition(bed, null)).toBeNull();
  });
});
