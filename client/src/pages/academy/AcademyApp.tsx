import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Clock, GraduationCap, PlayCircle, RotateCcw } from "lucide-react";
import { ASPECT_RATIO, type AcademyAspect, type AcademyLanguage, type AcademyCourseDetail, type AcademyCourseSummary, type AcademyLessonDetail, type AcademyLessonSummary } from "@shared/academy";
import { Button } from "@/components/ui/button";
import { AppLoader } from "@/components/ui/spinner";
import { AppLayout } from "@/components/xpot/AppLayout";
import { ErrorState } from "@/components/xpot/EmptyState";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { PageHeader } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { BRAND_GRADIENT, EYEBROW, GLASS_CLASS } from "@/components/xpot/surface";
import { LessonBody } from "@/components/academy/LessonBody";
import { YouTubePlayer } from "@/components/academy/YouTubePlayer";
import { useLessonTracker } from "@/components/academy/useLessonTracker";
import { useAcademyAvailable } from "@/components/academy/useAcademyAvailable";
import { useI18n, useT } from "@/i18n";
import { ACCENT_SELECTED } from "@/components/xpot/surface";
import { academyMessages } from "@/i18n/messages/academy";
import { commonMessages } from "@/i18n/messages/common";
import { SessionGate } from "@/components/xpot/SessionGate";
import type { XpotMeResponse } from "../xpot/types";
import NotFound from "../NotFound";

// /academy (courses), /academy/:courseId (lessons), /academy/:courseId/:lessonId (the lesson). When there is no
// visible course the whole thing answers like any unknown address.

const COURSES_KEY = "/api/xpot/academy/courses";
/** The video box is never taller than this share of the screen, so the title stays in view on a phone. */
const VIDEO_MAX_VH = 70;

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label} className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: BRAND_GRADIENT }} />
    </div>
  );
}

function Frame({ title, back, eyebrow, children, wide = false }: { title: string; back?: string; eyebrow?: string; children: React.ReactNode; wide?: boolean }) {
  const tc = useT(commonMessages);
  return (
    <AppLayout title={title} size={wide ? "wide" : "medium"} mobileMaxWidth="max-w-lg" mobileColumnClassName="pb-20 pt-6">
      <PageHeader backHref={back} backLabel={tc("back")} eyebrow={eyebrow} title={title} className="mb-6" />
      {children}
    </AppLayout>
  );
}

// ─── Courses ─────────────────────────────────────────────────────────────────

function CourseList() {
  const t = useT(academyMessages);
  const { lang: uiLang } = useI18n();
  // The interface language is the only control; the server falls back to English, then any. The key carries the
  // language, so changing it refetches the list.
  const requested: AcademyLanguage = uiLang;
  const query = useQuery<{ courses: AcademyCourseSummary[] }>({ queryKey: [`${COURSES_KEY}?lang=${requested}`] });
  return (
    <Frame title={t("title")}>
      <p className="-mt-3 mb-5 text-sm text-white/50">{t("intro")}</p>
      {query.isLoading ? (
        <ListSkeleton rows={2} rowClassName="h-32 rounded-2xl" />
      ) : query.isError || !query.data ? (
        <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-4" data-testid="academy-courses">
          {query.data.courses.map((course) => (
            <Link key={course.id} href={`/academy/${course.id}`} className={`block rounded-2xl ${GLASS_CLASS} p-5 transition-colors hover:bg-white/[0.07]`} data-testid={`academy-course-${course.id}`}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-white">{course.title}</h2>
                  {course.description && <p className="mt-1 text-sm text-white/55">{course.description}</p>}
                  <p className="mt-2 text-xs text-white/45">{t("courseCount", { count: course.lessonCount })}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1"><ProgressBar percent={course.percent} label={t("progressLabel", { percent: course.percent })} /></div>
                <span className="text-xs tabular-nums text-white/55">{course.percent}%</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">{course.percent >= 100 ? t("review") : course.started ? t("continue") : t("start")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Frame>
  );
}

function LessonRows({ courseId, lessons, currentId }: { courseId: string; lessons: AcademyLessonSummary[]; currentId?: string }) {
  const t = useT(academyMessages);
  return (
    <ol className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_CLASS}`} data-testid="academy-lessons">
      {lessons.map((lesson, i) => (
        <li key={lesson.id}>
          <Link
            href={`/academy/${courseId}/${lesson.id}`}
            aria-current={lesson.id === currentId ? "page" : undefined}
            className={`flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.05] ${lesson.id === currentId ? "bg-white/[0.06]" : ""}`}
          >
            {lesson.completed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-label={t("completedLabel")} /> : <Circle className="h-5 w-5 shrink-0 text-white/25" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{i + 1}. {lesson.title}</span>
              {lesson.summary && <span className="block truncate text-xs text-white/45">{lesson.summary}</span>}
            </span>
            {lesson.hasVideo && <PlayCircle className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />}
          </Link>
        </li>
      ))}
    </ol>
  );
}

function CoursePage({ courseId }: { courseId: string }) {
  const t = useT(academyMessages);
  const query = useQuery<AcademyCourseDetail>({ queryKey: [COURSES_KEY, courseId] });
  if (query.isError && (query.error as { status?: number }).status === 404) return <NotFound />;
  const course = query.data;
  const next = course?.lessons.find((l) => !l.completed) ?? course?.lessons[0];
  return (
    <Frame title={course?.title ?? t("title")} back="/academy" eyebrow={t("title")}>
      {query.isLoading ? (
        <ListSkeleton rows={4} />
      ) : !course ? (
        <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-5">
          {course.description && <p className="-mt-3 text-sm text-white/55">{course.description}</p>}
          <div className="flex items-center gap-3">
            <div className="flex-1"><ProgressBar percent={course.percent} label={t("progressLabel", { percent: course.percent })} /></div>
            <span className="text-xs tabular-nums text-white/55">{t("progressLabel", { percent: course.percent })}</span>
          </div>
          {next && (
            <Button asChild variant="brand"><Link href={`/academy/${course.id}/${next.id}`}>{course.percent >= 100 ? t("review") : course.percent > 0 ? t("continue") : t("start")}<ArrowRight /></Link></Button>
          )}
          <LessonRows courseId={course.id} lessons={course.lessons} />
        </div>
      )}
    </Frame>
  );
}

// ─── Lesson ──────────────────────────────────────────────────────────────────

/** The reserved video box: its shape comes from the lesson, its size is known before the player loads. */
function VideoBox({ aspect, children }: { aspect: AcademyAspect; children: React.ReactNode }) {
  const [w, h] = ASPECT_RATIO[aspect].split(" / ").map(Number);
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-black"
      style={{ aspectRatio: ASPECT_RATIO[aspect], maxWidth: `calc(${VIDEO_MAX_VH}vh * ${w} / ${h})` }}
      data-testid="academy-video"
      data-aspect={aspect}
    >
      {children}
    </div>
  );
}

function LessonView({ lesson }: { lesson: AcademyLessonDetail }) {
  const t = useT(academyMessages);
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const tracker = useLessonTracker({
    courseId: lesson.courseId,
    lessonId: lesson.id,
    hasVideo: Boolean(lesson.video),
    bodyRef,
    initialCompleted: lesson.progress.completed,
    initialRanges: lesson.progress.watchedRanges,
    initialDuration: lesson.progress.videoDurationSeconds,
    initialActiveSeconds: lesson.progress.activeSeconds,
    expectedReadingSeconds: lesson.expectedReadingSeconds,
    onCompletedChange: () => {
      void queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(COURSES_KEY) });
    },
  });
  const index = lesson.lessons.findIndex((l) => l.id === lesson.id);
  const aspect = lesson.video?.aspect;
  // Vertical and square videos sit beside the text on a computer; a horizontal one is on top at full width.
  const sideBySide = aspect === "vertical" || aspect === "square";

  const video = lesson.video && !videoFailed ? (
    <VideoBox aspect={lesson.video.aspect}>
      <YouTubePlayer videoId={lesson.video.youtubeId} onReady={tracker.onPlayerReady} onStateChange={tracker.onPlayerState} onUnavailable={() => setVideoFailed(true)} />
    </VideoBox>
  ) : null;

  const text = (
    <div className="min-w-0 space-y-6">
      <div>
        <p className={EYEBROW}>{t("lessonOf", { n: index + 1, total: lesson.lessons.length })}{lesson.expectedMinutes ? ` · ${t("aboutMinutes", { minutes: lesson.expectedMinutes })}` : ""}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{lesson.title}</h2>
      </div>
      {videoFailed && <InlineAlert tone="warning">{t("videoUnavailable")}</InlineAlert>}
      <div ref={bodyRef}><LessonBody markdown={lesson.markdown} /></div>
      <div className="flex flex-wrap items-center gap-3">
        {tracker.completed ? (
          <>
            <Pill tone="green" dot>{t("completedLabel")}</Pill>
            <Button type="button" variant="ghost" size="sm" onClick={tracker.reopen}><RotateCcw />{t("markIncomplete")}</Button>
          </>
        ) : (
          <Button type="button" variant="brand" onClick={() => tracker.complete("manual")} data-testid="academy-complete"><Check />{t("markComplete")}</Button>
        )}
      </div>
      <nav className="flex items-center justify-between gap-3" aria-label={t("lessonsHeading")}>
        {lesson.prevLessonId ? <Button asChild variant="secondary"><Link href={`/academy/${lesson.courseId}/${lesson.prevLessonId}`}><ArrowLeft />{t("previous")}</Link></Button> : <span />}
        {lesson.nextLessonId
          ? <Button asChild variant="secondary"><Link href={`/academy/${lesson.courseId}/${lesson.nextLessonId}`}>{t("next")}<ArrowRight /></Link></Button>
          : <Button asChild variant="secondary"><Link href={`/academy/${lesson.courseId}`}>{t("finish")}</Link></Button>}
      </nav>
      <div>
        <h3 className={`${EYEBROW} mb-2 flex items-center gap-1.5`}><Clock className="h-3 w-3" aria-hidden="true" />{t("lessonsHeading")}</h3>
        <LessonRows courseId={lesson.courseId} lessons={lesson.lessons} currentId={lesson.id} />
      </div>
    </div>
  );

  if (video && sideBySide) {
    return (
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0">
        <div className="lg:sticky lg:top-24 lg:w-[calc(70vh*9/16)] lg:max-w-[40vw]">{video}</div>
        {text}
      </div>
    );
  }
  return <div className="space-y-6">{video}{text}</div>;
}

function LessonPage({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const t = useT(academyMessages);
  const query = useQuery<AcademyLessonDetail>({ queryKey: [COURSES_KEY, courseId, "lessons", lessonId], staleTime: 0, gcTime: 0 });
  if (query.isError && (query.error as { status?: number }).status === 404) return <NotFound />;
  const lesson = query.data;
  return (
    <Frame title={lesson?.courseTitle ?? t("title")} back={`/academy/${courseId}`} eyebrow={t("title")} wide>
      {query.isLoading ? (
        <ListSkeleton rows={3} rowClassName="h-40 rounded-2xl" />
      ) : !lesson ? (
        <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />
      ) : (
        // Keyed by lesson: a new lesson starts a fresh tracker.
        <LessonView key={lesson.id} lesson={lesson} />
      )}
    </Frame>
  );
}

// ─── Entry ───────────────────────────────────────────────────────────────────

export function AcademyApp() {
  const [location] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const { available, loading } = useAcademyAvailable();
  // A link sent to a partner opens sign-in first when there is no session.
  if (!meQuery.data) return meQuery.isLoading ? <AppLoader /> : <SessionGate error={meQuery.error} />;
  // The availability answer decides next: no visible course, no Academy.
  if (loading) return <AppLoader />;
  if (!available) return <NotFound />;
  const [, , courseId, lessonId] = location.split("?")[0].split("/");
  if (courseId && lessonId) return <LessonPage courseId={courseId} lessonId={lessonId} />;
  if (courseId) return <CoursePage courseId={courseId} />;
  return <CourseList />;
}
