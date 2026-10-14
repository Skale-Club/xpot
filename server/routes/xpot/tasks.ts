import { Router } from "express";
import { z } from "zod";
import { requireXpotUser, type XpotActor } from "./middleware.js";
import { createTask, getTask, listTasks, TaskServiceError, updateTask } from "../../tasks/service.js";
import { xpotTaskCreateSchema, xpotTaskPrioritySchema, xpotTaskStatusSchema, xpotTaskUpdateSchema } from "#shared/xpot.js";

function id(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new TaskServiceError("Invalid task id");
  return parsed;
}

function answerError(res: any, error: unknown) {
  if (error instanceof TaskServiceError) return res.status(error.status).json({ message: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid task input", errors: error.flatten() });
  throw error;
}

export function createTasksRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/tasks", async (req, res) => {
    try {
      const actor = (req as any).xpotActor as XpotActor;
      const statuses = typeof req.query.status === "string"
        ? req.query.status.split(",").filter(Boolean).map((value) => xpotTaskStatusSchema.parse(value))
        : undefined;
      const repId = typeof req.query.repId === "string" ? Number(req.query.repId) : undefined;
      const leadId = typeof req.query.leadId === "string" ? Number(req.query.leadId) : undefined;
      const priority = typeof req.query.priority === "string" ? xpotTaskPrioritySchema.parse(req.query.priority) : undefined;
      res.json(await listTasks(actor, {
        statuses,
        repId: repId && Number.isInteger(repId) ? repId : undefined,
        leadId: leadId && Number.isInteger(leadId) ? leadId : undefined,
        priority,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        all: req.query.all === "true",
        limit: typeof req.query.limit === "string" && /^\d+$/.test(req.query.limit) ? Number(req.query.limit) : undefined,
        offset: typeof req.query.offset === "string" && /^\d+$/.test(req.query.offset) ? Number(req.query.offset) : undefined,
      }));
    } catch (error) {
      answerError(res, error);
    }
  });

  router.get("/tasks/:id", async (req, res) => {
    try {
      res.json(await getTask((req as any).xpotActor, id(req.params.id)));
    } catch (error) {
      answerError(res, error);
    }
  });

  router.post("/tasks", async (req, res) => {
    try {
      const task = await createTask({ actor: (req as any).xpotActor, source: "manual", input: xpotTaskCreateSchema.parse(req.body) });
      res.status(201).json(task);
    } catch (error) {
      answerError(res, error);
    }
  });

  router.patch("/tasks/:id", async (req, res) => {
    try {
      res.json(await updateTask((req as any).xpotActor, id(req.params.id), xpotTaskUpdateSchema.parse(req.body)));
    } catch (error) {
      answerError(res, error);
    }
  });

  for (const [action, status] of [["start", "in_progress"], ["complete", "completed"], ["reopen", "pending"], ["cancel", "cancelled"]] as const) {
    router.post(`/tasks/:id/${action}`, async (req, res) => {
      try {
        res.json(await updateTask((req as any).xpotActor, id(req.params.id), { status }));
      } catch (error) {
        answerError(res, error);
      }
    });
  }

  return router;
}
