import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { adminUiMessages } from "@/i18n/messages/adminUi";
import { commonMessages } from "@/i18n/messages/common";

// The one form footer: an "Unsaved changes" note on the left (only while the
// form differs from what is saved), then Cancel and the primary action on the
// right, in that order. The primary is a <Button variant="brand"> that stays
// disabled while the form is clean. `sticky` keeps it at the bottom of the
// screen, for long editors only (the landing page).
//
//   <FormFooter dirty={dirty} onCancel={reset}>
//     <Button variant="brand" disabled={!dirty} loading={save.isPending} onClick={…}>{tc("save")}</Button>
//   </FormFooter>

/** "● Unsaved changes", the amber note of a form with edits not saved yet. */
export function UnsavedNote({ label, className = "" }: { label?: ReactNode; className?: string }) {
  const t = useT(adminUiMessages);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 ${className}`} role="status" data-testid="unsaved-changes">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
      {label ?? t("unsavedChanges")}
    </span>
  );
}

export function FormFooter({
  dirty = false,
  status,
  onCancel,
  cancelLabel,
  sticky = false,
  children,
  className = "",
}: {
  /** The form differs from what is saved: shows the unsaved note. */
  dirty?: boolean;
  /** Replaces the note on the left ("Published on …", a custom unsaved label). */
  status?: ReactNode;
  /** Shows Cancel before the primary action. */
  onCancel?: () => void;
  /** Defaults to the translated "Cancel". */
  cancelLabel?: ReactNode;
  /** Stays at the bottom of the screen while the form scrolls (long editors). */
  sticky?: boolean;
  /** The primary action (and any secondary one before it). */
  children: ReactNode;
  className?: string;
}) {
  const tc = useT(commonMessages);
  const left = status ?? (dirty ? <UnsavedNote /> : null);
  return (
    <div
      className={`flex flex-wrap items-center justify-end gap-2 ${
        sticky ? "sticky bottom-3 z-10 rounded-2xl border border-white/10 bg-[#0d1322] p-2.5 pl-4 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur" : ""
      } ${className}`}
    >
      {left ? <div className="mr-auto min-w-0">{left}</div> : null}
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          {cancelLabel ?? tc("cancel")}
        </Button>
      ) : null}
      {children}
    </div>
  );
}
