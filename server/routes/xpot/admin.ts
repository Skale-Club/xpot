import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { storage } from "../../storage.js";
import { requireSuperAdmin, requireXpotManager } from "./middleware.js";
import {
  AccountError,
  approveRep,
  approveSchema,
  blockRep,
  blockSchema,
  changeRepPhone,
  createResellerAccount,
  listRepsWithAccess,
  phoneChangeSchema,
  resellerAccountSchema,
  unblockRep,
  type Actor,
} from "./resellerAccounts.js";
import { AccountDeletionError, deleteRepAccount } from "../../accountDeletion.js";

export function createAdminRouter() {
  const router = Router();
  // Only the /admin paths: this router is mounted at /api/xpot, so a bare router.use would guard
  // every route mounted after it (sales, consignments, products...) and lock plain reps out.
  router.use("/admin", requireXpotManager);

  const genInboundKey = () => `xpot_${randomBytes(24).toString("base64url")}`;

  router.get("/admin/overview", async (_req, res) => {
    const [reps, leads, visits, opportunities, tasks, syncEvents] = await Promise.all([
      storage.listSalesReps(),
      storage.listSalesLeads(),
      storage.listSalesVisits(),
      storage.listSalesOpportunities(),
      storage.listSalesTasks(),
      storage.listSalesSyncEvents(),
    ]);
    const latestSyncByEntity = new Map<string, (typeof syncEvents)[number]>();
    for (const event of syncEvents) {
      const key = `${event.entityType}:${event.entityId}`;
      if (!latestSyncByEntity.has(key)) {
        latestSyncByEntity.set(key, event);
      }
    }

    res.json({
      reps,
      metrics: {
        activeReps: reps.filter((rep) => rep.isActive).length,
        leads: leads.length,
        visitsInProgress: visits.filter((visit) => visit.status === "in_progress").length,
        completedVisits: visits.filter((visit) => visit.status === "completed").length,
        openOpportunities: opportunities.filter((item) => item.status === "open").length,
        pipelineValue: opportunities.filter((item) => item.status === "open").reduce((sum, item) => sum + (item.value || 0), 0),
        pendingTasks: tasks.filter((item) => item.status === "pending").length,
        syncIssues: Array.from(latestSyncByEntity.values()).filter((item) => item.status !== "synced").length,
      },
      latestSyncEvents: syncEvents.slice(0, 10),
    });
  });

  router.get("/admin/reps", async (_req, res) => {
    res.json(await listRepsWithAccess());
  });

  const actorOf = (req: any): Actor => ({ userId: req.xpotActor.user.userId, isAdmin: !!req.xpotActor.user.isAdmin });
  const repIdOf = (req: any): number | null => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };
  const accountRoute = (handler: (req: any) => Promise<unknown>, status = 200) => async (req: any, res: any) => {
    try {
      res.status(status).json(await handler(req));
    } catch (err) {
      if (err instanceof AccountError || err instanceof AccountDeletionError) return res.status(err.status).json({ message: err.message });
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message ?? "Invalid input" });
      console.error(`[${req.method} ${req.path}]`, err);
      res.status(500).json({ message: "Something went wrong" });
    }
  };
  const withRep = (fn: (repId: number, req: any) => Promise<unknown>) =>
    accountRoute(async (req) => {
      const repId = repIdOf(req);
      if (!repId) throw new AccountError("Invalid rep id", 400);
      return fn(repId, req);
    });

  // Edit an existing rep's profile, role, team and modules. Access (approve,
  // block) has its own routes below, so this never turns anyone on or off.
  router.post("/admin/reps", accountRoute(async (req) => {
    const input = z.object({
      userId: z.string().min(1),
      displayName: z.string().min(1),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      team: z.string().optional().nullable(),
      role: z.enum(["rep", "manager", "admin"]).default("rep"),
      vcardId: z.number().int().positive().optional().nullable(),
      ghlUserId: z.string().optional().nullable(),
      modules: z.array(z.enum(["visits", "tags"])).min(1).optional(),
    }).parse(req.body);
    const actor = actorOf(req);
    const existing = await storage.getSalesRepByUserId(input.userId);
    if (!existing) throw new AccountError("Rep not found", 404);
    if (!actor.isAdmin && (input.role !== "rep" || existing.role !== "rep")) {
      throw new AccountError("Only an admin can change a manager's or admin's role.", 403);
    }
    return storage.upsertSalesRep({ ...input, isActive: existing.isActive });
  }));

  // Create someone's access directly (active; they sign in with a code sent to this phone).
  router.post("/admin/reps/accounts", accountRoute((req) => createResellerAccount(resellerAccountSchema.parse(req.body), actorOf(req)), 201));
  router.post("/admin/reps/:id/approve", withRep((id, req) => approveRep(id, approveSchema.parse(req.body ?? {}).modules, actorOf(req))));
  router.post("/admin/reps/:id/block", withRep((id, req) => blockRep(id, blockSchema.parse(req.body ?? {}).reason, actorOf(req))));
  router.post("/admin/reps/:id/unblock", withRep((id, req) => unblockRep(id, actorOf(req))));
  router.post("/admin/reps/:id/phone", withRep((id, req) => changeRepPhone(id, phoneChangeSchema.parse(req.body), actorOf(req))));
  // Delete the account and its data on the person's request (server/accountDeletion.ts).
  // The global admin only; the body must say { "confirm": "DELETE" } so a stray call can't do it.
  router.delete("/admin/reps/:id", requireSuperAdmin, withRep((id, req) => {
    z.object({ confirm: z.literal("DELETE", { errorMap: () => ({ message: 'Send { "confirm": "DELETE" } to delete this account.' }) }) }).parse(req.body ?? {});
    return deleteRepAccount(id, actorOf(req));
  }));

  router.get("/admin/sync-events", async (_req, res) => {
    res.json(await storage.listSalesSyncEvents());
  });

  router.get("/admin/recent-visits", async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(25, Math.max(1, Number(req.query.pageSize) || 5));
    const repId = req.query.repId ? Number(req.query.repId) : undefined;
    if (repId !== undefined && (!Number.isInteger(repId) || repId <= 0)) {
      return res.status(400).json({ message: "repId must be a positive integer" });
    }
    const offset = (page - 1) * pageSize;
    const result = await storage.listRecentSalesVisits(pageSize, offset, { repId });
    res.json({ ...result, page, pageSize });
  });

  // ── App settings (DAT-03) ──
  // updateSalesAppSettings existed in storage with no route calling it, so the
  // geofence radius, the GPS requirement and manual override could only be
  // changed by SQL. Manager-level, like the rest of this router.

  router.get("/admin/settings", async (_req, res) => {
    res.json(await storage.getSalesAppSettings());
  });

  router.put("/admin/settings", async (req, res) => {
    const input = z.object({
      checkInRequiresGps: z.boolean().optional(),
      defaultGeofenceRadiusMeters: z.number().int().min(10).max(5000).optional(),
      allowManualOverride: z.boolean().optional(),
    }).parse(req.body);
    res.json(await storage.updateSalesAppSettings(input));
  });

  // ── Xphere per-user config, managed by the global admin across all reps ──
  router.use("/admin/xphere", requireSuperAdmin);

  router.get("/admin/xphere", async (_req, res) => {
    const [reps, configs] = await Promise.all([
      storage.listSalesReps(),
      storage.listXphereIntegrations(),
    ]);
    const byUser = new Map(configs.map((c) => [c.userId, c]));
    const items = reps.map((rep) => {
      const cfg = rep.userId ? byUser.get(rep.userId) : undefined;
      return {
        userId: rep.userId,
        repId: rep.id,
        displayName: rep.displayName,
        email: rep.email,
        inboundApiKey: cfg?.inboundApiKey ?? null,
        apiUrl: cfg?.apiUrl ?? "https://xphere.app",
        apiKeySet: Boolean(cfg?.apiKey),
        isEnabled: Boolean(cfg?.isEnabled),
      };
    });
    res.json(items);
  });

  router.put("/admin/xphere/:userId", async (req, res) => {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ message: "userId required" });

    const input = z
      .object({
        apiKey: z.string().trim().nullable().optional(),
        apiUrl: z.string().url().nullable().optional(),
        isEnabled: z.boolean().optional(),
      })
      .parse(req.body);

    const existing = await storage.getXphereIntegrationByUserId(userId);
    const data: Record<string, unknown> = {};
    if (input.apiKey !== undefined) data.apiKey = input.apiKey || null;
    if (input.apiUrl !== undefined) data.apiUrl = input.apiUrl || "https://xphere.app";
    if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
    if (!existing?.inboundApiKey) data.inboundApiKey = genInboundKey();

    const saved = await storage.upsertXphereIntegration(userId, data);
    res.json({
      userId,
      inboundApiKey: saved.inboundApiKey ?? null,
      apiUrl: saved.apiUrl ?? "https://xphere.app",
      apiKeySet: Boolean(saved.apiKey),
      isEnabled: Boolean(saved.isEnabled),
    });
  });

  return router;
}
