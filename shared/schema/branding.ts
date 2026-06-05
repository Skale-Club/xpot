// App branding — single-row table holding the admin-uploaded favicon/icon and
// PWA manifest fields (name, colors). Consumed by the public /api/branding/*
// endpoints that feed favicon, apple-touch-icon, the web manifest and OG tags.

import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appBranding = pgTable("app_branding", {
  // Singleton: always id = 1 (enforced by a CHECK in the migration).
  id: integer("id").primaryKey().default(1),
  faviconUrl: text("favicon_url"),
  faviconContentType: text("favicon_content_type"),
  appName: text("app_name").default("Xpot"),
  shortName: text("short_name").default("Xpot"),
  themeColor: text("theme_color").default("#09090b"),
  backgroundColor: text("background_color").default("#0a0f1e"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AppBranding = typeof appBranding.$inferSelect;
export type InsertAppBranding = typeof appBranding.$inferInsert;
