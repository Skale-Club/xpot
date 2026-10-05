import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  TAG_BATCH_STATUSES,
  TAG_DEFAULT_PUBLIC_BASE_URL,
  TAG_DESTINATION_TYPES,
  TAG_MAX_BATCH_QUANTITY,
  TAG_PRODUCT_TYPES,
  TAG_STATUSES,
  buildManufacturingCsv,
  buildTagUrls,
  normalizeTagCode,
  validateDestinationUrl,
} from "#shared/tags.js";
import { canWorkOnTag } from "#shared/tagAccess.js";
import { TAG_FACES } from "#shared/tagFace.js";
import { DIRECT_WRITE_METHODS, TAGS_APP_PATH } from "#shared/tagApp.js";
import {
  DEVICE_EVENT_TYPES,
  PROVISIONER_PROTOCOL_HEADER,
  PROVISIONER_PROTOCOL_VERSION,
  PROVISIONING_ERROR_CODES,
} from "#shared/tagProvisioning.js";
import type { TagProvisioningDevice } from "#shared/schema.js";
import { storage } from "../storage.js";
import { resolveGoogleApiKey } from "../routes/xpot/google.js";
import { actorOf, requireTagAdmin, requireTagManager, requireTagUser } from "./access.js";
import { registerJourneyRoutes } from "./journeyRoutes.js";
import { createTagRedirectHandler, type PublicTag } from "./publicHandler.js";
import { buildBatchZip, qrPng, qrSvg } from "./qrAssets.js";
import { normalizeIpKey, rateLimit } from "./rateLimit.js";
import * as repo from "./repository.js";
import * as field from "./field.js";
import * as provisioning from "./provisioning.js";
import { getTeamReport } from "./report.js";
import { ReviewLinkError, resolveReviewLink } from "./reviewLink.js";

// Xpot Tags HTTP API. Four audiences:
//   /q/:code, /n/:code           — public redirects printed/programmed on pieces
//   /api/xpot/tags*, …           — any active rep; a reseller only reaches the
//                                  pieces in their kit and their own customers
//   /api/xpot/admin/tag*         — active managers/admins (the journey: admins only)
//   /api/provisioner/*           — the paired desktop NFC provisioner (device token)
// Registered before the Xpot routers, whose admin router guards every path it sees.

/** Where printed QR / programmed NFC URLs point. */
export function tagBaseUrl(): string {
  return (process.env.TAG_PUBLIC_BASE_URL?.trim() || TAG_DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, "");
}

const allowHttp = () => process.env.NODE_ENV !== "production";

// ─── Validation ───────────────────────────────────────────────────────────────

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v), z.string().max(max).nullable().optional());

const destinationUrl = z.string().transform((value, ctx) => {
  const result = validateDestinationUrl(value, { allowHttp: allowHttp() });
  if (!result.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error });
    return z.NEVER;
  }
  return result.url;
});

const nullableDestinationUrl = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === "") return null;
    const result = validateDestinationUrl(value, { allowHttp: allowHttp() });
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error, path: ["destinationUrl"] });
      return z.NEVER;
    }
    return result.url;
  });

const leadFields = {
  leadId: z.number().int().positive().nullable().optional(),
  leadName: optionalText(200),
};

export const quickActivateSchema = z.object({
  destinationUrl,
  destinationType: z.enum(TAG_DESTINATION_TYPES),
  label: optionalText(120),
  ...leadFields,
}).strict();

const nfcWrittenSchema = z.object({
  readbackUrl: z.string().max(2048).nullable().optional(),
  method: z.enum(DIRECT_WRITE_METHODS),
}).strict();

const directWriteSchema = z.object({
  url: destinationUrl,
  label: optionalText(120),
  method: z.enum(DIRECT_WRITE_METHODS),
  verified: z.boolean(),
  ...leadFields,
}).strict();

const reviewLinkSchema = z.object({
  input: z.string().trim().min(2).max(2000),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).strict();

export const listQuerySchema = z.object({
  status: z.enum(TAG_STATUSES).optional(),
  productType: z.enum(TAG_PRODUCT_TYPES).optional(),
  leadId: z.coerce.number().int().positive().optional(),
  batchId: z.string().uuid().optional(),
  repId: z.coerce.number().int().positive().optional(),
  kitId: z.string().uuid().optional(),
  house: z.enum(["1", "true"]).transform(() => true).optional(),
  method: z.enum(["qr", "nfc"]).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

/** What is printed on the piece (shared/tagFace.ts); null clears it back to the batch/product default. */
const faceField = z.enum(TAG_FACES).nullable().optional();

const tagCreateSchema = z.object({
  productType: z.enum(TAG_PRODUCT_TYPES),
  face: faceField,
  label: optionalText(120),
}).strict();

const tagPatchSchema = z.object({
  label: optionalText(120),
  productType: z.enum(TAG_PRODUCT_TYPES).optional(),
  face: faceField,
  destinationType: z.enum(TAG_DESTINATION_TYPES).nullable().optional(),
  destinationUrl: nullableDestinationUrl,
  utmEnabled: z.boolean().optional(),
  utmCampaign: optionalText(80),
  metadata: z.record(z.unknown()).nullable().optional(),
  reason: optionalText(300),
}).strict();

const actionSchema = z.object({ reason: optionalText(300) }).strict();

const legacyPublicCode = z
  .string()
  .refine((value) => normalizeTagCode(value) !== null, "Invalid public code")
  .transform((value) => normalizeTagCode(value)!);

export const batchCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  batchCode: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() || undefined : v),
    z.string().regex(/^[A-Z0-9._-]{1,40}$/, "Batch code: letters, numbers, dot, dash or underscore").optional(),
  ),
  productType: z.enum(TAG_PRODUCT_TYPES),
  face: faceField,
  vendor: optionalText(120),
  quantity: z.coerce.number().int().min(1).max(TAG_MAX_BATCH_QUANTITY),
  notes: optionalText(2000),
  // Admin-only escape hatch for already-manufactured pieces whose printed QR
  // codes must be preserved during a migration. Normal batches omit this and
  // keep using cryptographically random codes.
  publicCodes: z.array(legacyPublicCode).min(1).max(TAG_MAX_BATCH_QUANTITY).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.publicCodes) return;
  if (value.publicCodes.length !== value.quantity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publicCodes"],
      message: "publicCodes must contain exactly quantity codes",
    });
  }
  if (new Set(value.publicCodes).size !== value.publicCodes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publicCodes"],
      message: "publicCodes must not contain duplicates",
    });
  }
});

const batchPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  face: faceField,
  vendor: optionalText(120),
  notes: optionalText(2000),
  status: z.enum(TAG_BATCH_STATUSES).optional(),
}).strict();

const codeList = z
  .array(z.string())
  .min(1)
  .max(TAG_MAX_BATCH_QUANTITY)
  .transform((list, ctx) => {
    const out: string[] = [];
    for (const raw of list) {
      const code = normalizeTagCode(raw);
      if (!code) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Not a tag code: ${raw}` });
        return z.NEVER;
      }
      out.push(code);
    }
    return out;
  });

const kitSchema = z.object({
  repId: z.number().int().positive(),
  codes: codeList.optional(),
  batchId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(TAG_MAX_BATCH_QUANTITY).optional(),
  note: optionalText(500),
}).strict().refine((v) => v.codes?.length || (v.batchId && v.quantity), {
  message: "Choose the pieces: codes, or a batch and a quantity",
});

const MAX_RANGE_MS = 366 * 86_400_000;
const PRESET_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export const analyticsQuerySchema = z.object({
  range: z.enum(["today", "7d", "30d", "90d", "custom"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  leadId: z.coerce.number().int().positive().optional(),
  batchId: z.string().uuid().optional(),
  repId: z.coerce.number().int().positive().optional(),
  productType: z.enum(TAG_PRODUCT_TYPES).optional(),
});

export function analyticsWindow(query: { range?: string; from?: string; to?: string }, now = new Date()): { from: Date; to: Date } {
  if (query.from || query.to) {
    const to = query.to ? new Date(query.to) : now;
    let from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);
    if (from > to) from = new Date(to.getTime() - 86_400_000);
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) from = new Date(to.getTime() - MAX_RANGE_MS);
    return { from, to };
  }
  if (query.range === "today") {
    return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), to: now };
  }
  const days = PRESET_DAYS[query.range ?? "30d"] ?? 30;
  return { from: new Date(now.getTime() - days * 86_400_000), to: now };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fail(res: Response, err: unknown, fallback: string) {
  if (err instanceof repo.TagError) return res.status(err.status).json({ message: err.message });
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

/** Loads the tag and answers 404/403 unless the acting rep may work on it. */
async function tagForActor(req: Request, res: Response, id: string) {
  const tag = await repo.getTagRow(id);
  if (!tag) {
    res.status(404).json({ message: "Tag not found" });
    return null;
  }
  if (!canWorkOnTag(actorOf(req), tag)) {
    res.status(403).json({ message: "This piece is not in your kit." });
    return null;
  }
  return tag;
}

function fileSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

function userIdOf(req: Request): string | null {
  return (req.session as { userId?: string } | undefined)?.userId ?? null;
}

/**
 * The "set up this tag" link on an unconfigured piece, for a signed-in rep who
 * may work on it. Read-only: never provisions a rep for a stray session.
 */
async function configureUrlFor(req: Request, tag: PublicTag): Promise<string | undefined> {
  const userId = userIdOf(req);
  if (!userId) return undefined;
  const rep = await storage.getSalesRepByUserId(userId);
  if (!rep?.isActive) return undefined;
  const sess = req.session as { isAdmin?: boolean } | undefined;
  const isManager = !!sess?.isAdmin || rep.role === "manager" || rep.role === "admin";
  if (!canWorkOnTag({ userId, repId: rep.id, isManager }, tag)) return undefined;
  return `${TAGS_APP_PATH}/t/${encodeURIComponent(tag.publicCode)}`;
}

// ─── Desktop provisioner auth ─────────────────────────────────────────────────

declare module "express-serve-static-core" {
  interface Request {
    provisionerDevice?: TagProvisioningDevice;
  }
}

/** Old or newer apps get a clear upgrade message instead of undefined behaviour. */
function requireProtocol(req: Request, res: Response, next: NextFunction) {
  const sent = Number(req.get(PROVISIONER_PROTOCOL_HEADER));
  if (sent !== PROVISIONER_PROTOCOL_VERSION) {
    return res.status(426).json({
      message: "This Xpot NFC Writer version is not compatible with the server. Install the current version.",
      protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    });
  }
  next();
}

async function requireProvisioner(req: Request, res: Response, next: NextFunction) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return res.status(401).json({ message: "Device token required" });
  try {
    const device = await provisioning.authenticateDevice(token);
    if (!device) return res.status(401).json({ message: "Device is not paired or was revoked" });
    req.provisionerDevice = device;
    await provisioning.touchDevice(device, req.get("x-provisioner-app-version")?.slice(0, 40) ?? null);
    next();
  } catch (err) {
    fail(res, err, "Failed to authenticate device");
  }
}

const pairSchema = z.object({
  pairingCode: z.string().min(1).max(20),
  platform: optionalText(40),
  appVersion: optionalText(40),
}).strict();

const deviceEventSchema = z.object({
  jobId: z.string().uuid().nullable().optional(),
  type: z.enum(DEVICE_EVENT_TYPES),
  detail: z.record(z.unknown()).optional(),
}).strict();

const completeSchema = z.object({
  outcome: z.enum(["succeeded", "failed"]),
  readbackUrl: z.string().max(2048).nullable().optional(),
  tagType: optionalText(40),
  errorCode: z.enum(PROVISIONING_ERROR_CODES).nullable().optional(),
  errorMessage: optionalText(500),
}).strict();

// ─── Routes ───────────────────────────────────────────────────────────────────

export function registerTagRoutes(app: Express) {
  // Public redirects.
  const publicDeps = {
    findByCode: repo.findPublicTagByCode,
    recordEvent: repo.recordTagEvent,
    configureUrlFor,
  };
  app.get("/q/:code", createTagRedirectHandler("qr", publicDeps));
  app.get("/n/:code", createTagRedirectHandler("nfc", publicDeps));

  // ─── Field app (any active rep, scoped) ─────────────────────────────────────

  const fieldBase = "/api/xpot/tags";

  app.get(`${fieldBase}/summary`, requireTagUser, async (req, res) => {
    try {
      res.json(await repo.getRepSummary(actorOf(req).repId));
    } catch (err) {
      fail(res, err, "Failed to load summary");
    }
  });

  // Pieces per customer, for the customer cards on the Visits side.
  app.get(`${fieldBase}/by-lead`, requireTagUser, async (req, res) => {
    try {
      res.json(await repo.getLeadTagSummaries(actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to load customer pieces");
    }
  });

  // Type the code printed on the piece, get its record.
  app.get(`${fieldBase}/lookup/:code`, requireTagUser, async (req, res) => {
    try {
      const code = normalizeTagCode(req.params.code);
      const tag = code ? await repo.getTagByCode(code) : null;
      if (!tag) return res.status(404).json({ message: "No tag with that code" });
      if (!canWorkOnTag(actorOf(req), tag)) return res.status(403).json({ message: "This piece is not in your kit." });
      res.json({ id: tag.id, publicCode: tag.publicCode });
    } catch (err) {
      fail(res, err, "Failed to look up tag");
    }
  });

  app.get(fieldBase, requireTagUser, async (req, res) => {
    try {
      const actor = actorOf(req);
      const filters = listQuerySchema.parse(req.query);
      // A reseller's list is their own pieces, whatever filter they send.
      res.json(await repo.listTags(actor.isManager ? filters : { ...filters, repId: actor.repId, house: undefined }));
    } catch (err) {
      fail(res, err, "Failed to load tags");
    }
  });

  app.get(`${fieldBase}/:id`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      if (!(await tagForActor(req, res, id))) return;
      res.json(await repo.getTagDetail(id, tagBaseUrl()));
    } catch (err) {
      fail(res, err, "Failed to load tag");
    }
  });

  // Customer + link + activation in one step.
  app.post(`${fieldBase}/:id/quick-activate`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      await field.quickActivateTag(id, quickActivateSchema.parse(req.body), actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl()));
    } catch (err) {
      fail(res, err, "Failed to activate tag");
    }
  });

  // Resellers switch their own sold pieces on and off; the rest of the lifecycle is admin-only.
  for (const action of ["activate", "disable"] as const) {
    app.post(`${fieldBase}/:id/${action}`, requireTagUser, async (req, res) => {
      const id = idParam(req, res);
      if (!id) return;
      try {
        if (!(await tagForActor(req, res, id))) return;
        const { reason } = actionSchema.parse(req.body ?? {});
        await repo.transitionTag(id, action, actorOf(req), reason, "field");
        res.json(await repo.getTagDetail(id, tagBaseUrl()));
      } catch (err) {
        fail(res, err, `Failed to ${action} tag`);
      }
    });
  }

  // The phone (or NFC Tools, by hand) wrote this tag's NFC URL into its chip.
  app.post(`${fieldBase}/:id/nfc-written`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      await field.recordPhoneWrite(id, nfcWrittenSchema.parse(req.body), tagBaseUrl(), actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl()));
    } catch (err) {
      fail(res, err, "Failed to record chip write");
    }
  });

  // Direct pieces: chips holding the customer's own link.
  app.get("/api/xpot/tag-direct-writes", requireTagUser, async (req, res) => {
    try {
      res.json(await field.listDirectWrites(actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to load direct links");
    }
  });

  app.post("/api/xpot/tag-direct-writes", requireTagUser, async (req, res) => {
    try {
      res.status(201).json(await field.recordDirectWrite(directWriteSchema.parse(req.body), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to record direct link");
    }
  });

  // Google Business / Maps link or business name → review link. Each call can
  // reach Google Places, so cap it per rep.
  app.post("/api/xpot/tools/review-link", requireTagUser, async (req, res) => {
    try {
      if (rateLimit(`review-link:${actorOf(req).repId}`, { limit: 30, windowMs: 60_000 })) {
        return res.status(429).json({ message: "Too many searches. Wait a minute and try again." });
      }
      const { input, lat, lng } = reviewLinkSchema.parse(req.body);
      const places = await resolveReviewLink(input, { apiKey: await resolveGoogleApiKey(), lat, lng });
      res.json({ places });
    } catch (err) {
      if (err instanceof ReviewLinkError) return res.status(err.status).json({ message: err.message });
      fail(res, err, "Failed to build the review link");
    }
  });

  // ─── Admin (active managers/admins) ─────────────────────────────────────────

  const adminBase = "/api/xpot/admin/tags";

  // Journey and plans: admins only (see journeyRoutes.ts).
  registerJourneyRoutes(app);

  app.get(`${adminBase}/overview`, requireTagManager, async (_req, res) => {
    try {
      res.json(await repo.getOverview());
    } catch (err) {
      fail(res, err, "Failed to load overview");
    }
  });

  // Aggregated analytics, optionally scoped to a customer, batch, reseller or product type.
  app.get(`${adminBase}/analytics`, requireTagManager, async (req, res) => {
    try {
      const q = analyticsQuerySchema.parse(req.query);
      const { from, to } = analyticsWindow(q);
      res.json(await repo.getAnalytics({ leadId: q.leadId, batchId: q.batchId, repId: q.repId, productType: q.productType }, from, to));
    } catch (err) {
      fail(res, err, "Failed to load analytics");
    }
  });

  // Per-reseller sales, activations, stock and scans.
  app.get(`${adminBase}/report`, requireTagManager, async (req, res) => {
    try {
      const { from, to } = analyticsWindow(analyticsQuerySchema.parse(req.query));
      res.json(await getTeamReport(from, to));
    } catch (err) {
      fail(res, err, "Failed to load report");
    }
  });

  app.post(adminBase, requireTagManager, async (req, res) => {
    try {
      const tag = await repo.createSingleTag(tagCreateSchema.parse(req.body), userIdOf(req));
      res.status(201).json(await repo.getTagDetail(tag.id, tagBaseUrl()));
    } catch (err) {
      fail(res, err, "Failed to create tag");
    }
  });

  app.patch(`${adminBase}/:id`, requireTagManager, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      await repo.updateTag(id, tagPatchSchema.parse(req.body), userIdOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl()));
    } catch (err) {
      fail(res, err, "Failed to update tag");
    }
  });

  app.post(`${adminBase}/:id/assign`, requireTagManager, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const target = z
        .object({ leadId: z.number().int().positive().optional(), leadName: optionalText(200) })
        .strict()
        .refine((v) => !!v.leadId !== !!v.leadName, "Send either leadId or leadName")
        .parse(req.body);
      await repo.assignTag(id, { leadId: target.leadId, leadName: target.leadName ?? undefined }, userIdOf(req), actorOf(req).repId);
      res.json(await repo.getTagDetail(id, tagBaseUrl()));
    } catch (err) {
      fail(res, err, "Failed to assign tag");
    }
  });

  for (const action of ["unassign", "retire", "restore"] as const) {
    app.post(`${adminBase}/:id/${action}`, requireTagManager, async (req, res) => {
      const id = idParam(req, res);
      if (!id) return;
      try {
        const { reason } = actionSchema.parse(req.body ?? {});
        await repo.transitionTag(id, action, actorOf(req), reason);
        res.json(await repo.getTagDetail(id, tagBaseUrl()));
      } catch (err) {
        fail(res, err, `Failed to ${action} tag`);
      }
    });
  }

  // Move a piece (and, if sold, its credit) to another reseller or back to the house.
  app.patch(`${adminBase}/:id/rep`, requireTagManager, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const { repId } = z.object({ repId: z.number().int().positive().nullable() }).strict().parse(req.body);
      await repo.setTagRep(id, repId, userIdOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl()));
    } catch (err) {
      fail(res, err, "Failed to change reseller");
    }
  });

  app.get(`${adminBase}/:id/analytics`, requireTagManager, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const { from, to } = analyticsWindow(analyticsQuerySchema.parse(req.query));
      res.json(await repo.getAnalytics({ tagId: id }, from, to));
    } catch (err) {
      fail(res, err, "Failed to load tag analytics");
    }
  });

  // QR image for one tag (always the QR URL; NFC chips are programmed, not printed).
  for (const format of ["svg", "png"] as const) {
    app.get(`${adminBase}/:id/qr.${format}`, requireTagManager, async (req, res) => {
      const id = idParam(req, res);
      if (!id) return;
      try {
        const tag = await repo.getTagRow(id);
        if (!tag) return res.status(404).json({ message: "Tag not found" });
        const { qrUrl } = buildTagUrls(tagBaseUrl(), tag.publicCode);
        res.set("Cache-Control", "private, max-age=300");
        if (req.query.download) res.attachment(`${tag.publicCode}.${format}`);
        if (format === "svg") res.type("image/svg+xml").send(await qrSvg(qrUrl));
        else res.type("image/png").send(await qrPng(qrUrl));
      } catch (err) {
        fail(res, err, "Failed to render QR");
      }
    });
  }

  // Kits: pieces handed to a reseller.
  app.get("/api/xpot/admin/tag-kits", requireTagManager, async (req, res) => {
    try {
      const { repId } = z.object({ repId: z.coerce.number().int().positive().optional() }).parse(req.query);
      res.json(await repo.listKits({ repId }));
    } catch (err) {
      fail(res, err, "Failed to load kits");
    }
  });

  app.post("/api/xpot/admin/tag-kits", requireTagManager, async (req, res) => {
    try {
      const input = kitSchema.parse(req.body);
      const rep = await storage.getSalesRep(input.repId);
      if (!rep) return res.status(404).json({ message: "Reseller not found" });
      res.status(201).json(await repo.deliverKit(input, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to deliver kit");
    }
  });

  app.post("/api/xpot/admin/tag-kits/return", requireTagManager, async (req, res) => {
    try {
      const { codes } = z.object({ codes: codeList }).strict().parse(req.body);
      res.json(await repo.returnToHouse(codes, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to return pieces");
    }
  });

  // Manufacturing batches.
  app.get("/api/xpot/admin/tag-batches", requireTagAdmin, async (_req, res) => {
    try {
      res.json(await repo.listBatches());
    } catch (err) {
      fail(res, err, "Failed to load batches");
    }
  });

  app.post("/api/xpot/admin/tag-batches", requireTagAdmin, async (req, res) => {
    try {
      res.status(201).json(await repo.createBatch(batchCreateSchema.parse(req.body), userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to create batch");
    }
  });

  app.get("/api/xpot/admin/tag-batches/:id", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const batch = await repo.getBatch(id);
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      res.json({ ...batch, tags: await repo.listTags({ batchId: id, limit: 2000 }) });
    } catch (err) {
      fail(res, err, "Failed to load batch");
    }
  });

  app.patch("/api/xpot/admin/tag-batches/:id", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json(await repo.updateBatch(id, batchPatchSchema.parse(req.body), userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to update batch");
    }
  });

  app.get("/api/xpot/admin/tag-batches/:id/export.csv", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const batch = await repo.getBatch(id);
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      const csv = buildManufacturingCsv(batch, await repo.getBatchTagsForExport(id), tagBaseUrl(), "svg");
      res.attachment(`${fileSafe(batch.batchCode)}.csv`);
      res.type("text/csv").send(csv);
    } catch (err) {
      fail(res, err, "Failed to export batch");
    }
  });

  app.get("/api/xpot/admin/tag-batches/:id/qr-assets.zip", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const batch = await repo.getBatch(id);
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      const zip = await buildBatchZip({
        batch,
        tags: await repo.getBatchTagsForExport(id),
        baseUrl: tagBaseUrl(),
        includePng: req.query.png === "1",
      });
      res.attachment(`${fileSafe(batch.batchCode)}-qr.zip`);
      res.type("application/zip").send(Buffer.from(zip));
    } catch (err) {
      fail(res, err, "Failed to build QR assets");
    }
  });

  // Desktop NFC provisioners (admin side).
  app.get("/api/xpot/admin/tag-provisioners", requireTagAdmin, async (_req, res) => {
    try {
      res.json(await provisioning.listDevices());
    } catch (err) {
      fail(res, err, "Failed to load provisioners");
    }
  });

  app.post("/api/xpot/admin/tag-provisioners", requireTagAdmin, async (req, res) => {
    try {
      const { deviceName } = z.object({ deviceName: z.string().trim().min(1, "Name the computer").max(80) }).strict().parse(req.body);
      res.status(201).json(await provisioning.createPairing(deviceName, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to create pairing code");
    }
  });

  app.post("/api/xpot/admin/tag-provisioners/:id/revoke", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json(await provisioning.revokeDevice(id, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to revoke provisioner");
    }
  });

  app.get(`${adminBase}/:id/provisioning`, requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const state = await provisioning.getTagProvisioning(id);
      if (!state) return res.status(404).json({ message: "Tag not found" });
      res.json(state);
    } catch (err) {
      fail(res, err, "Failed to load provisioning");
    }
  });

  app.post(`${adminBase}/:id/provisioning-jobs`, requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const { deviceId } = z.object({ deviceId: z.string().uuid().nullable().optional() }).strict().parse(req.body ?? {});
      await provisioning.createJob(id, userIdOf(req), tagBaseUrl(), deviceId);
      res.status(201).json(await provisioning.getTagProvisioning(id));
    } catch (err) {
      fail(res, err, "Failed to create provisioning job");
    }
  });

  app.post("/api/xpot/admin/tag-provisioning-jobs/:id/cancel", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json(await provisioning.cancelJob(id, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to cancel job");
    }
  });

  // ─── Desktop provisioner (device token only) ────────────────────────────────

  app.post("/api/provisioner/pair", requireProtocol, async (req, res) => {
    // Pairing codes are short-lived, but still cap guesses per IP.
    if (rateLimit(`provisioner-pair:${normalizeIpKey(req.ip)}`, { limit: 10, windowMs: 10 * 60_000 })) {
      return res.status(429).json({ message: "Too many pairing attempts. Try again later." });
    }
    try {
      const result = await provisioning.redeemPairing(pairSchema.parse(req.body));
      res.status(201).json({ ...result, protocolVersion: PROVISIONER_PROTOCOL_VERSION });
    } catch (err) {
      fail(res, err, "Pairing failed");
    }
  });

  const device = [requireProtocol, requireProvisioner] as const;

  app.get("/api/provisioner/session", ...device, (req, res) => {
    const d = req.provisionerDevice!;
    res.json({
      device: { id: d.id, deviceName: d.deviceName },
      protocolVersion: PROVISIONER_PROTOCOL_VERSION,
      baseUrl: tagBaseUrl(),
    });
  });

  // Next job for this device, or 204 when there is nothing to do.
  app.post("/api/provisioner/jobs/claim", ...device, async (req, res) => {
    try {
      const job = await provisioning.claimNextJob(req.provisionerDevice!.id);
      if (!job) return res.status(204).end();
      res.json(job);
    } catch (err) {
      fail(res, err, "Failed to claim job");
    }
  });

  app.post("/api/provisioner/events", ...device, async (req, res) => {
    try {
      const status = await provisioning.recordDeviceEvent(req.provisionerDevice!.id, deviceEventSchema.parse(req.body));
      res.json({ ok: true, jobStatus: status });
    } catch (err) {
      fail(res, err, "Failed to record event");
    }
  });

  app.post("/api/provisioner/jobs/:id/complete", ...device, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const job = await provisioning.completeJob(req.provisionerDevice!.id, id, completeSchema.parse(req.body));
      res.json({ id: job.id, status: job.status, errorCode: job.errorCode, errorMessage: job.errorMessage });
    } catch (err) {
      fail(res, err, "Failed to complete job");
    }
  });
}
