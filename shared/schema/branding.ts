// App branding — single-row table holding the independently uploaded square
// app icon, horizontal product logo and PWA manifest fields (name, colors).

import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appBranding = pgTable("app_branding", {
  // Singleton: always id = 1 (enforced by a CHECK in the migration).
  id: integer("id").primaryKey().default(1),
  faviconUrl: text("favicon_url"),
  faviconContentType: text("favicon_content_type"),
  logoUrl: text("logo_url"),
  logoContentType: text("logo_content_type"),
  appName: text("app_name").default("Xpot"),
  shortName: text("short_name").default("Xpot"),
  themeColor: text("theme_color").default("#09090b"),
  backgroundColor: text("background_color").default("#0a0f1e"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AppBranding = typeof appBranding.$inferSelect;
export type InsertAppBranding = typeof appBranding.$inferInsert;
