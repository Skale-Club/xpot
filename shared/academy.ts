// Academy: in-app courses authored in Notion (docs/ACADEMY.md is the short map). Pure rules shared by the server and
// the app: video ranges, aspect ratio, expected time, heartbeat clamping and the "too fast" flag.

/** The app's name in the Notion "Apps" multi-select of a course. */
export const ACADEMY_APP = "Xpot";

/** Cache of a rendered lesson (its Notion file URLs expire after about an hour) and of the availability check. */
export const LESSON_CACHE_MS = 10 * 60_000;
export const AVAILABILITY_CACHE_MS = 5 * 60_000;

/** A heartbeat counts at most this many active seconds (the client sends one every 15 s). */
export const MAX_HEARTBEAT_SECONDS = 20;
export const HEARTBEAT_EVERY_MS = 15_000;
/** The tab counts as in use for this long after the last touch, key or scroll. */
export const INTERACTION_WINDOW_MS = 60_000;
/** Words read per minute when a lesson has no Expected minutes. */
export const READING_WPM = 200;
/** Share of the video that must have played for a lesson to complete by itself. */
export const AUTO_COMPLETE_VIDEO_SHARE = 0.9;
/** Completed with less than this share of the expected time (or of the video) is flagged "too fast". */
export const TOO_FAST_SHARE = 0.5;

export const ACADEMY_EVENT_TYPES = ["lesson_open", "video_play", "video_ended", "lesson_complete", "lesson_reopen"] as const;
export type AcademyEventType = (typeof ACADEMY_EVENT_TYPES)[number];

export const ACADEMY_FORMATS = ["Auto", "Vertical", "Horizontal", "Square"] as const;
export type AcademyFormat = (typeof ACADEMY_FORMATS)[number];
export type AcademyAspect = "vertical" | "horizontal" | "square";

/** CSS aspect-ratio of each shape. */
export const ASPECT_RATIO: Record<AcademyAspect, string> = { vertical: "9 / 16", horizontal: "16 / 9", square: "1 / 1" };

// ─── Videos ──────────────────────────────────────────────────────────────────

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** The YouTube id of a watch, shorts, youtu.be, embed or live link; null for anything else. */
export function parseYouTubeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

export function isShortsUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    return /^\/shorts\//.test(new URL(raw.trim()).pathname);
  } catch {
    return false;
  }
}

export type OEmbedSize = { width: number; height: number } | null | undefined;

/** The shape of a width x height box: within 5% of square is square. */
export function aspectOfSize(size: OEmbedSize): AcademyAspect | null {
  if (!size || !(size.width > 0) || !(size.height > 0)) return null;
  const ratio = size.width / size.height;
  if (Math.abs(ratio - 1) <= 0.05) return "square";
  return ratio > 1 ? "horizontal" : "vertical";
}

/**
 * The shape of one lesson's video, never a fixed rule: the Notion Format when it is not Auto, else what YouTube's
 * oEmbed says (a Shorts link is vertical), else vertical while nothing is known.
 */
export function resolveAspect(input: { format?: string | null; url?: string | null; oembed?: OEmbedSize }): AcademyAspect {
  switch (input.format) {
    case "Vertical": return "vertical";
    case "Horizontal": return "horizontal";
    case "Square": return "square";
  }
  const detected = aspectOfSize(input.oembed);
  if (detected) return detected;
  // A Shorts link implies vertical; so does not knowing yet (a phone-shot lesson is the common case).
  return "vertical";
}

// ─── Watched ranges ──────────────────────────────────────────────────────────

export type WatchedRange = [number, number];
/** The most ranges kept per lesson (a viewer who seeks around all day must not grow the row). */
export const MAX_RANGES = 200;

/** Whole-second intervals, sorted, with overlapping and touching ones merged. Bad entries are dropped. */
export function mergeRanges(ranges: ReadonlyArray<readonly [number, number]>, duration?: number | null): WatchedRange[] {
  const cap = duration && duration > 0 ? Math.ceil(duration) : Number.POSITIVE_INFINITY;
  const clean: WatchedRange[] = [];
  for (const range of ranges) {
    const a = Number(range?.[0]);
    const b = Number(range?.[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const start = Math.max(0, Math.floor(Math.min(a, b)));
    const end = Math.min(cap, Math.ceil(Math.max(a, b)));
    if (end > start) clean.push([start, end]);
  }
  clean.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const merged: WatchedRange[] = [];
  for (const range of clean) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged.length > MAX_RANGES ? merged.slice(0, MAX_RANGES) : merged;
}

export function rangesSeconds(ranges: ReadonlyArray<readonly [number, number]>): number {
  return ranges.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0);
}

/** Reads a stored jsonb value back as ranges. */
export function readRanges(value: unknown): WatchedRange[] {
  if (!Array.isArray(value)) return [];
  return mergeRanges(value.filter((r): r is [number, number] => Array.isArray(r) && r.length === 2));
}


/** Ticks of the player (about one a second) further apart than this are a seek, not playback. */
export const MAX_TICK_STEP_SECONDS = 3;

export type RecorderState = { last: number | null; ranges: WatchedRange[] };

/**
 * Feeds one player position into the recorder. Only the stretch between two consecutive ticks of real playback is
 * kept, so seeking (to the end, say) records nothing. Returns the same state object when nothing changed.
 */
export function recordTick(state: RecorderState, position: number, maxStep = MAX_TICK_STEP_SECONDS): RecorderState {
  if (!Number.isFinite(position) || position < 0) return state;
  const last = state.last;
  if (last == null || position < last || position - last > maxStep) return { last: position, ranges: state.ranges };
  if (position === last) return state;
  return { last: position, ranges: mergeRanges([...state.ranges, [last, position]]) };
}

/** Share of the video covered by the ranges, 0-1. */
export function watchedFraction(ranges: ReadonlyArray<readonly [number, number]>, duration: number | null | undefined): number {
  if (!duration || duration <= 0) return 0;
  return Math.min(1, rangesSeconds(ranges) / duration);
}

// ─── Time ────────────────────────────────────────────────────────────────────

export function wordCount(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_`|\\[\]()-]+/g, " ");
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9À-ɏ]/.test(w)).length;
}

/**
 * Expected time of a lesson, in seconds: Expected minutes when set, else the video's length (known from any
 * viewer's progress) plus the reading time of the body at 200 words a minute.
 */
export function expectedSeconds(input: { expectedMinutes?: number | null; videoDurationSeconds?: number | null; bodyWords?: number | null }): number {
  if (input.expectedMinutes != null && input.expectedMinutes > 0) return Math.round(input.expectedMinutes * 60);
  const video = input.videoDurationSeconds && input.videoDurationSeconds > 0 ? input.videoDurationSeconds : 0;
  const reading = ((input.bodyWords ?? 0) / READING_WPM) * 60;
  return Math.round(video + reading);
}

/** Active seconds a heartbeat may add: whole, never negative, never more than MAX_HEARTBEAT_SECONDS. */
export function clampHeartbeat(seconds: unknown): number {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_HEARTBEAT_SECONDS, Math.floor(n));
}

export function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Finished too quickly to have learned it: completed, and either active time under half of the expected time or the
 * video watched under half. Lessons with no known expectation are never flagged on time.
 */
export function isTooFast(input: {
  completed: boolean;
  activeSeconds: number;
  expectedSeconds: number;
  videoDurationSeconds?: number | null;
  videoWatchedSeconds?: number | null;
}): boolean {
  if (!input.completed) return false;
  if (input.expectedSeconds > 0 && input.activeSeconds < input.expectedSeconds * TOO_FAST_SHARE) return true;
  const duration = input.videoDurationSeconds ?? 0;
  if (duration > 0 && (input.videoWatchedSeconds ?? 0) < duration * TOO_FAST_SHARE) return true;
  return false;
}

/** A text-only lesson never auto-completes before this many active seconds. */
export const AUTO_COMPLETE_MIN_TEXT_SECONDS = 15;
/** ...nor before this share of its expected reading time. */
export const AUTO_COMPLETE_TEXT_TIME_SHARE = 0.5;

/** Active seconds a text-only lesson needs before it may complete by itself: max(15, 50% of the expected reading time). */
export function requiredTextActiveSeconds(expectedReadingSeconds: number): number {
  return Math.max(AUTO_COMPLETE_MIN_TEXT_SECONDS, Math.max(0, expectedReadingSeconds || 0) * AUTO_COMPLETE_TEXT_TIME_SHARE);
}

/**
 * Whether the lesson may complete by itself. With a video: at least 90% of it was actually watched. Without one: the
 * body was scrolled to the end AND the person was active long enough (max of 15 s and half of the expected reading
 * time), so a short lesson that fits on screen does not complete the moment it opens.
 */
export function canAutoComplete(input: {
  hasVideo: boolean;
  videoDurationSeconds?: number | null;
  videoWatchedSeconds?: number | null;
  maxScrollPct: number;
  activeSeconds?: number | null;
  expectedReadingSeconds?: number | null;
}): boolean {
  if (input.hasVideo) {
    const duration = input.videoDurationSeconds ?? 0;
    return duration > 0 && (input.videoWatchedSeconds ?? 0) >= duration * AUTO_COMPLETE_VIDEO_SHARE;
  }
  return input.maxScrollPct >= 95 && (input.activeSeconds ?? 0) >= requiredTextActiveSeconds(input.expectedReadingSeconds ?? 0);
}

// ─── Visibility ──────────────────────────────────────────────────────────────

export const ACADEMY_LANGUAGES = ["en", "pt", "es"] as const;
export type AcademyLanguage = (typeof ACADEMY_LANGUAGES)[number];
/** Each language is labelled by its own name. */

export const isAcademyLanguage = (value: unknown): value is AcademyLanguage => typeof value === "string" && (ACADEMY_LANGUAGES as readonly string[]).includes(value);

/** Notion `Language` select option -> code. Empty or unknown means English. */
export function parseCourseLanguage(name: string | null | undefined): AcademyLanguage {
  switch ((name ?? "").trim().toLowerCase()) {
    case "português":
    case "portugues":
    case "portuguese":
      return "pt";
    case "español":
    case "espanol":
    case "spanish":
      return "es";
    default:
      return "en";
  }
}

export type CatalogCourse = {
  id: string;
  published: boolean;
  apps: string[];
  order: number | null;
  title: string;
  description: string;
  /** Content language (Notion `Language`); empty or unknown is "en". */
  language: AcademyLanguage;
  /** Translations of one course share a Group; empty means the course stands alone. */
  group: string;
};
export type CatalogLesson = {
  id: string;
  courseId: string | null;
  published: boolean;
  order: number | null;
  title: string;
  summary: string;
  video: string | null;
  expectedMinutes: number | null;
  format: AcademyFormat;
};

const byOrder = <T extends { order: number | null; title: string }>(a: T, b: T) =>
  (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title);

/**
 * The courses a person may see: Published, listing this app, with at least one Published lesson (drafts count only
 * when `includeDrafts`, which the server allows in development alone). Lessons come sorted within their course.
 */
export function visibleCatalog(
  courses: CatalogCourse[],
  lessons: CatalogLesson[],
  app: string,
  includeDrafts = false,
): Array<CatalogCourse & { lessons: CatalogLesson[] }> {
  return courses
    .filter((c) => (includeDrafts || c.published) && c.apps.includes(app))
    .map((course) => ({
      ...course,
      lessons: lessons.filter((l) => l.courseId === course.id && (includeDrafts || l.published)).sort(byOrder),
    }))
    .filter((c) => c.lessons.length > 0)
    .sort(byOrder);
}

/**
 * One course per translation group: the requested language, else English, else the first by Order. Courses with an
 * empty group are their own group.
 */
export function resolveCatalogForLanguage<T extends { id: string; order: number | null; title: string; language: AcademyLanguage; group: string }>(
  visibleCourses: T[],
  requested: AcademyLanguage | null | undefined,
): { courses: T[] } {
  const groups = new Map<string, T[]>();
  for (const course of visibleCourses) {
    const key = course.group || course.id;
    groups.set(key, [...(groups.get(key) ?? []), course]);
  }
  const picked: T[] = [];
  for (const members of Array.from(groups.values())) {
    const sorted = [...members].sort(byOrder);
    picked.push((requested ? sorted.find((c) => c.language === requested) : undefined) ?? sorted.find((c) => c.language === "en") ?? sorted[0]);
  }
  return { courses: picked.sort(byOrder) };
}

// ─── Admin numbers ───────────────────────────────────────────────────────────

export type ProgressRow = {
  repId: number;
  courseId: string;
  lessonId: string;
  firstOpenedAt: Date | string;
  lastSeenAt: Date | string;
  activeSeconds: number;
  videoDurationSeconds: number | null;
  videoWatchedSeconds: number;
  maxScrollPct: number;
  completedAt: Date | string | null;
};

export type LessonExpectation = { lessonId: string; expectedSeconds: number };

export type CourseStats = {
  courseId: string;
  enrolled: number;
  completed: number;
  completionPct: number;
  lessons: Array<{ lessonId: string; opened: number; completed: number; /** Opened it and never finished: where people stop. */ dropOff: number }>;
};

/** Per course: who opened a lesson, who finished every lesson, and per lesson who opened and who completed. */
export function courseStats(
  course: { id: string; lessonIds: string[] },
  rows: ProgressRow[],
): CourseStats {
  const mine = rows.filter((r) => r.courseId === course.id && course.lessonIds.includes(r.lessonId));
  const people = new Set(mine.map((r) => r.repId));
  const doneBy = new Map<number, Set<string>>();
  for (const r of mine) {
    if (!r.completedAt) continue;
    if (!doneBy.has(r.repId)) doneBy.set(r.repId, new Set());
    doneBy.get(r.repId)!.add(r.lessonId);
  }
  const completed = Array.from(doneBy.values()).filter((set) => course.lessonIds.every((id) => set.has(id))).length;
  return {
    courseId: course.id,
    enrolled: people.size,
    completed,
    completionPct: people.size ? Math.round((completed / people.size) * 100) : 0,
    lessons: course.lessonIds.map((lessonId) => {
      const rowsOf = mine.filter((r) => r.lessonId === lessonId);
      const done = rowsOf.filter((r) => r.completedAt).length;
      return { lessonId, opened: rowsOf.length, completed: done, dropOff: rowsOf.length - done };
    }),
  };
}

export type PersonLessonLine = {
  lessonId: string;
  activeSeconds: number;
  expectedSeconds: number;
  videoPct: number | null;
  scrollPct: number;
  completed: boolean;
  tooFast: boolean;
  lastSeenAt: string | null;
};

/** One person's lessons of a course (those they opened), with the too-fast flag. */
export function personLessonLines(
  lessonIds: string[],
  rows: ProgressRow[],
  expectations: LessonExpectation[],
): PersonLessonLine[] {
  const expected = new Map(expectations.map((e) => [e.lessonId, e.expectedSeconds]));
  return lessonIds.map((lessonId) => {
    const row = rows.find((r) => r.lessonId === lessonId);
    const exp = expected.get(lessonId) ?? 0;
    const duration = row?.videoDurationSeconds ?? null;
    return {
      lessonId,
      activeSeconds: row?.activeSeconds ?? 0,
      expectedSeconds: exp,
      videoPct: row && duration && duration > 0 ? Math.min(100, Math.round((row.videoWatchedSeconds / duration) * 100)) : null,
      scrollPct: row?.maxScrollPct ?? 0,
      completed: Boolean(row?.completedAt),
      tooFast: row
        ? isTooFast({
            completed: Boolean(row.completedAt),
            activeSeconds: row.activeSeconds,
            expectedSeconds: exp,
            videoDurationSeconds: duration,
            videoWatchedSeconds: row.videoWatchedSeconds,
          })
        : false,
      lastSeenAt: row ? new Date(row.lastSeenAt).toISOString() : null,
    };
  });
}

/** Share of a course's lessons completed, 0-100. */
export function coursePercent(completedLessons: number, totalLessons: number): number {
  return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
}

// ─── API shapes ──────────────────────────────────────────────────────────────

export type AcademyCourseSummary = {
  id: string;
  title: string;
  language: AcademyLanguage;
  description: string;
  lessonCount: number;
  completedCount: number;
  percent: number;
  /** The lesson "Continue" opens: the first one not completed. */
  nextLessonId: string;
  started: boolean;
};

export type AcademyLessonSummary = {
  id: string;
  title: string;
  summary: string;
  hasVideo: boolean;
  expectedMinutes: number | null;
  completed: boolean;
};

export type AcademyCourseDetail = {
  id: string;
  title: string;
  description: string;
  percent: number;
  lessons: AcademyLessonSummary[];
};

export type AcademyLessonDetail = {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  summary: string;
  markdown: string;
  video: { youtubeId: string; aspect: AcademyAspect } | null;
  expectedMinutes: number | null;
  prevLessonId: string | null;
  nextLessonId: string | null;
  lessons: AcademyLessonSummary[];
  /** Expected reading seconds (Expected minutes, else the body at 200 words a minute): the text-only auto-complete threshold. */
  expectedReadingSeconds: number;
  progress: { completed: boolean; watchedRanges: WatchedRange[]; videoDurationSeconds: number | null; maxScrollPct: number; activeSeconds: number };
};

export type AcademyTrackBody = {
  courseId: string;
  event?: AcademyEventType;
  activeSeconds?: number;
  videoDurationSeconds?: number | null;
  videoRanges?: Array<[number, number]>;
  maxScrollPct?: number;
  payload?: Record<string, string | number | boolean | null>;
};

export type AcademyPersonCourse = {
  courseId: string;
  title: string;
  percent: number;
  completedLessons: number;
  totalLessons: number;
  activeSeconds: number;
  expectedSeconds: number;
  lastSeenAt: string | null;
  tooFastLessons: number;
  lessons: Array<PersonLessonLine & { title: string }>;
};

export type AcademyPersonSummary = { repId: number; name: string; courses: AcademyPersonCourse[]; lastSeenAt: string | null };

export type AcademyAdminOverview = {
  courses: Array<{ id: string; title: string; language: AcademyLanguage; stats: CourseStats & { lessons: Array<CourseStats["lessons"][number] & { title: string }> } }>;
  people: AcademyPersonSummary[];
};

export type AcademyPersonDetail = AcademyPersonSummary & {
  events: Array<{ id: number; type: string; courseId: string; lessonId: string; lessonTitle: string | null; payload: unknown; createdAt: string }>;
};
