// Super-admin numbers: per course (enrolled, completed, where people stop) and per person (progress, active time
// against expected time, too-fast flags, timeline). Pure rules live in shared/academy.ts.

import { desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { academyEvents, academyLessonProgress, salesReps } from "#shared/schema.js";
import {
  coursePercent,
  courseStats,
  expectedSeconds,
  personLessonLines,
  type AcademyAdminOverview,
  type AcademyPersonCourse,
  type AcademyPersonDetail,
  type AcademyPersonSummary,
  type LessonExpectation,
  type ProgressRow,
} from "#shared/academy.js";
import { lessonWords, loadVisibleCourses, type VisibleCourse } from "./catalog.js";

async function allProgress(): Promise<ProgressRow[]> {
  return db.select().from(academyLessonProgress);
}

/** Expected seconds of every lesson: Expected minutes, else the longest video any viewer reported plus reading time. */
async function expectations(courses: VisibleCourse[], rows: ProgressRow[]): Promise<LessonExpectation[]> {
  const out: LessonExpectation[] = [];
  for (const course of courses) {
    for (const lesson of course.lessons) {
      const duration = rows.filter((r) => r.lessonId === lesson.id).reduce((m, r) => Math.max(m, r.videoDurationSeconds ?? 0), 0);
      const words = lesson.expectedMinutes ? 0 : await lessonWords(lesson.id);
      out.push({ lessonId: lesson.id, expectedSeconds: expectedSeconds({ expectedMinutes: lesson.expectedMinutes, videoDurationSeconds: duration, bodyWords: words }) });
    }
  }
  return out;
}

function personCourses(courses: VisibleCourse[], rows: ProgressRow[], exp: LessonExpectation[]): AcademyPersonCourse[] {
  const out: AcademyPersonCourse[] = [];
  for (const course of courses) {
    const lessonIds = course.lessons.map((l) => l.id);
    const mine = rows.filter((r) => lessonIds.includes(r.lessonId));
    if (!mine.length) continue;
    const lines = personLessonLines(lessonIds, mine, exp);
    const titles = new Map(course.lessons.map((l) => [l.id, l.title]));
    const last = mine.map((r) => new Date(r.lastSeenAt).getTime()).reduce((a, b) => Math.max(a, b), 0);
    out.push({
      courseId: course.id,
      title: course.title,
      percent: coursePercent(lines.filter((l) => l.completed).length, lessonIds.length),
      completedLessons: lines.filter((l) => l.completed).length,
      totalLessons: lessonIds.length,
      activeSeconds: lines.reduce((s, l) => s + l.activeSeconds, 0),
      expectedSeconds: lines.reduce((s, l) => s + l.expectedSeconds, 0),
      lastSeenAt: last ? new Date(last).toISOString() : null,
      tooFastLessons: lines.filter((l) => l.tooFast).length,
      lessons: lines.map((l) => ({ ...l, title: titles.get(l.lessonId) ?? l.lessonId })),
    });
  }
  return out;
}

function summaryOf(repId: number, name: string, courses: VisibleCourse[], rows: ProgressRow[], exp: LessonExpectation[]): AcademyPersonSummary {
  const mine = personCourses(courses, rows.filter((r) => r.repId === repId), exp);
  const last = mine.map((c) => c.lastSeenAt).filter((v): v is string => Boolean(v)).sort().pop() ?? null;
  return { repId, name, courses: mine, lastSeenAt: last };
}

export async function adminOverview(): Promise<AcademyAdminOverview> {
  const [courses, rows] = await Promise.all([loadVisibleCourses(), allProgress()]);
  const exp = await expectations(courses, rows);
  const reps = await db.select({ id: salesReps.id, name: salesReps.displayName }).from(salesReps);
  const names = new Map(reps.map((r) => [r.id, r.name]));
  const repIds = Array.from(new Set(rows.map((r) => r.repId)));
  return {
    courses: courses.map((course) => {
      const stats = courseStats({ id: course.id, lessonIds: course.lessons.map((l) => l.id) }, rows);
      const titles = new Map(course.lessons.map((l) => [l.id, l.title]));
      return { id: course.id, title: course.title, language: course.language, stats: { ...stats, lessons: stats.lessons.map((l) => ({ ...l, title: titles.get(l.lessonId) ?? l.lessonId })) } };
    }),
    people: repIds
      .map((id) => summaryOf(id, names.get(id) ?? `#${id}`, courses, rows, exp))
      .sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "")),
  };
}

export async function adminPerson(repId: number): Promise<AcademyPersonDetail | null> {
  const [rep] = await db.select({ id: salesReps.id, name: salesReps.displayName }).from(salesReps).where(eq(salesReps.id, repId));
  if (!rep) return null;
  const [courses, rows, events] = await Promise.all([
    loadVisibleCourses(),
    db.select().from(academyLessonProgress),
    db.select().from(academyEvents).where(eq(academyEvents.repId, repId)).orderBy(desc(academyEvents.createdAt)).limit(100),
  ]);
  const exp = await expectations(courses, rows);
  const titles = new Map(courses.flatMap((c) => c.lessons.map((l) => [l.id, l.title] as const)));
  return {
    ...summaryOf(repId, rep.name, courses, rows.filter((r) => r.repId === repId), exp),
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      courseId: e.courseId,
      lessonId: e.lessonId,
      lessonTitle: titles.get(e.lessonId) ?? null,
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
