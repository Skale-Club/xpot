// Xpot Tags — physical QR/NFC pieces (Google Review signs, NFC keychains,
// cards...). One `tags` row per piece; its public code is printed (QR) and
// programmed (NFC) once and never changes, while the destination lives here.
//
// Skale Club supplies the pieces. A reseller (sales_reps) receives them in a
// kit (tags.rep_id) and sells them to businesses, which are Xpot leads
// (tags.lead_id). SQL: migrations/0009_tags.sql. Enum-like columns are text
// guarded by CHECK constraints there; the allowed values are in shared/tags.ts.

import { sql } from "drizzle-orm";
import { bigserial, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { salesLeads, salesReps } from "./sales.js";

export const tagBatches = pgTable("tag_batches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  batchCode: text("batch_code").notNull(),
  name: text("name").notNull(),
  productType: text("product_type").notNull(),
  vendor: text("vendor"),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("generated"),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  batchCodeIdx: uniqueIndex("tag_batches_batch_code_unique").on(table.batchCode),
}));

/** One hand-over of pieces to a reseller (agreed on WhatsApp for now). */
export const tagKits = pgTable("tag_kits", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  repId: integer("rep_id").notNull().references(() => salesReps.id),
  note: text("note"),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  repIdx: index("tag_kits_rep_idx").on(table.repId, table.createdAt),
}));

export const tagProvisioningDevices = pgTable("tag_provisioning_devices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceName: text("device_name").notNull(),
  platform: text("platform"),
  appVersion: text("app_version"),
  status: text("status").notNull().default("pairing"),
  pairingCodeHash: text("pairing_code_hash"),
  pairingExpiresAt: timestamp("pairing_expires_at", { withTimezone: true }),
  tokenHash: text("token_hash"),
  tokenPrefix: text("token_prefix"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  pairedAt: timestamp("paired_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  publicCode: text("public_code").notNull(),
  // Position inside its batch (1-based); the manufacturing CSV's serial_number.
  serialNumber: integer("serial_number"),
  batchId: uuid("batch_id").references(() => tagBatches.id, { onDelete: "set null" }),
  // The reseller holding the piece: in their kit while unsold, credited once sold.
  repId: integer("rep_id").references(() => salesReps.id, { onDelete: "set null" }),
  kitId: uuid("kit_id").references(() => tagKits.id, { onDelete: "set null" }),
  // The business the piece was sold to.
  leadId: integer("lead_id").references(() => salesLeads.id, { onDelete: "set null" }),
  productType: text("product_type").notNull(),
  status: text("status").notNull().default("inventory"),
  destinationType: text("destination_type"),
  destinationUrl: text("destination_url"),
  utmEnabled: boolean("utm_enabled").notNull().default(false),
  utmCampaign: text("utm_campaign"),
  label: text("label"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  // First activation for a customer: when the sale counts. Never moves after.
  soldAt: timestamp("sold_at", { withTimezone: true }),
  activatedByRepId: integer("activated_by_rep_id").references(() => salesReps.id, { onDelete: "set null" }),
  // Physical NFC chip state (phone writes and the desktop provisioner).
  nfcProvisioningStatus: text("nfc_provisioning_status").notNull().default("not_programmed"),
  nfcProgrammedAt: timestamp("nfc_programmed_at", { withTimezone: true }),
  nfcVerifiedAt: timestamp("nfc_verified_at", { withTimezone: true }),
  nfcLockedAt: timestamp("nfc_locked_at", { withTimezone: true }),
  nfcProvisioningDeviceId: uuid("nfc_provisioning_device_id").references(() => tagProvisioningDevices.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  publicCodeIdx: uniqueIndex("tags_public_code_unique").on(table.publicCode),
  repIdx: index("tags_rep_idx").on(table.repId, table.status),
  leadIdx: index("tags_lead_idx").on(table.leadId),
  batchIdx: index("tags_batch_idx").on(table.batchId),
  statusIdx: index("tags_status_idx").on(table.status),
}));

// Append-only: every destination/type change writes one row, never updated.
export const tagDestinationHistory = pgTable("tag_destination_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  previousUrl: text("previous_url"),
  newUrl: text("new_url"),
  previousDestinationType: text("previous_destination_type"),
  newDestinationType: text("new_destination_type"),
  changedByUserId: text("changed_by_user_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tagIdx: index("tag_destination_history_tag_idx").on(table.tagId, table.createdAt.desc()),
}));

// One row per public QR scan / NFC tap. No raw IP is ever stored: approximate
// uniques use `visitor_day_key`, a daily-rotating HMAC (server/tags/requestInfo.ts).
export const tagEvents = pgTable("tag_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  // Customer and reseller at the time of the event, so a piece that changes
  // hands never moves past interactions onto its new owner's numbers.
  leadId: integer("lead_id").references(() => salesLeads.id, { onDelete: "set null" }),
  repId: integer("rep_id").references(() => salesReps.id, { onDelete: "set null" }),
  accessMethod: text("access_method").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  visitorDayKey: text("visitor_day_key"),
  deviceType: text("device_type"),
  osFamily: text("os_family"),
  browserFamily: text("browser_family"),
  countryCode: text("country_code"),
  referrer: text("referrer"),
  isBot: boolean("is_bot").notNull().default(false),
  requestId: text("request_id"),
}, (table) => ({
  tagOccurredIdx: index("tag_events_tag_occurred_idx").on(table.tagId, table.occurredAt),
  occurredIdx: index("tag_events_occurred_idx").on(table.occurredAt),
  leadOccurredIdx: index("tag_events_lead_occurred_idx").on(table.leadId, table.occurredAt),
  repOccurredIdx: index("tag_events_rep_occurred_idx").on(table.repId, table.occurredAt),
}));

export const tagProvisioningJobs = pgTable("tag_provisioning_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  expectedUrl: text("expected_url").notNull(),
  status: text("status").notNull().default("pending"),
  requestedByUserId: text("requested_by_user_id"),
  targetDeviceId: uuid("target_device_id").references(() => tagProvisioningDevices.id, { onDelete: "set null" }),
  claimedByDeviceId: uuid("claimed_by_device_id").references(() => tagProvisioningDevices.id, { onDelete: "set null" }),
  readbackUrl: text("readback_url"),
  tagType: text("tag_type"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tagProvisioningEvents = pgTable("tag_provisioning_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jobId: uuid("job_id").references(() => tagProvisioningJobs.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => tagProvisioningDevices.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Chips written with the customer's own URL, no redirect. Log only.
export const tagDirectWrites = pgTable("tag_direct_writes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: integer("lead_id").references(() => salesLeads.id, { onDelete: "set null" }),
  repId: integer("rep_id").references(() => salesReps.id, { onDelete: "set null" }),
  url: text("url").notNull(),
  label: text("label"),
  method: text("method").notNull().default("web_nfc"),
  verified: boolean("verified").notNull().default(false),
  writtenByUserId: text("written_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  repIdx: index("tag_direct_writes_rep_idx").on(table.repId, table.createdAt.desc()),
}));

// ─── Journey (story, planning, execution) ────────────────────────────────────
// SQL: migrations/0014_tag_journey.sql. Allowed values: shared/tagJourney.ts.
// Admin-only; resellers never read these tables through the API.

export const tagPlans = pgTable("tag_plans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  batchId: uuid("batch_id").references(() => tagBatches.id, { onDelete: "set null" }),
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "set null" }),
  kitId: uuid("kit_id").references(() => tagKits.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => salesLeads.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  outcome: text("outcome"),
  dueDate: date("due_date", { mode: "string" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (table) => ({
  statusIdx: index("tag_plans_status_idx").on(table.status, table.createdAt.desc()),
}));

// Append-only timeline; a DB trigger lets UPDATE change `status` only.
export const tagJourneyEntries = pgTable("tag_journey_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: text("kind").notNull(),
  action: text("action"),
  title: text("title").notNull(),
  content: text("content"),
  batchId: uuid("batch_id").references(() => tagBatches.id, { onDelete: "set null" }),
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "set null" }),
  kitId: uuid("kit_id").references(() => tagKits.id, { onDelete: "set null" }),
  // The reseller the entry is about.
  repId: integer("rep_id").references(() => salesReps.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => salesLeads.id, { onDelete: "set null" }),
  planId: uuid("plan_id").references(() => tagPlans.id, { onDelete: "set null" }),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  source: text("source").notNull(),
  actor: text("actor").notNull(),
  actorUserId: text("actor_user_id"),
  // Who acted, when it was a reseller in the field app.
  actorRepId: integer("actor_rep_id").references(() => salesReps.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  occurredIdx: index("tag_journey_entries_occurred_idx").on(table.occurredAt.desc()),
}));

export type TagBatch = typeof tagBatches.$inferSelect;
export type TagKit = typeof tagKits.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type TagDestinationChange = typeof tagDestinationHistory.$inferSelect;
export type TagEvent = typeof tagEvents.$inferSelect;
export type InsertTagEvent = typeof tagEvents.$inferInsert;
export type TagProvisioningDevice = typeof tagProvisioningDevices.$inferSelect;
export type TagProvisioningJob = typeof tagProvisioningJobs.$inferSelect;
export type TagDirectWrite = typeof tagDirectWrites.$inferSelect;
export type TagPlan = typeof tagPlans.$inferSelect;
export type TagJourneyEntry = typeof tagJourneyEntries.$inferSelect;
export type InsertTagJourneyEntry = typeof tagJourneyEntries.$inferInsert;
