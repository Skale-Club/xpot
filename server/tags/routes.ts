import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  TAG_DEFAULT_PUBLIC_BASE_URL,
  TAG_DESTINATION_TYPES,
  TAG_MAX_BATCH_QUANTITY,
  TAG_PRODUCT_TYPES,
  TAG_STOCK_STATUSES,
  TAG_STATUSES,
  buildManufacturingCsv,
  buildTagUrls,
  normalizeTagCode,
} from "#shared/tags.js";
import { canWorkOnTag } from "#shared/tagAccess.js";
import { pieceAccess, RECEIVE_TARGETS } from "#shared/tagCustody.js";
import { TAG_STOCK_METRIC_NAMES } from "#shared/tagMetrics.js";
import { kitCostRequired, kitOwnership } from "#shared/tagKits.js";
import { TAG_PIECE_QUEUES } from "#shared/tagQueues.js";
import { TAG_FACES } from "#shared/tagFace.js";
import { validateChipContent } from "#shared/chipContent.js";
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
import { actorOf, productionScopeOf, requireProductionUser, requireTagAdmin, requireTagManager, requireTagUser, tagScopeOf, type TagScope } from "./access.js";
import { inManagementView, viewsAsRep } from "../routes/xpot/middleware.js";
import { listTagPeople } from "../routes/xpot/resellerAccounts.js";
import { registerJourneyRoutes } from "./journeyRoutes.js";
import { createTagRedirectHandler, type PublicTag } from "./publicHandler.js";
import { buildBatchZip, qrPng, qrSvg } from "./qrAssets.js";
import { normalizeIpKey, rateLimit } from "./rateLimit.js";
import * as repo from "./repository.js";
import * as field from "./field.js";
import * as custody from "./custody.js";
import * as provisioning from "./provisioning.js";
import { getTeamReport } from "./report.js";
import { getPieceActivity } from "./pieceActivity.js";
import { ReviewLinkError, resolveReviewLink } from "./reviewLink.js";
import { tagSaleCreateSchema } from "#shared/tagSales.js";
import { createTagSale, linkTagToSale, listLinkableSales, TagSaleError } from "./sales.js";
import { syncSaleToXphere } from "../routes/xpot/xphere-sync.js";
import { checkAcquisition, fulfillAcquisition, listAcquisitions } from "./acquisitions.js";
import { registerShowcaseRoutes } from "./showcase.js";
import { registerShopCatalogRoutes } from "./shopCatalog.js";
import { registerProductionRoutes } from "./productionRoutes.js";
import { salesStorage } from "../storage-sales.js";
import { companyOrganizationId, organizationIdForRep, printingOrganization } from "../organizations/service.js";
import { handOutProducers } from "../organizations/links.js";
import { handOutSource } from "./distribution.js";
import { registerCustomerOrderRoutes } from "../customerOrders/routes.js";
import { hideProfitFromMembers } from '../routes/xpot/profitVisibility.js';

// Xpot Tags HTTP API. Four audiences:
//   /q/:code, /n/:code           — public redirects printed/programmed on pieces
//   /api/xpot/tags*, …           — any active rep; a reseller only reaches the
//                                  pieces in their kit and their own customers
//   /api/xpot/admin/tag*         — active managers/admins (the journey: admins only)
//   /api/provisioner/*           — the paired desktop NFC provisioner (device token)
// Registered before the Xpot routers, whose admin router guards every path it sees.

/** The actor for a list: viewing as a rep (admin mode off), a manager's lists are their own. */
function listActor(req: Request) {
  const actor = actorOf(req);
  return viewsAsRep(req) ? { ...actor, isManager: false } : actor;
}

/** Where printed QR / programmed NFC URLs point. */
export function tagBaseUrl(): string {
  return (process.env.TAG_PUBLIC_BASE_URL?.trim() || TAG_DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, "");
}

const allowHttp = () => process.env.NODE_ENV !== "production";

// ─── Validation ───────────────────────────────────────────────────────────────

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v), z.string().max(max).nullable().optional());

// A link, an email, a phone or a contact card (shared/chipContent.ts), stored canonical.
const destinationUrl = z.string().transform((value, ctx) => {
  const result = validateChipContent(value, { allowHttp: allowHttp() });
  if (!result.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error });
    return z.NEVER;
  }
  return result.value;
});

const nullableDestinationUrl = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === "") return null;
    const result = validateChipContent(value, { allowHttp: allowHttp() });
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error, path: ["destinationUrl"] });
      return z.NEVER;
    }
    return result.value;
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
  stockStatus: z.enum(TAG_STOCK_STATUSES).optional(),
  productType: z.enum(TAG_PRODUCT_TYPES).optional(),
  leadId: z.coerce.number().int().positive().optional(),
  batchId: z.string().uuid().optional(),
  repId: z.coerce.number().int().positive().optional(),
  kitId: z.string().uuid().optional(),
  house: z.enum(["1", "true"]).transform(() => true).optional(),
  /** A stock number (shared/tagMetrics.ts): the list behind a count, e.g. the company stock card. */
  metric: z.enum(TAG_STOCK_METRIC_NAMES).optional(),
  /** Without the pieces not in stock yet: the stock list's default view (a code search or a batch still finds them). */
  hidePending: z.enum(["1", "true"]).transform(() => true).optional(),
  /** An Overview "Needs action" queue (shared/tagQueues.ts): the list behind its count. */
  queue: z.enum(TAG_PIECE_QUEUES).optional(),
  /** Only the viewer's own pieces, even for a manager (the phone app's Pieces screen). */
  mine: z.enum(["1", "true"]).transform(() => true).optional(),
  /** One organization's pieces; honoured only for platform management (a reseller's list is theirs anyway). */
  organizationId: z.coerce.number().int().positive().optional(),
  method: z.enum(["qr", "nfc"]).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

/** What is printed on the piece (shared/tagFace.ts); null clears it back to the batch/product default. */
const faceField = z.enum(TAG_FACES).nullable().optional();

const tagCreateSchema = z.object({
  productType: z.enum(TAG_PRODUCT_TYPES),
  // Without a catalog product a piece can never be sold (server/tags/sales.ts).
  salesProductId: z.number({ required_error: "Choose a sales catalog product" }).int().positive(),
  face: faceField,
  label: optionalText(120),
}).strict();

const tagPatchSchema = z.object({
  label: optionalText(120),
  productType: z.enum(TAG_PRODUCT_TYPES).optional(),
  salesProductId: z.number().int().positive().nullable().optional(),
  face: faceField,
  destinationType: z.enum(TAG_DESTINATION_TYPES).nullable().optional(),
  destinationUrl: nullableDestinationUrl,
  utmEnabled: z.boolean().optional(),
  utmCampaign: optionalText(80),
  metadata: z.record(z.unknown()).nullable().optional(),
  reason: optionalText(300),
}).strict();

const actionSchema = z.object({ reason: optionalText(300) }).strict();
const receiveSchema = z.object({ into: z.enum(RECEIVE_TARGETS) }).strict();

const destinationChangeSchema = z.object({
  destinationUrl,
  destinationType: z.enum(TAG_DESTINATION_TYPES),
}).strict();

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
  salesProductId: z.number().int().positive(),
  face: faceField,
  vendor: optionalText(120),
  notes: optionalText(2000),
  // Issue this many codes now (3D printing, or a supplier printing Xpot codes); the pieces start `pending` and enter
  // stock when scanned. Omit for an empty batch filled by scanning already-coded pieces.
  quantity: z.coerce.number().int().min(1).max(TAG_MAX_BATCH_QUANTITY).optional(),
  // Admin-only escape hatch for already-manufactured pieces whose printed codes must be preserved (they enter stock
  // at once). Never offered over MCP.
  publicCodes: z.array(legacyPublicCode).min(1).max(TAG_MAX_BATCH_QUANTITY).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.publicCodes) return;
  if (value.quantity !== undefined && value.publicCodes.length !== value.quantity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["publicCodes"], message: "publicCodes must contain exactly quantity codes" });
  }
  if (new Set(value.publicCodes).size !== value.publicCodes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["publicCodes"], message: "publicCodes must not contain duplicates" });
  }
});

export const batchScanSchema = z.object({
  value: z.string().trim().min(1).max(2048),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
}).strict();

const batchPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  face: faceField,
  vendor: optionalText(120),
  notes: optionalText(2000),
  salesProductId: z.number().int().positive().optional(),
}).strict();

const batchReopenSchema = z.object({
  reason: z.string().trim().min(1).max(300),
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
  unitCostCents: z.number().int().nonnegative().optional(),
  /** Consignment (`company`) or a purchase (`rep`); omitted: the rep's cost rule decides (shared/tagKits.ts). */
  ownershipType: z.enum(["company", "rep"]).optional(),
}).strict().refine((v) => v.codes?.length || (v.batchId && v.quantity), {
  message: "Choose the pieces: codes, or a batch and a quantity",
});

/** Hand out dry run: the same pieces a kit would take, without moving them. */
const kitCheckSchema = z.object({
  codes: codeList.optional(),
  batchId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(TAG_MAX_BATCH_QUANTITY).optional(),
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
  if ((err as {cause?:{message?:string}})?.cause?.message?.includes('order_piece_design')) return res.status(409).json({code:'order_piece_design',message:'This design belongs to a different customer order'});
  if ((err as {cause?:{message?:string}})?.cause?.message?.includes('order_piece_allocated')) return res.status(409).json({code:'order_piece_allocated',message:'This piece is set aside for a customer order'});
  if (err instanceof repo.TagError) return res.status(err.status).json(repo.tagErrorBody(err));
  if (err instanceof TagSaleError) return res.status(err.status).json({ code: err.code, message: err.message, ...(err.params ? { params: err.params } : {}) });
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
  const isManager = !!sess?.isAdmin;
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
  capabilities: z.array(z.enum(["nfc", "print"])).min(1).max(2).optional(),
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
  app.use(['/api/xpot/tags','/api/xpot/tag-sales'],hideProfitFromMembers);
  registerCustomerOrderRoutes(app);
  // Public redirects.
  const publicDeps = {
    findByCode: repo.findPublicTagByCode,
    recordEvent: repo.recordTagEvent,
    confirmNfc: repo.confirmNfcFromTap,
    configureUrlFor,
  };
  app.get("/q/:code", createTagRedirectHandler("qr", publicDeps));
  app.get("/n/:code", createTagRedirectHandler("nfc", publicDeps));

  // ─── Field app (any active rep, scoped) ─────────────────────────────────────

  const fieldBase = "/api/xpot/tags";

  // Tags › Shop (the showcase that sends resellers to Stuscle). Before the `${fieldBase}/:id` routes below, which
  // would take "showcase" for a piece id.
  registerShowcaseRoutes(app);
  registerShopCatalogRoutes(app);

  // The Tags dashboard: the person's own pieces, or every rep's for a manager in admin mode.
  app.get(`${fieldBase}/dashboard`, requireTagUser, async (req, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
      const actor = listActor(req);
      res.json(await repo.getTagDashboard(actor.isManager ? null : actor.repId, days));
    } catch (err) {
      fail(res, err, "Failed to load dashboard");
    }
  });

  // Pieces per customer, for the customer cards on the Visits side.
  app.get(`${fieldBase}/by-lead`, requireTagUser, async (req, res) => {
    try {
      res.json(await repo.getLeadTagSummaries(listActor(req)));
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
      // Limited: a piece of the viewer's Organization they don't hold (shared/tagCustody.ts); GET /:id says what they may see.
      const access = pieceAccess(actorOf(req), tag);
      if (access === "none") return res.status(403).json({ message: "This piece is not in your kit." });
      res.json({ id: tag.id, publicCode: tag.publicCode, access });
    } catch (err) {
      fail(res, err, "Failed to look up tag");
    }
  });

  app.get(fieldBase, requireTagUser, async (req, res) => {
    try {
      const actor = actorOf(req);
      const filters = listQuerySchema.parse(req.query);
      // A reseller's list is their own pieces, whatever filter they send. A manager gets
      // every piece (the admin screens), unless asking for their own: a piece is theirs
      // once it is in their kit or they activated it, not because they can reach it.
      // As in listScope (routes/xpot/middleware.ts): the platform's owners in management mode get every piece, and
      // ?organizationId= narrows that; an organization's owner in management mode gets the organizations they run.
      const { mine, organizationId, ...rest } = filters;
      const managed = actor.managedOrganizationIds ?? [];
      if (!mine && !actor.isManager && inManagementView(req) && managed.length) {
        const organizationIds = organizationId !== undefined && managed.includes(organizationId) ? [organizationId] : managed;
        return res.json(await repo.listTags({ ...rest, organizationIds }));
      }
      const own = mine || !actor.inManagement;
      // A reseller's pieces in the Organizations they are still active in, as GET /:id
      // allows (canWorkOnTag): leaving one takes its pieces off the list too.
      const organizationIds = actor.isManager ? undefined : actor.organizationIds ?? [];
      if (own) return res.json(await repo.listTags({ ...rest, repId: actor.repId, house: undefined, organizationIds }));
      // House stock never adds up across organizations: unnarrowed, it means the company's.
      const housePieces = rest.house || rest.metric === "house" || rest.metric === "withCustomer" || rest.metric === "handOut";
      res.json(await repo.listTags({ ...rest, organizationId: organizationId ?? (housePieces ? await companyOrganizationId() : undefined) }));
    } catch (err) {
      fail(res, err, "Failed to load tags");
    }
  });

  // A financial sale backed by exact physical pieces. Kept in the Tags router
  // so a Tags-only partner does not need the Visits module.
  app.post("/api/xpot/tag-sales", requireTagUser, async (req, res) => {
    try {
      const input = tagSaleCreateSchema.parse(req.body);
      const result = await createTagSale(input, actorOf(req), req.get("idempotency-key") ?? "");
      res.status(201).json(result);
      if (!result.replayed) syncSaleToXphere(result.sale.id).catch((err) => console.error("[tag-sale] xphere mirror:", err));
    } catch (err) {
      if (err instanceof TagSaleError) {
        return res.status(err.status).json({ code: err.code, message: err.message, ...(err.params ? { params: err.params } : {}), requestId: req.get("x-request-id") ?? null });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({ code: "validation_error", message: err.issues[0]?.message ?? "Validation error", details: err.errors, requestId: req.get("x-request-id") ?? null });
      }
      fail(res, err, "Failed to record tag sale");
    }
  });

  app.get(`${fieldBase}/catalog`, requireTagUser, async (_req, res) => {
    try {
      const products = (await salesStorage.listProducts()).filter((product) => product.kind === "physical");
      const tiers = await salesStorage.listTiersBatch(products.map((product) => product.id));
      res.json(products.map((product) => ({ ...product, tiers: tiers.filter((tier) => tier.productId === product.id) })));
    } catch (err) {
      fail(res, err, "Failed to load tag catalog");
    }
  });

  app.get(`${fieldBase}/:id`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const tag = await repo.getTagRow(id);
      if (!tag) return res.status(404).json({ message: "Tag not found" });
      const actor = actorOf(req);
      const access = pieceAccess(actor, tag);
      if (access === "none") return res.status(403).json({ message: "This piece is not in your kit." });
      res.json(access === "full" ? await repo.getTagDetail(id, tagBaseUrl(), actor) : await repo.getTagLimitedView(id, actor));
    } catch (err) {
      fail(res, err, "Failed to load tag");
    }
  });

  // The piece screen's Performance (same numbers and range presets as the admin analytics),
  // for anyone who can open the piece.
  app.get(`${fieldBase}/:id/analytics`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      if (!(await tagForActor(req, res, id))) return;
      const { range, from, to } = analyticsQuerySchema.parse(req.query);
      const window = analyticsWindow({ range, from, to });
      res.json(await repo.getAnalytics({ tagId: id }, window.from, window.to));
    } catch (err) {
      fail(res, err, "Failed to load piece analytics");
    }
  });

  // The piece screen's Sale and Activity: its sales (active and cancelled) and, on the
  // management side, its stock movements.
  app.get(`${fieldBase}/:id/activity`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      if (!(await tagForActor(req, res, id))) return;
      res.json(await getPieceActivity(id, { withMovements: listActor(req).isManager }));
    } catch (err) {
      fail(res, err, "Failed to load piece activity");
    }
  });

  // Customer + link + activation in one step.
  app.post(`${fieldBase}/:id/quick-activate`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      await field.quickActivateTag(id, quickActivateSchema.parse(req.body), actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to activate tag");
    }
  });

  // A piece handed to a customer whose sale was recorded elsewhere (Visits):
  // the sales it can join, and joining one.
  app.get(`${fieldBase}/:id/linkable-sales`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      if (!(await tagForActor(req, res, id))) return;
      res.json(await listLinkableSales(id));
    } catch (err) {
      fail(res, err, "Failed to load sales");
    }
  });

  app.post(`${fieldBase}/:id/link-sale`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      if (!(await tagForActor(req, res, id))) return;
      const { saleItemId } = z.object({ saleItemId: z.number().int().positive() }).strict().parse(req.body);
      await linkTagToSale(id, saleItemId, actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to link the sale");
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
        res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
      } catch (err) {
        fail(res, err, `Failed to ${action} tag`);
      }
    });
  }

  // The phone (or NFC Tools, by hand) wrote this tag's NFC URL into its chip.
  // A customer's link, changed from the customer page: the piece keeps its state.
  app.post(`${fieldBase}/:id/destination`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const input = destinationChangeSchema.parse(req.body);
      await field.changeTagDestination(id, input, actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to change the link");
    }
  });

  // Take a piece away from its customer, back to the reseller's unconfigured
  // stock. Same rule as the admin: a piece with an active sale stays put.
  app.post(`${fieldBase}/:id/unassign`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      if (!(await tagForActor(req, res, id))) return;
      const { reason } = actionSchema.parse(req.body ?? {});
      // No reason typed: the history row gets the "customer removed" code (transitionTag), worded by the app.
      await repo.transitionTag(id, "unassign", actorOf(req), reason ?? null, "field");
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to unlink the piece");
    }
  });

  app.post(`${fieldBase}/:id/nfc-written`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      await field.recordPhoneWrite(id, nfcWrittenSchema.parse(req.body), tagBaseUrl(), actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to record chip write");
    }
  });

  // The phone erased this tag's chip (testing it, or starting over). Never moves stock.
  app.post(`${fieldBase}/:id/nfc-erased`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      await field.recordPhoneErase(id, actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to record chip erase");
    }
  });

  // Receive a printed piece never received into stock: the house's (management) or the caller's own.
  // Explicit only: reading or writing a piece never receives it (docs/TAG_CUSTODY_EXECUTION_PLAN.md §2.2).
  app.post(`${fieldBase}/:id/receive`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const { into } = receiveSchema.parse(req.body ?? {});
      await custody.receivePiece(id, into, actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to receive the piece");
    }
  });

  // Hand a piece back to house stock (received by mistake, or only to test it): Take back, from the phone.
  app.post(`${fieldBase}/:id/return-to-house`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      await custody.returnPieceToHouse(id, actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to return the piece to the house");
    }
  });

  // The phone made this tag's chip read-only, so nobody can rewrite it.
  app.post(`${fieldBase}/:id/nfc-locked`, requireTagUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      await field.recordPhoneLock(id, actorOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to record chip lock");
    }
  });

  // Direct pieces: chips holding the customer's own link.
  app.get("/api/xpot/tag-direct-writes", requireTagUser, async (req, res) => {
    try {
      res.json(await field.listDirectWrites(listActor(req)));
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

  /** The scope of a management request, narrowed to one organization if it asks for one it may see. */
  const narrowedScope = (req: Request, organizationId?: number): TagScope => {
    const scope = tagScopeOf(req);
    if (organizationId === undefined) return scope;
    return scope === null || scope.includes(organizationId) ? [organizationId] : scope;
  };

  /** Another organization's piece reads as not found. After requireTagManager, on `:id` routes. */
  const pieceInScope = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = tagScopeOf(req);
      if (scope === null) return next();
      const parsed = z.string().uuid().safeParse(req.params.id);
      const tag = parsed.success ? await repo.getTagRow(parsed.data) : null;
      if (!tag || !scope.includes(tag.organizationId)) return res.status(404).json({ message: "Tag not found" });
      next();
    } catch (err) {
      fail(res, err, "Failed to verify access");
    }
  };

  // Journey and plans: admins only (see journeyRoutes.ts).
  registerJourneyRoutes(app);

  app.get(`${adminBase}/overview`, requireTagManager, async (req, res) => {
    try {
      const { timezoneOffset, organizationId } = z.object({
        timezoneOffset: z.coerce.number().int().min(-840).max(840).default(0),
        organizationId: z.coerce.number().int().positive().optional(),
      }).parse(req.query);
      res.json(await repo.getOverview(new Date(), timezoneOffset, narrowedScope(req, organizationId)));
    } catch (err) {
      fail(res, err, "Failed to load overview");
    }
  });

  // Pieces held per person, for the chips on the stock list. Same scope as the list; counted in SQL, never from a page.
  app.get(`${adminBase}/by-person`, requireTagManager, async (req, res) => {
    try {
      res.json(await repo.countPiecesByPerson(tagScopeOf(req)));
    } catch (err) {
      fail(res, err, "Failed to count pieces per person");
    }
  });

  // Aggregated analytics, optionally scoped to a customer, batch, reseller or product type.
  app.get(`${adminBase}/analytics`, requireTagManager, async (req, res) => {
    try {
      const q = analyticsQuerySchema.parse(req.query);
      const { from, to } = analyticsWindow(q);
      res.json(await repo.getAnalytics({ leadId: q.leadId, batchId: q.batchId, repId: q.repId, productType: q.productType, organizations: tagScopeOf(req) }, from, to));
    } catch (err) {
      fail(res, err, "Failed to load analytics");
    }
  });

  // Per-reseller sales, activations, stock and scans.
  app.get(`${adminBase}/report`, requireTagManager, async (req, res) => {
    try {
      const { from, to } = analyticsWindow(analyticsQuerySchema.parse(req.query));
      res.json(await getTeamReport(from, to, tagScopeOf(req)));
    } catch (err) {
      fail(res, err, "Failed to load report");
    }
  });

  // A single piece outside any batch: production (batches) is the global admin's, so is this.
  app.post(adminBase, requireTagAdmin, async (req, res) => {
    try {
      const tag = await repo.createSingleTag(tagCreateSchema.parse(req.body), userIdOf(req));
      res.status(201).json(await repo.getTagDetail(tag.id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to create tag");
    }
  });

  app.patch(`${adminBase}/:id`, requireTagManager, pieceInScope, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      await repo.updateTag(id, tagPatchSchema.parse(req.body), userIdOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to update tag");
    }
  });

  app.post(`${adminBase}/:id/internal-use`, requireTagManager, pieceInScope, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const { purpose } = z.object({ purpose: z.string().trim().min(1).max(300) }).strict().parse(req.body);
      await repo.setTagInternalUse(id, purpose, userIdOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to move piece to internal use");
    }
  });

  app.post(`${adminBase}/:id/return-to-stock`, requireTagManager, pieceInScope, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const { reason } = z.object({ reason: z.string().trim().min(1).max(300) }).strict().parse(req.body);
      await repo.returnInternalTagToStock(id, reason, userIdOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to return piece to stock");
    }
  });

  app.post(`${adminBase}/:id/damage`, requireTagManager, pieceInScope, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const { reason } = z.object({ reason: z.string().trim().min(1).max(300) }).strict().parse(req.body);
      await repo.markTagDamaged(id, reason, userIdOf(req));
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to mark piece damaged");
    }
  });

  app.post(`${adminBase}/:id/assign`, requireTagManager, pieceInScope, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const target = z
        .object({ leadId: z.number().int().positive().optional(), leadName: optionalText(200) })
        .strict()
        .refine((v) => !!v.leadId !== !!v.leadName, "Send either leadId or leadName")
        .parse(req.body);
      const scope = tagScopeOf(req);
      if (scope !== null && target.leadId) {
        // An organization's owner links its pieces to its own customers.
        const lead = await storage.getSalesLead(target.leadId);
        if (!lead || !scope.includes(lead.organizationId)) return res.status(404).json({ code: "lead_not_found", message: "Customer not found" });
      }
      await repo.assignTag(id, { leadId: target.leadId, leadName: target.leadName ?? undefined }, userIdOf(req), actorOf(req).repId);
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to assign tag");
    }
  });

  for (const action of ["unassign", "retire", "restore"] as const) {
    app.post(`${adminBase}/:id/${action}`, requireTagManager, pieceInScope, async (req, res) => {
      const id = idParam(req, res);
      if (!id) return;
      try {
        const { reason } = actionSchema.parse(req.body ?? {});
        await repo.transitionTag(id, action, actorOf(req), reason);
        res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
      } catch (err) {
        fail(res, err, `Failed to ${action} tag`);
      }
    });
  }

  // Move an unsold, unconfigured piece to another reseller or back to the house (a stock transfer or return).
  app.patch(`${adminBase}/:id/rep`, requireTagManager, pieceInScope, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const { repId } = z.object({ repId: z.number().int().positive().nullable() }).strict().parse(req.body);
      const scope = tagScopeOf(req);
      if (scope !== null) {
        // An organization's owner moves pieces inside it: to one of its people, or back to its own house stock.
        if (repId !== null && !scope.includes(await organizationIdForRep(repId))) return res.status(403).json({ code: "organization_member_inactive", message: "This person is not active in this organization." });
        await repo.setTagRep(id, repId, userIdOf(req), "admin", null, (await repo.getTagRow(id))!.organizationId);
      } else {
        await repo.setTagRep(id, repId, userIdOf(req));
      }
      res.json(await repo.getTagDetail(id, tagBaseUrl(), actorOf(req)));
    } catch (err) {
      fail(res, err, "Failed to change reseller");
    }
  });

  app.get(`${adminBase}/:id/analytics`, requireTagManager, pieceInScope, async (req, res) => {
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
    app.get(`${adminBase}/:id/qr.${format}`, requireTagManager, pieceInScope, async (req, res) => {
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

  // The people these screens hand pieces to and filter by, within the viewer's reach.
  app.get("/api/xpot/admin/tag-people", requireTagManager, async (req, res) => {
    try {
      res.json(await listTagPeople(tagScopeOf(req)));
    } catch (err) {
      fail(res, err, "Failed to load people");
    }
  });

  // Kits: pieces handed to a reseller.
  app.get("/api/xpot/admin/tag-kits", requireTagManager, async (req, res) => {
    try {
      const { repId, organizationId } = z.object({
        repId: z.coerce.number().int().positive().optional(),
        organizationId: z.coerce.number().int().positive().optional(),
      }).parse(req.query);
      // The organization filter is platform management's; viewing as a rep it is ignored, as on the pieces list.
      // An organization's owner only ever gets the kits of the organizations they run.
      const scope = tagScopeOf(req);
      res.json(await repo.listKits(scope !== null ? { repId, scope } : { repId, organizationId: actorOf(req).inManagement ? organizationId : undefined }));
    } catch (err) {
      fail(res, err, "Failed to load kits");
    }
  });

  app.post("/api/xpot/admin/tag-kits", requireTagManager, async (req, res) => {
    try {
      const input = kitSchema.parse(req.body);
      const rep = await storage.getSalesRep(input.repId);
      if (!rep) return res.status(404).json({ message: "Reseller not found" });
      // Hand-outs come from the giver's house stock: the company's, or an organization's owner's own, to their own people
      // (and, for a partner that handles its own distribution, to the people of the organizations linked to it).
      const scope = tagScopeOf(req);
      const targetOrganization = await organizationIdForRep(input.repId);
      const source = handOutSource({
        scope,
        targetOrganizationId: targetOrganization,
        companyOrganizationId: await companyOrganizationId(),
        producers: scope !== null && !scope.includes(targetOrganization) ? await handOutProducers(scope) : [],
      });
      if (!source.ok) return res.status(403).json({ code: "organization_member_inactive", message: "This person is not active in this organization." });
      const policy = rep.costPolicy === "zero" ? "zero" : "acquisition";
      // Acquisition rule: the rep buys the pieces. Zero-cost rule: company stock in the rep's custody (consignment),
      // even when a reference cost is recorded. The person handing out may pick the other ownership for one kit; a
      // purchase, or any kit under the acquisition rule, needs a cost (shared/tagKits.ts).
      const ownershipType = input.ownershipType ?? kitOwnership(policy);
      if (kitCostRequired(policy, ownershipType) && input.unitCostCents === undefined) {
        return res.status(400).json({ code: "tag_cost_required", message: "Unit acquisition cost is required for this partner" });
      }
      res.status(201).json(await repo.deliverKit({ ...input, ownershipType, organizationId: targetOrganization, sourceOrganizationId: source.sourceOrganizationId }, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to deliver kit");
    }
  });

  app.post("/api/xpot/admin/tag-kits/return", requireTagManager, async (req, res) => {
    try {
      const { codes } = z.object({ codes: codeList }).strict().parse(req.body);
      // Each piece goes back into the stock of the organization its kit came from (repo.returnToHouse).
      res.json(await repo.returnToHouse(codes, userIdOf(req), "admin", tagScopeOf(req)));
    } catch (err) {
      fail(res, err, "Failed to return pieces");
    }
  });

  // Dry runs for Distribution: per code, whether it can be handed out / taken back now, and why not. Nothing moves.
  app.post("/api/xpot/admin/tag-kits/check", requireTagManager, async (req, res) => {
    try {
      const scope = tagScopeOf(req);
      res.json(await repo.checkHandOut(kitCheckSchema.parse(req.body), scope ?? [await companyOrganizationId()], scope === null));
    } catch (err) {
      fail(res, err, "Failed to check pieces");
    }
  });

  app.post("/api/xpot/admin/tag-kits/return/check", requireTagManager, async (req, res) => {
    try {
      const { codes } = z.object({ codes: codeList }).strict().parse(req.body);
      res.json(await repo.checkTakeBack(codes, tagScopeOf(req)));
    } catch (err) {
      fail(res, err, "Failed to check pieces");
    }
  });

  // What a kit handed out (its packing list), each piece with where it is now.
  app.get("/api/xpot/admin/tag-kits/:id/items", requireTagManager, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const items = await repo.getKitItems(id, tagScopeOf(req));
      if (!items) return res.status(404).json({ message: "Kit not found" });
      res.json(items);
    } catch (err) {
      fail(res, err, "Failed to load kit");
    }
  });

  app.get("/api/xpot/admin/tag-acquisitions", requireTagManager, async (req, res) => {
    try {
      const { repId } = z.object({ repId: z.coerce.number().int().positive().optional() }).parse(req.query);
      res.json(await listAcquisitions({ repId, organizationIds: tagScopeOf(req) }));
    } catch (err) {
      fail(res, err, "Failed to load acquisitions");
    }
  });

  // Dry run of separating an order: each code as Hand out checks it, plus whether it belongs to this order. Nothing moves.
  app.post("/api/xpot/admin/tag-acquisitions/:id/check", requireTagAdmin, async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ message: "Acquisition not found" });
    try {
      const { codes } = z.object({ codes: codeList }).strict().parse(req.body);
      res.json(await checkAcquisition(id.data, codes));
    } catch (err) {
      if (err instanceof TagSaleError) return res.status(err.status).json({ code: err.code, message: err.message, ...(err.params ? { params: err.params } : {}) });
      fail(res, err, "Failed to check pieces");
    }
  });

  // Separating an order is the platform's: it comes out of the company's stock.
  app.post("/api/xpot/admin/tag-acquisitions/:id/fulfill", requireTagAdmin, async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ message: "Acquisition not found" });
    try {
      const { codes } = z.object({ codes: codeList }).strict().parse(req.body);
      res.json(await fulfillAcquisition(id.data, codes, userIdOf(req)));
    } catch (err) {
      if (err instanceof TagSaleError) return res.status(err.status).json({ code: err.code, message: err.message, ...(err.params ? { params: err.params } : {}) });
      fail(res, err, "Failed to fulfill acquisition");
    }
  });

  // Batches to pick from (Give a kit › From a batch, the Pieces filter). Managers hand out kits too, so they get
  // this read-only list; the batches themselves (production, intake, editing) stay admin-only.
  app.get("/api/xpot/admin/tag-batch-options", requireTagManager, async (req, res) => {
    try {
      res.json(await repo.listBatchOptions(tagScopeOf(req)));
    } catch (err) {
      fail(res, err, "Failed to load batches");
    }
  });

  // Manufacturing batches. A printing branch's Rep Admin reads its own batches and checks their QR codes (the scan
  // station); making, closing, reopening and editing batches stay the admin's.
  const batchInScope = async (req: Request, res: Response, id: string) => {
    const batch = await repo.getBatch(id);
    const scope = productionScopeOf(req);
    if (!batch || (scope !== null && !scope.includes(batch.organizationId))) {
      res.status(404).json({ message: "Batch not found" });
      return null;
    }
    return batch;
  };

  app.get("/api/xpot/admin/tag-batches", requireProductionUser, async (req, res) => {
    try {
      res.json(await repo.listBatches(productionScopeOf(req)));
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

  app.post("/api/xpot/admin/tag-batches/:id/scan", requireProductionUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      if (!(await batchInScope(req, res, id))) return;
      const input = batchScanSchema.parse(req.body);
      const result = await repo.scanTagIntoBatch(id, input.value, input.idempotencyKey ?? null, userIdOf(req));
      res.status(result.alreadyRegistered ? 200 : 201).json(result);
    } catch (err) {
      fail(res, err, "Failed to add piece to batch");
    }
  });

  // Undo a read the intake station just made: the piece goes back to "not received" and stays registered to the batch
  // (stock movements are append-only, so a received piece is never deleted). Refused once anything else happened to
  // it (server/tags/repository.ts undoBatchIntake).
  app.delete("/api/xpot/admin/tag-batches/:id/tags/:tagId", requireProductionUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    const tagId = z.string().uuid().safeParse(req.params.tagId);
    if (!tagId.success) return res.status(404).json({ message: "Tag not found" });
    try {
      if (!(await batchInScope(req, res, id))) return;
      res.json(await repo.undoBatchIntake(id, tagId.data, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to undo the read");
    }
  });

  app.post("/api/xpot/admin/tag-batches/:id/close", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json(await repo.setBatchIntakeStatus(id, "closed", userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to close batch");
    }
  });

  app.post("/api/xpot/admin/tag-batches/:id/reopen", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const { reason } = batchReopenSchema.parse(req.body);
      res.json(await repo.setBatchIntakeStatus(id, "open", userIdOf(req), reason));
    } catch (err) {
      fail(res, err, "Failed to reopen batch");
    }
  });

  app.get("/api/xpot/admin/tag-batches/:id", requireProductionUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const batch = await batchInScope(req, res, id);
      if (!batch) return;
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

  app.get("/api/xpot/admin/tag-batches/:id/export.csv", requireProductionUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const batch = await batchInScope(req, res, id);
      if (!batch) return;
      const csv = buildManufacturingCsv(batch, await repo.getBatchTagsForExport(id), tagBaseUrl(), "svg");
      res.attachment(`${fileSafe(batch.batchCode)}.csv`);
      res.type("text/csv").send(csv);
    } catch (err) {
      fail(res, err, "Failed to export batch");
    }
  });

  app.get("/api/xpot/admin/tag-batches/:id/qr-assets.zip", requireProductionUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const batch = await batchInScope(req, res, id);
      if (!batch) return;
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

  // Desktop NFC provisioners and print benches (admin side). A printing branch's Rep Admin pairs and revokes its own
  // bench; each device works for one organization (the company's unless the admin says otherwise).
  app.get("/api/xpot/admin/tag-provisioners", requireProductionUser, async (req, res) => {
    try {
      res.json(await provisioning.listDevices(productionScopeOf(req)));
    } catch (err) {
      fail(res, err, "Failed to load provisioners");
    }
  });

  app.post("/api/xpot/admin/tag-provisioners", requireProductionUser, async (req, res) => {
    try {
      const { deviceName, organizationId } = z.object({
        deviceName: z.string().trim().min(1, "Name the computer").max(80),
        organizationId: z.number().int().positive().optional(),
      }).strict().parse(req.body);
      const scope = productionScopeOf(req);
      const target = organizationId ?? (scope === null ? await companyOrganizationId() : scope.length === 1 ? scope[0] : null);
      if (target === null) return res.status(400).json({ message: "Choose which organization this computer works for", code: "print_organization_required" });
      if (scope !== null && !scope.includes(target)) return res.status(404).json({ message: "Organization not found", code: "organization_not_found" });
      if (scope === null && !(await printingOrganization(target))) {
        return res.status(409).json({ message: "This organization does not print its own pieces", code: "print_organization_not_printing" });
      }
      res.status(201).json(await provisioning.createPairing(deviceName, userIdOf(req), target));
    } catch (err) {
      fail(res, err, "Failed to create pairing code");
    }
  });

  app.post("/api/xpot/admin/tag-provisioners/:id/revoke", requireProductionUser, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json(await provisioning.revokeDevice(id, userIdOf(req), productionScopeOf(req)));
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
      device: { id: d.id, deviceName: d.deviceName, capabilities: d.capabilities ?? ["nfc"] },
      protocolVersion: PROVISIONER_PROTOCOL_VERSION,
      baseUrl: tagBaseUrl(),
    });
  });

  // Next job for this device, or 204 when there is nothing to do.
  app.post("/api/provisioner/jobs/claim", ...device, async (req, res) => {
    try {
      const job = await provisioning.claimNextJob(req.provisionerDevice!);
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

  // Tags › Production: the catalog, the print queue and the bench's side of it (docs/PRINT_EXECUTION_PLAN.md).
  registerProductionRoutes(app, { device, fail });
}
