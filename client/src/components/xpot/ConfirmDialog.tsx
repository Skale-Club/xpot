import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "@/components/ui/loader";

/**
 * A yes/no confirmation in the same chrome as the visit and company delete
 * dialogs. Both buttons carry explicit labels ("Cancel sale" / "Keep sale")
 * so the dismiss button is never a second "Cancel". The dialog stays open
 * with a spinner while `onConfirm` runs and closes once it resolves.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  pending = false,
  destructive = false,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  onConfirm: () => Promise<unknown> | void;
  pending?: boolean;
  destructive?: boolean;
  testId?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <AlertDialogContent
        className="max-w-xs rounded-2xl border-0 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold text-white">{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription className="text-sm text-white/45">{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 flex-row gap-2 sm:space-x-0">
          <AlertDialogCancel
            disabled={pending}
            className="flex-1 rounded-xl border-0 text-sm font-medium text-white/60 transition-colors hover:text-white"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              try {
                await onConfirm();
                onOpenChange(false);
              } catch {
                // The caller reports the failure (toast); keep the dialog so it can retry.
              }
            }}
            className="flex-1 rounded-xl border-0 text-sm font-medium text-white"
            style={{ background: destructive ? "rgba(239,68,68,0.85)" : "rgba(99,102,241,0.85)" }}
            data-testid={testId}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
