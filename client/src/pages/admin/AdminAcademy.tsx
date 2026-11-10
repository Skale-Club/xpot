import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, GraduationCap, Users } from "lucide-react";
import { formatDuration, formatShare } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import type { AcademyAdminOverview, AcademyPersonSummary } from "@shared/academy";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { Pill } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { academyMessages } from "@/i18n/messages/academy";

// Admin › Academy (/admin/academy): per course who enrolled, who finished and where people stop; per person their
// progress, active time against the expected time and the "too fast" flag. A person opens in People (their Academy
// section shows the per-lesson breakdown and timeline).

export const ACADEMY_OVERVIEW_KEY = ["/api/xpot/admin/academy/overview"];

/** Expected time: 0 means unknown, shown as a dash rather than "0s". */
const formatExpected = (seconds: number) => (seconds > 0 ? formatDuration(seconds) : "—");

type CourseRow = AcademyAdminOverview["courses"][number];
type LessonRow = CourseRow["stats"]["lessons"][number];

function CourseSection({ course }: { course: CourseRow }) {
  const t = useT(academyMessages);
  const worst = Math.max(0, ...course.stats.lessons.map((l) => l.dropOff));
  const columns: CompactDataColumn<LessonRow>[] = [
    { key: "lesson", label: t("lessonCol"), render: (l) => <span className="text-white">{l.title}</span> },
    { key: "opened", label: t("openedCol"), align: "right", render: (l) => l.opened },
    { key: "done", label: t("finishedCol"), align: "right", render: (l) => l.completed },
    {
      key: "drop",
      label: t("stopsHere"),
      align: "right",
      render: (l) => (l.dropOff > 0 && l.dropOff === worst ? <Pill tone="amber">{l.dropOff}</Pill> : l.dropOff),
    },
  ];
  return (
    <SectionCard title={<>{course.title} <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">{course.language}</span></>} icon={GraduationCap} accent="account" testId={`academy-admin-course-${course.id}`}>
      <dl className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">{t("enrolled")}</dt><dd className="mt-0.5 text-lg font-semibold text-white">{course.stats.enrolled}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">{t("completedCount")}</dt><dd className="mt-0.5 text-lg font-semibold text-white">{course.stats.completed}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">{t("completionRate")}</dt><dd className="mt-0.5 text-lg font-semibold text-white">{formatShare(course.stats.completed, course.stats.enrolled)}</dd></div>
      </dl>
      <CompactDataTable columns={columns} rows={course.stats.lessons} getRowKey={(l) => l.lessonId} dense />
    </SectionCard>
  );
}

export function PeopleTable({ people }: { people: AcademyPersonSummary[] }) {
  const t = useT(academyMessages);
  const rows = people.flatMap((person) => person.courses.map((course) => ({ person, course })));
  const columns: CompactDataColumn<(typeof rows)[number]>[] = [
    {
      key: "person",
      label: t("personCol"),
      render: ({ person }) => <Link href={`/admin/reps/${person.repId}`} className="font-medium text-white hover:underline">{person.name}</Link>,
    },
    { key: "course", label: t("adminCourses"), render: ({ course }) => course.title },
    { key: "progress", label: t("progressCol"), align: "right", render: ({ course }) => `${course.percent}%` },
    { key: "active", label: t("activeCol"), align: "right", render: ({ course }) => formatDuration(course.activeSeconds) },
    { key: "expected", label: t("expectedCol"), align: "right", render: ({ course }) => formatExpected(course.expectedSeconds) },
    { key: "last", label: t("lastSeenCol"), render: ({ course }) => (course.lastSeenAt ? formatDateTime(course.lastSeenAt) : t("never")) },
    {
      key: "flags",
      label: t("flagsCol"),
      render: ({ course }) => (course.tooFastLessons > 0 ? <span title={t("tooFastHint")}><Pill tone="amber">{t("tooFast")} · {course.tooFastLessons}</Pill></span> : null),
    },
  ];
  return <CompactDataTable columns={columns} rows={rows} getRowKey={({ person, course }) => `${person.repId}-${course.courseId}`} dense testId="academy-people" />;
}

export function AdminAcademy() {
  const t = useT(academyMessages);
  const query = useQuery<AcademyAdminOverview>({ queryKey: ACADEMY_OVERVIEW_KEY, staleTime: 30_000 });
  if (query.isLoading) return <ListSkeleton rows={3} rowClassName="h-40 rounded-2xl" className="space-y-4" />;
  if (query.isError || !query.data) return <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />;
  const { courses, people } = query.data;
  if (!courses.length) return <EmptyState icon={GraduationCap} title={t("adminTitle")} hint={t("adminEmpty")} />;
  return (
    <div className="space-y-5" data-testid="academy-admin">
      <p className="text-sm text-white/55">{t("adminIntro")}</p>
      {courses.map((course) => <CourseSection key={course.id} course={course} />)}
      <SectionCard title={t("adminPeople")} icon={Users} accent="account">
        {people.length ? <PeopleTable people={people} /> : <EmptyState compact icon={CheckCircle2} title={t("noPeople")} />}
      </SectionCard>
    </div>
  );
}
