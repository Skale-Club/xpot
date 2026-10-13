import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repModules } from "#shared/modules.js";
import { xpotTaskCreateSchema, xpotTaskPrioritySchema, xpotTaskStatusSchema, xpotTaskTypeSchema } from "#shared/xpot.js";
import { storage } from "../../storage.js";
import { db } from "../../db.js";
import { users } from "#shared/schema.js";
import { eq } from "drizzle-orm";
import { accessDenial } from "../../routes/xpot/middleware.js";
import { createTask, getTask, listTasks, TaskServiceError, updateTask } from "../../tasks/service.js";
import type { McpCaller } from "../server.js";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const failure = (message: string) => ({ isError: true as const, content: [{ type: "text" as const, text: message }] });

async function actorForCaller(caller: McpCaller) {
  if (!caller.userId) throw new TaskServiceError("This MCP token is not linked to an Xpot user.", 403);
  const rep = await storage.getSalesRepByUserId(caller.userId);
  if (!rep) throw new TaskServiceError("The MCP user has no Xpot representative profile.", 403);
  const denial = accessDenial(rep);
  if (denial) throw new TaskServiceError(denial.message, 403);
  if (!repModules(rep).includes("visits") && !["manager", "admin"].includes(rep.role)) {
    throw new TaskServiceError("Visits are not enabled for this Xpot account.", 403);
  }
  const [user] = await db.select().from(users).where(eq(users.id, caller.userId));
  if (!user) throw new TaskServiceError("The MCP user could not be loaded.", 403);
  return {
    rep,
    user: {
      userId: user.id,
      email: user.email ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      isAdmin: Boolean(user.isAdmin),
    },
  };
}

function message(error: unknown) {
  if (error instanceof TaskServiceError) return error.message;
  if (error instanceof z.ZodError) return `Invalid input: ${error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`;
  return "Internal error";
}

export function registerTaskTools(server: McpServer, caller: McpCaller) {
  async function run(tool: string, body: () => Promise<unknown>) {
    const started = Date.now();
    try {
      const result = await body();
      console.log(`[mcp] ${tool} caller=${caller.label} ok ${Date.now() - started}ms`);
      return text(result);
    } catch (error) {
      const detail = message(error);
      console.log(`[mcp] ${tool} caller=${caller.label} error "${detail}" ${Date.now() - started}ms`);
      if (!(error instanceof TaskServiceError) && !(error instanceof z.ZodError)) console.error(`[mcp] ${tool} failed:`, error);
      return failure(detail);
    }
  }

  server.tool(
    "tasks_list",
    "List Xpot tasks visible to the account that authorized this connection. By default returns the caller's tasks. Organization admins can pass all=true for their team's tasks. Status accepts one or more lifecycle states.",
    {
      status: z.array(xpotTaskStatusSchema).max(4).optional(),
      priority: xpotTaskPrioritySchema.optional(),
      leadId: z.number().int().positive().optional(),
      repId: z.number().int().positive().optional(),
      search: z.string().trim().max(200).optional(),
      all: z.boolean().default(false),
      limit: z.number().int().min(1).max(500).default(100),
    },
    async ({ status, ...input }) => run("tasks_list", async () => listTasks(await actorForCaller(caller), { ...input, statuses: status })),
  );

  server.tool(
    "tasks_get",
    "Get one Xpot task by id, including lead, assignee, and opportunity context.",
    { taskId: z.number().int().positive() },
    async ({ taskId }) => run("tasks_get", async () => getTask(await actorForCaller(caller), taskId)),
  );

  server.tool(
    "tasks_create",
    "Create an Xpot task. The task is organization-scoped, records MCP as its source, and is synchronized to configured CRMs. Use idempotencyKey when retrying the same request.",
    {
      title: z.string().trim().min(1).max(240),
      description: z.string().trim().max(5000).nullable().optional(),
      dueAt: z.string().datetime().nullable().optional(),
      type: xpotTaskTypeSchema.default("follow_up"),
      priority: xpotTaskPrioritySchema.default("medium"),
      leadId: z.number().int().positive().nullable().optional(),
      visitId: z.number().int().positive().nullable().optional(),
      opportunityId: z.number().int().positive().nullable().optional(),
      repId: z.number().int().positive().optional(),
      idempotencyKey: z.string().trim().min(8).max(200).optional(),
    },
    async (input) => run("tasks_create", async () => createTask({ actor: await actorForCaller(caller), source: "mcp", input: xpotTaskCreateSchema.parse(input) })),
  );

  server.tool(
    "tasks_update",
    "Edit or reassign an existing Xpot task. Organization authorization is enforced by the shared task service.",
    {
      taskId: z.number().int().positive(),
      title: z.string().trim().min(1).max(240).optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      dueAt: z.string().datetime().nullable().optional(),
      type: xpotTaskTypeSchema.optional(),
      priority: xpotTaskPrioritySchema.optional(),
      leadId: z.number().int().positive().nullable().optional(),
      opportunityId: z.number().int().positive().nullable().optional(),
      repId: z.number().int().positive().optional(),
    },
    async ({ taskId, ...input }) => run("tasks_update", async () => updateTask(await actorForCaller(caller), taskId, {
      ...input,
      dueAt: input.dueAt ? new Date(input.dueAt) : input.dueAt,
    })),
  );

  for (const [name, status, description] of [
    ["tasks_start", "in_progress", "Mark an Xpot task as in progress."],
    ["tasks_complete", "completed", "Complete an Xpot task and record its completion time."],
    ["tasks_reopen", "pending", "Reopen a completed or cancelled Xpot task."],
    ["tasks_cancel", "cancelled", "Cancel an Xpot task and record its cancellation time."],
  ] as const) {
    server.tool(name, description, { taskId: z.number().int().positive() }, async ({ taskId }) =>
      run(name, async () => updateTask(await actorForCaller(caller), taskId, { status })));
  }
}
