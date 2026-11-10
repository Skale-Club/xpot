// Where the Academy reads its Notion content from: the "notion" row of Admin > Integrations (token in api_key, the
// two database ids in config), with the NOTION_* environment as a development-only fallback.

import { storage } from "../storage.js";

export type NotionConfig = { token: string; coursesDb: string; lessonsDb: string };
type Env = Record<string, string | undefined>;

/** Dashes and spaces do not matter in a pasted id; a Notion URL may have been pasted whole. */
export function normalizeNotionId(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  const match = /([0-9a-f]{32})(?:[?#].*)?$/i.exec(value.replace(/-/g, ""));
  return match ? match[1].toLowerCase() : value;
}

export function envNotionConfig(env: Env = process.env): NotionConfig | null {
  if (env.NODE_ENV === "production") return null;
  const token = env.NOTION_TOKEN?.trim();
  const coursesDb = normalizeNotionId(env.NOTION_ACADEMY_COURSES_DB);
  const lessonsDb = normalizeNotionId(env.NOTION_ACADEMY_LESSONS_DB);
  return token && coursesDb && lessonsDb ? { token, coursesDb, lessonsDb } : null;
}

/** The panel's settings when switched on and complete, else the development environment, else null. */
export async function loadNotionConfig(env: Env = process.env): Promise<NotionConfig | null> {
  const row = await storage.getIntegrationSettings("notion");
  const config = (row?.config ?? {}) as Record<string, string | undefined>;
  const coursesDb = normalizeNotionId(config.coursesDatabaseId);
  const lessonsDb = normalizeNotionId(config.lessonsDatabaseId);
  if (row?.isEnabled && row.apiKey && coursesDb && lessonsDb) return { token: row.apiKey, coursesDb, lessonsDb };
  return envNotionConfig(env);
}
