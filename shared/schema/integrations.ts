// Integration settings — minimal subset Xpot reads.
// chat_integrations is read for AI-related toggles (not used yet but kept for parity).
// integration_settings holds the GoHighLevel apiKey + locationId.

import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const chatIntegrations = pgTable("chat_integrations", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("openai"),
  enabled: boolean("enabled").default(false),
  model: text("model").default("gpt-4o-mini"),
  presentationModel: text("presentation_model"),
  apiKey: text("api_key"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ChatIntegration = typeof chatIntegrations.$inferSelect;

export const integrationSettings = pgTable("integration_settings", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("gohighlevel"),
  apiKey: text("api_key"),
  locationId: text("location_id"),
  calendarId: text("calendar_id").default("2irhr47AR6K0AQkFqEQl"),
  isEnabled: boolean("is_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type IntegrationSettings = typeof integrationSettings.$inferSelect;
