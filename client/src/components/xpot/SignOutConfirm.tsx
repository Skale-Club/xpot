import { useLocation } from "wouter";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { signOut } from "@/lib/signOut";
import { ConfirmDialog } from "./ConfirmDialog";
import { clearPanelRoute } from "./panelRoute";

/** "Sign out of Xpot?" before it happens: on the street a wrong tap would cost a text code to come back. */
export function SignOutConfirm({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(shellMessages);
  const tw = useT(workspacesMessages);
  const [, navigate] = useLocation();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title={tw("signOutTitle")}
      description={tw("signOutHint")}
      confirmLabel={t("signOut")}
      testId="sign-out-confirm"
      onConfirm={async () => { clearPanelRoute(); await signOut(navigate); }}
    />
  );
}
