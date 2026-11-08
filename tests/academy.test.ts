import { describe, expect, it, vi } from "vitest";
import {
  canAutoComplete,
  requiredTextActiveSeconds,
  clampHeartbeat,
  courseStats,
  expectedSeconds,
  isTooFast,
  mergeRanges,
  parseCourseLanguage,
  parseYouTubeId,
  personLessonLines,
  recordTick,
  rangesSeconds,
  resolveAspect,
  resolveCatalogForLanguage,
  visibleCatalog,
  watchedFraction,
  wordCount,
  type CatalogCourse,
  type CatalogLesson,
  type ProgressRow,
} from "../shared/academy";
import { parseNotionMarkdown } from "../shared/notionMarkdown";
import { courseFromPage, lessonFromPage, fixturesEnabled, draftsEnabled } from "../server/academy/source";
import { envNotionConfig, normalizeNotionId } from "../server/academy/config";
import { integrationProblemCode, getProviderDef } from "../shared/integrations-registry";
import { envProvides, maskIntegration } from "../server/routes/xpot/integrationStatus";
import { trackSchema } from "../server/academy/tracking";
import { fixtureSource } from "../server/academy/fixture";

// Pure rules only: nothing here may reach a database.
vi.mock("../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../server/storage", () => ({ storage: {} }));

describe("watched ranges", () => {
  it("merges overlapping and touching intervals and ignores bad ones", () => {
    expect(mergeRanges([[10, 20], [0, 5], [5, 8], [18, 30], [4, 2], [Number.NaN, 3]])).toEqual([[0, 8], [10, 30]].map((r) => r) as never);
  });
  it("clamps to the video length", () => {
    expect(mergeRanges([[0, 500]], 120)).toEqual([[0, 120]]);
  });
  it("sums seconds", () => {
    expect(rangesSeconds([[0, 10], [20, 25]])).toBe(15);
  });
  it("a seek to the end records nothing; steady playback does", () => {
    let state = recordTick({ last: null, ranges: [] }, 0);
    state = recordTick(state, 1);
    state = recordTick(state, 2);
    expect(state.ranges).toEqual([[0, 2]]);
    state = recordTick(state, 590); // seek
    expect(state.ranges).toEqual([[0, 2]]);
    state = recordTick(state, 600);
    expect(state.ranges).toEqual([[0, 2]]);
    state = recordTick(state, 1); // seek back
    expect(state.ranges).toEqual([[0, 2]]);
    expect(watchedFraction(state.ranges, 600)).toBeCloseTo(2 / 600);
  });
});

describe("expected time", () => {
  it("uses Expected minutes when set", () => {
    expect(expectedSeconds({ expectedMinutes: 6, videoDurationSeconds: 999, bodyWords: 9999 })).toBe(360);
  });
  it("derives it from the video plus reading at 200 words a minute", () => {
    expect(expectedSeconds({ videoDurationSeconds: 120, bodyWords: 400 })).toBe(240);
    expect(expectedSeconds({})).toBe(0);
  });
  it("counts words of a Notion body without markup", () => {
    expect(wordCount("# Title\n\nOne **two** three <callout>four</callout> ![img](http://x/y.png)")).toBe(5);
  });
});

describe("heartbeat clamping", () => {
  it("never credits more than 20 s, nor negatives or junk", () => {
    expect(clampHeartbeat(15)).toBe(15);
    expect(clampHeartbeat(9999)).toBe(20);
    expect(clampHeartbeat(-3)).toBe(0);
    expect(clampHeartbeat("abc")).toBe(0);
    expect(clampHeartbeat(4.9)).toBe(4);
  });
  it("validates the track body", () => {
    expect(trackSchema.safeParse({ courseId: "c", event: "lesson_open", activeSeconds: 5 }).success).toBe(true);
    expect(trackSchema.safeParse({ courseId: "c", event: "hack" }).success).toBe(false);
    expect(trackSchema.safeParse({ courseId: "", activeSeconds: 1 }).success).toBe(false);
    expect(trackSchema.safeParse({ courseId: "c", videoDurationSeconds: 1e9 }).success).toBe(false);
    expect(trackSchema.safeParse({ courseId: "c", payload: { a: { nested: 1 } } }).success).toBe(false);
  });
});

describe("completion rules", () => {
  it("a video lesson auto-completes at 90% watched; a text lesson at the end of the body", () => {
    expect(canAutoComplete({ hasVideo: true, videoDurationSeconds: 100, videoWatchedSeconds: 89, maxScrollPct: 100 })).toBe(false);
    expect(canAutoComplete({ hasVideo: true, videoDurationSeconds: 100, videoWatchedSeconds: 90, maxScrollPct: 0 })).toBe(true);
    // Text only: scroll alone is not enough; it also needs max(15 s, half of the expected reading time) of active time.
    expect(canAutoComplete({ hasVideo: false, maxScrollPct: 50, activeSeconds: 600, expectedReadingSeconds: 60 })).toBe(false);
    expect(canAutoComplete({ hasVideo: false, maxScrollPct: 100 })).toBe(false);
    expect(canAutoComplete({ hasVideo: false, maxScrollPct: 100, activeSeconds: 14, expectedReadingSeconds: 10 })).toBe(false);
    expect(canAutoComplete({ hasVideo: false, maxScrollPct: 100, activeSeconds: 15, expectedReadingSeconds: 10 })).toBe(true);
    expect(requiredTextActiveSeconds(120)).toBe(60);
    expect(canAutoComplete({ hasVideo: false, maxScrollPct: 96, activeSeconds: 59, expectedReadingSeconds: 120 })).toBe(false);
    expect(canAutoComplete({ hasVideo: false, maxScrollPct: 96, activeSeconds: 60, expectedReadingSeconds: 120 })).toBe(true);
  });
  it("flags too fast: completed under half the expected time or half the video", () => {
    const base = { completed: true, activeSeconds: 100, expectedSeconds: 300, videoDurationSeconds: null, videoWatchedSeconds: 0 };
    expect(isTooFast(base)).toBe(true);
    expect(isTooFast({ ...base, activeSeconds: 200 })).toBe(false);
    expect(isTooFast({ ...base, activeSeconds: 400, videoDurationSeconds: 200, videoWatchedSeconds: 50 })).toBe(true);
    expect(isTooFast({ ...base, completed: false })).toBe(false);
    expect(isTooFast({ ...base, expectedSeconds: 0, activeSeconds: 0 })).toBe(false);
  });
});

describe("video aspect", () => {
  it("parses every YouTube link shape", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeId("nope")).toBeNull();
  });
  it("Format wins, then oEmbed, then vertical", () => {
    expect(resolveAspect({ format: "Horizontal", oembed: { width: 9, height: 16 } })).toBe("horizontal");
    expect(resolveAspect({ format: "Auto", oembed: { width: 480, height: 270 } })).toBe("horizontal");
    expect(resolveAspect({ format: "Auto", oembed: { width: 200, height: 113 } })).toBe("horizontal");
    expect(resolveAspect({ format: "Auto", oembed: { width: 113, height: 200 } })).toBe("vertical");
    expect(resolveAspect({ format: "Auto", oembed: { width: 300, height: 300 } })).toBe("square");
    expect(resolveAspect({ format: "Square" })).toBe("square");
    expect(resolveAspect({ format: "Auto", url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" })).toBe("vertical");
    expect(resolveAspect({ format: "Auto" })).toBe("vertical");
  });
});

const course = (over: Partial<CatalogCourse>): CatalogCourse => ({ id: "c1", title: "C", description: "", apps: ["Xpot"], published: true, order: 1, language: "en", group: "", ...over });
const lesson = (over: Partial<CatalogLesson>): CatalogLesson => ({ id: "l1", courseId: "c1", title: "L", summary: "", published: true, order: 1, video: null, expectedMinutes: null, format: "Auto", ...over });

describe("visibility rule", () => {
  it("needs Published, this app and one Published lesson", () => {
    const lessons = [lesson({}), lesson({ id: "l2", courseId: "c2" }), lesson({ id: "l3", courseId: "c3", published: false })];
    const courses = [course({}), course({ id: "c2", apps: ["Xtimator"] }), course({ id: "c3" }), course({ id: "c4", published: false }), course({ id: "c5" })];
    expect(visibleCatalog(courses, lessons, "Xpot").map((c) => c.id)).toEqual(["c1"]);
  });
  it("shows drafts only when asked and sorts by order", () => {
    const lessons = [lesson({ id: "b", order: 2, published: false }), lesson({ id: "a", order: 1 })];
    expect(visibleCatalog([course({})], lessons, "Xpot")[0].lessons.map((l) => l.id)).toEqual(["a"]);
    expect(visibleCatalog([course({ published: false })], lessons, "Xpot", true)[0].lessons.map((l) => l.id)).toEqual(["a", "b"]);
  });
  it("nothing visible for an empty catalog", () => {
    expect(visibleCatalog([], [], "Xpot")).toEqual([]);
  });
});

describe("language", () => {
  const all = [
    course({ id: "a-en", group: "A" }),
    course({ id: "a-pt", language: "pt", group: "A" }),
    course({ id: "b-en", group: "B", order: 2 }),
    course({ id: "c-es", language: "es", group: "C", order: 3 }),
  ];
  const ids = (r: { courses: CatalogCourse[] }) => r.courses.map((c) => c.id);
  it("maps the Notion option, defaulting to English", () => {
    expect([parseCourseLanguage("English"), parseCourseLanguage("Português"), parseCourseLanguage("Español"), parseCourseLanguage(null), parseCourseLanguage("x")]).toEqual(["en", "pt", "es", "en", "en"]);
  });
  it("picks the requested language per group, else English, else the first by Order", () => {
    expect(ids(resolveCatalogForLanguage(all, "pt"))).toEqual(["a-pt", "b-en", "c-es"]);
    expect(ids(resolveCatalogForLanguage(all, "es"))).toEqual(["a-en", "b-en", "c-es"]);
    expect(ids(resolveCatalogForLanguage([course({ id: "z-es", language: "es", group: "Z", order: 2 }), course({ id: "z-pt", language: "pt", group: "Z", order: 1 })], "en"))).toEqual(["z-pt"]);
  });
  it("treats an empty group as its own", () => {
    const lone = resolveCatalogForLanguage([course({ id: "p", language: "pt" }), course({ id: "q", order: 2 })], "pt");
    expect(ids(lone)).toEqual(["p", "q"]);
    expect(resolveCatalogForLanguage([], "en")).toEqual({ courses: [] });
  });
});

describe("Notion mapping", () => {
  it("reads a course page", () => {
    const page = {
      id: "p1",
      properties: {
        Name: { title: [{ plain_text: "Get " }, { plain_text: "started" }] },
        Apps: { multi_select: [{ name: "Xpot" }, { name: "Xtimator" }] },
        Published: { checkbox: true },
        Order: { number: 2 },
        Description: { rich_text: [{ plain_text: "Two sentences." }] },
      },
    };
    expect(courseFromPage(page)).toEqual({ id: "p1", title: "Get started", apps: ["Xpot", "Xtimator"], published: true, order: 2, description: "Two sentences.", language: "en", group: "" });
  });
  it("reads a lesson page and defaults Format to Auto", () => {
    const l = lessonFromPage({
      id: "l9",
      properties: {
        Name: { title: [{ plain_text: "Intro" }] },
        Course: { relation: [{ id: "p1" }] },
        Published: { checkbox: false },
        Video: { url: "https://youtu.be/dQw4w9WgXcQ" },
        "Expected minutes": { number: 4 },
        Format: { select: { name: "Vertical" } },
      },
    });
    expect(l).toMatchObject({ courseId: "p1", video: "https://youtu.be/dQw4w9WgXcQ", expectedMinutes: 4, format: "Vertical", published: false });
    expect(lessonFromPage({ id: "x", properties: { Format: { select: { name: "Weird" } } } }).format).toBe("Auto");
  });
});

describe("Notion markdown to blocks", () => {
  it("maps callout, toggle, table, video, embed and drops unknown", () => {
    const md = [
      "Intro **text**",
      "",
      '<callout icon="💡" color="gray_bg">',
      "\tA tip with a list:",
      "\t- one",
      "</callout>",
      "<details>",
      "<summary>More</summary>",
      "\tHidden **body**",
      "</details>",
      '<table header-row="true">',
      "\t<tr>",
      "\t\t<td>A</td>",
      "\t\t<td>B</td>",
      "\t</tr>",
      "\t<tr>",
      "\t\t<td>1</td>",
      "\t\t<td>2</td>",
      "\t</tr>",
      "</table>",
      '<video src="https://cdn.example/v.mp4">Caption</video>',
      '<embed source="https://example.com/x"/>',
      '<unknown url="https://notion.so/x" alt="thing"/>',
      "After {color=\"blue\"}",
    ].join("\n");
    const blocks = parseNotionMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(["markdown", "callout", "toggle", "table", "video", "embed", "markdown"]);
    const callout = blocks[1] as Extract<(typeof blocks)[number], { type: "callout" }>;
    expect(callout.icon).toBe("💡");
    expect(callout.children[0]).toMatchObject({ type: "markdown" });
    expect((blocks[2] as { summary: string }).summary).toBe("More");
    expect(blocks[3]).toEqual({ type: "table", headerRow: true, headerColumn: false, rows: [["A", "B"], ["1", "2"]] });
    expect(blocks[4]).toEqual({ type: "video", src: "https://cdn.example/v.mp4", caption: "Caption" });
    expect(blocks[5]).toMatchObject({ type: "embed", src: "https://example.com/x" });
    expect((blocks[6] as { text: string }).text).toBe("After");
  });
  it("turns a toggle heading into a toggle and keeps code fences intact", () => {
    const blocks = parseNotionMarkdown(['## Section {toggle="true"}', "\tinside", "", "```", "<callout>not a tag</callout>", "```"].join("\n"));
    expect(blocks[0]).toMatchObject({ type: "toggle", summary: "Section" });
    expect(blocks[1]).toMatchObject({ type: "markdown" });
  });
  it("never throws on an unclosed tag", () => {
    expect(() => parseNotionMarkdown("<callout>\nno end")).not.toThrow();
  });
});

describe("admin numbers", () => {
  const row = (over: Partial<ProgressRow>): ProgressRow => ({
    repId: 1, courseId: "c1", lessonId: "l1", firstOpenedAt: new Date(0), lastSeenAt: new Date(1000),
    activeSeconds: 0, videoDurationSeconds: null, videoWatchedSeconds: 0, maxScrollPct: 0, completedAt: null, ...over,
  });
  it("counts enrolled, completed and drop-off per lesson", () => {
    const done = new Date();
    const rows = [
      row({ repId: 1, lessonId: "l1", completedAt: done }), row({ repId: 1, lessonId: "l2", completedAt: done }),
      row({ repId: 2, lessonId: "l1", completedAt: done }), row({ repId: 2, lessonId: "l2" }),
      row({ repId: 3, lessonId: "l1" }),
    ];
    const stats = courseStats({ id: "c1", lessonIds: ["l1", "l2"] }, rows);
    expect(stats).toMatchObject({ enrolled: 3, completed: 1, completionPct: 33 });
    expect(stats.lessons).toEqual([
      { lessonId: "l1", opened: 3, completed: 2, dropOff: 1 },
      { lessonId: "l2", opened: 2, completed: 1, dropOff: 1 },
    ]);
  });
  it("builds a person's lines with the too-fast flag", () => {
    const lines = personLessonLines(["l1", "l2"], [row({ lessonId: "l1", completedAt: new Date(), activeSeconds: 20, videoDurationSeconds: 100, videoWatchedSeconds: 100 })], [{ lessonId: "l1", expectedSeconds: 120 }]);
    expect(lines[0]).toMatchObject({ completed: true, tooFast: true, videoPct: 100 });
    expect(lines[1]).toMatchObject({ completed: false, tooFast: false, activeSeconds: 0 });
  });
});

describe("configuration", () => {
  it("accepts a pasted Notion URL or a dashed id", () => {
    expect(normalizeNotionId("https://www.notion.so/ws/0123456789abcdef0123456789abcdef?v=1")).toBe("0123456789abcdef0123456789abcdef");
    expect(normalizeNotionId("01234567-89ab-cdef-0123-456789abcdef")).toBe("0123456789abcdef0123456789abcdef");
  });
  it("the NOTION_* environment is a development-only fallback", () => {
    const env = { NOTION_TOKEN: "t", NOTION_ACADEMY_COURSES_DB: "a".repeat(32), NOTION_ACADEMY_LESSONS_DB: "b".repeat(32) };
    expect(envNotionConfig({ ...env, NODE_ENV: "development" })).toMatchObject({ token: "t" });
    expect(envNotionConfig({ ...env, NODE_ENV: "production" })).toBeNull();
    expect(envProvides("notion", { ...env, NODE_ENV: "production" })).toBe(false);
    expect(envProvides("notion", { ...env, NODE_ENV: "development" })).toBe(true);
  });
  it("fixtures and drafts never apply in production", () => {
    expect(fixturesEnabled({ NODE_ENV: "development", ACADEMY_FIXTURES: "1" })).toBe(true);
    expect(fixturesEnabled({ NODE_ENV: "production", ACADEMY_FIXTURES: "1" })).toBe(false);
    expect(fixturesEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(draftsEnabled({ NODE_ENV: "production", ACADEMY_INCLUDE_DRAFTS: "1" })).toBe(false);
  });
  it("registers Notion as a provider that needs both database ids", () => {
    expect(getProviderDef("notion")?.fields.map((f) => f.key)).toEqual(["apiKey", "coursesDatabaseId", "lessonsDatabaseId"]);
    expect(integrationProblemCode("notion", { hasApiKey: true, config: { coursesDatabaseId: "a" } })).toBe("missing_database");
    expect(integrationProblemCode("notion", { hasApiKey: true, config: { coursesDatabaseId: "a", lessonsDatabaseId: "b" } })).toBeNull();
    const status = maskIntegration("notion", { isEnabled: true, apiKey: "ntn_secret1234", config: { coursesDatabaseId: "a", lessonsDatabaseId: "b" } }, {});
    expect(status.problem).toBeNull();
    expect(status.apiKeyLast4).toBe("1234");
    expect(JSON.stringify(status)).not.toContain("ntn_secret");
  });
});

describe("fixture source", () => {
  it("has one English course (three lessons: vertical, horizontal, text only) plus its Portuguese translation", async () => {
    const [allCourses, allLessons] = await Promise.all([fixtureSource.listCourses(), fixtureSource.listLessons()]);
    expect(allCourses.map((c) => c.language)).toEqual(["en", "pt"]);
    expect(new Set(allCourses.map((c) => c.group)).size).toBe(1);
    expect(allLessons.filter((l) => l.courseId === allCourses[1].id)).toHaveLength(1);
    const courses = allCourses.filter((c) => c.language === "en");
    const lessons = allLessons.filter((l) => l.courseId === courses[0].id);
    expect(lessons.map((l) => l.format)).toEqual(["Vertical", "Horizontal", "Auto"]);
    expect(lessons[2].video).toBeNull();
    const blocks = parseNotionMarkdown(await fixtureSource.lessonMarkdown(lessons[2].id));
    expect(blocks.map((b) => b.type)).toEqual(expect.arrayContaining(["callout", "toggle", "table"]));
  });
});

describe("availability never waits on Notion", () => {
  it("answers false at the deadline when the source is slow", async () => {
    vi.resetModules();
    vi.doMock("../server/academy/source", async (orig) => ({
      ...(await orig<typeof import("../server/academy/source")>()),
      getContentSource: () => new Promise(() => undefined),
    }));
    vi.doMock("../server/storage", () => ({ storage: {} }));
    const { academyAvailable, resetAcademyCache } = await import("../server/academy/catalog");
    resetAcademyCache();
    const started = Date.now();
    expect(await academyAvailable(50)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    vi.doUnmock("../server/academy/source");
    vi.doUnmock("../server/storage");
  });
});
