import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, Flag, MoreVertical, Pencil, Plus, RotateCcw, Users, X } from "lucide-react";
import { Link, useRouter } from "wouter";
import { FilterBar, FilterChips, FilterSearch, FilterSelect, FilterToggle } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, useOffsetPages } from "@/components/xpot/pagination";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { EMPTY_TASK, TASK_PRIORITIES, TaskForm, invalidateTaskLists, taskBody, type TaskFormValues } from "./components/leads/TaskForm";

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

/** The less used actions of a task (edit, cancel) behind one menu, so the card shows only what is done in the field. */
function TaskMenu({ label, items }: { label: string; items: Array<{ key: string; label: string; icon: typeof X; run: () => void }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative -mr-2 -mt-2 shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <Button type="button" variant="ghost" size="icon" onClick={() => setOpen((value) => !value)} aria-label={label} title={label} aria-expanded={open} className="text-white/40"><MoreVertical aria-hidden="true" /></Button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-white/10 bg-[#0d1322] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
          {items.map(({ key, label: itemLabel, icon: Icon, run }) => (
            <button key={key} type="button" role="menuitem" onClick={() => { setOpen(false); run(); }} className="flex min-h-10 w-full items-center gap-2.5 px-3 text-left text-sm text-white/80 hover:bg-white/[0.06]">
              <Icon className="h-4 w-4" aria-hidden="true" />{itemLabel}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function XpotTasks() {
  // Inside the management panel the panel already names the screen.
  const inPanel = useRouter().base.startsWith("/admin");
  const { me } = useXpotQueries();
  const { toast } = useToast();
  const t = useT(tasksMessages);
  // ?status=completed&priority=high&q=invoice&team=1
  const filters = useUrlFilters({ q: "", status: "open", priority: "", team: "" });
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
  const team = canManage && filters.values.team === "1";

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
  });
  const taskCount = tasks.items.length;
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
    const map = new Map<BucketKey, EnrichedTask[]>();
    for (const task of tasks.items) map.set(bucket(task), [...(map.get(bucket(task)) ?? []), task]);
    return bucketKeys.flatMap((key) => map.has(key) ? [{ key, tasks: map.get(key)! }] : []);
  }, [tasks.items]);

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

  function newTask() { setEditing(null); setForm({ ...emptyForm, repId: String(me?.rep.id ?? "") }); setOpen(true); }
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
    {/* Inside the management panel the panel already names the screen: only the action stays. */}
    {inPanel ? (
      <div className="flex justify-end">
        <Button type="button" variant="brand" onClick={newTask}><Plus aria-hidden="true" /> {t("newTask")}</Button>
      </div>
    ) : (
      <PageHeader
        safeArea={false}
        className="!mb-0"
        accent="visits"
        title={t("title")}
        actions={(
          <Button type="button" variant="brand" onClick={newTask} aria-label={t("newTask")} className="w-11 px-0 sm:w-auto sm:px-4">
            <Plus aria-hidden="true" /> <span className="hidden sm:inline">{t("newTask")}</span>
          </Button>
        )}
      />
    )}

    <FilterBar
      testId="tasks-filters"
      search={<FilterSearch value={filters.values.q} onChange={(q) => filters.set({ q })} placeholder={t("searchPlaceholder")} debounceMs={300} />}
      controls={
        <>
          <FilterSelect
            value={priority}
            onChange={(next) => filters.set({ priority: next })}
            placeholder={t("allPriorities")}
            icon={Flag}
            options={priorityOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          />
          {canManage ? <FilterToggle pressed={team} onChange={(on) => filters.set({ team: on ? "1" : null })} label={t("wholeTeam")} icon={Users} /> : null}
        </>
      }
      secondary={
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
      }
      summary={{ shown: taskCount, active: filters.activeCount() > 0, onClear: () => filters.reset() }}
    />

    {tasks.isLoading ? (
      <ListSkeleton rows={4} rowClassName="h-24 rounded-2xl" />
    ) : tasks.error && taskCount === 0 ? (
      // A failed read is not an empty queue.
      <ErrorState message={t("loadFailed")} onRetry={() => void tasks.refetch()} />
    ) : groups.length === 0 ? (
      <EmptyState icon={Check} title={t("noTasks")}>
        <Button type="button" variant="brand" size="sm" onClick={newTask}><Plus aria-hidden="true" /> {t("newTask")}</Button>
      </EmptyState>
    ) : groups.map((group) => <section key={group.key} className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className={EYEBROW}>{t(group.key)}</h2>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] tabular-nums text-white/40">{group.tasks.length}</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">{group.tasks.map((task) => <article key={task.id} className={`group rounded-2xl p-4 transition ${group.key === "bucketOverdue" ? "border border-red-400/20 bg-red-500/[0.04]" : `${GLASS_SUBTLE_CLASS} hover:border-white/15`}`}>
        <div className="flex items-start gap-2">
          {task.status === "completed" || task.status === "cancelled" ? (
            <span className="-ml-1.5 -mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${task.status === "completed" ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20 text-white/40"}`}>
                {task.status === "completed" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
            </span>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => changeStatus.mutate({ id: task.id, action: "complete" })} loading={changeStatus.isPending && changeStatus.variables?.id === task.id} className="-mt-0.5 shrink-0 text-emerald-300" data-testid={`task-done-${task.id}`}>
              <Check aria-hidden="true" /> {t("markDone")}
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`font-semibold ${task.status === "completed" ? "text-white/35 line-through" : "text-white"}`}>{task.title}</h3>
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
          <TaskMenu
            label={t("moreActions")}
            items={[
              { key: "edit", label: t("edit"), icon: Pencil, run: () => editTask(task) },
              ...(task.status !== "completed" && task.status !== "cancelled" ? [{ key: "cancel", label: t("cancel"), icon: X, run: () => changeStatus.mutate({ id: task.id, action: "cancel" }) }] : []),
            ]}
          />
        </div>
        {(task.status === "completed" || task.status === "cancelled") && <div className="mt-3 flex justify-end border-t border-white/5 pt-3"><button onClick={() => changeStatus.mutate({ id: task.id, action: "reopen" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/10"><RotateCcw className="h-3 w-3" /> {t("reopen")}</button></div>}
      </article>)}</div>
    </section>)}
    <ListPager shown={taskCount} hasMore={tasks.hasMore} onMore={tasks.loadMore} loading={tasks.loadingMore} pageSize={100} />

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
