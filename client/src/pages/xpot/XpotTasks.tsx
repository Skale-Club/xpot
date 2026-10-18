import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, Circle, Clock3, Flag, Pencil, Plus, RotateCcw, Users, X } from "lucide-react";
import { FilterBar, FilterChips, FilterSearch, FilterSelect, FilterToggle } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, useOffsetPages } from "@/components/xpot/pagination";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useXpotQueries } from "./hooks/useXpotQueries";
import type { FullSalesLead, SalesTask } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xpot/EmptyState";
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

export function XpotTasks() {
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
  const organizationId = me?.organizations?.[0]?.id;
  const canManage = Boolean(me?.user.isAdmin || me?.rep.role === "manager" || me?.rep.role === "admin" || me?.organizations?.some((org) => org.membershipRole === "admin"));
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
    if (value === "pending") return t("statusPending");
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
    <PageHeader
      safeArea={false}
      className="!mb-0"
      accent="visits"
      eyebrow={t("eyebrow")}
      title={t("title")}
      description={t("subtitle")}
      actions={(
        <Button type="button" variant="brand" onClick={newTask} aria-label={t("newTask")} className="w-11 px-0 sm:w-auto sm:px-4">
          <Plus aria-hidden="true" /> <span className="hidden sm:inline">{t("newTask")}</span>
        </Button>
      )}
    />

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
    ) : groups.length === 0 ? (
      <EmptyState icon={Circle} title={t("noTasks")} />
    ) : groups.map((group) => <section key={group.key} className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className={EYEBROW}>{t(group.key)}</h2>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] tabular-nums text-white/40">{group.tasks.length}</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">{group.tasks.map((task) => <article key={task.id} className={`group rounded-2xl p-4 transition ${group.key === "bucketOverdue" ? "border border-red-400/20 bg-red-500/[0.04]" : `${GLASS_SUBTLE_CLASS} hover:border-white/15`}`}>
        <div className="flex items-start gap-2">
          <button type="button" aria-label={task.status === "completed" ? t("reopen") : t("complete")} title={task.status === "completed" ? t("reopen") : t("complete")} onClick={() => changeStatus.mutate({ id: task.id, action: task.status === "completed" ? "reopen" : "complete" })} disabled={changeStatus.isPending && changeStatus.variables?.id === task.id} className="-ml-1.5 -mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${task.status === "completed" ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20 text-transparent hover:border-emerald-400 hover:text-emerald-400"}`}>
              <Check className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`font-semibold ${task.status === "completed" ? "text-white/35 line-through" : "text-white"}`}>{task.title}</h3>
              <Pill tone={task.priority === "urgent" ? "red" : task.priority === "high" ? "amber" : "slate"}>{priorityLabel(task.priority)}</Pill>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
              {task.dueAt && <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden="true" />{formatDateTime(task.dueAt)}</span>}
              {task.lead && <span>{task.lead.name}</span>}
              {team && task.assignee && <span>→ {task.assignee.displayName}</span>}
              <span>{statusLabel(task.status)}</span>
            </div>
            {task.description && <p className="mt-2 line-clamp-2 text-sm text-white/50">{task.description}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => editTask(task)} aria-label={t("edit")} title={t("edit")} className="-mr-2 -mt-2 text-white/40"><Pencil aria-hidden="true" /></Button>
        </div>
        {task.status !== "completed" && task.status !== "cancelled" && <div className="mt-3 flex justify-end gap-2 border-t border-white/5 pt-3">
          {task.status === "pending" && <button onClick={() => changeStatus.mutate({ id: task.id, action: "start" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/10"><Clock3 className="h-3 w-3" /> {t("start")}</button>}
          <button onClick={() => changeStatus.mutate({ id: task.id, action: "cancel" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/35 hover:bg-white/5"><X className="h-3 w-3" /> {t("cancel")}</button>
        </div>}
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
