import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  JOURNEY_ACTION_PATTERN,
  JOURNEY_ENTRY_KINDS,
  JOURNEY_ENTRY_STATUSES,
  JOURNEY_MAX_FUTURE_MS,
  PLAN_KINDS,
  PLAN_STATUSES,
} from "#shared/tagJourney.js";
import { actorOf, requireTagAdmin } from "./access.js";
import { TagError } from "./errors.js";
import * as journey from "./journey.js";

// Tags Journey admin API: /api/xpot/admin/tag-journey* (the timeline) and
// /api/xpot/admin/tag-plans* (plans). Admins only (requireTagAdmin): neither
// resellers nor reseller managers read the journey. The MCP tools reuse the
// schemas below.

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v), z.string().max(max).nullable().optional());

const optionalUuid = z.string().uuid().nullable().optional();
const optionalInt = z.number().int().positive().nullable().optional();

const occurredAtField = z
  .string()
  .datetime({ offset: true })
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    const date = new Date(value);
    if (date.getTime() > Date.now() + JOURNEY_MAX_FUTURE_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "occurredAt cannot be in the future", path: ["occurredAt"] });
      return z.NEVER;
    }
    return date;
  });

export const journeyEntryCreateSchema = z.object({
  kind: z.enum(JOURNEY_ENTRY_KINDS),
  action: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || null : v),
    z.string().regex(JOURNEY_ACTION_PATTERN, "action: a short snake_case word, e.g. printed").nullable().optional(),
  ),
  title: z.string().trim().min(1, "Title is required").max(200),
  content: optionalText(4000),
  batchId: optionalUuid,
  tagId: optionalUuid,
  kitId: optionalUuid,
  /** The reseller the entry is about. */
  repId: optionalInt,
  leadId: optionalInt,
  planId: optionalUuid,
  beforeValue: optionalText(500),
  afterValue: optionalText(500),
  /** true: the entry waits for an admin's review (needs_review). */
  proposed: z.boolean().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  occurredAt: occurredAtField,
}).strict();

export const journeyEntryPatchSchema = z.object({
  status: z.enum(JOURNEY_ENTRY_STATUSES),
}).strict();

export const journeyQuerySchema = z.object({
  batchId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  kitId: z.string().uuid().optional(),
  repId: z.coerce.number().int().positive().optional(),
  leadId: z.coerce.number().int().positive().optional(),
  planId: z.string().uuid().optional(),
  kind: z.enum(JOURNEY_ENTRY_KINDS).optional(),
  includeArchived: z.preprocess((v) => v === true || v === "1" || v === "true", z.boolean()).optional(),
  before: z.string().datetime({ offset: true }).optional().transform((v) => (v ? new Date(v) : undefined)),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const dueDateField = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() || null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate: YYYY-MM-DD").nullable().optional(),
);

export const planCreateSchema = z.object({
  kind: z.enum(PLAN_KINDS),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalText(4000),
  batchId: optionalUuid,
  tagId: optionalUuid,
  kitId: optionalUuid,
  leadId: optionalInt,
  status: z.enum(PLAN_STATUSES).optional(),
  dueDate: dueDateField,
  metadata: z.record(z.unknown()).nullable().optional(),
}).strict();

export const planPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: optionalText(4000),
  status: z.enum(PLAN_STATUSES).optional(),
  outcome: optionalText(4000),
  dueDate: dueDateField,
  metadata: z.record(z.unknown()).nullable().optional(),
}).strict();

export const planQuerySchema = z.object({
  status: z.enum(["open", "closed", "all", ...PLAN_STATUSES]).optional(),
  batchId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  kitId: z.string().uuid().optional(),
  leadId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** The repository input for a parsed create body. */
export function toEntryInput(body: z.infer<typeof journeyEntryCreateSchema>): journey.JourneyEntryInput {
  const { proposed, ...rest } = body;
  return { ...rest, status: proposed ? "needs_review" : "active" };
}

function userIdOf(req: Request): string | null {
  return (req.session as { userId?: string } | undefined)?.userId ?? null;
}

/** The admin writing from the panel: their user and their rep row (for the name on the entry). */
function adminContext(req: Request): journey.JourneyContext {
  return journey.journeyContext(userIdOf(req), "admin", actorOf(req).repId);
}

function fail(res: Response, err: unknown, fallback: string) {
  if (err instanceof TagError) return res.status(err.status).json({ message: err.message });
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: err.issues[0]?.message ?? "Validation error", errors: err.errors });
  }
  console.error(`[tags] ${fallback}:`, err);
  return res.status(500).json({ message: fallback });
}

function idParam(req: Request, res: Response): string | null {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) {
    res.status(404).json({ message: "Not found" });
    return null;
  }
  return parsed.data;
}

export function registerJourneyRoutes(app: Express) {
  const entries = "/api/xpot/admin/tag-journey";
  const plans = "/api/xpot/admin/tag-plans";

  // Timeline (newest first) plus the plans of the same scope.
  app.get(entries, requireTagAdmin, async (req, res) => {
    try {
      res.json(await journey.getJourney(journeyQuerySchema.parse(req.query)));
    } catch (err) {
      fail(res, err, "Failed to load journey");
    }
  });

  app.post(entries, requireTagAdmin, async (req, res) => {
    try {
      const input = toEntryInput(journeyEntryCreateSchema.parse(req.body));
      res.status(201).json(await journey.createJourneyEntry(input, adminContext(req)));
    } catch (err) {
      fail(res, err, "Failed to record journey entry");
    }
  });

  // Review only: approve a proposed entry, archive it, or mark it superseded.
  app.patch(`${entries}/:id`, requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json(await journey.setJourneyEntryStatus(id, journeyEntryPatchSchema.parse(req.body).status));
    } catch (err) {
      fail(res, err, "Failed to update journey entry");
    }
  });

  app.get(plans, requireTagAdmin, async (req, res) => {
    try {
      res.json(await journey.listPlans(planQuerySchema.parse(req.query)));
    } catch (err) {
      fail(res, err, "Failed to load plans");
    }
  });

  app.post(plans, requireTagAdmin, async (req, res) => {
    try {
      res.status(201).json(await journey.createPlan(planCreateSchema.parse(req.body), adminContext(req)));
    } catch (err) {
      fail(res, err, "Failed to create plan");
    }
  });

  app.patch(`${plans}/:id`, requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json(await journey.updatePlan(id, planPatchSchema.parse(req.body), adminContext(req)));
    } catch (err) {
      fail(res, err, "Failed to update plan");
    }
  });
}
