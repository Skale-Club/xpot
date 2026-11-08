// Recording what a person does in a lesson: heartbeats and discrete events. The client is never trusted: deltas are
// clamped, ranges are merged inside the video's length, and an automatic completion is re-checked here.

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { academyEvents, academyLessonProgress, organizationMemberships } from "#shared/schema.js";
import {
  ACADEMY_EVENT_TYPES,
  MAX_RANGES,
  canAutoComplete,
  clampHeartbeat,
  clampPercent,
  mergeRanges,
  rangesSeconds,
  readRanges,
  type AcademyEventType,
  type WatchedRange,
} from "#shared/academy.js";

const payloadSchema = z
  .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
  .refine((p) => Object.keys(p).length <= 10, "Too many payload keys");

export const trackSchema = z.object({
  courseId: z.string().trim().min(1).max(100),
  event: z.enum(ACADEMY_EVENT_TYPES).optional(),
  activeSeconds: z.number().finite().optional(),
  videoDurationSeconds: z.number().finite().min(0).max(86_400).nullable().optional(),
  videoRanges: z.array(z.tuple([z.number().finite(), z.number().finite()])).max(MAX_RANGES * 2).optional(),
  maxScrollPct: z.number().finite().optional(),
  payload: payloadSchema.optional(),
});
export type TrackInput = z.infer<typeof trackSchema>;

/** The person's active organization, if any. Read-only: it never creates a workspace. */
export async function activeOrganizationOf(repId: number): Promise<number | null> {
  const [row] = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.repId, repId), eq(organizationMemberships.isActive, true), isNull(organizationMemberships.blockedAt)))
    .orderBy(desc(organizationMemberships.updatedAt))
    .limit(1);
  return row?.organizationId ?? null;
}

export type TrackResult = { completed: boolean; watchedRanges: WatchedRange[]; videoDurationSeconds: number | null; maxScrollPct: number };

export async function recordTrack(input: { repId: number; lessonId: string; hasVideo: boolean; track: TrackInput; expectedReadingSeconds?: number }): Promise<TrackResult> {
  const { repId, lessonId, hasVideo, track, expectedReadingSeconds } = input;
  const organizationId = await activeOrganizationOf(repId);
  const now = new Date();

  return db.transaction(async (tx) => {
    await tx
      .insert(academyLessonProgress)
      .values({ repId, organizationId, courseId: track.courseId, lessonId, firstOpenedAt: now, lastSeenAt: now })
      .onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(academyLessonProgress)
      .where(and(eq(academyLessonProgress.repId, repId), eq(academyLessonProgress.lessonId, lessonId)))
      .for("update");

    const duration = hasVideo ? (track.videoDurationSeconds != null ? Math.round(track.videoDurationSeconds) : row.videoDurationSeconds) : null;
    const ranges = hasVideo ? mergeRanges([...readRanges(row.videoWatchedRanges), ...(track.videoRanges ?? [])], duration) : [];
    const watched = rangesSeconds(ranges);
    const maxScrollPct = Math.max(row.maxScrollPct, clampPercent(track.maxScrollPct ?? 0));
    const event: AcademyEventType | undefined = track.event;
    const activeSeconds = row.activeSeconds + clampHeartbeat(track.activeSeconds);

    let completedAt = row.completedAt;
    let eventToWrite: AcademyEventType | null = event ?? null;
    if (event === "lesson_complete") {
      const auto = track.payload?.auto === true;
      const allowed = !auto || canAutoComplete({ hasVideo, videoDurationSeconds: duration, videoWatchedSeconds: watched, maxScrollPct, activeSeconds, expectedReadingSeconds });
      if (!allowed || completedAt) eventToWrite = null;
      else completedAt = now;
    } else if (event === "lesson_reopen") {
      if (completedAt) completedAt = null;
      else eventToWrite = null;
    }

    const [saved] = await tx
      .update(academyLessonProgress)
      .set({
        organizationId: row.organizationId ?? organizationId,
        lastSeenAt: now,
        activeSeconds,
        videoDurationSeconds: duration,
        videoWatchedRanges: ranges,
        videoWatchedSeconds: watched,
        maxScrollPct,
        completedAt,
        openCount: row.openCount + (event === "lesson_open" ? 1 : 0),
      })
      .where(and(eq(academyLessonProgress.repId, repId), eq(academyLessonProgress.lessonId, lessonId)))
      .returning();

    if (eventToWrite) {
      await tx.insert(academyEvents).values({
        repId,
        organizationId: saved.organizationId,
        courseId: track.courseId,
        lessonId,
        type: eventToWrite,
        payload: track.payload ?? {},
        createdAt: now,
      });
    }
    return {
      completed: Boolean(saved.completedAt),
      watchedRanges: readRanges(saved.videoWatchedRanges),
      videoDurationSeconds: saved.videoDurationSeconds,
      maxScrollPct: saved.maxScrollPct,
    };
  });
}

export async function progressOf(repId: number, lessonIds?: string[]) {
  const where = lessonIds?.length
    ? and(eq(academyLessonProgress.repId, repId), inArray(academyLessonProgress.lessonId, lessonIds))
    : eq(academyLessonProgress.repId, repId);
  return db.select().from(academyLessonProgress).where(where);
}
