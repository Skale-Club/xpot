import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  organizations,
  salesLeads,
  salesReps,
  salesProducts,
  salesSales,
  salesVisits,
  salesOpportunitiesLocal,
} from "./sales.js";
import { tags, printModels, printModelVersions } from "./tags.js";

export const customerOrders = pgTable("customer_orders", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => salesLeads.id, { onDelete: "restrict" }),
  repId: integer("rep_id")
    .notNull()
    .references(() => salesReps.id, { onDelete: "restrict" }),
  visitId: integer("visit_id").references(() => salesVisits.id, {
    onDelete: "set null",
  }),
  opportunityId: integer("opportunity_id").references(
    () => salesOpportunitiesLocal.id,
    { onDelete: "restrict" },
  ),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("open"),
  revision: integer("revision").notNull().default(1),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const customerOrderLines = pgTable("customer_order_lines", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderId: uuid("order_id")
    .notNull()
    .references(() => customerOrders.id, { onDelete: "restrict" }),
  sequence: integer("sequence").notNull(),
  quantity: integer("quantity").notNull(),
  cancelledQuantity: integer("cancelled_quantity").notNull().default(0),
  description: text("description").notNull(),
  salesProductId: integer("sales_product_id")
    .notNull()
    .references(() => salesProducts.id, { onDelete: "restrict" }),
  productType: text("product_type").notNull(),
  face: text("face").notNull(),
  theme: text("theme"),
  unitPriceCents: integer("unit_price_cents").notNull(),
  producerOrganizationId: integer("producer_organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  modelId: uuid("model_id").references(() => printModels.id, {
    onDelete: "restrict",
  }),
  versionId: uuid("version_id").references(() => printModelVersions.id, {
    onDelete: "restrict",
  }),
  custom: text("custom").notNull().default("standard"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const customerOrderDeliveries = pgTable("customer_order_deliveries", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderId: uuid("order_id")
    .notNull()
    .references(() => customerOrders.id, { onDelete: "restrict" }),
  saleId: integer("sale_id")
    .notNull()
    .references(() => salesSales.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("confirmed"),
  actorUserId: text("actor_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const customerOrderPieces = pgTable("customer_order_pieces", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  lineId: uuid("line_id")
    .notNull()
    .references(() => customerOrderLines.id, { onDelete: "restrict" }),
  tagId: uuid("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "restrict" }),
  state: text("state").notNull().default("allocated"),
  deliveryId: uuid("delivery_id").references(() => customerOrderDeliveries.id, {
    onDelete: "restrict",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const customerOrderEvents = pgTable(
  "customer_order_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => customerOrders.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    commandKey: text("command_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    command: uniqueIndex("customer_order_events_command_unique").on(
      t.actorUserId,
      t.commandKey,
    ),
  }),
);
export const customerOrderPayments = pgTable("customer_order_payments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderId: uuid("order_id")
    .notNull()
    .references(() => customerOrders.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  amountCents: integer("amount_cents").notNull(),
  paymentMethod: text("payment_method"),
  deliveryId: uuid("delivery_id").references(() => customerOrderDeliveries.id, {
    onDelete: "restrict",
  }),
  referenceId: uuid("reference_id"),
  reason: text("reason").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const customerOrderArtwork = pgTable("customer_order_artwork", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  lineId: uuid("line_id")
    .notNull()
    .references(() => customerOrderLines.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  fileRef: text("file_ref"),
  filename: text("filename"),
  contentType: text("content_type"),
  sha256: text("sha256"),
  status: text("status").notNull().default("proposed"),
  approvedBy: text("approved_by"),
  approvalMethod: text("approval_method"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
