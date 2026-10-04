// Schema behaviour of the Journey admin API (the MCP tools reuse these
// schemas). No database needed.
import { test } from "vitest";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";

const TAG = "11111111-1111-4111-8111-111111111111";

async function load() {
  return import("../../server/tags/journeyRoutes.js");
}

test("a journey entry needs a known kind and a title; action is normalised snake_case", async () => {
  const { journeyEntryCreateSchema } = await load();
  const body = journeyEntryCreateSchema.parse({
    kind: "execution",
    action: " Printed ",
    title: "  Plate printed  ",
    tagId: TAG,
    metadata: { file: "REV-2026-001 Google Cards Small PLA 001-002-003-004.3mf", minutes: 163.8 },
  });
  assert.equal(body.action, "printed");
  assert.equal(body.title, "Plate printed");
  assert.equal(journeyEntryCreateSchema.safeParse({ kind: "milestone", title: "x" }).success, false);
  assert.equal(journeyEntryCreateSchema.safeParse({ kind: "insight", title: "  " }).success, false);
  assert.equal(journeyEntryCreateSchema.safeParse({ kind: "execution", title: "x", action: "print plate" }).success, false);
  assert.equal(journeyEntryCreateSchema.safeParse({ kind: "insight", title: "x", unknown: 1 }).success, false);
});

test("an entry can point at a kit, a reseller and a lead (integer ids)", async () => {
  const { journeyEntryCreateSchema } = await load();
  const ok = journeyEntryCreateSchema.parse({ kind: "observation", title: "x", kitId: TAG, repId: 4, leadId: 12 });
  assert.equal(ok.repId, 4);
  assert.equal(ok.leadId, 12);
  assert.equal(journeyEntryCreateSchema.safeParse({ kind: "observation", title: "x", repId: "4" }).success, false);
  assert.equal(journeyEntryCreateSchema.safeParse({ kind: "observation", title: "x", leadId: 0 }).success, false);
  assert.equal(journeyEntryCreateSchema.safeParse({ kind: "observation", title: "x", kitId: "not-a-uuid" }).success, false);
});

test("occurredAt may be in the past (recorded afterwards) but not in the future", async () => {
  const { journeyEntryCreateSchema } = await load();
  const past = journeyEntryCreateSchema.parse({ kind: "execution", title: "x", occurredAt: "2026-10-03T13:38:35Z" });
  assert.equal(past.occurredAt?.toISOString(), "2026-10-03T13:38:35.000Z");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(journeyEntryCreateSchema.safeParse({ kind: "execution", title: "x", occurredAt: tomorrow }).success, false);
  assert.equal(journeyEntryCreateSchema.safeParse({ kind: "execution", title: "x", occurredAt: "yesterday" }).success, false);
});

test("a proposed entry waits for review", async () => {
  const { journeyEntryCreateSchema, toEntryInput } = await load();
  assert.equal(toEntryInput(journeyEntryCreateSchema.parse({ kind: "insight", title: "x", proposed: true })).status, "needs_review");
  assert.equal(toEntryInput(journeyEntryCreateSchema.parse({ kind: "insight", title: "x" })).status, "active");
  assert.ok(!("proposed" in toEntryInput(journeyEntryCreateSchema.parse({ kind: "insight", title: "x", proposed: false }))));
});

test("the review patch only moves the status", async () => {
  const { journeyEntryPatchSchema } = await load();
  assert.equal(journeyEntryPatchSchema.safeParse({ status: "archived" }).success, true);
  assert.equal(journeyEntryPatchSchema.safeParse({ status: "deleted" }).success, false);
  assert.equal(journeyEntryPatchSchema.safeParse({ status: "active", title: "rewritten" }).success, false);
});

test("journey query flags and ids arrive as query strings", async () => {
  const { journeyQuerySchema } = await load();
  const q = journeyQuerySchema.parse({
    includeArchived: "1",
    limit: "20",
    before: "2026-10-03T00:00:00Z",
    repId: "7",
    leadId: "12",
    kitId: TAG,
  });
  assert.equal(q.includeArchived, true);
  assert.equal(q.limit, 20);
  assert.equal(q.before?.toISOString(), "2026-10-03T00:00:00.000Z");
  assert.equal(q.repId, 7);
  assert.equal(q.leadId, 12);
  assert.equal(journeyQuerySchema.parse({ includeArchived: "0" }).includeArchived, false);
  assert.equal(journeyQuerySchema.safeParse({ repId: "abc" }).success, false);
  assert.equal(journeyQuerySchema.safeParse({ limit: "501" }).success, false);
});

test("plans: known kind and status, due date as YYYY-MM-DD", async () => {
  const { planCreateSchema, planPatchSchema, planQuerySchema } = await load();
  const plan = planCreateSchema.parse({ kind: "experiment", title: "Bigger plaque", dueDate: "2026-10-10" });
  assert.equal(plan.dueDate, "2026-10-10");
  assert.equal(planCreateSchema.safeParse({ kind: "idea", title: "x" }).success, false);
  assert.equal(planCreateSchema.safeParse({ kind: "task", title: "x", dueDate: "10/10/2026" }).success, false);
  assert.equal(planPatchSchema.safeParse({ status: "validated", outcome: "Fits with 0.15 per side" }).success, true);
  assert.equal(planPatchSchema.safeParse({ status: "approved" }).success, false);
  assert.equal(planPatchSchema.parse({ dueDate: "" }).dueDate, null);
  assert.equal(planQuerySchema.parse({ status: "open", leadId: "3" }).leadId, 3);
  assert.equal(planQuerySchema.safeParse({ status: "weird" }).success, false);
});
