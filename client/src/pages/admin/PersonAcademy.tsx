import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { AcademyPersonDetail } from "@shared/academy";
import { formatDuration } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { Pill } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { academyMessages } from "@/i18n/messages/academy";

// A compact Academy section on a person's page (Account › People): per course the progress and time against the
// expected time, per lesson the video and reading numbers, and the latest events. Asked only for the global admin.

type Line = AcademyPersonDetail["courses"][number]["lessons"][number];

export function PersonAcademy({ repId }: { repId: number }) {
  const t = useT(academyMessages);
  const query = useQuery<AcademyPersonDetail>({ queryKey: [`/api/xpot/admin/academy/people/${repId}`], staleTime: 30_000, retry: false });
  if (query.isLoading) return <p className="text-sm text-white/45">…</p>;
  // Not configured or nothing visible: the section says nothing rather than alarming.
  if (query.isError || !query.data) return <InlineAlert tone="info">{t("personLoadFailed")}</InlineAlert>;
  const person = query.data;
  if (!person.courses.length) return <p className="text-sm text-white/45">{t("personNoActivity")}</p>;

  const columns: CompactDataColumn<Line>[] = [
    { key: "lesson", label: t("lessonCol"), render: (l) => <span className="text-white">{l.title}</span> },
    { key: "active", label: t("activeCol"), align: "right", render: (l) => `${formatDuration(l.activeSeconds)} / ${formatDuration(l.expectedSeconds)}` },
    { key: "video", label: t("videoPct"), align: "right", render: (l) => (l.videoPct == null ? "-" : `${l.videoPct}%`) },
    { key: "scroll", label: t("scrollPct"), align: "right", render: (l) => `${l.scrollPct}%` },
    {
      key: "done",
      label: t("completedCol"),
      render: (l) => (
        <span className="flex items-center gap-1.5">
          {l.completed ? t("yes") : t("no")}
          {l.tooFast && <Pill tone="amber">{t("tooFast")}</Pill>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4" data-testid={`person-academy-${repId}`}>
      {person.courses.map((course) => (
        <div key={course.courseId} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-white/85">{course.title}</h4>
            <Pill tone={course.percent >= 100 ? "green" : "slate"}>{course.percent}%</Pill>
            {course.tooFastLessons > 0 && <Pill tone="amber">{t("tooFast")} · {course.tooFastLessons}</Pill>}
            <span className="text-xs text-white/45">{t("lastSeenCol")}: {course.lastSeenAt ? formatDateTime(course.lastSeenAt) : t("never")}</span>
          </div>
          <CompactDataTable columns={columns} rows={course.lessons.filter((l) => l.activeSeconds > 0 || l.completed || l.lastSeenAt)} getRowKey={(l) => l.lessonId} dense />
        </div>
      ))}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-white/85">{t("timeline")}</h4>
        {person.events.length ? (
          <ul className="space-y-1 text-sm text-white/65">
            {person.events.slice(0, 15).map((e) => (
              <li key={e.id}>
                <span className="text-white/40">{formatDateTime(e.createdAt)}</span> · {t(`event_${e.type}` as keyof typeof academyMessages.en)}
                {e.lessonTitle ? ` · ${e.lessonTitle}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/45">{t("noEvents")}</p>
        )}
        <Link href="/admin/academy" className="mt-2 inline-block text-xs text-blue-300 hover:underline">{t("openInDashboard")}</Link>
      </div>
    </div>
  );
}
