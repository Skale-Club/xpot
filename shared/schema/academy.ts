// Academy: what each person did in each lesson (migrations/0084_academy.sql). The courses themselves live in Notion.

import { sql } from "drizzle-orm";
import { bigserial, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, salesReps } from "./sales.js";

/** One row per person and lesson; heartbeats update it, nothing else writes it. */
export const academyLessonProgress = pgTable("academy_lesson_progress", {
  repId: integer("rep_id").notNull().references(() => salesReps.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  courseId: text("course_id").notNull(),
  lessonId: text("lesson_id").notNull(),
  firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  activeSeconds: integer("active_seconds").notNull().default(0),
  videoDurationSeconds: integer("video_duration_seconds"),
  videoWatchedRanges: jsonb("video_watched_ranges").$type<Array<[number, number]>>().notNull().default(sql`'[]'::jsonb`),
  videoWatchedSeconds: integer("video_watched_seconds").notNull().default(0),
  maxScrollPct: integer("max_scroll_pct").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  openCount: integer("open_count").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.repId, table.lessonId] }),
  courseIdx: index("academy_lesson_progress_course_idx").on(table.courseId),
}));

/** Append-only timeline (open, play, ended, complete, reopen). Heartbeats are not events. */
export const academyEvents = pgTable("academy_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  repId: integer("rep_id").notNull().references(() => salesReps.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  courseId: text("course_id").notNull(),
  lessonId: text("lesson_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  repIdx: index("academy_events_rep_idx").on(table.repId, table.createdAt.desc()),
  courseIdx: index("academy_events_course_idx").on(table.courseId),
}));

export type AcademyLessonProgress = typeof academyLessonProgress.$inferSelect;
export type AcademyEvent = typeof academyEvents.$inferSelect;
