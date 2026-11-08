// Academy content sources: Notion (the real one) and a development-only fixture. Both answer the same questions;
// everything above this file (visibility, caching, API) is source-agnostic.

// The SDK is CommonJS and Node's ESM loader does not see `Client` as a named export: take it from the default.
import notionSdk from "@notionhq/client";

const { Client } = notionSdk;
import { ACADEMY_FORMATS, parseCourseLanguage, type AcademyFormat, type CatalogCourse, type CatalogLesson } from "#shared/academy.js";
import { loadNotionConfig, type NotionConfig } from "./config.js";
import { fixtureSource } from "./fixture.js";

export interface ContentSource {
  readonly kind: "notion" | "fixture";
  listCourses(): Promise<CatalogCourse[]>;
  listLessons(): Promise<CatalogLesson[]>;
  /** The lesson body as Notion enhanced markdown. */
  lessonMarkdown(lessonId: string): Promise<string>;
}

/** The Notion API version that serves GET /v1/pages/:id/markdown. */
export const NOTION_VERSION = "2026-03-11";

// ─── Page property readers (pure, so the mapping is testable without Notion) ──

type Props = Record<string, any>;
const plain = (items: any): string => (Array.isArray(items) ? items.map((i) => i?.plain_text ?? "").join("") : "");

export function readTitle(p: Props, name: string): string {
  return plain(p[name]?.title).trim();
}
export function readText(p: Props, name: string): string {
  return plain(p[name]?.rich_text).trim();
}
export function readCheckbox(p: Props, name: string): boolean {
  return p[name]?.checkbox === true;
}
export function readNumber(p: Props, name: string): number | null {
  const n = p[name]?.number;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
export function readUrl(p: Props, name: string): string | null {
  const u = p[name]?.url;
  return typeof u === "string" && u.trim() ? u.trim() : null;
}
export function readMulti(p: Props, name: string): string[] {
  const list = p[name]?.multi_select;
  return Array.isArray(list) ? list.map((o: any) => String(o?.name ?? "")).filter(Boolean) : [];
}
export function readSelect(p: Props, name: string): string | null {
  const n = p[name]?.select?.name;
  return typeof n === "string" ? n : null;
}
export function readRelationId(p: Props, name: string): string | null {
  const id = p[name]?.relation?.[0]?.id;
  return typeof id === "string" ? id : null;
}

export function courseFromPage(page: { id: string; properties?: Props }): CatalogCourse {
  const p = page.properties ?? {};
  return {
    id: page.id,
    title: readTitle(p, "Name"),
    description: readText(p, "Description"),
    apps: readMulti(p, "Apps"),
    published: readCheckbox(p, "Published"),
    order: readNumber(p, "Order"),
    language: parseCourseLanguage(readSelect(p, "Language")),
    group: readText(p, "Group"),
  };
}

export function lessonFromPage(page: { id: string; properties?: Props }): CatalogLesson {
  const p = page.properties ?? {};
  const format = readSelect(p, "Format");
  return {
    id: page.id,
    courseId: readRelationId(p, "Course"),
    title: readTitle(p, "Name"),
    summary: readText(p, "Summary"),
    published: readCheckbox(p, "Published"),
    order: readNumber(p, "Order"),
    video: readUrl(p, "Video"),
    expectedMinutes: readNumber(p, "Expected minutes"),
    format: (ACADEMY_FORMATS as readonly string[]).includes(format ?? "") ? (format as AcademyFormat) : "Auto",
  };
}

// ─── Notion ──────────────────────────────────────────────────────────────────

const dataSourceIds = new Map<string, string>();

function notionSource(config: NotionConfig): ContentSource {
  const notion = new Client({ auth: config.token, notionVersion: NOTION_VERSION, timeoutMs: 15_000 });

  // Config holds the DATABASE id; rows are queried through its data source.
  async function dataSourceOf(databaseId: string): Promise<string> {
    const cached = dataSourceIds.get(databaseId);
    if (cached) return cached;
    const db = await notion.databases.retrieve({ database_id: databaseId });
    const id = "data_sources" in db ? db.data_sources?.[0]?.id : undefined;
    if (!id) throw new Error(`Notion database ${databaseId} has no data source`);
    dataSourceIds.set(databaseId, id);
    return id;
  }

  async function rows(databaseId: string): Promise<Array<{ id: string; properties: Props }>> {
    const data_source_id = await dataSourceOf(databaseId);
    const out: Array<{ id: string; properties: Props }> = [];
    let cursor: string | undefined;
    do {
      const res = await notion.dataSources.query({ data_source_id, start_cursor: cursor, page_size: 100 });
      for (const r of res.results) if (r.object === "page" && "properties" in r) out.push({ id: r.id, properties: r.properties as Props });
      cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
    } while (cursor);
    return out;
  }

  return {
    kind: "notion",
    listCourses: async () => (await rows(config.coursesDb)).map(courseFromPage),
    listLessons: async () => (await rows(config.lessonsDb)).map(lessonFromPage),
    async lessonMarkdown(lessonId) {
      const res = await notion.pages.retrieveMarkdown({ page_id: lessonId, markdown_version: "v2" });
      return res.markdown;
    },
  };
}

type Env = Record<string, string | undefined>;

/** Fixtures only in development with ACADEMY_FIXTURES=1; production never shows them. */
export function fixturesEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" && env.ACADEMY_FIXTURES === "1";
}

/** Drafts are shown only in development with ACADEMY_INCLUDE_DRAFTS=1. */
export function draftsEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" && env.ACADEMY_INCLUDE_DRAFTS === "1";
}

/** The source in force, or null when none is configured. */
export async function getContentSource(env: Env = process.env): Promise<ContentSource | null> {
  if (fixturesEnabled(env)) return fixtureSource;
  const config = await loadNotionConfig(env);
  return config ? notionSource(config) : null;
}
