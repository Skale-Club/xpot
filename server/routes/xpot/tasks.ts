import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep } from "./middleware.js";
import { syncTaskToGhl } from "./helpers.js";
import { xpotTaskCreateSchema, xpotTaskUpdateSchema } from "#shared/xpot.js";

export function createTasksRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/tasks", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const status = typeof req.query.status === "string"
      ? z.enum(["pending", "completed", "cancelled"]).parse(req.query.status)
      : undefined;
    const tasks = await storage.listSalesTasks({
      repId: actor!.user.isAdmin && req.query.all === "true" ? undefined : actor!.rep.id,
      status,
    });
    res.json(tasks);
  });

  router.post("/tasks", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const input = xpotTaskCreateSchema.parse(req.body);
    const task = await storage.createSalesTask({
      ...input,
      repId: actor!.rep.id,
      status: "pending",
    });

    const syncResult = await syncTaskToGhl(task.id);
    if (syncResult.synced && syncResult.ghlTaskId) {
      await storage.updateSalesTask(task.id, { ghlTaskId: syncResult.ghlTaskId });
    }

    res.status(201).json(task);
  });

  router.patch("/tasks/:id", async (req, res) => {
    const taskId = Number(req.params.id);
    const input = xpotTaskUpdateSchema.parse(req.body);
    const task = await storage.updateSalesTask(taskId, input);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.json(task);
  });

  return router;
}
