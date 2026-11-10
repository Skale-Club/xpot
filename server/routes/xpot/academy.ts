// Academy API. People: /api/xpot/academy/* (availability, courses, lessons, tracking). Super admin:
// /api/xpot/admin/academy/*. When no course is visible every people route answers 404, and the availability
// answer is just { available: false }.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requirePlatformAdmin, requireSuperAdmin, requireXpotUser, type XpotActor } from "./middleware.js";
import { sendValidationError } from "../../lib/validation.js";
import { academyAvailable, findLesson, lessonBody, lessonVideo, lessonWords, loadCoursesForLanguage, loadVisibleCourses, type VisibleCourse } from "../../academy/catalog.js";
import { recordTrack, progressOf, trackSchema } from "../../academy/tracking.js";
import { adminOverview, adminPerson } from "../../academy/admin.js";
import {
  coursePercent,
  expectedSeconds,
  isAcademyLanguage,
  type AcademyCourseDetail,
  type AcademyCourseSummary,
  type AcademyLessonDetail,
  type AcademyLessonSummary,
} from "#shared/academy.js";
import type { CatalogLesson } from "#shared/academy.js";

const notFound = (res: Response) => res.status(404).json({ message: "Not found" });
const repOf = (req: Request) => (req as unknown as { xpotActor: XpotActor }).xpotActor.rep.id;

function lessonSummary(lesson: CatalogLesson, done: Set<string>): AcademyLessonSummary {
  return { id: lesson.id, title: lesson.title, summary: lesson.summary, hasVideo: Boolean(lesson.video), expectedMinutes: lesson.expectedMinutes, completed: done.has(lesson.id) };
}

async function completedSet(repId: number, courses: VisibleCourse[]): Promise<{ done: Set<string>; opened: Set<string> }> {
  const rows = await progressOf(repId, courses.flatMap((c) => c.lessons.map((l) => l.id)));
  return { done: new Set(rows.filter((r) => r.completedAt).map((r) => r.lessonId)), opened: new Set(rows.map((r) => r.lessonId)) };
}

export function createAcademyRouter() {
  const router = Router();

  // The shell asks this on every screen: cheap, cached, and never slower than the availability deadline.
  router.get("/academy/availability", requireXpotUser, async (_req, res) => {
    res.set("Cache-Control", "private, max-age=60").json({ available: await academyAvailable() });
  });

  router.get("/academy/courses", requireXpotUser, async (req, res) => {
    // ?lang= is the app's interface language.
    const requested = isAcademyLanguage(req.query.lang) ? req.query.lang : null;
    const { courses } = await loadCoursesForLanguage(requested);
    if (!courses.length) return notFound(res);
    const { done, opened } = await completedSet(repOf(req), courses);
    const out: AcademyCourseSummary[] = courses.map((course) => {
      const completedCount = course.lessons.filter((l) => done.has(l.id)).length;
      return {
        id: course.id,
        title: course.title,
        language: course.language,
        description: course.description,
        lessonCount: course.lessons.length,
        completedCount,
        percent: coursePercent(completedCount, course.lessons.length),
        nextLessonId: (course.lessons.find((l) => !done.has(l.id)) ?? course.lessons[0]).id,
        started: course.lessons.some((l) => opened.has(l.id)),
      };
    });
    res.set("Cache-Control", "no-store").json({ courses: out });
  });

  router.get("/academy/courses/:courseId", requireXpotUser, async (req, res) => {
    const courses = await loadVisibleCourses();
    const course = courses.find((c) => c.id === req.params.courseId);
    if (!course) return notFound(res);
    const { done } = await completedSet(repOf(req), [course]);
    const detail: AcademyCourseDetail = {
      id: course.id,
      title: course.title,
      description: course.description,
      percent: coursePercent(course.lessons.filter((l) => done.has(l.id)).length, course.lessons.length),
      lessons: course.lessons.map((l) => lessonSummary(l, done)),
    };
    res.set("Cache-Control", "no-store").json(detail);
  });

  router.get("/academy/courses/:courseId/lessons/:lessonId", requireXpotUser, async (req, res) => {
    const found = await findLesson(req.params.courseId, req.params.lessonId);
    if (!found) return notFound(res);
    const { course, lesson } = found;
    const [{ done }, rows, body, video] = await Promise.all([
      completedSet(repOf(req), [course]),
      progressOf(repOf(req), [lesson.id]),
      lessonBody(lesson.id).catch((error) => {
        console.error("[academy] could not read the lesson:", error instanceof Error ? error.message : error);
        return { markdown: "", words: 0 };
      }),
      lessonVideo(lesson),
    ]);
    const index = course.lessons.findIndex((l) => l.id === lesson.id);
    const mine = rows[0];
    const detail: AcademyLessonDetail = {
      id: lesson.id,
      courseId: course.id,
      courseTitle: course.title,
      title: lesson.title,
      summary: lesson.summary,
      markdown: body.markdown,
      video,
      expectedMinutes: lesson.expectedMinutes,
      expectedReadingSeconds: expectedSeconds({ expectedMinutes: lesson.expectedMinutes, bodyWords: body.words }),
      prevLessonId: course.lessons[index - 1]?.id ?? null,
      nextLessonId: course.lessons[index + 1]?.id ?? null,
      lessons: course.lessons.map((l) => lessonSummary(l, done)),
      progress: {
        completed: Boolean(mine?.completedAt),
        watchedRanges: (mine?.videoWatchedRanges as Array<[number, number]> | undefined) ?? [],
        videoDurationSeconds: mine?.videoDurationSeconds ?? null,
        maxScrollPct: mine?.maxScrollPct ?? 0,
        activeSeconds: mine?.activeSeconds ?? 0,
      },
    };
    res.set("Cache-Control", "no-store").json(detail);
  });

  // Heartbeats and events of one lesson. Ids must belong to a visible course; numbers are clamped in recordTrack.
  router.post("/academy/lessons/:lessonId/track", requireXpotUser, async (req, res) => {
    const parsed = trackSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error, "Invalid input");
    const found = await findLesson(parsed.data.courseId, req.params.lessonId);
    if (!found) return notFound(res);
    const hasVideo = Boolean(found.lesson.video);
    // Only a text-only lesson's auto-complete needs the reading time (the body is cached by lessonBody).
    const needsReading = !hasVideo && parsed.data.event === "lesson_complete" && parsed.data.payload?.auto === true;
    const expectedReadingSeconds = needsReading
      ? expectedSeconds({ expectedMinutes: found.lesson.expectedMinutes, bodyWords: found.lesson.expectedMinutes ? 0 : await lessonWords(found.lesson.id) })
      : undefined;
    const result = await recordTrack({ repId: repOf(req), lessonId: found.lesson.id, hasVideo, track: parsed.data, expectedReadingSeconds });
    res.set("Cache-Control", "no-store").json(result);
  });

  // ─── Super admin ───────────────────────────────────────────────────────────
  const admin = [requirePlatformAdmin, requireSuperAdmin];
  router.get("/admin/academy/overview", ...admin, async (_req, res) => {
    res.set("Cache-Control", "no-store").json(await adminOverview());
  });
  router.get("/admin/academy/people/:repId", ...admin, async (req, res) => {
    const repId = z.coerce.number().int().positive().safeParse(req.params.repId);
    if (!repId.success) return notFound(res);
    const detail = await adminPerson(repId.data);
    if (!detail) return notFound(res);
    res.set("Cache-Control", "no-store").json(detail);
  });

  return router;
}
