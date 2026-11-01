import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repModules } from "#shared/modules.js";
import { localDateIn, prospectingJobCreateSchema } from "#shared/prospecting.js";
import { storage } from "../../storage.js";
import { accessDenial } from "../../routes/xpot/middleware.js";
import {
  createProspectingJobForRep,
  latestProspectingJobDetails,
  prospectingJobDetails,
  ProspectingServiceError,
} from "../../prospecting/service.js";
import type { McpCaller } from "../server.js";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const failure = (message: string) => ({ isError: true as const, content: [{ type: "text" as const, text: message }] });

function nicheForSector(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

async function repForCaller(caller: McpCaller) {
  if (!caller.userId) throw new ProspectingServiceError("This MCP token is not linked to an Xpot user.", 403);
  const rep = await storage.getSalesRepByUserId(caller.userId);
  if (!rep) throw new ProspectingServiceError("The MCP user has no Xpot representative profile.", 403);
  const denial = accessDenial(rep);
  if (denial) throw new ProspectingServiceError(denial.message, 403);
  if (!repModules(rep).includes("visits") && rep.role !== "admin") {
    throw new ProspectingServiceError("Visits are not enabled for this Xpot account.", 403);
  }
  return rep;
}

function compactDetails(details: NonNullable<Awaited<ReturnType<typeof prospectingJobDetails>>>) {
  return {
    job: details.job,
    runs: details.runs,
    summary: details.summary,
    engine: details.engine,
    candidates: details.candidates.slice(0, 50),
    candidatesTruncated: details.candidates.length > 50,
  };
}

/**
 * The rep's "today". An MCP client has no browser clock, so it names the day
 * or the zone; without either, the deployment's zone decides (Xpot's reps work
 * in the US Eastern time zone unless PROSPECTING_DEFAULT_TIME_ZONE says otherwise).
 */
export function mcpRouteDate(input: { routeDate?: string; timeZone?: string }, now = new Date()) {
  if (input.routeDate) return input.routeDate;
  const zone = input.timeZone || process.env.PROSPECTING_DEFAULT_TIME_ZONE?.trim() || "America/New_York";
  const date = localDateIn(zone, now);
  if (!date) throw new ProspectingServiceError(`Unknown time zone: ${zone}.`, 400);
  return date;
}

function errorMessage(error: unknown) {
  if (error instanceof ProspectingServiceError) return error.message;
  if (error instanceof z.ZodError) {
    return `Invalid input: ${error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`;
  }
  return "Internal error";
}

export function registerProspectingTools(server: McpServer, caller: McpCaller) {
  async function run(tool: string, body: () => Promise<unknown>) {
    const started = Date.now();
    try {
      const result = await body();
      console.log(`[mcp] ${tool} caller=${caller.label} ok ${Date.now() - started}ms`);
      return text(result);
    } catch (error) {
      const message = errorMessage(error);
      console.log(`[mcp] ${tool} caller=${caller.label} error "${message}" ${Date.now() - started}ms`);
      if (!(error instanceof ProspectingServiceError) && !(error instanceof z.ZodError)) {
        console.error(`[mcp] ${tool} failed:`, error);
      }
      return failure(message);
    }
  }

  server.tool(
    "prospecting_create_today",
    "Start one cold-prospecting discovery job in the Xpot account that authorized this MCP connection. `location` is the city/territory, `sectors` contains 1-5 business types, and `shiftHours` is 2, 4, 6, 8, 10, or 12 (default 8). Xpot removes conflicts and may expand into a nearby area if the city is too small. The route is for the rep's today: pass `routeDate` (YYYY-MM-DD) or the rep's IANA `timeZone`; without either, today in America/New_York (or PROSPECTING_DEFAULT_TIME_ZONE). The same daily rules as the app apply: one active route, one search at a time, up to 3 routes a day. Returns the persisted job and physical engine runs. Use an idempotencyKey when retrying the same request.",
    {
      location: z.string().trim().min(2).max(500),
      sectors: z.array(z.string().trim().min(2).max(120)).min(1).max(5),
      shiftHours: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]).default(8),
      idempotencyKey: z.string().trim().min(8).max(200).optional(),
      routeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      timeZone: z.string().trim().min(1).max(64).optional(),
    },
    async ({ location, sectors, shiftHours, idempotencyKey, routeDate, timeZone }) => run("prospecting_create_today", async () => {
      const rep = await repForCaller(caller);
      const searches = sectors.map((query) => ({ query, niche: nicheForSector(query) }));
      const input = prospectingJobCreateSchema.parse({
        location,
        searches,
        shiftDurationMinutes: shiftHours * 60,
        idempotencyKey,
        routeDate: mcpRouteDate({ routeDate, timeZone }),
      });
      const result = await createProspectingJobForRep(rep.id, input);
      if (!result.details) throw new ProspectingServiceError("The prospecting job could not be loaded after creation.", 500);
      return { ...compactDetails(result.details), reused: result.reused };
    }),
  );

  server.tool(
    "prospecting_job_get",
    "Read a prospecting job from the Xpot account that authorized this MCP connection. Omit jobId for the newest job. Returns search progress, eligible/excluded totals and up to 50 ranked candidates.",
    { jobId: z.number().int().positive().optional() },
    async ({ jobId }) => run("prospecting_job_get", async () => {
      const rep = await repForCaller(caller);
      const details = jobId
        ? await prospectingJobDetails(jobId, rep.id)
        : await latestProspectingJobDetails(rep.id);
      if (!details) throw new ProspectingServiceError("Prospecting job not found.", 404);
      return compactDetails(details);
    }),
  );
}
