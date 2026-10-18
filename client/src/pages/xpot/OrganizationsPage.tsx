import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Package, PackageOpen, Settings, ShieldCheck, Users } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/xpot/AppLayout";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input, Select } from "@/components/xpot/Field";
import { FormFooter } from "@/components/xpot/FormFooter";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { BackLink, PageHeader } from "@/components/xpot/PageHeader";
import { Stat } from "@/components/xpot/Stat";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_CLASS, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { Tabs } from "@/components/xpot/Tabs";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { formatDate } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { organizationsMessages } from "@/i18n/messages/organizations";
import { tagsMessages } from "@/i18n/messages/tags";
import type { XpotMeResponse } from "./types";

type Organization = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  membershipRole?: "admin" | "member";
  counts?: { members: number; pieces: number; kits: number; customers: number };
};

type Member = {
  repId: number;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  platformRole: "rep" | "manager" | "admin";
  membershipRole: "admin" | "member";
  isActive: boolean;
  blockedAt?: string | null;
};

/** What a member action does, for its confirmation and its toast. */
type MemberAction = { member: Member; kind: "suspend" | "reactivate" | "makeAdmin" | "makeRep" | "remove" };

/** The outline button for removing someone; the dialog it opens is the red one. */
const DANGER_OUTLINE = "border-red-400/30 text-red-300 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200";
// Stored on the membership when it is suspended; managers read it in the audit log.
const SUSPENDED_REASON = "Suspended by an organization manager";

async function json<T>(method: string, url: string, body?: unknown): Promise<T> {
  return (await apiRequest(method, url, body)).json() as Promise<T>;
}

/** A label from a dictionary key that may not exist (an unknown product or status shows as is). */
function lookup(t: (key: never) => string, key: string, fallback: string) {
  const text = (t as unknown as (key: string) => string)(key);
  return text === key ? fallback : text;
}

export function OrganizationsPage({ organizationId }: { organizationId?: number }) {
  return organizationId ? <OrganizationWorkspace organizationId={organizationId} /> : <OrganizationsList />;
}

function OrganizationsList() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const t = useT(organizationsMessages);
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"] });
  const { data: organizations = [], isLoading } = useQuery<Organization[]>({ queryKey: ["/api/xpot/organizations"] });
  const { data: reps = [] } = useQuery<Array<{ id: number; displayName: string; role: string }>>({
    queryKey: ["/api/xpot/admin/reps"],
    enabled: !!me && (me.user.isAdmin || me.rep.role === "manager"),
  });
  const [name, setName] = useState("");
  const [repAdminId, setRepAdminId] = useState("");
  const mayCreate = !!me && (me.user.isAdmin || me.rep.role === "manager");
  const create = useMutation({
    mutationFn: () => json<Organization>("POST", "/api/xpot/organizations", { name, repAdminId: Number(repAdminId) }),
    onSuccess: (organization) => {
      void qc.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
      navigate(`/organizations/${organization.id}`);
    },
  });

  return (
    <AppLayout title={t("title")} size="wide">
      <div className="space-y-6">
        {/* Back to Settings, where Administration lists this page (the phone has no sidebar). */}
        <PageHeader backHref="/settings?tab=memberships" title={t("title")} description={t("intro")} className="mb-0" />

        {mayCreate && (
          <form
            className={`grid gap-3 rounded-2xl ${GLASS_CLASS} p-4 md:grid-cols-[1fr_1fr_auto]`}
            onSubmit={(event) => { event.preventDefault(); create.mutate(); }}
          >
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("namePlaceholder")} aria-label={t("namePlaceholder")} required />
            <Select value={repAdminId} onChange={(event) => setRepAdminId(event.target.value)} aria-label={t("chooseRepAdmin")} required
              placeholder={t("chooseRepAdmin")} options={reps.map((rep) => ({ value: String(rep.id), label: rep.displayName }))} />
            <Button type="submit" variant="brand" loading={create.isPending}>{t("createOrganization")}</Button>
            {create.error && <InlineAlert tone="error" className="md:col-span-3">{describeApiError(create.error)}</InlineAlert>}
          </form>
        )}

        {isLoading ? <ListSkeleton rows={3} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" rowClassName="h-32 rounded-2xl" /> : !organizations.length ? (
          <EmptyState icon={Building2} title={t("emptyList")} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                onClick={() => navigate(`/organizations/${organization.id}`)}
                className={`rounded-2xl ${GLASS_CLASS} p-5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Building2 className="h-6 w-6 text-slate-200" />
                  {organization.membershipRole && (
                    <Pill tone="slate">{organization.membershipRole === "admin" ? t("roleRepAdmin") : t("roleRep")}</Pill>
                  )}
                </div>
                <h2 className="mt-4 font-semibold text-white">{organization.name}</h2>
                <p className="mt-1 text-xs text-white/35">{organization.isActive ? t("active") : t("inactive")}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

type WorkspaceTab = "overview" | "team" | "inventory" | "kits" | "customers" | "settings";

function OrganizationWorkspace({ organizationId }: { organizationId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = useT(organizationsMessages);
  const tt = useT(tagsMessages);
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"] });
  const base = `/api/xpot/organizations/${organizationId}`;
  const organization = useQuery<Organization>({ queryKey: [base] });
  const members = useQuery<Member[]>({ queryKey: [`${base}/members`] });
  const inventory = useQuery<any[]>({ queryKey: [`${base}/inventory`], enabled: tab === "inventory" || tab === "overview" });
  const kits = useQuery<any[]>({ queryKey: [`${base}/kits`], enabled: tab === "kits" || tab === "overview" });
  const customers = useQuery<any[]>({ queryKey: [`${base}/customers`], enabled: tab === "customers" || tab === "overview" });
  const membership = me?.organizationMemberships?.find((item) => item.organizationId === organizationId && item.isActive && !item.blockedAt);
  const platformManager = !!me && (me.user.isAdmin || me.rep.role === "manager");
  const mayManageTeam = platformManager || membership?.role === "admin";
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "member">("member");
  const [pending, setPending] = useState<MemberAction | null>(null);
  // Kits and customers name their rep, not "Rep #12".
  const repNames = useMemo(() => new Map((members.data ?? []).map((m) => [m.repId, m.displayName])), [members.data]);
  const repName = (repId: number | null | undefined) => (repId ? repNames.get(repId) ?? "—" : t("unassigned"));

  const addMember = useMutation({
    mutationFn: () => json("POST", `${base}/members`, {
      displayName,
      phone,
      role: "rep",
      modules: ["visits", "tags"],
      costPolicy: "acquisition",
      membershipRole: platformManager ? newRole : "member",
    }),
    onSuccess: () => {
      toast({ title: t("memberAdded", { name: displayName }), variant: "success" });
      setDisplayName(""); setPhone(""); setNewRole("member");
      void qc.invalidateQueries({ queryKey: [`${base}/members`] });
      void qc.invalidateQueries({ queryKey: [base] });
    },
  });
  const changeMember = useMutation({
    mutationFn: async ({ member, kind }: MemberAction) => {
      if (kind === "remove") return json("DELETE", `${base}/members/${member.repId}`);
      const patch =
        kind === "suspend" ? { blockedReason: SUSPENDED_REASON }
        : kind === "reactivate" ? { blockedReason: null }
        : { role: kind === "makeAdmin" ? "admin" : "member" };
      return json("PATCH", `${base}/members/${member.repId}`, patch);
    },
    onSuccess: (_data, { member, kind }) => {
      setPending(null);
      toast({ title: t(kind === "remove" ? "memberRemoved" : "memberUpdated", { name: member.displayName }), variant: "success" });
      void qc.invalidateQueries({ queryKey: [`${base}/members`] });
      void qc.invalidateQueries({ queryKey: [base] });
    },
    onError: (error) => {
      setPending(null);
      toast({ title: t("couldNotSave"), description: describeApiError(error), variant: "destructive" });
    },
  });

  const tabs = useMemo<Array<{ id: WorkspaceTab; label: string; icon: typeof Users }>>(() => [
    { id: "overview", label: t("tabOverview"), icon: Building2 },
    { id: "team", label: t("tabTeam"), icon: Users },
    { id: "inventory", label: t("tabInventory"), icon: Package },
    { id: "kits", label: t("tabKits"), icon: PackageOpen },
    { id: "customers", label: t("tabCustomers"), icon: Users },
    { id: "settings", label: t("tabSettings"), icon: Settings },
  ], [t]);

  if (organization.isLoading) return <AppLayout title={t("title")}><ListSkeleton rows={4} /></AppLayout>;
  if (organization.error || !organization.data) {
    return (
      <AppLayout title={t("title")}>
        <BackLink href="/organizations" className="mb-3">{t("backToList")}</BackLink>
        {organization.error ? (
          <ErrorState message={describeApiError(organization.error)} onRetry={() => void organization.refetch()} />
        ) : (
          <EmptyState icon={Building2} title={t("notFound")} />
        )}
      </AppLayout>
    );
  }
  const org = organization.data;
  const confirmCopy = pending ? {
    suspend: { title: t("suspendTitle", { name: pending.member.displayName }), body: t("suspendBody"), label: t("suspend"), danger: true },
    reactivate: { title: t("reactivateTitle", { name: pending.member.displayName }), body: t("reactivateBody"), label: t("reactivate"), danger: false },
    makeAdmin: { title: t("makeAdminTitle", { name: pending.member.displayName }), body: t("makeAdminBody"), label: t("makeRepAdmin"), danger: false },
    makeRep: { title: t("makeRepTitle", { name: pending.member.displayName }), body: t("makeRepBody"), label: t("makeRep"), danger: false },
    remove: { title: t("removeTitle", { name: pending.member.displayName }), body: t("removeBody"), label: t("remove"), danger: true },
  }[pending.kind] : null;

  return (
    <AppLayout title={org.name} size="wide">
      <div className="space-y-5">
        <PageHeader
          backHref="/organizations"
          backLabel={t("backToList")}
          title={org.name}
          description={membership?.role === "admin" ? t("roleRepAdmin") : platformManager ? t("platformManagement") : t("roleRep")}
          className="mb-0"
        />

        <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel={org.name} idPrefix="organization" fill={false} accent="account" />

        {tab === "overview" && <Overview organization={org} inventory={inventory.data ?? []} kits={kits.data ?? []} customers={customers.data ?? []} />}
        {tab === "team" && (
          <div className="space-y-4">
            {mayManageTeam && (
              <form className={`grid gap-3 rounded-2xl ${GLASS_CLASS} p-4 md:grid-cols-[1fr_1fr_auto_auto]`} onSubmit={(event) => { event.preventDefault(); addMember.mutate(); }}>
                <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t("repName")} aria-label={t("repName")} required />
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t("phoneWithCode")} aria-label={t("phoneWithCode")} type="tel" required />
                {platformManager && (
                  <Select value={newRole} onChange={(event) => setNewRole(event.target.value as "admin" | "member")} aria-label={t("roleRepAdmin")}
                    options={[{ value: "member", label: t("roleRep") }, { value: "admin", label: t("roleRepAdmin") }]} />
                )}
                <Button type="submit" variant="brand" loading={addMember.isPending}>{t("addRep")}</Button>
                {addMember.error && <InlineAlert tone="error" className="md:col-span-4">{describeApiError(addMember.error)}</InlineAlert>}
              </form>
            )}
            {members.isLoading ? <ListSkeleton rows={3} /> : members.isError ? (
              <ErrorState message={describeApiError(members.error)} onRetry={() => void members.refetch()} />
            ) : (
            <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`}>
              {(members.data ?? []).map((member) => {
                const canChange = mayManageTeam && member.repId !== me?.rep.id && (platformManager || member.membershipRole !== "admin");
                const suspended = !member.isActive || !!member.blockedAt;
                return (
                  <div key={member.repId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{member.displayName}</p>
                      <p className="truncate text-xs text-white/40">{member.phone || member.email || t("noContact")}</p>
                    </div>
                    <Pill tone="slate" className="gap-1">
                      {member.membershipRole === "admin" && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}{member.membershipRole === "admin" ? t("roleRepAdmin") : t("roleRep")}
                    </Pill>
                    <Pill tone={suspended ? "red" : "green"}>{suspended ? t("memberSuspended") : t("memberActive")}</Pill>
                    {canChange && <>
                      <Button variant="secondary" size="sm" onClick={() => setPending({ member, kind: member.blockedAt ? "reactivate" : "suspend" })}>{member.blockedAt ? t("reactivate") : t("suspend")}</Button>
                      {platformManager && <Button variant="secondary" size="sm" onClick={() => setPending({ member, kind: member.membershipRole === "admin" ? "makeRep" : "makeAdmin" })}>{member.membershipRole === "admin" ? t("makeRep") : t("makeRepAdmin")}</Button>}
                      <Button variant="outline" size="sm" className={DANGER_OUTLINE} onClick={() => setPending({ member, kind: "remove" })}>{t("remove")}</Button>
                    </>}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}
        {tab === "inventory" && <SimpleList rows={inventory.data ?? []} empty={t("noPieces")} render={(row) => <><span className="font-mono text-sm text-white">{row.publicCode}</span><span className="text-xs text-white/45">{lookup(tt, `product_${row.productType}`, String(row.productType ?? ""))} · {lookup(tt, `status_${row.status}`, String(row.status ?? ""))}</span></>} />}
        {tab === "kits" && <SimpleList rows={kits.data ?? []} empty={t("noKits")} render={(row) => <><span className="text-sm text-white">{t("kitOf", { date: formatDate(row.createdAt) })}{row.note ? <span className="text-white/45"> · {row.note}</span> : null}</span><span className="text-xs text-white/45">{repName(row.repId)}</span></>} />}
        {tab === "customers" && <SimpleList rows={customers.data ?? []} empty={t("noCustomers")} render={(row) => <><span className="text-sm font-medium text-white">{row.name}</span><span className="text-xs text-white/45">{lookup(t, `customer_${row.status}`, String(row.status ?? ""))} · {repName(row.ownerRepId)}</span></>} />}
        {tab === "settings" && <OrganizationSettings organization={org} mayEdit={platformManager} />}
      </div>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={confirmCopy?.title ?? ""}
        description={confirmCopy?.body ?? ""}
        confirmLabel={confirmCopy?.label ?? ""}
        destructive={confirmCopy?.danger}
        busy={changeMember.isPending}
        onConfirm={() => pending && changeMember.mutate(pending)}
        testId="organization-member-confirm"
      />
    </AppLayout>
  );
}

function Overview({ organization, inventory, kits, customers }: { organization: Organization; inventory: any[]; kits: any[]; customers: any[] }) {
  const t = useT(organizationsMessages);
  const cards = [
    [t("cardMembers"), organization.counts?.members ?? 0],
    [t("cardInventory"), organization.counts?.pieces ?? inventory.length],
    [t("cardKits"), organization.counts?.kits ?? kits.length],
    [t("cardCustomers"), organization.counts?.customers ?? customers.length],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map(([label, value]) => <Stat key={String(label)} card label={label} value={value} />)}
    </div>
  );
}

function SimpleList({ rows, empty, render }: { rows: any[]; empty: string; render: (row: any) => ReactNode }) {
  if (!rows.length) return <EmptyState compact icon={Package} title={empty} />;
  return (
    <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`}>
      {rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">{render(row)}</div>)}
    </div>
  );
}

function OrganizationSettings({ organization, mayEdit }: { organization: Organization; mayEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = useT(organizationsMessages);
  const tc = useT(commonMessages);
  const [name, setName] = useState(organization.name);
  const dirty = name.trim() !== organization.name;
  const save = useMutation({
    mutationFn: () => json<Organization>("PATCH", `/api/xpot/organizations/${organization.id}`, { name }),
    onSuccess: () => {
      toast({ title: t("orgSaved"), variant: "success" });
      void qc.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organization.id}`] });
    },
    onError: (error) => toast({ title: t("couldNotSave"), description: describeApiError(error), variant: "destructive" }),
  });
  return (
    <div className={`max-w-xl space-y-4 rounded-2xl ${GLASS_CLASS} p-5`}>
      <Field label={t("orgName")} hint={!mayEdit ? t("settingsReadOnly") : undefined}>
        <Input value={name} onChange={(event) => setName(event.target.value)} disabled={!mayEdit} />
      </Field>
      {mayEdit && (
        <FormFooter dirty={dirty} onCancel={dirty ? () => setName(organization.name) : undefined}>
          <Button variant="brand" onClick={() => save.mutate()} disabled={!dirty || !name.trim()} loading={save.isPending}>{tc("save")}</Button>
        </FormFooter>
      )}
    </div>
  );
}
