import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { LandingPageContent } from "../landingContent.js";

/** One complete, independently publishable landing-page document per locale. */
export const landingPageContents = pgTable("landing_page_contents", {
  locale: text("locale").primaryKey(),
  content: jsonb("content").$type<LandingPageContent>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LandingPageContentRow = typeof landingPageContents.$inferSelect;
export type InsertLandingPageContentRow = typeof landingPageContents.$inferInsert;

