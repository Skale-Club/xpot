import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tasksMessages } from "@/i18n/messages/tasks";
import { apiRequest, queryClient } from "@/lib/queryClient";

// The one task form of the app (title, type, priority, due date, company and,
// for managers, the assignee). Used by the company page ("New task"), Sales ›
// Pipeline and the Tasks screen, so a task is created the same way everywhere.

export type TaskFormValues = { title: string; description: string; dueAt: string; priority: string; type: string; leadId: string; repId: string };

export const EMPTY_TASK: TaskFormValues = { title: "", description: "", dueAt: "", priority: "medium", type: "follow_up", leadId: "", repId: "" };

export const TASK_PRIORITIES = [
  { value: "low", labelKey: "priorityLow" },
  { value: "medium", labelKey: "priorityMedium" },
  { value: "high", labelKey: "priorityHigh" },
  { value: "urgent", labelKey: "priorityUrgent" },
] as const;

export const TASK_TYPES = [
  { value: "follow_up", labelKey: "typeFollowUp" },
  { value: "call", labelKey: "typeCall" },
  { value: "visit", labelKey: "typeVisit" },
  { value: "send_quote", labelKey: "typeSendQuote" },
  { value: "collect_payment", labelKey: "typeCollectPayment" },
  { value: "check_consignment", labelKey: "typeCheckConsignment" },
  { value: "restock", labelKey: "typeRestock" },
  { value: "other", labelKey: "typeOther" },
] as const;

/** The body the tasks API takes for these values. */
export function taskBody(form: TaskFormValues, extra: { visitId?: number | null } = {}) {
  return {
    title: form.title,
    description: form.description || null,
    dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
    priority: form.priority,
    type: form.type,
    leadId: form.leadId ? Number(form.leadId) : null,
    ...(form.repId ? { repId: Number(form.repId) } : {}),
    ...(extra.visitId ? { visitId: extra.visitId } : {}),
  };
}

/** Refreshes every list a new or changed task shows up in. */
export async function invalidateTaskLists() {
  await queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/xpot/tasks") || query.queryKey[0] === "/api/xpot/leads" });
  await queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
}

function ChoiceGrid({ legend, options, value, onChange }: {
  legend: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-white/60">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(option.value)}
              className={`min-h-10 rounded-xl border px-2 py-1.5 text-xs font-semibold transition-colors ${on ? "border-blue-400/40 bg-blue-500/[0.15] text-white" : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/80"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TaskForm({
  value, onChange, onSubmit, onCancel, pending = false, error, company, leads, assignees,
}: {
  value: TaskFormValues;
  onChange: (next: TaskFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending?: boolean;
  /** The last save's error, shown above the buttons. */
  error?: string | null;
  /** A fixed company (the company page): shown, not picked. */
  company?: { name: string };
  /** Companies to pick from when the task is not tied to one already. */
  leads?: ReadonlyArray<{ id: number; name: string }>;
  /** Who can do it (managers only). */
  assignees?: ReadonlyArray<{ repId: number; displayName: string }>;
}) {
  const t = useT(tasksMessages);
  const tc = useT(commonMessages);
  const set = (patch: Partial<TaskFormValues>) => onChange({ ...value, ...patch });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.title.trim()) onSubmit();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {company ? (
        <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/75">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden="true" />
          <span className="truncate">{company.name}</span>
        </div>
      ) : null}
      <Field label={t("fieldTitle")} required>
        <Input autoFocus required value={value.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label={t("fieldDescription")}>
        <Textarea rows={3} value={value.description} onChange={(e) => set({ description: e.target.value })} className="resize-none" />
      </Field>
      <ChoiceGrid legend={t("fieldType")} value={value.type} onChange={(type) => set({ type })} options={TASK_TYPES.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
      <ChoiceGrid legend={t("fieldPriority")} value={value.priority} onChange={(priority) => set({ priority })} options={TASK_PRIORITIES.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
      <Field label={t("fieldDueAt")}>
        <Input type="datetime-local" value={value.dueAt} onChange={(e) => set({ dueAt: e.target.value })} className="[color-scheme:dark]" />
      </Field>
      {!company && leads ? (
        <Field label={t("fieldClient")}>
          <Select value={value.leadId} onChange={(e) => set({ leadId: e.target.value })} placeholder={t("noClient")} options={leads.map((lead) => ({ value: String(lead.id), label: lead.name }))} />
        </Field>
      ) : null}
      {assignees ? (
        <Field label={t("fieldAssignee")}>
          <Select value={value.repId} onChange={(e) => set({ repId: e.target.value })} options={assignees.map((member) => ({ value: String(member.repId), label: member.displayName }))} />
        </Field>
      ) : null}
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>{tc("cancel")}</Button>
        <Button type="submit" variant="brand" loading={pending} disabled={!value.title.trim()}>{t("saveTask")}</Button>
      </DialogFooter>
    </form>
  );
}

/**
 * "New task" in a dialog, saved here: the company page (company fixed) and
 * Sales › Pipeline (company picked, linked to the visit in progress).
 */
export function NewTaskDialog({ open, onOpenChange, company, leads, visitId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: { id: number; name: string };
  leads?: ReadonlyArray<{ id: number; name: string }>;
  visitId?: number | null;
}) {
  const t = useT(tasksMessages);
  const { toast } = useToast();
  const [form, setForm] = useState<TaskFormValues>(EMPTY_TASK);
  useEffect(() => {
    if (open) setForm({ ...EMPTY_TASK, leadId: company ? String(company.id) : "" });
  }, [open, company?.id]);
  const save = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/xpot/tasks", taskBody(form, { visitId }))).json(),
    onSuccess: async () => {
      onOpenChange(false);
      await invalidateTaskLists();
      toast({ title: t("taskCreated"), variant: "success" });
    },
    onError: (error: Error) => toast({ title: t("saveFailed"), description: error.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!save.isPending) onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">{t("newTask")}</DialogTitle>
        </DialogHeader>
        <TaskForm
          value={form}
          onChange={setForm}
          onSubmit={() => save.mutate()}
          onCancel={() => onOpenChange(false)}
          pending={save.isPending}
          error={save.isError ? save.error.message : null}
          company={company}
          leads={leads}
        />
      </DialogContent>
    </Dialog>
  );
}
