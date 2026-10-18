import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, Check, Circle, Clock3, Edit3, Flag, Plus, RotateCcw, Users, X } from "lucide-react";
import { FilterBar, FilterChips, FilterSearch, FilterSelect, FilterToggle } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, useOffsetPages } from "@/components/xpot/pagination";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useXpotQueries } from "./hooks/useXpotQueries";
import type { FullSalesLead, SalesTask } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { tasksMessages } from "@/i18n/messages/tasks";

type EnrichedTask = SalesTask & {
  lead: { id: number; name: string } | null;
  assignee: { id: number; displayName: string; email: string | null } | null;
  opportunity: { id: number; title: string } | null;
};
type Member = { repId: number; displayName: string; isActive: boolean; blockedAt?: string | null };
type Form = { title: string; description: string; dueAt: string; priority: string; type: string; leadId: string; repId: string };

const emptyForm: Form = { title: "", description: "", dueAt: "", priority: "medium", type: "follow_up", leadId: "", repId: "" };
const field = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/60";
const priorityOptions = [
  { value: "low", labelKey: "priorityLow" },
  { value: "medium", labelKey: "priorityMedium" },
  { value: "high", labelKey: "priorityHigh" },
  { value: "urgent", labelKey: "priorityUrgent" },
] as const;
const typeOptions = [
  { value: "follow_up", labelKey: "typeFollowUp" },
  { value: "call", labelKey: "typeCall" },
  { value: "visit", labelKey: "typeVisit" },
  { value: "send_quote", labelKey: "typeSendQuote" },
  { value: "collect_payment", labelKey: "typeCollectPayment" },
  { value: "check_consignment", labelKey: "typeCheckConsignment" },
  { value: "restock", labelKey: "typeRestock" },
  { value: "other", labelKey: "typeOther" },
] as const;
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
      const body = {
        title: form.title,
        description: form.description || null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        priority: form.priority,
        type: form.type,
        leadId: form.leadId ? Number(form.leadId) : null,
        ...(form.repId ? { repId: Number(form.repId) } : {}),
      };
      const response = await apiRequest(editing ? "PATCH" : "POST", editing ? `/api/xpot/tasks/${editing.id}` : "/api/xpot/tasks", body);
      return response.json();
    },
    onSuccess: async () => {
      setOpen(false); setEditing(null); setForm(emptyForm);
      await queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/xpot/tasks") || query.queryKey[0] === "/api/xpot/leads" });
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
      toast({ title: editing ? t("taskUpdated") : t("taskCreated"), variant: "success" });
    },
    onError: (error: Error) => toast({ title: t("saveFailed"), description: error.message, variant: "destructive" }),
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: string }) => (await apiRequest("POST", `/api/xpot/tasks/${id}/${action}`)).json(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/xpot/tasks") || query.queryKey[0] === "/api/xpot/leads" });
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/70">{t("eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-bold text-white">{t("title")}</h1>
        <p className="mt-1 text-sm text-white/45">{t("subtitle")}</p>
      </div>
      <button onClick={newTask} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400">
        <Plus className="h-4 w-4" /> {t("newTask")}
      </button>
    </div>

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
      <div className="py-16 text-center text-white/40">{t("loadingTasks")}</div>
    ) : groups.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center">
        <Circle className="mx-auto mb-3 h-8 w-8 text-white/20" />
        <p className="font-medium text-white/70">{t("noTasks")}</p>
      </div>
    ) : groups.map((group) => <section key={group.key} className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">{t(group.key)}</h2>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/35">{group.tasks.length}</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">{group.tasks.map((task) => <article key={task.id} className={`group rounded-2xl border p-4 transition ${group.key === "bucketOverdue" ? "border-red-400/20 bg-red-500/[0.04]" : "border-white/8 bg-white/[0.025] hover:border-white/15"}`}>
        <div className="flex items-start gap-3">
          <button aria-label={task.status === "completed" ? t("reopen") : t("complete")} onClick={() => changeStatus.mutate({ id: task.id, action: task.status === "completed" ? "reopen" : "complete" })} className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${task.status === "completed" ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20 text-transparent hover:border-emerald-400 hover:text-emerald-400"}`}>
            <Check className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`font-semibold ${task.status === "completed" ? "text-white/35 line-through" : "text-white"}`}>{task.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${task.priority === "urgent" ? "bg-red-500/15 text-red-300" : task.priority === "high" ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-white/40"}`}>{priorityLabel(task.priority)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
              {task.dueAt && <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{new Date(task.dueAt).toLocaleString(t.locale, { dateStyle: "medium", timeStyle: "short" })}</span>}
              {task.lead && <span>{task.lead.name}</span>}
              {team && task.assignee && <span>→ {task.assignee.displayName}</span>}
              <span>{statusLabel(task.status)}</span>
            </div>
            {task.description && <p className="mt-2 line-clamp-2 text-sm text-white/50">{task.description}</p>}
          </div>
          <button onClick={() => editTask(task)} aria-label={t("edit")} className="rounded-lg p-2 text-white/30 hover:bg-white/5 hover:text-white"><Edit3 className="h-4 w-4" /></button>
        </div>
        {task.status !== "completed" && task.status !== "cancelled" && <div className="mt-3 flex justify-end gap-2 border-t border-white/5 pt-3">
          {task.status === "pending" && <button onClick={() => changeStatus.mutate({ id: task.id, action: "start" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/10"><Clock3 className="h-3 w-3" /> {t("start")}</button>}
          <button onClick={() => changeStatus.mutate({ id: task.id, action: "cancel" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/35 hover:bg-white/5"><X className="h-3 w-3" /> {t("cancel")}</button>
        </div>}
        {(task.status === "completed" || task.status === "cancelled") && <div className="mt-3 flex justify-end border-t border-white/5 pt-3"><button onClick={() => changeStatus.mutate({ id: task.id, action: "reopen" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/10"><RotateCcw className="h-3 w-3" /> {t("reopen")}</button></div>}
      </article>)}</div>
    </section>)}
    <ListPager shown={taskCount} hasMore={tasks.hasMore} onMore={tasks.loadMore} loading={tasks.loadingMore} pageSize={100} />

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-white/10 bg-[#0b1020] text-white">
        <DialogHeader><DialogTitle>{editing ? t("editTask") : t("newTask")}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <label className="block text-xs font-medium text-white/55">{t("fieldTitle")}<input autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${field} mt-1.5`} /></label>
          <label className="block text-xs font-medium text-white/55">{t("fieldDescription")}<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${field} mt-1.5 resize-none`} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-white/55">{t("fieldType")}<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={`${field} mt-1.5`}>{typeOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}</select></label>
            <label className="text-xs font-medium text-white/55">{t("fieldPriority")}<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={`${field} mt-1.5`}>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}</select></label>
          </div>
          <label className="block text-xs font-medium text-white/55">{t("fieldDueAt")}<input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} className={`${field} mt-1.5`} /></label>
          <label className="block text-xs font-medium text-white/55">{t("fieldClient")}<select value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })} className={`${field} mt-1.5`}><option value="">{t("noClient")}</option>{(leads.data ?? []).map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label>
          {canManage && <label className="block text-xs font-medium text-white/55">{t("fieldAssignee")}<select value={form.repId} onChange={(e) => setForm({ ...form, repId: e.target.value })} className={`${field} mt-1.5`}>{(members.data ?? [{ repId: me!.rep.id, displayName: me!.rep.displayName, isActive: true }]).filter((member) => member.isActive && !member.blockedAt).map((member) => <option key={member.repId} value={member.repId}>{member.displayName}</option>)}</select></label>}
          {save.isError && <p className="flex gap-2 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" />{save.error.message}</p>}
          <button disabled={save.isPending || !form.title.trim()} className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">{save.isPending ? t("saving") : t("saveTask")}</button>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
