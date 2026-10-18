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
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";

/**
 * A dark confirmation dialog for the account and admin screens. `children` sits
 * under the description (a typed confirmation, for example); `confirmDisabled`
 * keeps the confirm button off until that is satisfied.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  confirmDisabled = false,
  onConfirm,
  children,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
  testId?: string;
}) {
  const tc = useT(commonMessages);
  return (
    <AlertDialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <AlertDialogContent
        className="max-w-md rounded-2xl border border-white/10 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}
        data-testid={testId}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold text-white">{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="whitespace-pre-line text-sm text-white/55">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter className="mt-2 gap-2">
          <AlertDialogCancel disabled={busy} className="border-0 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
            {tc("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={busy || confirmDisabled}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            data-testid={testId ? `${testId}-confirm` : undefined}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
