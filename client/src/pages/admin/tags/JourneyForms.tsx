import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { TagPlanItem } from "@shared/tagsApi";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { BTN, BTN_GHOST, INPUT } from "./ui";
import { Field } from "./batches-shared";
import { Select } from "./pieces-shared";
import {
  ACTION_OPTIONS,
  KIND_OPTIONS,
  PLAN_KIND_OPTIONS,
  PLAN_STATUS_OPTIONS,
  type JourneyScope,
} from "./journey-shared";

// The three dialogs of the journey: record an entry, create a plan, and
// change a plan's status (with the outcome when it is closed).

const DIALOG = "max-w-lg border-white/10 bg-[#0d1326] text-white";
const DESC = "text-white/50";

interface ScopedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: JourneyScope;
  /** Short name of what the scope is ("batch", "piece"), for the hint under the title. */
  scopeLabel?: string;
}

const EMPTY_ENTRY = { kind: "observation", action: undefined as string | undefined, title: "", content: "" };

export function NewEntryDialog({ open, onOpenChange, scope, scopeLabel }: ScopedDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_ENTRY);
  const save = useMutation({
    mutationFn: () =>
      sendJson("POST", "/api/xpot/admin/tag-journey", {
        ...scope,
        kind: form.kind,
        action: form.kind === "execution" ? form.action ?? null : null,
        title: form.title,
        content: form.content,
      }),
    onSuccess: () => {
      void invalidateAdminTags();
      onOpenChange(false);
      setForm(EMPTY_ENTRY);
      toast({ title: "Recorded in the journey" });
    },
    onError: (err) => toast({ title: "Could not record", description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle>Record in the journey</DialogTitle>
          <DialogDescription className={DESC}>
            Something that happened, was decided or was learned. Entries cannot be edited afterwards, only archived.
            {scopeLabel ? ` It is attached to this ${scopeLabel}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind">
              <Select value={form.kind} onChange={(kind) => setForm({ ...form, kind: kind ?? "observation" })} placeholder="Kind" options={KIND_OPTIONS} allowEmpty={false} testId="journey-entry-kind" />
            </Field>
            {form.kind === "execution" && (
              <Field label="Step">
                <Select value={form.action} onChange={(action) => setForm({ ...form, action })} placeholder="Other" options={ACTION_OPTIONS} testId="journey-entry-action" />
              </Field>
            )}
          </div>
          <Field label="Title">
            <input
              value={form.title}
              maxLength={200}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Plate printed in PETG"
              className={INPUT}
              data-testid="journey-entry-title"
            />
          </Field>
          <Field label="Details">
            <textarea
              value={form.content}
              maxLength={4000}
              rows={4}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className={`${INPUT} resize-y`}
              data-testid="journey-entry-content"
            />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={BTN} onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()} data-testid="journey-entry-save">
            {save.isPending ? "Saving…" : "Record"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_PLAN = { kind: "task", title: "", description: "", dueDate: "" };

export function NewPlanDialog({ open, onOpenChange, scope, scopeLabel }: ScopedDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_PLAN);
  const save = useMutation({
    mutationFn: () => sendJson("POST", "/api/xpot/admin/tag-plans", { ...scope, ...form }),
    onSuccess: () => {
      void invalidateAdminTags();
      onOpenChange(false);
      setForm(EMPTY_PLAN);
      toast({ title: "Plan created" });
    },
    onError: (err) => toast({ title: "Could not create plan", description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription className={DESC}>
            A task, experiment, hypothesis, target or strategy. Closing it records the outcome in the journey.
            {scopeLabel ? ` It is attached to this ${scopeLabel}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind">
              <Select value={form.kind} onChange={(kind) => setForm({ ...form, kind: kind ?? "task" })} placeholder="Kind" options={PLAN_KIND_OPTIONS} allowEmpty={false} testId="journey-plan-kind" />
            </Field>
            <Field label="Due">
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className={`${INPUT} [color-scheme:dark]`}
                data-testid="journey-plan-due"
              />
            </Field>
          </div>
          <Field label="Title">
            <input
              value={form.title}
              maxLength={200}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Choose the size of the bigger plaque"
              className={INPUT}
              data-testid="journey-plan-title"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              maxLength={4000}
              rows={4}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`${INPUT} resize-y`}
            />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={BTN} onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()} data-testid="journey-plan-save">
            {save.isPending ? "Saving…" : "Create"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlanStatusDialog({ plan, onClose }: { plan: TagPlanItem | null; onClose: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState("");
  const next = status ?? plan?.status;
  const reset = () => {
    setStatus(undefined);
    setOutcome("");
  };
  const save = useMutation({
    // An empty box keeps the saved outcome instead of clearing it.
    mutationFn: () => sendJson("PATCH", `/api/xpot/admin/tag-plans/${plan!.id}`, { status: next, ...(outcome.trim() ? { outcome } : {}) }),
    onSuccess: () => {
      void invalidateAdminTags();
      reset();
      onClose();
      toast({ title: "Plan updated" });
    },
    onError: (err) => toast({ title: "Could not update plan", description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog
      open={!!plan}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle className="break-words pr-6">{plan?.title}</DialogTitle>
          <DialogDescription className={DESC}>Changing the status records it in the journey, with the outcome when the plan is closed.</DialogDescription>
        </DialogHeader>
        {plan?.description && <p className="whitespace-pre-wrap text-sm text-white/60">{plan.description}</p>}
        <div className="space-y-3">
          <Field label="Status">
            <Select value={next} onChange={setStatus} placeholder="Status" options={PLAN_STATUS_OPTIONS} allowEmpty={false} testId="journey-plan-status" />
          </Field>
          <Field label="Outcome">
            <textarea
              value={outcome}
              maxLength={4000}
              rows={3}
              placeholder={plan?.outcome ?? "What did it show?"}
              onChange={(e) => setOutcome(e.target.value)}
              className={`${INPUT} resize-y`}
              data-testid="journey-plan-outcome"
            />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={BTN}
            onClick={() => save.mutate()}
            disabled={save.isPending || (next === plan?.status && !outcome.trim())}
            data-testid="journey-plan-status-save"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
