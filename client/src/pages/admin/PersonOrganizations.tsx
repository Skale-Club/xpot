import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { ErrorState } from "@/components/xpot/EmptyState";
import { Select } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { Pill } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { manageMessages } from "@/i18n/messages/manage";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { send, type Rep } from "./PersonDetail";

// Account › People › one person › Organizations: where they work, with their role there; the platform adds and removes.

export type Membership = {
  organizationId: number;
  name: string;
  personal: boolean;
  organizationActive: boolean;
  role: "admin" | "member";
  isActive: boolean;
  blockedAt: string | null;
  /** The only active owner there: the server refuses to remove or suspend them. */
  onlyOwner: boolean;
};
type OrganizationOption = { id: number; name: string; personal: boolean };

export function Memberships({ rep }: { rep: Rep }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(manageMessages);
  const tw = useT(peopleWorkspaceMessages);
  const key = [`/api/xpot/admin/reps/${rep.id}/organizations`];
  const memberships = useQuery<Membership[]>({ queryKey: key });
  const organizations = useQuery<OrganizationOption[]>({ queryKey: ["/api/xpot/organizations"] });
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [removing, setRemoving] = useState<Membership | null>(null);

  const refresh = (organizationId: number) => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
    void queryClient.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organizationId}`] });
    void queryClient.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organizationId}/members`] });
  };
  const add = useMutation({
    mutationFn: (organizationId: number) => send(`/api/xpot/organizations/${organizationId}/members`, { repId: rep.id, membershipRole: role }),
    onSuccess: (_d, organizationId) => {
      const org = organizations.data?.find((o) => o.id === organizationId);
      toast({ title: tw("addedToOrg", { name: rep.displayName, org: org?.name ?? "" }), variant: "success" });
      setOrgId("");
      setRole("member");
      refresh(organizationId);
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (m: Membership) => send(`/api/xpot/organizations/${m.organizationId}/members/${rep.id}`, {}, "DELETE"),
    onSuccess: (_d, m) => {
      setRemoving(null);
      toast({ title: tw("removedFromOrg", { name: rep.displayName, org: m.name }), variant: "success" });
      refresh(m.organizationId);
    },
    onError: (e: Error) => {
      setRemoving(null);
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    },
  });

  if (memberships.isLoading) return <ListSkeleton rows={2} rowClassName="h-11 rounded-xl" />;
  if (memberships.isError || !memberships.data) {
    return <ErrorState compact message={tw("orgsLoadFailed")} onRetry={() => void memberships.refetch()} />;
  }
  const joined = new Set(memberships.data.map((m) => m.organizationId));
  // Other people's personal workspaces are not somewhere to add someone.
  const options = (organizations.data ?? []).filter((o) => !joined.has(o.id) && !o.personal);
  const activeCount = memberships.data.filter((m) => m.isActive && !m.blockedAt).length;
  const suspended = (m: Membership) => !m.isActive || !!m.blockedAt;

  return (
    <div className="space-y-3">
      {memberships.data.length === 0 ? (
        <p className="text-xs text-white/45">{tw("noOrganizations")}</p>
      ) : (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07]">
          {memberships.data.map((m) => (
            <li key={m.organizationId} className="flex items-center gap-2 px-3 py-2">
              {/* The name on its own line, the pills under it: a long name never squeezes out. */}
              <div className="min-w-0 flex-1">
                <Link href={`/organizations/${m.organizationId}`} className="flex min-h-9 min-w-0 items-center gap-1 text-sm font-medium text-white hover:text-blue-200" aria-label={tw("openOrganization", { name: m.name })}>
                  <span className="truncate">{m.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true" />
                </Link>
                <div className="flex flex-wrap gap-1.5 pb-1">
                  <Pill tone={m.role === "admin" ? "blue" : "slate"}>{m.role === "admin" ? tw("orgRoleAdmin") : tw("orgRoleMember")}</Pill>
                  {m.personal && <Pill tone="slate">{tw("personalWorkspace")}</Pill>}
                  {/* A blocked person is suspended everywhere because of that: the top already says it. */}
                  {suspended(m) && rep.access !== "blocked" && <Pill tone="red">{tw("orgSuspended")}</Pill>}
                  {m.onlyOwner && !m.personal && <span title={tw("onlyOwnerHint")}><Pill tone="slate">{tw("onlyOwner")}</Pill></span>}
                </div>
              </div>
              {!m.onlyOwner && (
                <Button variant="ghost" size="icon" className="text-red-300/80 hover:text-red-200" onClick={() => setRemoving(m)} aria-label={tw("removeFromOrg")} title={tw("removeFromOrg")} data-testid={`remove-org-${m.organizationId}`}>
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {rep.access === "blocked" ? null : options.length > 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="col-span-2">
              <Select value={orgId} onChange={(e) => setOrgId(e.target.value)} aria-label={tw("addToOrganization")} placeholder={tw("chooseOrganization")}
                options={options.map((o) => ({ value: String(o.id), label: o.name }))} data-testid="person-add-org" />
            </div>
            <Select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")} aria-label={tw("orgRole")}
              options={[{ value: "member", label: tw("orgRoleMember") }, { value: "admin", label: tw("orgRoleAdmin") }]} />
            <Button variant="secondary" disabled={!orgId} loading={add.isPending} onClick={() => add.mutate(Number(orgId))}>
              {tw("add")}
            </Button>
          </div>
          {role === "admin" && <p className="text-xs text-white/45">{tw("orgAdminWarning")}</p>}
        </div>
      ) : organizations.data ? (
        <p className="text-xs text-white/40">{tw("allOrgsJoined")}</p>
      ) : null}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={tw("removeFromOrgTitle", { name: rep.displayName, org: removing?.name ?? "" })}
        description={tw("removeFromOrgBody")}
        confirmLabel={tw("removeFromOrg")}
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        testId="person-remove-org-confirm"
      >
        {removing && !suspended(removing) && activeCount === 1 && <InlineAlert tone="warning">{tw("removeOnlyOrgWarning")}</InlineAlert>}
      </ConfirmDialog>
    </div>
  );
}
