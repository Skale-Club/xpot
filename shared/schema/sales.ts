import { pgTable, text, serial, integer, timestamp, boolean, jsonb, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth.js";
// Note: in the source project there was a FK to a `vcards` table (Skale Club's vCard feature).
// Xpot is standalone — the column stays for data compatibility but is no longer a FK constraint.

export const salesRepRoleEnum = pgEnum("sales_rep_role", [
  "rep",
  "manager",
  "admin",
]);

export const salesLeadStatusEnum = pgEnum("sales_lead_status", [
  "prospect",
  "lead",
  "active",
  "inactive",
  "customer",
]);

export const salesVisitStatusEnum = pgEnum("sales_visit_status", [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
  "invalid",
  "no_answer",
  "came_back_later",
  "not_interested",
  "follow_up",
  "sale_made",
]);

export const salesVisitValidationEnum = pgEnum("sales_visit_validation_status", [
  "valid",
  "outside_geofence",
  "gps_unavailable",
  "manual_override",
]);

export const salesOpportunityStatusEnum = pgEnum("sales_opportunity_status", [
  "open",
  "won",
  "lost",
  "archived",
]);

export const salesTaskStatusEnum = pgEnum("sales_task_status", [
  "pending",
  "completed",
  "cancelled",
]);

export const salesSyncStatusEnum = pgEnum("sales_sync_status", [
  "pending",
  "synced",
  "failed",
  "needs_review",
]);

export const salesSyncDirectionEnum = pgEnum("sales_sync_direction", [
  "outbound",
  "inbound",
]);

export const salesReps = pgTable("sales_reps", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  team: text("team"),
  role: salesRepRoleEnum("role").notNull().default("rep"),
  vcardId: integer("vcard_id"),
  avatarUrl: text("avatar_url"),
  ghlUserId: text("ghl_user_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: uniqueIndex("sales_reps_user_id_idx").on(table.userId),
  roleIdx: index("sales_reps_role_idx").on(table.role),
}));

export const salesLeads = pgTable("sales_leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  website: text("website"),
  phone: text("phone"),
  email: text("email"),
  industry: text("industry"),
  socialUrls: jsonb("social_urls").$type<{ platform: string; url: string }[]>().default([]),
  photos: jsonb("photos").$type<string[]>().default([]),
  source: text("source").notNull().default("manual"),
  status: salesLeadStatusEnum("status").notNull().default("lead"),
  ownerRepId: integer("owner_rep_id").references(() => salesReps.id),
  territoryName: text("territory_name"),
  ghlContactId: text("ghl_contact_id"),
  ghlCompanyId: text("ghl_company_id"),
  lastVisitAt: timestamp("last_visit_at"),
  nextVisitDueAt: timestamp("next_visit_due_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  ownerIdx: index("sales_leads_owner_idx").on(table.ownerRepId),
  statusIdx: index("sales_leads_status_idx").on(table.status),
  nameIdx: index("sales_leads_name_idx").on(table.name),
}));

export const salesLeadLocations = pgTable("sales_lead_locations", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => salesLeads.id).notNull(),
  label: text("label").notNull().default("Main"),
  addressLine1: text("address_line_1").notNull(),
  addressLine2: text("address_line_2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default("US"),
  lat: text("lat"),
  lng: text("lng"),
  geofenceRadiusMeters: integer("geofence_radius_meters").notNull().default(150),
  isPrimary: boolean("is_primary").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  leadIdx: index("sales_lead_locations_lead_idx").on(table.leadId),
}));

export const salesLeadContacts = pgTable("sales_lead_contacts", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => salesLeads.id).notNull(),
  name: text("name").notNull(),
  jobTitle: text("job_title"),
  email: text("email"),
  phone: text("phone"),
  isPrimary: boolean("is_primary").notNull().default(false),
  ghlContactId: text("ghl_contact_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  leadIdx: index("sales_lead_contacts_lead_idx").on(table.leadId),
}));

export const salesVisits = pgTable("sales_visits", {
  id: serial("id").primaryKey(),
  repId: integer("rep_id").references(() => salesReps.id).notNull(),
  leadId: integer("lead_id").references(() => salesLeads.id).notNull(),
  locationId: integer("location_id").references(() => salesLeadLocations.id),
  status: salesVisitStatusEnum("status").notNull().default("planned"),
  scheduledAt: timestamp("scheduled_at"),
  checkedInAt: timestamp("checked_in_at"),
  checkedOutAt: timestamp("checked_out_at"),
  durationSeconds: integer("duration_seconds"),
  checkInLat: text("check_in_lat"),
  checkInLng: text("check_in_lng"),
  checkOutLat: text("check_out_lat"),
  checkOutLng: text("check_out_lng"),
  distanceFromTargetMeters: integer("distance_from_target_meters"),
  gpsAccuracyMeters: integer("gps_accuracy_meters"),
  validationStatus: salesVisitValidationEnum("validation_status").notNull().default("gps_unavailable"),
  manualOverrideReason: text("manual_override_reason"),
  source: text("source").notNull().default("mobile"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  repIdx: index("sales_visits_rep_idx").on(table.repId),
  leadIdx: index("sales_visits_lead_idx").on(table.leadId),
  statusIdx: index("sales_visits_status_idx").on(table.status),
}));

export const salesVisitNotes = pgTable("sales_visit_notes", {
  id: serial("id").primaryKey(),
  visitId: integer("visit_id").references(() => salesVisits.id).notNull().unique(),
  summary: text("summary"),
  outcome: text("outcome"),
  sentiment: text("sentiment"),
  objections: text("objections"),
  competitorMentioned: text("competitor_mentioned"),
  nextStep: text("next_step"),
  followUpRequired: boolean("follow_up_required").notNull().default(false),
  audioUrl: text("audio_url"),
  audioDurationSeconds: integer("audio_duration_seconds"),
  audioTranscription: text("audio_transcription"),
  createdByRepId: integer("created_by_rep_id").references(() => salesReps.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const salesOpportunitiesLocal = pgTable("sales_opportunities_local", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => salesLeads.id).notNull(),
  repId: integer("rep_id").references(() => salesReps.id).notNull(),
  visitId: integer("visit_id").references(() => salesVisits.id),
  title: text("title").notNull(),
  pipelineKey: text("pipeline_key"),
  stageKey: text("stage_key"),
  value: integer("value").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  status: salesOpportunityStatusEnum("status").notNull().default("open"),
  closeDate: timestamp("close_date"),
  lossReason: text("loss_reason"),
  notes: text("notes"),
  ghlOpportunityId: text("ghl_opportunity_id"),
  syncStatus: salesSyncStatusEnum("sync_status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  leadIdx: index("sales_opportunities_lead_idx").on(table.leadId),
  repIdx: index("sales_opportunities_rep_idx").on(table.repId),
  statusIdx: index("sales_opportunities_status_idx").on(table.status),
}));

export const salesTasks = pgTable("sales_tasks", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => salesLeads.id),
  visitId: integer("visit_id").references(() => salesVisits.id),
  opportunityId: integer("opportunity_id").references(() => salesOpportunitiesLocal.id),
  repId: integer("rep_id").references(() => salesReps.id).notNull(),
  type: text("type").notNull().default("follow_up"),
  title: text("title").notNull(),
  description: text("description"),
  dueAt: timestamp("due_at"),
  status: salesTaskStatusEnum("status").notNull().default("pending"),
  ghlTaskId: text("ghl_task_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  repIdx: index("sales_tasks_rep_idx").on(table.repId),
  statusIdx: index("sales_tasks_status_idx").on(table.status),
}));

export const salesSyncEvents = pgTable("sales_sync_events", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("gohighlevel"),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  direction: salesSyncDirectionEnum("direction").notNull().default("outbound"),
  status: salesSyncStatusEnum("status").notNull().default("pending"),
  payload: jsonb("payload").default({}),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  lastAttemptAt: timestamp("last_attempt_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  entityIdx: index("sales_sync_events_entity_idx").on(table.entityType, table.entityId),
  statusIdx: index("sales_sync_events_status_idx").on(table.status),
}));

export const salesAppSettings = pgTable("sales_app_settings", {
  id: serial("id").primaryKey(),
  checkInRequiresGps: boolean("check_in_requires_gps").notNull().default(true),
  defaultGeofenceRadiusMeters: integer("default_geofence_radius_meters").notNull().default(150),
  allowManualOverride: boolean("allow_manual_override").notNull().default(true),
  offlineQueueEnabled: boolean("offline_queue_enabled").notNull().default(true),
  defaultPipelineKey: text("default_pipeline_key"),
  defaultStageKey: text("default_stage_key"),
  defaultTaskTemplate: text("default_task_template"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSalesRepSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  role: z.enum(salesRepRoleEnum.enumValues as [string, ...string[]]).default("rep"),
  vcardId: z.number().int().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  ghlUserId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const insertSalesLeadSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  industry: z.string().nullable().optional(),
  socialUrls: z.array(z.object({
    platform: z.string(),
    url: z.string()
  })).default([]),
  photos: z.array(z.string()).default([]),
  source: z.string().default("manual"),
  status: z.enum(salesLeadStatusEnum.enumValues as [string, ...string[]]).default("lead"),
  ownerRepId: z.number().int().nullable().optional(),
  territoryName: z.string().nullable().optional(),
  ghlContactId: z.string().nullable().optional(),
  ghlCompanyId: z.string().nullable().optional(),
  lastVisitAt: z.union([z.string(), z.date(), z.null()]).optional(),
  nextVisitDueAt: z.union([z.string(), z.date(), z.null()]).optional(),
  notes: z.string().nullable().optional(),
});

export const insertSalesLeadLocationSchema = z.object({
  leadId: z.number().int(),
  label: z.string().default("Main"),
  addressLine1: z.string().min(1),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  country: z.string().default("US"),
  lat: z.string().nullable().optional(),
  lng: z.string().nullable().optional(),
  geofenceRadiusMeters: z.number().int().default(150),
  isPrimary: z.boolean().default(true),
});

export const insertSalesLeadContactSchema = z.object({
  leadId: z.number().int(),
  name: z.string().min(1),
  jobTitle: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  isPrimary: z.boolean().default(false),
  ghlContactId: z.string().nullable().optional(),
});

export const insertSalesVisitSchema = z.object({
  repId: z.number().int(),
  leadId: z.number().int(),
  locationId: z.number().int().nullable().optional(),
  status: z.enum(salesVisitStatusEnum.enumValues as [string, ...string[]]).default("planned"),
  scheduledAt: z.union([z.string(), z.date(), z.null()]).optional(),
  checkedInAt: z.union([z.string(), z.date(), z.null()]).optional(),
  checkedOutAt: z.union([z.string(), z.date(), z.null()]).optional(),
  durationSeconds: z.number().int().nullable().optional(),
  checkInLat: z.string().nullable().optional(),
  checkInLng: z.string().nullable().optional(),
  checkOutLat: z.string().nullable().optional(),
  checkOutLng: z.string().nullable().optional(),
  distanceFromTargetMeters: z.number().int().nullable().optional(),
  gpsAccuracyMeters: z.number().int().nullable().optional(),
  validationStatus: z.enum(salesVisitValidationEnum.enumValues as [string, ...string[]]).default("gps_unavailable"),
  manualOverrideReason: z.string().nullable().optional(),
  source: z.string().default("mobile"),
});

export const insertSalesVisitNoteSchema = z.object({
  visitId: z.number().int(),
  summary: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  sentiment: z.string().nullable().optional(),
  objections: z.string().nullable().optional(),
  competitorMentioned: z.string().nullable().optional(),
  nextStep: z.string().nullable().optional(),
  followUpRequired: z.boolean().default(false),
  audioUrl: z.string().nullable().optional(),
  audioDurationSeconds: z.number().int().nullable().optional(),
  audioTranscription: z.string().nullable().optional(),
  createdByRepId: z.number().int().nullable().optional(),
});

export const insertSalesOpportunitySchema = z.object({
  leadId: z.number().int(),
  repId: z.number().int(),
  visitId: z.number().int().nullable().optional(),
  title: z.string().min(1),
  pipelineKey: z.string().nullable().optional(),
  stageKey: z.string().nullable().optional(),
  value: z.number().int().default(0),
  currency: z.string().default("USD"),
  status: z.enum(salesOpportunityStatusEnum.enumValues as [string, ...string[]]).default("open"),
  closeDate: z.union([z.string(), z.date(), z.null()]).optional(),
  lossReason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  ghlOpportunityId: z.string().nullable().optional(),
  syncStatus: z.enum(salesSyncStatusEnum.enumValues as [string, ...string[]]).default("pending"),
});

export const insertSalesTaskSchema = z.object({
  leadId: z.number().int().nullable().optional(),
  visitId: z.number().int().nullable().optional(),
  opportunityId: z.number().int().nullable().optional(),
  repId: z.number().int(),
  type: z.string().default("follow_up"),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  dueAt: z.union([z.string(), z.date(), z.null()]).optional(),
  status: z.enum(salesTaskStatusEnum.enumValues as [string, ...string[]]).default("pending"),
  ghlTaskId: z.string().nullable().optional(),
});

export const insertSalesSyncEventSchema = z.object({
  provider: z.string().default("gohighlevel"),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  direction: z.enum(salesSyncDirectionEnum.enumValues as [string, ...string[]]).default("outbound"),
  status: z.enum(salesSyncStatusEnum.enumValues as [string, ...string[]]).default("pending"),
  payload: z.any().default({}),
  attemptCount: z.number().int().default(0),
  lastError: z.string().nullable().optional(),
  lastAttemptAt: z.union([z.string(), z.date(), z.null()]).optional(),
});

export const insertSalesAppSettingsSchema = z.object({
  checkInRequiresGps: z.boolean().default(true),
  defaultGeofenceRadiusMeters: z.number().int().default(150),
  allowManualOverride: z.boolean().default(true),
  offlineQueueEnabled: z.boolean().default(true),
  defaultPipelineKey: z.string().nullable().optional(),
  defaultStageKey: z.string().nullable().optional(),
  defaultTaskTemplate: z.string().nullable().optional(),
});

export type SalesRep = typeof salesReps.$inferSelect;
export type InsertSalesRep = typeof salesReps.$inferInsert;
export type SalesRepRole = typeof salesRepRoleEnum.enumValues[number];

export type SalesLead = typeof salesLeads.$inferSelect;
export type InsertSalesLead = typeof salesLeads.$inferInsert;

export type SalesLeadLocation = typeof salesLeadLocations.$inferSelect;
export type InsertSalesLeadLocation = typeof salesLeadLocations.$inferInsert;

export type SalesLeadContact = typeof salesLeadContacts.$inferSelect;
export type InsertSalesLeadContact = typeof salesLeadContacts.$inferInsert;

export type SalesVisit = typeof salesVisits.$inferSelect;
export type InsertSalesVisit = typeof salesVisits.$inferInsert;
export type SalesVisitStatus = typeof salesVisitStatusEnum.enumValues[number];
export type SalesVisitValidationStatus = typeof salesVisitValidationEnum.enumValues[number];

export type SalesVisitNote = typeof salesVisitNotes.$inferSelect;
export type InsertSalesVisitNote = typeof salesVisitNotes.$inferInsert;

export type SalesOpportunity = typeof salesOpportunitiesLocal.$inferSelect;
export type InsertSalesOpportunity = typeof salesOpportunitiesLocal.$inferInsert;
export type SalesOpportunityStatus = typeof salesOpportunityStatusEnum.enumValues[number];

export type SalesTask = typeof salesTasks.$inferSelect;
export type InsertSalesTask = typeof salesTasks.$inferInsert;
export type SalesTaskStatus = typeof salesTaskStatusEnum.enumValues[number];

export type SalesSyncEvent = typeof salesSyncEvents.$inferSelect;
export type InsertSalesSyncEvent = typeof salesSyncEvents.$inferInsert;
export type SalesSyncStatus = typeof salesSyncStatusEnum.enumValues[number];

export type SalesAppSettings = typeof salesAppSettings.$inferSelect;
export type InsertSalesAppSettings = typeof salesAppSettings.$inferInsert;
