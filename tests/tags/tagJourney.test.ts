import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JOURNEY_ACTION_PATTERN,
  JOURNEY_ENTRY_KINDS,
  JOURNEY_ENTRY_STATUSES,
  JOURNEY_PRODUCT_LABELS,
  JOURNEY_PRODUCTION_ACTIONS,
  JOURNEY_SOURCES,
  JOURNEY_SYSTEM_ACTIONS,
  PLAN_KINDS,
  PLAN_STATUSES,
  actorForSource,
  isClosedPlanStatus,
  planStatusEntry,
  tagActionEntry,
} from "../../shared/tagJourney.js";
import { TAG_PRODUCT_TYPES } from "../../shared/tags.js";

test("every known action fits the action pattern the database enforces", () => {
  for (const action of [...JOURNEY_SYSTEM_ACTIONS, ...JOURNEY_PRODUCTION_ACTIONS]) {
    assert.match(action, JOURNEY_ACTION_PATTERN, action);
  }
  assert.doesNotMatch("Printed", JOURNEY_ACTION_PATTERN);
  assert.doesNotMatch("print plate", JOURNEY_ACTION_PATTERN);
  assert.doesNotMatch("1printed", JOURNEY_ACTION_PATTERN);
  assert.doesNotMatch("a".repeat(41), JOURNEY_ACTION_PATTERN);
});

test("the migration's CHECK constraints list exactly the shared values", () => {
  const migration = readFileSync(new URL("../../migrations/0014_tag_journey.sql", import.meta.url), "utf8");
  const quoted = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");
  assert.ok(migration.includes(`kind IN (${quoted(PLAN_KINDS)})`), "plan kinds");
  assert.ok(migration.includes(`status IN (${quoted(PLAN_STATUSES)})`), "plan statuses");
  assert.ok(migration.includes(`kind IN (${quoted(JOURNEY_ENTRY_KINDS)})`), "entry kinds");
  assert.ok(migration.includes(`status IN (${quoted(JOURNEY_ENTRY_STATUSES)})`), "entry statuses");
  assert.ok(migration.includes(`source IN (${quoted(JOURNEY_SOURCES)})`), "sources");
  assert.ok(migration.includes("actor IN ('human', 'ai', 'system')"), "actors");
  assert.ok(migration.includes(`'^[a-z][a-z0-9_]{0,39}$'`), "action pattern");
  assert.equal(JOURNEY_ACTION_PATTERN.source, "^[a-z][a-z0-9_]{0,39}$");
});

test("the append-only trigger guards every content column and leaves status and the foreign keys free", () => {
  const migration = readFileSync(new URL("../../migrations/0014_tag_journey.sql", import.meta.url), "utf8");
  const trigger = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION"), migration.indexOf("DROP TRIGGER"));
  for (const column of ["kind", "action", "title", "content", "before_value", "after_value", "source", "actor", "actor_user_id", "metadata", "occurred_at", "created_at"]) {
    assert.ok(trigger.includes(`NEW.${column} IS DISTINCT FROM OLD.${column}`), column);
  }
  // ON DELETE SET NULL must keep working, and review must stay possible.
  for (const column of ["status", "batch_id", "tag_id", "kit_id", "rep_id", "lead_id", "plan_id", "actor_rep_id"]) {
    assert.ok(!trigger.includes(`NEW.${column} `), column);
  }
});

test("the actor follows the source", () => {
  assert.equal(actorForSource("admin"), "human");
  assert.equal(actorForSource("field"), "human");
  assert.equal(actorForSource("mcp"), "ai");
  assert.equal(actorForSource("system"), "system");
});

test("every product type has a label for the titles the server writes", () => {
  for (const type of TAG_PRODUCT_TYPES) assert.ok(JOURNEY_PRODUCT_LABELS[type], type);
});

test("tag actions become past-tense executions with before and after", () => {
  assert.deepEqual(tagActionEntry("activate", "Z8MEZP0X", "assigned", "active"), {
    action: "tag_activated",
    title: "Tag Z8MEZP0X activated",
    before: "assigned",
    after: "active",
  });
  const assigned = tagActionEntry("assign", "7414WRMT", "inventory", "assigned", "to Padaria Central");
  assert.equal(assigned.action, "tag_assigned");
  assert.equal(assigned.title, "Tag 7414WRMT assigned to Padaria Central");
  for (const action of ["assign", "unassign", "activate", "disable", "retire", "restore"]) {
    assert.ok((JOURNEY_SYSTEM_ACTIONS as readonly string[]).includes(tagActionEntry(action, "X", "a", "b").action), action);
  }
});

test("closing a plan is a result, other status changes are decisions", () => {
  const plan = { title: "Bigger plaque, option A (80 × 110 card)", kind: "experiment" };
  assert.deepEqual(planStatusEntry(plan, "validated"), {
    kind: "result",
    action: "plan_status_changed",
    title: "Experiment validated: Bigger plaque, option A (80 × 110 card)",
  });
  assert.equal(planStatusEntry(plan, "invalidated").kind, "result");
  assert.equal(planStatusEntry(plan, "done").kind, "result");
  assert.equal(planStatusEntry(plan, "paused").kind, "decision");
  assert.equal(planStatusEntry(plan, "cancelled").kind, "decision");
  assert.ok(planStatusEntry({ title: "x".repeat(300), kind: "task" }, "done").title.length <= 200);
});

test("open plans are draft, active and paused", () => {
  assert.equal(isClosedPlanStatus("draft"), false);
  assert.equal(isClosedPlanStatus("active"), false);
  assert.equal(isClosedPlanStatus("paused"), false);
  for (const s of ["validated", "invalidated", "done", "cancelled"]) assert.equal(isClosedPlanStatus(s), true, s);
});
