import { z } from "zod";

// Base types for validation schemas (avoiding drizzle-zod .pick/.omit breakage)
export const xpotCheckInSchema = z.object({
  leadId: z.number().int().positive(),
  locationId: z.number().int().positive().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  gpsAccuracyMeters: z.number().int().nonnegative().nullable().optional(),
  manualOverrideReason: z.string().max(500).optional(),
});

export const xpotCheckOutSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  status: z.string().optional(),
});

export const xpotVisitNoteUpsertSchema = z.object({
  summary: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  sentiment: z.string().nullable().optional(),
  objections: z.string().nullable().optional(),
  competitorMentioned: z.string().nullable().optional(),
  nextStep: z.string().nullable().optional(),
  followUpRequired: z.boolean().optional(),
  audioUrl: z.string().nullable().optional(),
  audioDurationSeconds: z.number().int().nullable().optional(),
});

// lat/lng live in text columns, but every producer hands us numbers: Google
// Places returns them as numbers and so does the browser's geolocation API.
// Rejecting those was failing every "create lead from a place" check-in, so the
// boundary accepts either shape and normalizes to the stored one.
const coordinate = z
  .union([z.string(), z.number().transform(String)])
  .nullable()
  .optional();

export const xpotLeadCreateSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  industry: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["prospect", "lead", "active", "inactive", "customer"]).optional(),
  source: z.string().optional(),
  socialUrls: z.array(z.object({
    platform: z.string(),
    url: z.string()
  })).optional(),
  ownerRepId: z.number().int().nullable().optional(),
  territoryName: z.string().nullable().optional(),
  primaryLocation: z.object({
    label: z.string().optional(),
    addressLine1: z.string().min(1),
    addressLine2: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    postalCode: z.string().nullable().optional(),
    country: z.string().optional(),
    lat: coordinate,
    lng: coordinate,
    geofenceRadiusMeters: z.number().int().optional(),
    isPrimary: z.boolean().optional(),
  }).optional(),
});

export const xpotLeadUpdateSchema = xpotLeadCreateSchema.partial();

export const xpotLeadContactCreateSchema = z.object({
  name: z.string().min(1),
  jobTitle: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

export const xpotOpportunityCreateSchema = z.object({
  leadId: z.number().int().positive(),
  visitId: z.number().int().positive().nullable().optional(),
  title: z.string().min(1),
  pipelineKey: z.string().nullable().optional(),
  stageKey: z.string().nullable().optional(),
  currency: z.string().optional(),
  closeDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  notes: z.string().nullable().optional(),
  value: z.number().optional().default(0),
});

export const xpotOpportunityUpdateSchema = z.object({
  title: z.string().optional(),
  pipelineKey: z.string().nullable().optional(),
  stageKey: z.string().nullable().optional(),
  value: z.number().optional(),
  currency: z.string().optional(),
  status: z.enum(["open", "won", "lost", "archived"]).optional(),
  closeDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  lossReason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).partial();

export const xpotTaskCreateSchema = z.object({
  leadId: z.number().int().nullable().optional(),
  visitId: z.number().int().nullable().optional(),
  opportunityId: z.number().int().nullable().optional(),
  type: z.string().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  dueAt: z.string().optional().transform(val => val ? new Date(val) : undefined),
});

export const xpotTaskUpdateSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  dueAt: z.string().optional().transform(val => val ? new Date(val) : undefined),
  status: z.enum(["completed", "cancelled", "pending"]).optional(),
}).partial();

export type XpotCheckInInput = z.infer<typeof xpotCheckInSchema>;
export type XpotCheckOutInput = z.infer<typeof xpotCheckOutSchema>;
export type XpotVisitNoteUpsertInput = z.infer<typeof xpotVisitNoteUpsertSchema>;
export type XpotLeadCreateInput = z.infer<typeof xpotLeadCreateSchema>;
export type XpotLeadUpdateInput = z.infer<typeof xpotLeadUpdateSchema>;
export type XpotLeadContactCreateInput = z.infer<typeof xpotLeadContactCreateSchema>;
export type XpotOpportunityCreateInput = z.infer<typeof xpotOpportunityCreateSchema>;
export type XpotOpportunityUpdateInput = z.infer<typeof xpotOpportunityUpdateSchema>;
export type XpotTaskCreateInput = z.infer<typeof xpotTaskCreateSchema>;
export type XpotTaskUpdateInput = z.infer<typeof xpotTaskUpdateSchema>;

// ─── Sales module ────────────────────────────────────────────────────────────

const cents = z.number().int().nonnegative();
const positiveInt = z.number().int().positive();

export const xpotProductUpsertSchema = z.object({
  sku: z.string().trim().max(60).nullable().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  kind: z.enum(["digital", "physical"]).optional(),
  category: z.string().trim().max(60).nullable().optional(),
  unitLabel: z.string().trim().min(1).max(30).optional(),
  basePriceCents: cents.optional(),
  suggestedRetailCents: cents.nullable().optional(),
  costCents: cents.nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  consignable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const xpotPriceTiersReplaceSchema = z.object({
  tiers: z.array(z.object({
    label: z.string().trim().max(60).nullable().optional(),
    minQuantity: positiveInt,
    unitPriceCents: cents,
  })).max(20),
});

export const xpotPaymentMethodSchema = z.enum(["cash", "card", "pix", "transfer", "invoice", "other"]);

export const xpotSaleItemInputSchema = z.object({
  productId: positiveInt.nullable().optional(),
  description: z.string().trim().max(200).optional(),
  quantity: positiveInt,
  // Omit to let the server price from the catalog (tiers by quantity).
  unitPriceCents: cents.optional(),
}).refine((item) => item.productId || (item.description && item.description.length > 0), {
  message: "Each item needs a product or a description",
});

export const xpotSaleCreateSchema = z.object({
  leadId: positiveInt,
  visitId: positiveInt.nullable().optional(),
  items: z.array(xpotSaleItemInputSchema).min(1).max(50),
  discountCents: cents.optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  paymentMethod: xpotPaymentMethodSchema.nullable().optional(),
  paidCents: cents.optional(),
  soldAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const xpotSalePaymentSchema = z.object({
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  paymentMethod: xpotPaymentMethodSchema.nullable().optional(),
  paidCents: cents.optional(),
});

export const xpotSaleCancelSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
});

export const xpotConsignmentDepositSchema = z.object({
  leadId: positiveInt,
  productId: positiveInt,
  quantity: positiveInt,
  // Agreed B2B unit price; omit to price from the catalog for this quantity.
  unitPriceCents: cents.optional(),
  settlementIntervalDays: z.number().int().min(1).max(365).optional(),
  visitId: positiveInt.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const xpotConsignmentSettleSchema = z.object({
  // What the rep physically counted on the shelf.
  countedRemaining: z.number().int().nonnegative(),
  // Units left behind after the count (new stock for the next cycle).
  restockQuantity: z.number().int().nonnegative().optional(),
  // Override the agreed price for this settlement only.
  unitPriceCents: cents.optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  paymentMethod: xpotPaymentMethodSchema.nullable().optional(),
  paidCents: cents.optional(),
  visitId: positiveInt.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const xpotConsignmentReturnSchema = z.object({
  quantity: positiveInt,
  // Close the agreement once the stock is picked up.
  close: z.boolean().optional(),
  visitId: positiveInt.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const xpotConsignmentAdjustSchema = z.object({
  // Signed: +N found extra, -N lost/damaged.
  delta: z.number().int().refine((n) => n !== 0, { message: "delta must be non-zero" }),
  visitId: positiveInt.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const xpotConsignmentUpdateSchema = z.object({
  unitPriceCents: cents.optional(),
  settlementIntervalDays: z.number().int().min(1).max(365).optional(),
  nextVisitDueAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type XpotProductUpsertInput = z.infer<typeof xpotProductUpsertSchema>;
export type XpotPriceTiersReplaceInput = z.infer<typeof xpotPriceTiersReplaceSchema>;
export type XpotSaleCreateInput = z.infer<typeof xpotSaleCreateSchema>;
export type XpotSalePaymentInput = z.infer<typeof xpotSalePaymentSchema>;
export type XpotConsignmentDepositInput = z.infer<typeof xpotConsignmentDepositSchema>;
export type XpotConsignmentSettleInput = z.infer<typeof xpotConsignmentSettleSchema>;
export type XpotConsignmentReturnInput = z.infer<typeof xpotConsignmentReturnSchema>;
export type XpotConsignmentAdjustInput = z.infer<typeof xpotConsignmentAdjustSchema>;
export type XpotConsignmentUpdateInput = z.infer<typeof xpotConsignmentUpdateSchema>;
