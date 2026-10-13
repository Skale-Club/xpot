import { Router, type Request, type Response, type NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db.js";
import { storage } from "../../storage.js";
import { salesTasks, type SalesRep } from "#shared/schema.js";
import { accessDenial } from "./middleware.js";
import { createTask, TaskServiceError, updateTask } from "../../tasks/service.js";

// Server-to-server inbound API for Xphere to push prospect records in for field
// visits. Each tenant (user) has its own inbound key, so the Bearer token both
// authenticates AND identifies which user the prospects belong to. Leads created
// here are owned by that tenant's rep.
export function createInboundRouter() {
  const router = Router();

  async function requireInboundKey(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const integration = await storage.getXphereIntegrationByInboundKey(token);
    if (!integration || !integration.isEnabled) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const rep = await storage.getSalesRepByUserId(integration.userId);
    // Same rule as a signed-in rep: blocked or still pending means no access (accessDenial).
    if (!rep || accessDenial(rep)) {
      return res.status(403).json({ error: "Tenant has no active rep profile" });
    }
    (req as any).xphereTenant = { integration, rep };
    next();
  }

  // POST /inbound/prospects
  // Body: { leads: [{ xphereId, xphereKind, name, email?, phone?, address? }] }
  router.post("/inbound/prospects", requireInboundKey, async (req: Request, res: Response) => {
    const { rep } = (req as any).xphereTenant as { rep: { id: number } };
    const leads = Array.isArray(req.body?.leads) ? req.body.leads : [];
    if (leads.length === 0) {
      return res.status(400).json({ error: "leads must be a non-empty array" });
    }

    let sent = 0;
    let skipped = 0;
    for (const l of leads) {
      const name = typeof l?.name === "string" && l.name.trim() ? l.name.trim() : null;
      const xphereId = typeof l?.xphereId === "string" ? l.xphereId : null;
      if (!name || !xphereId) continue;
      const xphereKind = l?.xphereKind === "account" ? "account" : "contact";

      const xphereRef = `${xphereKind}:${xphereId}`;

      try {
        // DAT-02: a retry from Xphere used to create a second copy of the same
        // prospect, and `sent` reported it as a success either way.
        const existing = await storage.getSalesLeadByXphereRef(xphereRef);
        if (existing) {
          skipped += 1;
          continue;
        }

        const lead = await storage.createSalesLead({
          name,
          email: typeof l?.email === "string" ? l.email : null,
          phone: typeof l?.phone === "string" ? l.phone : null,
          source: "xphere",
          status: "prospect",
          ownerRepId: rep.id,
          xphereRef,
        } as Parameters<typeof storage.createSalesLead>[0]);

        const address =
          typeof l?.address === "string" && l.address.trim() ? l.address.trim() : null;
        if (address) {
          await storage.createSalesLeadLocation({
            leadId: lead.id,
            label: "Main",
            addressLine1: address,
            isPrimary: true,
          } as Parameters<typeof storage.createSalesLeadLocation>[0]);
        }

        sent += 1;
      } catch (err) {
        console.error("[xpot inbound] create lead failed:", err);
      }
    }

    res.json({ sent, skipped });
  });

  const inboundTaskSchema = z.object({
    externalId: z.string().trim().min(1).max(200),
    xpotTaskId: z.number().int().positive().nullable().optional(),
    operation: z.enum(["upsert", "delete"]).default("upsert"),
    occurredAt: z.string().datetime(),
    task: z.object({
      title: z.string().trim().min(1).max(240),
      description: z.string().max(5000).nullable().optional(),
      dueAt: z.string().datetime().nullable().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
      status: z.enum(["todo", "in_progress", "done", "cancelled"]),
      entityType: z.enum(["contact", "account", "opportunity"]).nullable().optional(),
      entityId: z.string().nullable().optional(),
    }),
  });

  // POST /inbound/tasks — Xphere's durable outbox delivers every task mutation
  // here. The external id is stable, retries are idempotent, and a task that
  // originally came from Xpot carries xpotTaskId so it updates its source row.
  router.post("/inbound/tasks", requireInboundKey, async (req: Request, res: Response) => {
    try {
      const input = inboundTaskSchema.parse(req.body);
      const { rep, integration } = (req as any).xphereTenant as {
        rep: SalesRep;
        integration: { userId: string };
      };
      const actor = {
        rep,
        user: { userId: integration.userId, email: rep.email ?? null, firstName: null, lastName: null, isAdmin: false },
      };
      const occurredAt = new Date(input.occurredAt);
      let existing = input.xpotTaskId ? await storage.getSalesTask(input.xpotTaskId) : undefined;
      if (!existing) {
        [existing] = await db.select().from(salesTasks).where(and(
          eq(salesTasks.xphereTaskId, input.externalId),
          eq(salesTasks.repId, rep.id),
        )).limit(1);
      }
      if (existing?.xphereUpdatedAt && new Date(existing.xphereUpdatedAt) >= occurredAt) {
        return res.json({ ok: true, action: "stale", taskId: existing.id });
      }
      if (!existing && input.operation === "delete") {
        return res.json({ ok: true, action: "ignored", taskId: null });
      }

      let leadId: number | undefined;
      if (input.task.entityId && (input.task.entityType === "contact" || input.task.entityType === "account")) {
        leadId = (await storage.getSalesLeadByXphereRef(`${input.task.entityType}:${input.task.entityId}`))?.id;
      }
      const status = input.operation === "delete" ? "cancelled" : ({
        todo: "pending",
        in_progress: "in_progress",
        done: "completed",
        cancelled: "cancelled",
      } as const)[input.task.status];

      let task;
      if (existing) {
        task = await updateTask(actor, existing.id, {
          title: input.task.title,
          description: input.task.description ?? null,
          dueAt: input.task.dueAt ? new Date(input.task.dueAt) : null,
          priority: input.task.priority,
          status,
          ...(leadId ? { leadId } : {}),
        }, { skipXphereSync: true });
        await storage.updateSalesTask(task.id, { xphereTaskId: input.externalId, xphereUpdatedAt: occurredAt });
      } else {
        task = await createTask({
          actor,
          source: "integration",
          skipXphereSync: true,
          input: {
            title: input.task.title,
            description: input.task.description ?? null,
            dueAt: input.task.dueAt ? new Date(input.task.dueAt) : null,
            priority: input.task.priority,
            type: "follow_up",
            leadId,
            idempotencyKey: `xphere-task:${input.externalId}`,
          },
        });
        if (status !== "pending") task = await updateTask(actor, task.id, { status }, { skipXphereSync: true });
        await storage.updateSalesTask(task.id, { xphereTaskId: input.externalId, xphereUpdatedAt: occurredAt });
      }
      await storage.createSalesSyncEvent({
        provider: "xphere",
        entityType: "sales_task",
        entityId: String(task.id),
        direction: "inbound",
        status: "synced",
        payload: { xphereTaskId: input.externalId, operation: input.operation },
        lastAttemptAt: new Date(),
      });
      res.json({ ok: true, action: existing ? "updated" : "created", taskId: task.id });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid task payload", details: error.flatten() });
      if (error instanceof TaskServiceError) return res.status(error.status).json({ error: error.message });
      console.error("[xpot inbound] task sync failed:", error);
      res.status(500).json({ error: "Task sync failed" });
    }
  });

  return router;
}
