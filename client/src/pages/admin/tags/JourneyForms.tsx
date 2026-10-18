import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { TagPlanItem } from "@shared/tagsApi";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { useJourneyLabels, type JourneyScope } from "./journey-shared";

// The three dialogs of the journey: record an entry, create a plan, and
// change a plan's status (with the outcome when it is closed).

const DIALOG = "max-w-lg";

interface ScopedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: JourneyScope;
  /** What the scope is, for the hint under the title. */
  scopeLabel?: "piece" | "batch";
}

/** "It is attached to this piece / batch.", with its leading space, or nothing. */
function useAttachedHint(scopeLabel: ScopedDialogProps["scopeLabel"]) {
  const t = useT(manageTagsMessages);
  return scopeLabel ? ` ${t(scopeLabel === "piece" ? "attachedPiece" : "attachedBatch")}` : "";
}

const EMPTY_ENTRY = { kind: "observation", action: undefined as string | undefined, title: "", content: "" };

export function NewEntryDialog({ open, onOpenChange, scope, scopeLabel }: ScopedDialogProps) {
  const t = useT(manageTagsMessages);
  const tc = useT(commonMessages);
  const labels = useJourneyLabels();
  const attached = useAttachedHint(scopeLabel);
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
      toast({ title: t("entryRecorded") });
    },
    onError: (err) => toast({ title: t("couldNotRecord"), description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle>{t("entryDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("entryDialogDesc")}
            {attached}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("fieldKind")}>
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value || "observation" })} options={labels.kindOptions} data-testid="journey-entry-kind" />
            </Field>
            {form.kind === "execution" && (
              <Field label={t("fieldStep")}>
                <Select value={form.action ?? ""} onChange={(e) => setForm({ ...form, action: e.target.value || undefined })} placeholder={t("stepOther")} options={labels.actionOptions} data-testid="journey-entry-action" />
              </Field>
            )}
          </div>
          <Field label={t("fieldTitle")}>
            <Input
              value={form.title}
              maxLength={200}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("entryTitlePlaceholder")}
              data-testid="journey-entry-title"
            />
          </Field>
          <Field label={t("fieldDetails")}>
            <Textarea
              value={form.content}
              maxLength={4000}
              rows={4}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              data-testid="journey-entry-content"
            />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button type="button" variant="brand" accent="tags" onClick={() => save.mutate()} disabled={!form.title.trim()} loading={save.isPending} data-testid="journey-entry-save">
            {t("journeyRecord")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_PLAN = { kind: "task", title: "", description: "", dueDate: "" };

export function NewPlanDialog({ open, onOpenChange, scope, scopeLabel }: ScopedDialogProps) {
  const t = useT(manageTagsMessages);
  const tc = useT(commonMessages);
  const labels = useJourneyLabels();
  const attached = useAttachedHint(scopeLabel);
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_PLAN);
  const save = useMutation({
    mutationFn: () => sendJson("POST", "/api/xpot/admin/tag-plans", { ...scope, ...form }),
    onSuccess: () => {
      void invalidateAdminTags();
      onOpenChange(false);
      setForm(EMPTY_PLAN);
      toast({ title: t("planCreated") });
    },
    onError: (err) => toast({ title: t("couldNotCreatePlan"), description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle>{t("planDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("planDialogDesc")}
            {attached}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("fieldKind")}>
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value || "task" })} options={labels.planKindOptions} data-testid="journey-plan-kind" />
            </Field>
            <Field label={t("fieldDue")}>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="[color-scheme:dark]"
                data-testid="journey-plan-due"
              />
            </Field>
          </div>
          <Field label={t("fieldTitle")}>
            <Input
              value={form.title}
              maxLength={200}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("planTitlePlaceholder")}
              data-testid="journey-plan-title"
            />
          </Field>
          <Field label={t("fieldDescription")}>
            <Textarea
              value={form.description}
              maxLength={4000}
              rows={4}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button type="button" variant="brand" accent="tags" onClick={() => save.mutate()} disabled={!form.title.trim()} loading={save.isPending} data-testid="journey-plan-save">
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlanStatusDialog({ plan, onClose }: { plan: TagPlanItem | null; onClose: () => void }) {
  const t = useT(manageTagsMessages);
  const tc = useT(commonMessages);
  const labels = useJourneyLabels();
  const { toast } = useToast();
  const [status, setStatus] = useState<string | undefined>(undefined);
  const statusChange = (value: string) => setStatus(value || undefined);
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
      toast({ title: t("planUpdated") });
    },
    onError: (err) => toast({ title: t("couldNotUpdatePlan"), description: errorMessage(err), variant: "destructive" }),
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
          <DialogDescription>{t("planStatusDesc")}</DialogDescription>
        </DialogHeader>
        {plan?.description && <p className="whitespace-pre-wrap text-sm text-white/60">{plan.description}</p>}
        <div className="space-y-3">
          <Field label={t("colStatus")}>
            <Select value={next ?? ""} onChange={(e) => statusChange(e.target.value)} options={labels.planStatusOptions} data-testid="journey-plan-status" />
          </Field>
          <Field label={t("fieldOutcome")}>
            <Textarea
              value={outcome}
              maxLength={4000}
              rows={3}
              placeholder={plan?.outcome ?? t("outcomePlaceholder")}
              onChange={(e) => setOutcome(e.target.value)}
              data-testid="journey-plan-outcome"
            />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {tc("cancel")}
          </Button>
          <Button
            type="button"
            variant="brand"
            accent="tags"
            onClick={() => save.mutate()}
            disabled={next === plan?.status && !outcome.trim()}
            loading={save.isPending}
            data-testid="journey-plan-status-save"
          >
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
