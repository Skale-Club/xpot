import { useEffect, useId, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { kitMessages } from "@/i18n/messages/kit";
import { Input, Textarea } from "./Field";

// The one confirmation of the app, in place of window.confirm/prompt and
// hand-rolled AlertDialogs. Built on ui/alert-dialog, so it shares the modal
// shell. What it guarantees:
//   - it never closes while the action runs (Escape and Cancel are ignored);
//   - `onConfirm` may return a promise: the confirm button shows the loader,
//     the dialog closes when it resolves and stays open when it rejects (show
//     the error with a toast or `error`);
//   - a void `onConfirm` closes it at once, unless `autoClose={false}`: then
//     the caller closes it (e.g. in a mutation's onSuccess) and drives `pending`;
//   - `reason` adds a text box (required or optional) whose text is passed to
//     onConfirm; `confirmWord` makes the person type a word first ("DELETE",
//     the piece code) for actions that cannot be undone.
//
//   <ConfirmDialog open={open} onOpenChange={setOpen} tone="danger"
//     title={t("deleteLead")} description={t("deleteLeadHint")}
//     confirmLabel={t("delete")} onConfirm={() => remove.mutateAsync(id)} />

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  tone = "default",
  accent,
  destructive = false,
  testId,
  reason,
  reasonLabel,
  reasonPlaceholder,
  confirmWord,
  pending: pendingProp,
  busy: busyProp,
  confirmDisabled = false,
  autoClose,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra content between the description and the buttons (a summary of what changes). */
  children?: ReactNode;
  /** Defaults to the translated "Confirm". */
  confirmLabel?: ReactNode;
  /** Defaults to the translated "Cancel". */
  cancelLabel?: ReactNode;
  /** `danger` paints the confirm button red: deleting, cancelling for good. */
  tone?: "default" | "danger";
  /** `tags` turns a non-danger confirm violet, like the Tags button that opened it. */
  accent?: "tags";
  /** Same as tone="danger". */
  destructive?: boolean;
  /** data-testid on the confirm button. */
  testId?: string;
  /** Ask for a reason; "required" keeps the button off until one is written. */
  reason?: "required" | "optional";
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** The person must type this word (case-insensitive) before confirming. */
  confirmWord?: string;
  /** The action is running (when the caller drives it); the dialog can't close. */
  pending?: boolean;
  /** Same as `pending`; passing either makes the caller close the dialog (autoClose off). */
  busy?: boolean;
  /** Keep the confirm button off (a condition in `children` is not met yet). */
  confirmDisabled?: boolean;
  /** Close as soon as a void onConfirm returns. Defaults to on, off when the caller drives `pending`/`busy`. */
  autoClose?: boolean;
  /** An error from the last attempt, shown above the buttons. */
  error?: ReactNode;
  onConfirm: (reason: string) => unknown;
}) {
  const t = useT(kitMessages);
  const tc = useT(commonMessages);
  const reasonId = useId();
  const wordId = useId();
  const [reasonText, setReasonText] = useState("");
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const pending = Boolean(pendingProp || busyProp);
  const callerDriven = pendingProp !== undefined || busyProp !== undefined;
  const closesItself = autoClose ?? !callerDriven;
  const busy = pending || running;

  // A fresh form every time it opens.
  useEffect(() => {
    if (open) {
      setReasonText("");
      setTyped("");
    }
  }, [open]);

  const reasonMissing = reason === "required" && reasonText.trim() === "";
  const wordMissing = Boolean(confirmWord) && typed.trim().toLowerCase() !== confirmWord!.trim().toLowerCase();
  const canConfirm = !busy && !reasonMissing && !wordMissing && !confirmDisabled;

  const setOpen = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };

  const confirm = () => {
    if (!canConfirm) return;
    const result = onConfirm(reasonText.trim());
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setRunning(true);
      (result as Promise<unknown>).then(
        () => {
          setRunning(false);
          onOpenChange(false);
        },
        () => setRunning(false),
      );
    } else if (closesItself) {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-md" onEscapeKeyDown={(event) => busy && event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children}
        {reason ? (
          <div className="space-y-1.5">
            <label htmlFor={reasonId} className="text-xs font-semibold text-white/60">
              {reasonLabel ?? (reason === "required" ? t("reason") : t("reasonOptional"))}
            </label>
            <Textarea
              id={reasonId}
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              placeholder={reasonPlaceholder}
              disabled={busy}
              rows={3}
              maxLength={500}
              aria-required={reason === "required" || undefined}
            />
            {reasonMissing ? <p className="text-xs text-white/40">{t("reasonRequired")}</p> : null}
          </div>
        ) : null}
        {confirmWord ? (
          <div className="space-y-1.5">
            <label htmlFor={wordId} className="text-xs font-semibold text-white/60">
              {t("typeToConfirm", { word: confirmWord })}
            </label>
            <Input
              id={wordId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel disabled={busy} className="mt-0">
            {cancelLabel ?? tc("cancel")}
          </AlertDialogCancel>
          <Button
            type="button"
            variant={tone === "danger" || destructive ? "danger" : "brand"}
            accent={accent}
            data-testid={testId}
            loading={busy}
            disabled={!canConfirm}
            onClick={confirm}
          >
            {confirmLabel ?? t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
