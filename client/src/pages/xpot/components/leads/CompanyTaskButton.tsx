import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, ListTodo, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { tasksMessages } from "@/i18n/messages/tasks";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { FullSalesLead } from "../../types";

type Form = { title: string; description: string; dueAt: string; priority: string; type: string };

const emptyForm: Form = { title: "", description: "", dueAt: "", priority: "medium", type: "follow_up" };
const field = "mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/60";
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

export function CompanyTaskButton({ lead }: { lead: FullSalesLead }) {
  const t = useT(tasksMessages);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const save = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/xpot/tasks", {
        leadId: lead.id,
        title: form.title,
        description: form.description || null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        priority: form.priority,
        type: form.type,
      });
      return response.json();
    },
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/xpot/tasks") });
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
      toast({ title: t("taskCreated"), variant: "success" });
    },
    onError: (error: Error) => toast({ title: t("saveFailed"), description: error.message, variant: "destructive" }),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs font-semibold text-white/75 transition hover:border-indigo-300/20 hover:bg-indigo-400/[0.08] hover:text-white"
      >
        <Plus className="h-3.5 w-3.5 text-indigo-300" />
        {t("newTask")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-white/10 bg-[#0b1020] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-indigo-300" />{t("newTask")}</DialogTitle>
          </DialogHeader>
          <div className="w-fit max-w-full truncate rounded-full border border-indigo-300/15 bg-indigo-400/[0.08] px-3 py-1 text-xs font-medium text-indigo-200">{lead.name}</div>
          <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }} className="space-y-4">
            <label className="block text-xs font-medium text-white/55">{t("fieldTitle")}<input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={field} /></label>
            <label className="block text-xs font-medium text-white/55">{t("fieldDescription")}<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${field} resize-none`} /></label>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-white/55">{t("fieldType")}</legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {typeOptions.map((option) => <button key={option.value} type="button" onClick={() => setForm({ ...form, type: option.value })} className={`min-h-9 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${form.type === option.value ? "border-indigo-300/30 bg-indigo-400/15 text-indigo-100" : "border-white/[0.07] bg-white/[0.025] text-white/45 hover:bg-white/[0.06] hover:text-white/75"}`}>{t(option.labelKey)}</button>)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-white/55">{t("fieldPriority")}</legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {priorityOptions.map((option) => <button key={option.value} type="button" onClick={() => setForm({ ...form, priority: option.value })} className={`h-9 rounded-lg border px-2 text-xs font-medium transition ${form.priority === option.value ? "border-indigo-300/30 bg-indigo-400/15 text-indigo-100" : "border-white/[0.07] bg-white/[0.025] text-white/45 hover:bg-white/[0.06] hover:text-white/75"}`}>{t(option.labelKey)}</button>)}
              </div>
            </fieldset>
            <label className="block text-xs font-medium text-white/55">{t("fieldDueAt")}<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className={field} /></label>
            {save.isError ? <p className="flex gap-2 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" />{t("saveFailed")}</p> : null}
            <button disabled={save.isPending || !form.title.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50">
              <Plus className="h-4 w-4" />{save.isPending ? t("saving") : t("saveTask")}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
