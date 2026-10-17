// What the app records about its own failures (migrations/0051_system_events.sql).

import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const SYSTEM_EVENT_LEVELS = ["error", "warn"] as const;
export type SystemEventLevel = (typeof SYSTEM_EVENT_LEVELS)[number];

/** Where an event came from. Free text in the table; these are the ones the app writes. */
export const SYSTEM_EVENT_SOURCES = [
  "api",
  "client",
  "prospecting.worker",
  "prospecting.engine",
  "prospecting.route",
  "push",
] as const;
export type SystemEventSource = (typeof SYSTEM_EVENT_SOURCES)[number];

export const systemEvents = pgTable("system_events", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  level: text("level").$type<SystemEventLevel>().notNull(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  detail: text("detail"),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  repId: integer("rep_id"),
  fingerprint: text("fingerprint").notNull(),
});

export type SystemEvent = typeof systemEvents.$inferSelect;
