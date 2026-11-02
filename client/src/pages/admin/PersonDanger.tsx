import { useState } from "react";
import { Ban, ShieldAlert, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { Field, Input } from "@/components/xpot/Field";
import { DANGER_OUTLINE } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { manageMessages } from "@/i18n/messages/manage";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { personStatus } from "./peopleFilters";
import { REPS_KEY, Section, send, useRepAction, type Rep } from "./PersonDetail";

// Account › People › one person › the two things that cannot be undone, apart from everything else:
// blocking an active person (reversible) and deleting an account (not).

/**
 * The last section of a person: what cannot be taken lightly, each with one sentence. An active person can be
 * blocked (they sign in again when unblocked); a blocked or refused account can be deleted for good, by the
 * platform only. Nothing here for a sign-up still waiting, or when the server would refuse (yourself, a manager).
 */
export function DangerZone({ rep, onGone }: { rep: Rep; onGone: () => void }) {
  const t = useT(manageMessages);
  const tw = useT(peopleWorkspaceMessages);
  const isSuperAdmin = useIsSuperAdmin();
  const status = personStatus(rep);
  // Blocking yourself would lock you out of the admin you are using.
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const isSelf = !!me && rep.id === me.rep.id;
  const canBlock = status === "active" && !isSelf && (isSuperAdmin || rep.role === "rep");
  const canDelete = (status === "blocked" || status === "refused") && isSuperAdmin;
  if (!canBlock && !canDelete) return null;
  return (
    <Section title={tw("sectionDanger")} icon={ShieldAlert} testId="person-danger">
      {canBlock ? <BlockAccess rep={rep} /> : (
        <div className="space-y-2">
          <p className="text-xs text-white/50">{tw("deleteHint")}</p>
          <DeleteAccountButton rep={rep} onGone={onGone} />
        </div>
      )}
    </Section>
  );
}

function BlockAccess({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const [open, setOpen] = useState(false);
  const block = useRepAction((r) => t("repBlocked", { name: r.displayName }));
  return (
    <div className="space-y-2">
      <p className="text-xs text-white/50">{t("blockHint")}</p>
      <Button variant="outline" size="sm" className={DANGER_OUTLINE} onClick={() => setOpen(true)} data-testid={`block-${rep.id}`}>
        <Ban />
        {t("blockTitle")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title={t("confirmBlock", { name: rep.displayName })}
        description={t("blockHint")}
        reason="optional"
        reasonLabel={t("reasonOptional")}
        confirmLabel={t("block")}
        onConfirm={(reason) => block.mutateAsync({ url: `/api/xpot/admin/reps/${rep.id}/block`, body: { reason: reason || null }, rep })}
        testId={`block-${rep.id}-confirm`}
      />
    </div>
  );
}

type DeletionResult = { account: "deleted" | "anonymized"; leadsDeleted: number; leadsUnassigned: number; visitsDeleted: number; files: { deleted: number; failed: number } };

/** Delete the account and its data, when the person asks (privacy policy, "How long we keep it"). */
function DeleteAccountButton({ rep, onGone }: { rep: Rep; onGone: () => void }) {
  const t = useT(manageMessages);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = useIsSuperAdmin();
  const word = t("deleteAccountWord");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    // The API's own guard word is always "DELETE"; the one typed is localized.
    mutationFn: () => send<DeletionResult>(`/api/xpot/admin/reps/${rep.id}`, { confirm: "DELETE" }, "DELETE"),
    onSuccess: (r) => {
      setOpen(false);
      toast({
        title: t("accountDeleted", { name: rep.displayName }),
        description: [
          t("accountDeletedSummary", { leads: r.leadsDeleted, visits: r.visitsDeleted, files: r.files.deleted }),
          r.leadsUnassigned ? t("accountDeletedKept", { count: r.leadsUnassigned }) : "",
          r.files.failed ? t("accountDeletedFilesFailed", { count: r.files.failed }) : "",
        ].filter(Boolean).join(" "),
        variant: r.files.failed ? "destructive" : "success",
      });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
      onGone();
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
  // The global admin only, like the server (requireSuperAdmin).
  if (!isSuperAdmin) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={DANGER_OUTLINE}
        loading={remove.isPending}
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        data-testid={`delete-${rep.id}`}
      >
        <Trash2 />
        {t("deleteAccount")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("deleteAccountTitle", { name: rep.displayName })}
        description={t("deleteAccountBody")}
        confirmLabel={t("deleteAccount")}
        destructive
        busy={remove.isPending}
        // The word is typed in the admin's language and in capitals, like the hint says.
        confirmDisabled={typed.trim() !== word}
        onConfirm={() => remove.mutate()}
        testId={`delete-dialog-${rep.id}`}
      >
        <Field label={t("deleteAccountTypeHint", { word })}>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} autoComplete="off" data-testid={`delete-word-${rep.id}`} />
        </Field>
      </ConfirmDialog>
    </>
  );
}
