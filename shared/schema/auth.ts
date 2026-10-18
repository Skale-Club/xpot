// Auth schema — users + sessions (Express session store).
// Xpot has its own dedicated Supabase project; nothing here is shared.

import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// connect-pg-simple session store
export const sessions = pgTable(
  "sessions",
  {
    sid: text("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// Supabase Auth users, mirrored into this table on every server-side login.
export const users = pgTable("users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  // Sign-in identity, E.164 ("+15085550100"); migrations/0012_phone_login.sql.
  phone: text("phone"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const upsertUserSchema = createInsertSchema(users);

// One-time sign-in codes sent by SMS (hashed, short-lived).
export const authPhoneCodes = pgTable("auth_phone_codes", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  ip: text("ip"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Short application completed after a new phone number is verified. Access is
// still controlled by sales_reps.is_active; this row keeps the contact/context
// the team needs to review the request instead of turning signup into access.
export const authAccessRequests = pgTable("auth_access_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  workCity: text("work_city"),
  workRegion: text("work_region"),
  occupation: text("occupation"),
  availability: text("availability"),
  hasVehicle: boolean("has_vehicle"),
  languages: text("languages").array().default(sql`'{}'::text[]`),
  otherLanguages: text("other_languages"),
  salesExperience: text("sales_experience"),
  fieldSalesReadiness: text("field_sales_readiness"),
  kitInvestmentAcknowledged: boolean("kit_investment_acknowledged").default(false),
  activeSellerAcknowledged: boolean("active_seller_acknowledged").default(false),
  message: text("message"),
  status: text("status").notNull().default("draft"),
  draftStep: integer("draft_step").notNull().default(0),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
  abandonedNotifiedAt: timestamp("abandoned_notified_at"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (table) => [index("auth_access_requests_status_idx").on(table.status, table.submittedAt)]);

export type AuthAccessRequest = typeof authAccessRequests.$inferSelect;
