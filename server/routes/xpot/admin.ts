import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { storage } from "../../storage.js";
import { requireXpotManager } from "./middleware.js";

/** Platform admin: the only authority that may grant or change roles. */
function isPlatformAdmin(actor: { user: { isAdmin: boolean }; rep: { role: string } }): boolean {
  return actor.user.isAdmin || actor.rep.role === "admin";
}

export function createAdminRouter() {
  const router = Router();
  router.use(requireXpotManager);

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
    res.json(await storage.listSalesReps());
  });

  // SEG-07: this called upsertSalesRep, which for an existing userId overwrites
  // EVERY column — role and isActive included. Any manager could promote
  // themselves to admin, or deactivate another rep, in one call. Creating and
  // changing a rep are now separate operations with separate authority.
  router.post("/admin/reps", async (req, res) => {
    const actor = (req as any).xpotActor as { user: { isAdmin: boolean }; rep: { role: string } };
    const input = z.object({
      userId: z.string().min(1),
      displayName: z.string().min(1),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      team: z.string().optional().nullable(),
      role: z.enum(["rep", "manager", "admin"]).default("rep"),
      vcardId: z.number().int().positive().optional().nullable(),
      ghlUserId: z.string().optional().nullable(),
      isActive: z.boolean().default(true),
    }).parse(req.body);

    const existing = await storage.getSalesRepByUserId(input.userId);
    if (existing) {
      return res.status(409).json({ message: "This user already has a rep profile. Use PATCH /admin/reps/:id." });
    }
    if (input.role !== "rep" && !isPlatformAdmin(actor)) {
      return res.status(403).json({ message: "Only an admin can create a manager or admin." });
    }

    const rep = await storage.upsertSalesRep(input);
    res.status(201).json(rep);
  });

  // PATCH /admin/reps/:id — activate/deactivate and edit a profile.
  // Role changes are admin-only; nobody can change their own role or lock
  // themselves out (which would leave the panel with no way back in).
  router.patch("/admin/reps/:id", async (req, res) => {
    const actor = (req as any).xpotActor as { user: { isAdmin: boolean }; rep: { id: number; role: string } };
    const repId = Number(req.params.id);
    if (!Number.isFinite(repId) || repId <= 0) {
      return res.status(400).json({ message: "Invalid rep id" });
    }

    const input = z.object({
      displayName: z.string().min(1).max(120).optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().max(30).nullable().optional(),
      team: z.string().max(60).nullable().optional(),
      role: z.enum(["rep", "manager", "admin"]).optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const target = await storage.getSalesRep(repId);
    if (!target) return res.status(404).json({ message: "Rep not found" });

    if (input.role !== undefined && input.role !== target.role) {
      if (!isPlatformAdmin(actor)) {
        return res.status(403).json({ message: "Only an admin can change a rep's role." });
      }
      if (target.id === actor.rep.id) {
        return res.status(400).json({ message: "You cannot change your own role." });
      }
    }
    if (input.isActive === false && target.id === actor.rep.id) {
      return res.status(400).json({ message: "You cannot deactivate yourself." });
    }

    const rep = await storage.updateSalesRepFields(repId, input);
    res.json(rep);
  });

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

  // ── Xphere per-user config, managed by the admin across all reps ──

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
