import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import {
  PRINT_FILE_KINDS,
  PRINT_FILE_MAX_BYTES,
  PRINT_JOB_STATUSES,
  printJobCreateSchema,
  printJobUpdateSchema,
  printModelInputSchema,
  printModelPatchSchema,
  printPartAdjustSchema,
  printVersionInputSchema,
  type PrintFileKind,
} from "#shared/printProduction.js";
import { requireTagAdmin } from "./access.js";
import { TagError } from "./errors.js";
import * as production from "./production.js";

// Tags › Production HTTP API (docs/PRINT_EXECUTION_PLAN.md). Two audiences:
//   /api/xpot/admin/print-*        — the global admin (catalog, versions, queue, files)
//   /api/provisioner/print-jobs/*  — a paired bench app (device token with the 'print' capability)
// File uploads are the raw bytes (application/octet-stream) with ?kind=&filename=, up to 64 MB; downloads redirect to
// a short-lived signed URL. Registered from routes.ts, which owns the device middleware.

type Fail = (res: Response, err: unknown, fallback: string) => unknown;

const userIdOf = (req: Request) => (req.session as { userId?: string } | undefined)?.userId ?? null;

const rawFile = express.raw({ type: "application/octet-stream", limit: PRINT_FILE_MAX_BYTES });

const uploadQuery = z.object({
  kind: z.enum(PRINT_FILE_KINDS).optional(),
  filename: z.string().trim().min(1).max(200),
}).strict();

function uploadBody(req: Request): Uint8Array {
  if (!Buffer.isBuffer(req.body)) throw new TagError("Send the file as application/octet-stream", 415, "print_file_type");
  return new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength);
}

/** The bench side: only a device paired with the 'print' capability. */
function requirePrintDevice(req: Request, res: Response, next: NextFunction) {
  const caps = req.provisionerDevice?.capabilities ?? [];
  if (!caps.includes("print")) return res.status(403).json({ message: "This app is not paired as a print bench" });
  next();
}

const jobListQuery = z.object({
  status: z.enum(["open", "done", "all", ...PRINT_JOB_STATUSES]).default("open"),
  model: z.string().trim().min(1).max(80).optional(),
}).strict();

const claimSchema = z.object({ jobId: z.string().uuid().nullable().optional() }).strict();

const benchEventSchema = z.object({
  type: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  detail: z.record(z.unknown()).nullable().optional(),
}).strict();

const benchCompleteSchema = z.object({
  outcome: z.enum(["ready", "failed"]),
  report: z.record(z.unknown()).nullable().optional(),
  errorCode: z.string().max(60).nullable().optional(),
  errorMessage: z.string().max(1000).nullable().optional(),
}).strict();

function uuidParam(value: string | undefined, res: Response): string | null {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    res.status(404).json({ message: "Not found" });
    return null;
  }
  return parsed.data;
}

async function redirectToSigned(res: Response, ref: string) {
  const url = await production.signedFileUrl(ref);
  res.set("Cache-Control", "no-store");
  res.redirect(302, url);
}

export function registerProductionRoutes(app: Express, deps: { device: readonly RequestHandler[]; fail: Fail }) {
  const { fail } = deps;
  const models = "/api/xpot/admin/print-models";
  const jobs = "/api/xpot/admin/print-jobs";

  // ─── Catalog ────────────────────────────────────────────────────────────────

  app.get(models, requireTagAdmin, async (_req, res) => {
    try {
      res.json(await production.listModels());
    } catch (err) {
      fail(res, err, "Failed to load the print catalog");
    }
  });

  app.post(models, requireTagAdmin, async (req, res) => {
    try {
      res.status(201).json(await production.createModel(printModelInputSchema.parse(req.body), userIdOf(req), "admin"));
    } catch (err) {
      fail(res, err, "Failed to save the print model");
    }
  });

  app.get(`${models}/:ref`, requireTagAdmin, async (req, res) => {
    try {
      res.json(await production.getModel(req.params.ref));
    } catch (err) {
      fail(res, err, "Failed to load the print model");
    }
  });

  app.patch(`${models}/:ref`, requireTagAdmin, async (req, res) => {
    try {
      res.json(await production.updateModel(req.params.ref, printModelPatchSchema.parse(req.body)));
    } catch (err) {
      fail(res, err, "Failed to save the print model");
    }
  });

  app.post(`${models}/:ref/versions`, requireTagAdmin, async (req, res) => {
    try {
      res.status(201).json(await production.createVersion(req.params.ref, printVersionInputSchema.parse(req.body), userIdOf(req), "admin"));
    } catch (err) {
      fail(res, err, "Failed to save the version");
    }
  });

  // A part's fixed print file, on one bed of a version that has not printed yet.
  app.post(`${models}/:ref/versions/:versionId/beds/:label/file`, requireTagAdmin, rawFile, async (req, res) => {
    const versionId = uuidParam(req.params.versionId, res);
    if (!versionId) return;
    try {
      const { filename } = uploadQuery.parse(req.query);
      res.status(201).json(await production.attachBedFile(req.params.ref, versionId, req.params.label, filename, uploadBody(req), userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to upload the print file");
    }
  });

  app.get(`${models}/:ref/versions/:versionId/beds/:label/file`, requireTagAdmin, async (req, res) => {
    const versionId = uuidParam(req.params.versionId, res);
    if (!versionId) return;
    try {
      await redirectToSigned(res, await production.bedFileRef(req.params.ref, versionId, req.params.label));
    } catch (err) {
      fail(res, err, "Failed to open the print file");
    }
  });

  app.post(`${models}/:ref/part-count`, requireTagAdmin, async (req, res) => {
    try {
      const { delta, reason, note } = printPartAdjustSchema.parse(req.body);
      res.json(await production.adjustPart(req.params.ref, delta, reason, note ?? null, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to change the count");
    }
  });

  // ─── Queue ──────────────────────────────────────────────────────────────────

  app.get(jobs, requireTagAdmin, async (req, res) => {
    try {
      const { status, model } = jobListQuery.parse(req.query);
      res.json(await production.listJobs(status, model ?? null));
    } catch (err) {
      fail(res, err, "Failed to load the print queue");
    }
  });

  app.post(jobs, requireTagAdmin, async (req, res) => {
    try {
      res.status(201).json(await production.createJob(printJobCreateSchema.parse(req.body), userIdOf(req), "admin"));
    } catch (err) {
      fail(res, err, "Failed to create the print order");
    }
  });

  app.get(`${jobs}/:id`, requireTagAdmin, async (req, res) => {
    const id = uuidParam(req.params.id, res);
    if (!id) return;
    try {
      res.json(await production.getJob(id));
    } catch (err) {
      fail(res, err, "Failed to load the print order");
    }
  });

  app.post(`${jobs}/:id/transition`, requireTagAdmin, async (req, res) => {
    const id = uuidParam(req.params.id, res);
    if (!id) return;
    try {
      const { action, reason } = printJobUpdateSchema.parse(req.body);
      res.json(await production.transitionJob(id, { action, reason: reason ?? null, userId: userIdOf(req), source: "admin" }));
    } catch (err) {
      fail(res, err, "Failed to update the print order");
    }
  });

  app.post(`${jobs}/:id/redo`, requireTagAdmin, async (req, res) => {
    const id = uuidParam(req.params.id, res);
    if (!id) return;
    try {
      res.status(201).json(await production.redoJob(id, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to print the order again");
    }
  });

  app.post(`${jobs}/:id/files`, requireTagAdmin, rawFile, async (req, res) => {
    const id = uuidParam(req.params.id, res);
    if (!id) return;
    try {
      const { kind, filename } = uploadQuery.parse(req.query);
      const resolved: PrintFileKind = kind ?? production.fileKindFor(filename);
      res.status(201).json(await production.attachJobFile(id, resolved, filename, uploadBody(req)));
    } catch (err) {
      fail(res, err, "Failed to upload the print file");
    }
  });

  app.get("/api/xpot/admin/print-files/:id", requireTagAdmin, async (req, res) => {
    const id = uuidParam(req.params.id, res);
    if (!id) return;
    try {
      await redirectToSigned(res, (await production.getJobFile(id)).fileRef);
    } catch (err) {
      fail(res, err, "Failed to open the print file");
    }
  });

  // ─── The bench (device token, 'print' capability) ───────────────────────────

  const bench = [...deps.device, requirePrintDevice] as const;
  const deviceId = (req: Request) => req.provisionerDevice!.id;

  // The given order (`bench.py attach`) or the oldest buildable one; 204 when there is nothing to do.
  app.post("/api/provisioner/print-jobs/claim", ...bench, async (req, res) => {
    try {
      const { jobId } = claimSchema.parse(req.body ?? {});
      const ticket = await production.claimJob(deviceId(req), jobId ?? null);
      if (!ticket) return res.status(204).end();
      res.json(ticket);
    } catch (err) {
      fail(res, err, "Failed to claim the print order");
    }
  });

  app.post("/api/provisioner/print-jobs/:id/events", ...bench, async (req, res) => {
    const id = uuidParam(req.params.id, res);
    if (!id) return;
    try {
      const { type, detail } = benchEventSchema.parse(req.body);
      await production.recordBenchEvent(deviceId(req), id, type, detail ?? null);
      res.json({ ok: true });
    } catch (err) {
      fail(res, err, "Failed to record the event");
    }
  });

  app.post("/api/provisioner/print-jobs/:id/files", ...bench, rawFile, async (req, res) => {
    const id = uuidParam(req.params.id, res);
    if (!id) return;
    try {
      const { kind, filename } = uploadQuery.parse(req.query);
      res.status(201).json(await production.attachJobFile(id, kind ?? production.fileKindFor(filename), filename, uploadBody(req), { deviceId: deviceId(req) }));
    } catch (err) {
      fail(res, err, "Failed to upload the print file");
    }
  });

  app.post("/api/provisioner/print-jobs/:id/complete", ...bench, async (req, res) => {
    const id = uuidParam(req.params.id, res);
    if (!id) return;
    try {
      const body = benchCompleteSchema.parse(req.body);
      const job = await production.completeFromBench(deviceId(req), id, body);
      res.json({ id: job.id, status: job.status, errorMessage: job.errorMessage });
    } catch (err) {
      fail(res, err, "Failed to complete the print order");
    }
  });
}
