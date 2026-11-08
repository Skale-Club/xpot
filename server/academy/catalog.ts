// The Academy's catalog: what a person may see (visibility rule), cached so Notion is not asked on every request.
// Any failure (Notion unreachable, not configured, a bad id) reads as "no courses": logged here, never shown.

import {
  ACADEMY_APP,
  AVAILABILITY_CACHE_MS,
  LESSON_CACHE_MS,
  aspectOfSize,
  parseYouTubeId,
  resolveAspect,
  resolveCatalogForLanguage,
  visibleCatalog,
  wordCount,
  type AcademyAspect,
  type AcademyLanguage,
  type CatalogCourse,
  type CatalogLesson,
} from "#shared/academy.js";
import { draftsEnabled, getContentSource, type ContentSource } from "./source.js";

export type VisibleCourse = CatalogCourse & { lessons: CatalogLesson[] };

type Cached<T> = { at: number; value: T };
let catalogCache: Cached<{ source: ContentSource; courses: VisibleCourse[] }> | null = null;
const lessonCache = new Map<string, Cached<{ markdown: string; words: number }>>();
const aspectCache = new Map<string, Cached<AcademyAspect | null>>();

/** Forget everything (tests, and after the integration is saved). */
export function resetAcademyCache() {
  catalogCache = null;
  lessonCache.clear();
  aspectCache.clear();
}

/** The visible courses for this app, with their lessons. Empty on any error. Cached for the availability window. */
export async function loadVisibleCourses(now = Date.now()): Promise<VisibleCourse[]> {
  if (catalogCache && now - catalogCache.at < AVAILABILITY_CACHE_MS) return catalogCache.value.courses;
  try {
    const source = await getContentSource();
    if (!source) {
      catalogCache = { at: now, value: { source: null as unknown as ContentSource, courses: [] } };
      return [];
    }
    const [courses, lessons] = await Promise.all([source.listCourses(), source.listLessons()]);
    const visible = visibleCatalog(courses, lessons, ACADEMY_APP, draftsEnabled());
    catalogCache = { at: now, value: { source, courses: visible } };
    return visible;
  } catch (error) {
    console.error("[academy] could not read the catalog:", error instanceof Error ? error.message : error);
    // A failure is cached briefly as "none" so a Notion outage does not make every request wait on it.
    catalogCache = { at: now - AVAILABILITY_CACHE_MS + 30_000, value: { source: null as unknown as ContentSource, courses: [] } };
    return [];
  }
}

/** The app shell never waits on Notion: on a cold cache, no answer within this long reads as "not available". */
export const AVAILABILITY_DEADLINE_MS = 1_500;

export async function academyAvailable(deadlineMs = AVAILABILITY_DEADLINE_MS): Promise<boolean> {
  const load = loadVisibleCourses().then((courses) => courses.length > 0);
  // The load keeps running after the deadline and fills the cache for the next request.
  const late = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), deadlineMs));
  return Promise.race([load, late]);
}

/** The courses one person should see: one per translation group, in their language when it exists. */
export async function loadCoursesForLanguage(requested: AcademyLanguage | null) {
  return resolveCatalogForLanguage(await loadVisibleCourses(), requested);
}

export async function findLesson(courseId: string, lessonId: string) {
  const courses = await loadVisibleCourses();
  const course = courses.find((c) => c.id === courseId);
  const lesson = course?.lessons.find((l) => l.id === lessonId);
  return course && lesson ? { course, lesson } : null;
}

/** The lesson body, cached ~10 minutes (its Notion file URLs are signed and expire). */
export async function lessonBody(lessonId: string, now = Date.now()): Promise<{ markdown: string; words: number }> {
  const hit = lessonCache.get(lessonId);
  if (hit && now - hit.at < LESSON_CACHE_MS) return hit.value;
  if (!catalogCache?.value.source) return { markdown: "", words: 0 };
  const markdown = await catalogCache.value.source.lessonMarkdown(lessonId);
  const value = { markdown, words: wordCount(markdown) };
  lessonCache.set(lessonId, { at: now, value });
  return value;
}

/** Word count of a lesson body for expected time; 0 when it cannot be read. */
export async function lessonWords(lessonId: string): Promise<number> {
  try {
    return (await lessonBody(lessonId)).words;
  } catch {
    return 0;
  }
}

async function detectAspect(url: string): Promise<AcademyAspect | null> {
  const hit = aspectCache.get(url);
  if (hit && Date.now() - hit.at < 24 * 60 * 60_000) return hit.value;
  let value: AcademyAspect | null = null;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(4_000) });
    if (res.ok) {
      const json = (await res.json()) as { width?: number; height?: number };
      value = aspectOfSize({ width: Number(json.width), height: Number(json.height) });
    }
  } catch {
    // Unknown: the player falls back to vertical.
  }
  aspectCache.set(url, { at: Date.now(), value });
  return value;
}

/** The player data of a lesson: the YouTube id and the shape of its video, detected once and cached. */
export async function lessonVideo(lesson: CatalogLesson): Promise<{ youtubeId: string; aspect: AcademyAspect } | null> {
  const youtubeId = parseYouTubeId(lesson.video);
  if (!youtubeId || !lesson.video) return null;
  const override = lesson.format !== "Auto";
  const oembed = override ? null : await detectAspect(lesson.video);
  return { youtubeId, aspect: resolveAspect({ format: lesson.format, url: lesson.video, oembed: oembed ? sizeOf(oembed) : null }) };
}

const sizeOf = (aspect: AcademyAspect) => ({ square: { width: 1, height: 1 }, horizontal: { width: 16, height: 9 }, vertical: { width: 9, height: 16 } })[aspect];
