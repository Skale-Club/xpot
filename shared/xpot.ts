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
    lat: z.string().nullable().optional(),
    lng: z.string().nullable().optional(),
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
