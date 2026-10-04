import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  JOURNEY_ENTRY_KINDS,
  JOURNEY_ENTRY_STATUSES,
  JOURNEY_PRODUCTION_ACTIONS,
  PLAN_KINDS,
  PLAN_STATUSES,
} from "#shared/tagJourney.js";
import { TagError } from "../../tags/errors.js";
import * as journey from "../../tags/journey.js";
import {
  journeyEntryCreateSchema,
  journeyEntryPatchSchema,
  journeyQuerySchema,
  planCreateSchema,
  planPatchSchema,
  planQuerySchema,
  toEntryInput,
} from "../../tags/journeyRoutes.js";
import * as repo from "../../tags/repository.js";
import { tagBaseUrl } from "../../tags/routes.js";
import type { McpCaller } from "../server.js";

// Tags Journey tools for an AI session. Everything goes through the same
// journey / repository functions and zod schemas as the admin API; entries
// are written with source "mcp" (actor: ai) and no user (the token is logged
// instead). The site records its own mutations by itself: these tools are for
// what happens outside it, and for decisions, plans and learnings.

// Some MCP clients serialize object parameters as JSON strings. Accept either.
const objectParam = z.preprocess((v) => {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}, z.record(z.unknown()));

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const failure = (message: string) => ({ isError: true as const, content: [{ type: "text" as const, text: message }] });

function errorMessage(err: unknown): string {
  if (err instanceof TagError) return err.message;
  if (err instanceof z.ZodError) {
    return `Invalid input: ${err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`;
  }
  return "Internal error";
}

export function registerTagJourneyTools(server: McpServer, caller: McpCaller) {
  const ctx = journey.journeyContext(null, "mcp");

  /** Runs a tool body, logs the call with the token prefix, turns errors into isError results. */
  async function run(tool: string, body: () => Promise<unknown>) {
    const started = Date.now();
    try {
      const result = await body();
      console.log(`[mcp] ${tool} token=${caller.tokenPrefix} ok ${Date.now() - started}ms`);
      return text(result);
    } catch (err) {
      const message = errorMessage(err);
      console.log(`[mcp] ${tool} token=${caller.tokenPrefix} error "${message}" ${Date.now() - started}ms`);
      if (!(err instanceof TagError) && !(err instanceof z.ZodError)) console.error(`[mcp] ${tool} failed:`, err);
      return failure(message);
    }
  }

  /** `batch` (uuid or batch code) and `tag` (uuid or public code) become batchId / tagId. */
  async function withScopeRefs(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { batch, tag, ...rest } = input;
    if (typeof batch === "string" && batch.trim()) rest.batchId = await journey.resolveBatchId(batch);
    if (typeof tag === "string" && tag.trim()) rest.tagId = await journey.resolveTagId(tag);
    return rest;
  }

  const planScope = "`batch` (uuid or batch code, e.g. REV-2026-001), `tag` (uuid or public code), `kitId` and/or `leadId` (customer)";
  const scope = `${planScope} and/or \`repId\` (reseller)`;

  server.tool(
    "tags_journey_get",
    `The story of the Tags: the journey timeline (executions with before → after, decisions, insights, observations, risks, results) and the plans. Scope with ${scope}; a tag's story includes its batch's batch-wide entries and the kit deliveries that listed its code. Optional: kind (${JOURNEY_ENTRY_KINDS.join("|")}), planId, includeArchived, limit (1-500), planStatus (open|closed|all|<status>, default all), order (asc = oldest first, the default, to read it as a story; desc = newest first). Reseller-scoped (repId) reads return entries only.`,
    { filters: objectParam.optional() },
    async ({ filters }) =>
      run("tags_journey_get", async () => {
        const { order, planStatus, ...rest } = (filters ?? {}) as Record<string, unknown>;
        const query = journeyQuerySchema.parse(await withScopeRefs(rest));
        const status = planQuerySchema.shape.status.parse(planStatus);
        const result = await journey.getJourney({ ...query, planStatus: status ?? "all" });
        if (order !== "desc") result.entries.reverse();
        return result;
      }),
  );

  server.tool(
    "tags_journey_record",
    `Record a journey entry. \`entry\`: { kind (${JOURNEY_ENTRY_KINDS.join("|")}), title, content?, action? (snake_case; production steps: ${JOURNEY_PRODUCTION_ACTIONS.join(", ")}), batch? | tag? | kitId? | leadId?, planId?, beforeValue?, afterValue?, metadata? (files, slice numbers, checks), occurredAt? (ISO, when it happened if earlier than now), proposed? (true: waits for admin review) }. The site already records its own mutations (batch created, kit delivered, assigned, activated, destination changed, NFC verified, field-app activity); use this for what happens outside it (art, slicing, printing, assembly, tests) and for decisions and learnings.`,
    { entry: objectParam },
    async ({ entry }) =>
      run("tags_journey_record", async () => {
        const body = journeyEntryCreateSchema.parse(await withScopeRefs(entry));
        return journey.createJourneyEntry(toEntryInput(body), ctx);
      }),
  );

  server.tool(
    "tags_journey_review",
    `Change a journey entry's review status: ${JOURNEY_ENTRY_STATUSES.join(", ")} (active = approve a proposed entry; superseded = it was wrong, record the correction as a new entry). Entries are otherwise immutable.`,
    { entryId: z.string().uuid(), status: z.enum(JOURNEY_ENTRY_STATUSES) },
    async ({ entryId, status }) =>
      run("tags_journey_review", () =>
        journey.setJourneyEntryStatus(entryId, journeyEntryPatchSchema.parse({ status }).status)),
  );

  server.tool(
    "tags_plans_list",
    `List plans. Optional filters: status (open = draft|active|paused, the default; closed; all; or one of ${PLAN_STATUSES.join("|")}), ${planScope}, limit.`,
    { filters: objectParam.optional() },
    async ({ filters }) =>
      run("tags_plans_list", async () =>
        journey.listPlans(planQuerySchema.parse(await withScopeRefs(filters ?? {})))),
  );

  server.tool(
    "tags_plan_create",
    `Create a plan. \`plan\`: { kind (${PLAN_KINDS.join("|")}), title, description?, batch? | tag? | kitId? | leadId?, status? (default active), dueDate? (YYYY-MM-DD), metadata? }. Written to the journey as a decision.`,
    { plan: objectParam },
    async ({ plan }) =>
      run("tags_plan_create", async () =>
        journey.createPlan(planCreateSchema.parse(await withScopeRefs(plan)), ctx)),
  );

  server.tool(
    "tags_plan_update",
    `Patch a plan: title, description, status (${PLAN_STATUSES.join("|")}), outcome (what closing it showed), dueDate, metadata. A status change is written to the journey (validated / invalidated / done as a result, with the outcome).`,
    { planId: z.string().uuid(), patch: objectParam },
    async ({ planId, patch }) =>
      run("tags_plan_update", () => journey.updatePlan(planId, planPatchSchema.parse(patch), ctx)),
  );

  // Read-only helpers: find what a session wants to document.
  server.tool(
    "tags_batches_list",
    "List the production batches (id, batchCode, name, productType, vendor, quantity, status, and counts: pieces, at the house, with resellers, active, NFC verified). Use the batchCode or id as `batch` in the journey tools.",
    {},
    async () => run("tags_batches_list", () => repo.listBatches()),
  );

  server.tool(
    "tags_get",
    "Read one tag by uuid or printed public code: status, destination, batch, kit, reseller, customer, QR/NFC URLs and its destination history.",
    { tag: z.string().min(1) },
    async ({ tag }) =>
      run("tags_get", async () => {
        const id = await journey.resolveTagId(tag);
        const detail = await repo.getTagDetail(id, tagBaseUrl());
        if (!detail) throw new TagError("Tag not found", 404);
        return detail;
      }),
  );
}
