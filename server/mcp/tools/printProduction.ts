import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  PRINT_JOB_STATUSES,
  PRINT_MODEL_KINDS,
  printJobCreateSchema,
  printModelInputSchema,
  printModelPatchSchema,
  printVersionInputSchema,
} from "#shared/printProduction.js";
import { TAG_PRODUCT_TYPES } from "#shared/tags.js";
import { TAG_FACES } from "#shared/tagFace.js";
import { TagError } from "../../tags/errors.js";
import * as production from "../../tags/production.js";
import type { McpCaller } from "../server.js";

// Tags › Production for an AI session (docs/PRINT_EXECUTION_PLAN.md §8): the catalog of what the house prints, the
// versions of each recipe, and the print queue. The same service and zod schemas as the admin API. A design session
// registers a model's first version here (and a fix as the next version, with its changelog); files go up through
// the bench (`bench.py attach`), never through MCP.

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

const BED_DOC = "beds: [{ label (\"x4\"), copies, positions? (one per copy, as seen facing the printer: front-left, …), minutes?, swaps?, grams? ({\"White PLA\": 99.7}), ams? ([{slot, colour}]), pause? ({z, text}) }]";
const VERSION_DOC = `{ builder? (print-pipeline builder id: plate.menu, plate.google, plate.instagram, plate.venmo, stand.google, stand.instagram; omit for a part), params? (what the builder takes: size, theme, pocket depth, font…), recipe? (slicer settings over the builder's base recipe: wall_loops, top_shell_layers…), ${BED_DOC}, consumes? ([{part: slug, perPiece}]), changelog (required from v2: what changed and why), fixesBatch? (batch code whose problem this fixes) }`;

export function registerPrintProductionTools(server: McpServer, caller: McpCaller) {
  async function run(tool: string, body: () => Promise<unknown>) {
    const started = Date.now();
    try {
      const result = await body();
      console.log(`[mcp] ${tool} caller=${caller.label} ok ${Date.now() - started}ms`);
      return text(result);
    } catch (err) {
      const message = errorMessage(err);
      console.log(`[mcp] ${tool} caller=${caller.label} error "${message}" ${Date.now() - started}ms`);
      if (!(err instanceof TagError) && !(err instanceof z.ZodError)) console.error(`[mcp] ${tool} failed:`, err);
      return failure(message);
    }
  }

  server.tool(
    "print_models_list",
    "The print catalog (Tags › Production): every model with its kind (serialized = pieces with Xpot codes; part = a base or token with no code), status (design_needed = in the catalog, not drawn yet; ready; retired), current version (builder, params, recipe, beds), stock on hand and open orders.",
    {},
    async () => run("print_models_list", () => production.listModels()),
  );

  server.tool(
    "print_model_get",
    "One print model by slug or uuid, with every version (newest first, with changelog and how many orders used it) and, for a part, the count's movements.",
    { model: z.string().min(1) },
    async ({ model }) => run("print_model_get", () => production.getModel(model)),
  );

  server.tool(
    "print_model_create",
    `Add a model to the print catalog. \`model\`: { slug (lowercase-with-dashes, e.g. plate-large-menu-white), kind (${PRINT_MODEL_KINDS.join("|")}), title, description?, productType (${TAG_PRODUCT_TYPES.join("|")}; serialized only), face (${TAG_FACES.join("|")}; serialized only), theme? (white, black, mixed…), salesProductId (serialized), batchPrefix (serialized: LPLATE, SPLATE, REV, IG…), sortOrder?, version? (its v1: ${VERSION_DOC}) }. Without a version the model is design_needed and cannot be printed yet.`,
    { model: objectParam },
    async ({ model }) => run("print_model_create", () => production.createModel(printModelInputSchema.parse(model), null, "mcp")),
  );

  server.tool(
    "print_model_update",
    "Patch a print model: title, description, theme, face, salesProductId, batchPrefix, sortOrder, retired (true retires it; false brings it back). The recipe never changes here: a recipe change is a new version (print_model_version_create).",
    { model: z.string().min(1), patch: objectParam },
    async ({ model, patch }) => run("print_model_update", () => production.updateModel(model, printModelPatchSchema.parse(patch))),
  );

  server.tool(
    "print_model_version_create",
    `Register a model's next version and make it current (the previous one is superseded, still linked to what it printed). \`version\`: ${VERSION_DOC}. The model becomes ready. Record a version only once its design builds and its sample checks pass.`,
    { model: z.string().min(1), version: objectParam },
    async ({ model, version }) =>
      run("print_model_version_create", () => production.createVersion(model, printVersionInputSchema.parse(version), null, "mcp")),
  );

  server.tool(
    "print_jobs_list",
    `The print queue. status: open (requested|building|ready|printing, the default), done (printed|failed|cancelled), all, or one of ${PRINT_JOB_STATUSES.join("|")}; model? (slug) to narrow it.`,
    { status: z.enum(["open", "done", "all", ...PRINT_JOB_STATUSES]).optional(), model: z.string().min(1).optional() },
    async ({ status, model }) => run("print_jobs_list", () => production.listJobs(status ?? "open", model ?? null)),
  );

  server.tool(
    "print_job_get",
    "One print order: model, version, bed (AMS, pause, positions), batch and its pieces with bed positions and codes, files (each with a signed download url valid ~5 minutes, when storage is configured) and the build report.",
    { job: z.string().uuid() },
    async ({ job }) =>
      run("print_job_get", async () => {
        const detail = await production.getJob(job);
        const files = await Promise.all(detail.files.map(async (file) => {
          try {
            return { ...file, url: await production.signedFileUrl((await production.getJobFile(file.id)).fileRef) };
          } catch {
            return { ...file, url: null };
          }
        }));
        return { ...detail, files };
      }),
  );

  server.tool(
    "print_job_create",
    "Order a print of a model's current version. `order`: { model (slug or uuid), bed? (label; default the first), plates? (how many times the bed is printed, default 1), notes?, existingBatch? (batch code: link a batch made before the catalog instead of issuing codes; the order follows what the batch went through) }. A serialized order issues its batch (fresh codes, pieces pending until each printed QR is scanned in) in the same step; a part order is ready at once when its bed has a fixed file.",
    { order: objectParam },
    async ({ order }) => run("print_job_create", () => production.createJob(printJobCreateSchema.parse(order), null, "mcp")),
  );

  server.tool(
    "print_job_update",
    "Move a print order: start (ready → printing), printed (ready|printing → printed: the batch's journey records `printed`, a part's count goes up), fail (with reason), cancel, release (a building order whose bench died goes back to requested), complete (a requested/building order with its file attached becomes ready), redo (a failed/cancelled order is printed again: same version and bed, same batch while none of its pieces was received). Only `printed` after the user confirmed the print came off the bed.",
    { job: z.string().uuid(), action: z.enum(["start", "printed", "fail", "cancel", "release", "complete", "redo"]), reason: z.string().max(500).optional() },
    async ({ job, action, reason }) =>
      run("print_job_update", () =>
        action === "redo" ? production.redoJob(job, null) : production.transitionJob(job, { action, reason: reason ?? null, userId: null, source: "mcp" })),
  );
}
