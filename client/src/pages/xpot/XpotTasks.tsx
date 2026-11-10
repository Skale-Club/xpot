import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, Check, Clock3, Flag, List, Pencil, Plus, RotateCcw, Users, X } from "lucide-react";
import { Link, useRouter } from "wouter";
import { FilterBar, FilterChips, FilterSearch, FilterSelect, FilterToggle } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, useOffsetPages } from "@/components/xpot/pagination";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { useViewerAccess } from "@/lib/adminMode";
import type { FullSalesLead, SalesTask } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { PageHeader } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { EYEBROW, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/i18n";
import { tasksMessages } from "@/i18n/messages/tasks";
import { customerOrdersMessages } from '@/i18n/messages/customerOrders';
import { EMPTY_TASK, TASK_PRIORITIES, TaskForm, invalidateTaskLists, taskBody, type TaskFormValues } from "./components/leads/TaskForm";
import { TaskCalendar } from "./components/TaskCalendar";
import { calendarDayKey, fetchCalendarTasks, parseCalendarDay } from "./taskCalendar";

type EnrichedTask = SalesTask & {
  lead: { id: number; name: string } | null;
  assignee: { id: number; displayName: string; email: string | null } | null;
  opportunity: { id: number; title: string } | null;
};
type Member = { repId: number; displayName: string; isActive: boolean; blockedAt?: string | null };
type Form = TaskFormValues;

const emptyForm: Form = EMPTY_TASK;
const priorityOptions = TASK_PRIORITIES;
const bucketKeys = ["bucketOverdue", "bucketToday", "bucketTomorrow", "bucketUpcoming", "bucketNoDate"] as const;
type BucketKey = (typeof bucketKeys)[number];

function localInput(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function bucket(task: EnrichedTask): BucketKey {
  if (!task.dueAt) return "bucketNoDate";
  const due = new Date(task.dueAt);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(due); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "bucketOverdue";
  if (diff === 0) return "bucketToday";
  if (diff === 1) return "bucketTomorrow";
  return "bucketUpcoming";
}

export function XpotTasks() {
  // Inside the management panel the panel already names the screen.
  const inPanel = useRouter().base.startsWith("/admin");
  const isDesktop = useIsDesktop();
  const { me } = useXpotQueries();
  const { toast } = useToast();
  const t = useT(tasksMessages);
  const ordersT=useT(customerOrdersMessages);
  // ?status=completed&priority=high&q=invoice&team=1
  const filters = useUrlFilters({ q: "", status: "open", priority: "", team: "", view: "list", day: "" });
  const calendarView = filters.values.view === "calendar";
  const calendarDay = parseCalendarDay(filters.values.day) ?? new Date();
  const selectedDay = calendarDayKey(calendarDay);
  const [showUndated, setShowUndated] = useState(false);
  const search = filters.values.q.trim();
  const status = (["open", "completed", "cancelled"] as const).find((value) => value === filters.values.status) ?? "open";
  const priority = priorityOptions.some((option) => option.value === filters.values.priority) ? filters.values.priority : "";
  const [editing, setEditing] = useState<EnrichedTask | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  // The team's tasks and assigning to others are management: only in management mode,
  // like every other list (the server narrows "all" to the person's own outside it).
  // A Rep Admin's team is the organization they run (the server keeps it to that).
  const { adminMode: canManage, reach } = useViewerAccess();
  const organizationId = (reach === "organization"
    ? me?.organizations?.find((organization) => organization.membershipRole === "admin" && !organization.personal)
    : me?.organizations?.[0])?.id;
  // Inside the management panel the list is the team's from the start (the tile that opens it counts the team's
  // tasks), and "Only mine" narrows it; in My work the list is the person's own and "Whole team" widens it.
  const team = canManage && (filters.values.team === "1" || (inPanel && filters.values.team !== "0"));

  const taskParams = new URLSearchParams({ status: status === "open" ? "pending,in_progress" : status });
  if (priority) taskParams.set("priority", priority);
  if (search) taskParams.set("search", search);
  if (team) taskParams.set("all", "true");
  // Keep the last list on screen while the next filter loads.
  // 100 at a time from the server; the next page loads as you reach the end.
  // staleTime 0: a fresh read every time the screen opens (it was refetchOnMount).
  const tasks = useOffsetPages<EnrichedTask>({
    queryKey: [`/api/xpot/tasks?${taskParams}`],
    url: (offset, limit) => `/api/xpot/tasks?${taskParams}&limit=${limit}&offset=${offset}`,
    pageSize: 100,
    staleTime: 0,
    enabled: !calendarView,
  });
  const calendarTasks = useQuery<EnrichedTask[]>({
    queryKey: [`/api/xpot/tasks?${taskParams}`, "calendar"],
    queryFn: ({ signal }) => fetchCalendarTasks(`/api/xpot/tasks?${taskParams}`, signal),
    enabled: calendarView,
    staleTime: 0,
  });
  const taskItems = calendarView ? calendarTasks.data ?? [] : tasks.items;
  const tasksLoading = calendarView ? calendarTasks.isLoading : tasks.isLoading;
  const tasksError = calendarView ? calendarTasks.error : tasks.error;
  const refetchTasks = () => calendarView ? calendarTasks.refetch() : tasks.refetch();
  const taskCount = taskItems.length;
  const leads = useQuery<FullSalesLead[]>({ queryKey: ["/api/xpot/leads"], enabled: open });
  const members = useQuery<Member[]>({ queryKey: [`/api/xpot/organizations/${organizationId}/members`], enabled: open && canManage && Boolean(organizationId) });

  const save = useMutation({
    mutationFn: async () => {
      const body = taskBody(form);
      const response = await apiRequest(editing ? "PATCH" : "POST", editing ? `/api/xpot/tasks/${editing.id}` : "/api/xpot/tasks", body);
      return response.json();
    },
    onSuccess: async () => {
      setOpen(false); setEditing(null); setForm(emptyForm);
      await invalidateTaskLists();
      toast({ title: editing ? t("taskUpdated") : t("taskCreated"), variant: "success" });
    },
    onError: (error: Error) => toast({ title: t("saveFailed"), description: error.message, variant: "destructive" }),
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: string }) => (await apiRequest("POST", `/api/xpot/tasks/${id}/${action}`)).json(),
    onSuccess: async () => {
      await invalidateTaskLists();
    },
    onError: (error: Error) => toast({ title: t("changeFailed"), description: error.message, variant: "destructive" }),
  });

  const groups = useMemo(() => {
    if (calendarView) {
      const selected = taskItems.filter((task) => showUndated ? !task.dueAt : task.dueAt && calendarDayKey(new Date(task.dueAt)) === selectedDay);
      return selected.length ? [{ key: "bucketUpcoming" as const, tasks: selected }] : [];
    }
    const map = new Map<BucketKey, EnrichedTask[]>();
    for (const task of taskItems) map.set(bucket(task), [...(map.get(bucket(task)) ?? []), task]);
    return bucketKeys.flatMap((key) => map.has(key) ? [{ key, tasks: map.get(key)! }] : []);
  }, [taskItems, calendarView, selectedDay, showUndated]);

  function statusLabel(value: string) {
    // "Pending" is every task that has not started: it says nothing, so only the exceptions are named.
    if (value === "pending") return "";
    if (value === "in_progress") return t("statusInProgress");
    if (value === "completed") return t("statusCompleted");
    if (value === "cancelled") return t("statusCancelled");
    return value;
  }

  function priorityLabel(value: string) {
    const option = priorityOptions.find((item) => item.value === value);
    return option ? t(option.labelKey) : value;
  }

  function newTask() {
    setEditing(null);
    setForm({ ...emptyForm, repId: String(me?.rep.id ?? ""), dueAt: calendarView && !showUndated ? `${selectedDay}T09:00` : "" });
    setOpen(true);
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    newTask();
    const next = new URL(window.location.href);
    next.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", `${next.pathname}${next.search}${next.hash}`);
    // This is a one-shot route action; reopening is controlled by the dialog itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function editTask(task: EnrichedTask) {
    setEditing(task);
    setForm({ title: task.title, description: task.description ?? "", dueAt: localInput(task.dueAt), priority: task.priority, type: task.type, leadId: String(task.leadId ?? ""), repId: String(task.repId) });
    setOpen(true);
  }

  return <div className="space-y-5">
    {/* The desktop breadcrumb and the management panel already name the screen. */}
    {!inPanel && !isDesktop ? (
      <PageHeader
        safeArea={false}
        className="!mb-0 !items-center [&>div:last-child]:pt-0 [&_h1]:mt-0"
        accent="visits"
        title={t("title")}
        actions={(
          <Button type="button" variant="brand" onClick={newTask} className="shrink-0">
            <Plus aria-hidden="true" /> {t("newTask")}
          </Button>
        )}
      />
    ) : null}

    <FilterBar
      testId="tasks-filters"
      search={<FilterSearch value={filters.values.q} onChange={(q) => filters.set({ q })} placeholder={t("searchPlaceholder")} debounceMs={300} />}
      actions={<>
        <div role="group" aria-label={t("viewLabel")} className="flex shrink-0 rounded-xl border border-white/[0.08] bg-black/20 p-0.5">
          {([{ id: "list", icon: List, label: t("viewList") }, { id: "calendar", icon: CalendarDays, label: t("viewCalendar") }] as const).map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" onClick={() => filters.set({ view: id })} aria-label={label} title={label} aria-pressed={calendarView === (id === "calendar")} className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${calendarView === (id === "calendar") ? "bg-indigo-500/20 text-blue-200" : "text-white/40 hover:bg-white/5 hover:text-white/80"}`} data-testid={`tasks-view-${id}`}><Icon className="h-4 w-4" aria-hidden="true" /></button>
          ))}
        </div>
        {inPanel || isDesktop ? <Button type="button" variant="brand" size="sm" onClick={newTask} className="h-10" data-testid="tasks-new">
          <Plus aria-hidden="true" /> {t("newTask")}
        </Button> : null}
      </>}
      controls={
        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2">
          <FilterSelect
            value={priority}
            onChange={(next) => filters.set({ priority: next })}
            placeholder={t("allPriorities")}
            icon={Flag}
            className="w-full lg:w-auto"
            options={priorityOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          />
          {canManage ? (inPanel
            ? <FilterToggle pressed={!team} onChange={(on) => filters.set({ team: on ? "0" : null })} label={t("onlyMine")} icon={Users} />
            : <FilterToggle pressed={team} onChange={(on) => filters.set({ team: on ? "1" : null })} label={t("wholeTeam")} icon={Users} />) : null}
          <FilterChips
            items={[
              { id: "open", label: t("filterOpen") },
              { id: "completed", label: t("filterCompleted") },
              { id: "cancelled", label: t("filterCancelled") },
            ]}
            value={status}
            onChange={(next) => filters.set({ status: next })}
            ariaLabel={t("filterByStatus")}
          />
        </div>
      }
      summary={{ shown: taskCount, active: filters.activeCount(["q", "status", "priority", "team"]) > 0, onClear: () => filters.reset(["view", "day"]) }}
    />

    {calendarView && !tasksLoading && !tasksError ? (
      <TaskCalendar tasks={taskItems} value={calendarDay} undated={showUndated} onChange={(day) => { setShowUndated(false); filters.set({ day: calendarDayKey(day) }); }} onUndated={() => setShowUndated(true)} onCreate={newTask} />
    ) : null}

    {tasksLoading ? (
      <ListSkeleton rows={4} rowClassName="h-24 rounded-2xl" />
    ) : tasksError && (calendarView || taskCount === 0) ? (
      // A failed read is not an empty queue.
      <ErrorState message={t("loadFailed")} onRetry={() => void refetchTasks()} />
    ) : groups.length === 0 ? (
      <EmptyState icon={calendarView ? CalendarDays : Check} title={calendarView ? t(showUndated ? "noUndatedTasks" : "noTasksOnDay") : t("noTasks")}>
        <Button type="button" variant="brand" size="sm" onClick={newTask}><Plus aria-hidden="true" /> {t("newTask")}</Button>
      </EmptyState>
    ) : groups.map((group) => <section key={group.key} className="space-y-2">
      {!calendarView && <div className="flex items-center gap-2 px-1">
        <h2 className={EYEBROW}>{t(group.key)}</h2>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] tabular-nums text-white/40">{group.tasks.length}</span>
      </div>}
      <div className="grid gap-2 lg:grid-cols-2">{group.tasks.map((task) => <article key={task.id} className={`group rounded-2xl p-4 transition ${group.key === "bucketOverdue" ? "border border-red-400/20 bg-red-500/[0.04]" : `${GLASS_SUBTLE_CLASS} hover:border-white/15`}`}>
        <div className="flex items-start gap-2">
          {task.status === "completed" || task.status === "cancelled" ? (
            <span className="-ml-1.5 -mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${task.status === "completed" ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20 text-white/40"}`}>
                {task.status === "completed" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`font-semibold ${task.status === "completed" ? "text-white/35 line-through" : "text-white"}`}>{task.customerOrderId?<Link href={`/tags/orders/${task.customerOrderId}`}>{ordersT('deliver')}</Link>:task.title}</h3>
              <Pill tone={task.priority === "urgent" ? "red" : task.priority === "high" ? "amber" : "slate"}>{priorityLabel(task.priority)}</Pill>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
              {task.dueAt && <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden="true" />{formatDateTime(task.dueAt)}</span>}
              {task.lead && (task.leadId ? <Link href={`/leads/${task.leadId}`} className="text-blue-300/80 hover:text-blue-200">{task.lead.name}</Link> : <span>{task.lead.name}</span>)}
              {team && task.assignee && <span>→ {task.assignee.displayName}</span>}
              {statusLabel(task.status) ? <span>{statusLabel(task.status)}</span> : null}
            </div>
            {task.description && <p className="mt-2 line-clamp-2 text-sm text-white/50">{task.description}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => editTask(task)} disabled={changeStatus.isPending && changeStatus.variables?.id === task.id} aria-label={t("edit")} title={t("edit")} className="-mr-2 -mt-2 text-white/40"><Pencil aria-hidden="true" /></Button>
        </div>
        {task.status !== "completed" && task.status !== "cancelled" && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => changeStatus.mutate({ id: task.id, action: "complete" })}
            disabled={changeStatus.isPending}
            loading={changeStatus.isPending && changeStatus.variables?.id === task.id && changeStatus.variables.action === "complete"}
            aria-label={`${t("markDone")}: ${task.title}`}
            className="mr-auto px-2 text-xs text-emerald-300"
            data-testid={`task-done-${task.id}`}
          >
            <Check aria-hidden="true" /> {t("markDone")}
          </Button>
          {task.status === "pending" && <Button type="button" variant="ghost" size="sm" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: task.id, action: "start" })} className="px-2 text-xs text-indigo-300" data-testid={`task-start-${task.id}`}><Clock3 aria-hidden="true" /> {t("start")}</Button>}
          <Button type="button" variant="ghost" size="sm" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: task.id, action: "cancel" })} className="px-2 text-xs text-white/50"><X aria-hidden="true" /> {t("cancel")}</Button>
        </div>}
        {(task.status === "completed" || task.status === "cancelled") && <div className="mt-3 flex justify-end border-t border-white/5 pt-3"><Button type="button" variant="ghost" size="sm" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: task.id, action: "reopen" })} className="text-indigo-300"><RotateCcw aria-hidden="true" /> {t("reopen")}</Button></div>}
      </article>)}</div>
    </section>)}
    {!calendarView && <ListPager shown={taskCount} hasMore={tasks.hasMore} onMore={tasks.loadMore} loading={tasks.loadingMore} pageSize={100} />}

    <Dialog open={open} onOpenChange={(next) => { if (!save.isPending) setOpen(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pr-8"><DialogTitle className="text-base">{editing ? t("editTask") : t("newTask")}</DialogTitle></DialogHeader>
        <TaskForm
          value={form}
          onChange={setForm}
          onSubmit={() => save.mutate()}
          onCancel={() => setOpen(false)}
          pending={save.isPending}
          error={save.isError ? save.error.message : null}
          leads={leads.data ?? []}
          assignees={canManage ? (members.data ?? [{ repId: me!.rep.id, displayName: me!.rep.displayName, isActive: true }]).filter((member) => member.isActive && !member.blockedAt) : undefined}
        />
      </DialogContent>
    </Dialog>
  </div>;
}
