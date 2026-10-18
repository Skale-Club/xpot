import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, Package, PackageOpen, Settings, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/xpot/AppLayout";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input, Select } from "@/components/xpot/Field";
import { FilterToggle } from "@/components/xpot/filters";
import { FormFooter } from "@/components/xpot/FormFooter";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { BackLink, PageHeader } from "@/components/xpot/PageHeader";
import { Stat } from "@/components/xpot/Stat";
import { Pill } from "@/components/xpot/StatusPill";
import { SwitchRow } from "@/components/xpot/SwitchRow";
import { GLASS_CLASS, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { Tabs } from "@/components/xpot/Tabs";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { formatDate } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { organizationsMessages } from "@/i18n/messages/organizations";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { tagsMessages } from "@/i18n/messages/tags";
import { repModules } from "@shared/modules";
import type { XpotMeResponse } from "./types";

// Account › Organizations. People are created, approved and blocked only in
// People (/admin/reps); here an organization's members are existing people,
// added and given a role. The automatic one-person workspace each new rep gets
// (`personal`, shared/organizations.ts) is tucked away behind a toggle. The
// Inventory, Kits and Companies tabs list the organization's records by name,
// each row opening it on its own screen (those screens have no organization filter).

type Organization = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  membershipRole?: "admin" | "member";
  memberCount?: number;
  personal?: boolean;
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

type Person = { id: number; displayName: string; access: "pending" | "active" | "blocked"; refused?: boolean };

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

const isPlatformManager = (me: XpotMeResponse | undefined) => !!me && (me.user.isAdmin || me.rep.role === "manager");

export function OrganizationsPage({ organizationId }: { organizationId?: number }) {
  return organizationId ? <OrganizationWorkspace organizationId={organizationId} /> : <OrganizationsList />;
}

function OrganizationsList() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const t = useT(organizationsMessages);
  const tw = useT(peopleWorkspaceMessages);
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"] });
  const { data: organizations = [], isLoading } = useQuery<Organization[]>({ queryKey: ["/api/xpot/organizations"] });
  const mayCreate = isPlatformManager(me);
  const { data: reps = [] } = useQuery<Person[]>({ queryKey: ["/api/xpot/admin/reps"], enabled: mayCreate });
  const [name, setName] = useState("");
  const [repAdminId, setRepAdminId] = useState("");
  const [showPersonal, setShowPersonal] = useState(false);
  const personalCount = organizations.filter((o) => o.personal).length;
  const shown = showPersonal ? organizations : organizations.filter((o) => !o.personal);
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
            {/* The first org admin is someone who can use Xpot: not a refused or blocked account. */}
            <Select value={repAdminId} onChange={(event) => setRepAdminId(event.target.value)} aria-label={t("chooseRepAdmin")} required
              placeholder={t("chooseRepAdmin")} options={reps.filter((rep) => rep.access !== "blocked").map((rep) => ({ value: String(rep.id), label: rep.displayName }))} />
            <Button type="submit" variant="brand" loading={create.isPending}>{t("createOrganization")}</Button>
            {create.error && <InlineAlert tone="error" className="md:col-span-3">{describeApiError(create.error)}</InlineAlert>}
          </form>
        )}

        {personalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/45">{showPersonal ? "" : tw.plural("personalHidden", personalCount)}</p>
            <FilterToggle pressed={showPersonal} onChange={setShowPersonal} label={tw("showPersonal")} testId="organizations-show-personal" />
          </div>
        )}

        {isLoading ? <ListSkeleton rows={3} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" rowClassName="h-32 rounded-2xl" /> : !organizations.length ? (
          <EmptyState icon={Building2} title={t("emptyList")} />
        ) : !shown.length ? (
          <EmptyState compact icon={Building2} title={tw("onlyPersonal")} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="organizations-list">
            {shown.map((organization) => (
              <button
                key={organization.id}
                onClick={() => navigate(`/organizations/${organization.id}`)}
                className={`rounded-2xl ${GLASS_CLASS} p-5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Building2 className="h-6 w-6 text-slate-200" />
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {organization.personal && <Pill tone="slate">{tw("personalWorkspace")}</Pill>}
                    {organization.membershipRole && (
                      <Pill tone="slate">{organization.membershipRole === "admin" ? t("roleRepAdmin") : t("roleRep")}</Pill>
                    )}
                  </div>
                </div>
                <h2 className="mt-4 font-semibold text-white">{organization.name}</h2>
                <p className="mt-1 text-xs text-white/35">
                  {organization.isActive ? t("active") : t("inactive")}
                  {organization.memberCount != null ? ` · ${tw.plural("membersCount", organization.memberCount)}` : ""}
                </p>
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
  const tw = useT(peopleWorkspaceMessages);
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"] });
  const base = `/api/xpot/organizations/${organizationId}`;
  const organization = useQuery<Organization>({ queryKey: [base] });
  const members = useQuery<Member[]>({ queryKey: [`${base}/members`] });
  const inventory = useQuery<any[]>({ queryKey: [`${base}/inventory`], enabled: tab === "inventory" });
  const kits = useQuery<any[]>({ queryKey: [`${base}/kits`], enabled: tab === "kits" });
  const customers = useQuery<any[]>({ queryKey: [`${base}/customers`], enabled: tab === "customers" });
  const membership = me?.organizationMemberships?.find((item) => item.organizationId === organizationId && item.isActive && !item.blockedAt);
  const platformManager = isPlatformManager(me);
  const mayManageTeam = platformManager || membership?.role === "admin";
  // Companies open where this viewer works with them: Visits if they have it, else Tags.
  const usesVisits = !!me && repModules({ role: me.rep.role, modules: me.rep.modules }).includes("visits");
  const [pending, setPending] = useState<MemberAction | null>(null);
  // Kits and companies name their rep, not "Rep #12".
  const repNames = useMemo(() => new Map((members.data ?? []).map((m) => [m.repId, m.displayName])), [members.data]);
  const repName = (repId: number | null | undefined) => (repId ? repNames.get(repId) ?? "—" : t("unassigned"));

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
      void qc.invalidateQueries({ queryKey: [`/api/xpot/admin/reps/${member.repId}/organizations`] });
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

        {tab === "overview" && <Overview organization={org} onOpen={setTab} />}
        {tab === "team" && (
          <div className="space-y-4">
            {platformManager ? (
              <AddExistingPerson organizationId={organizationId} members={members.data ?? []} />
            ) : mayManageTeam ? (
              <p className="text-xs text-white/45">{tw("addExistingManagersOnly")}</p>
            ) : null}
            {members.isLoading ? <ListSkeleton rows={3} /> : members.isError ? (
              <ErrorState message={describeApiError(members.error)} onRetry={() => void members.refetch()} />
            ) : (
            <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`} data-testid="organization-members">
              {(members.data ?? []).map((member) => {
                const canChange = mayManageTeam && member.repId !== me?.rep.id && (platformManager || member.membershipRole !== "admin");
                const suspended = !member.isActive || !!member.blockedAt;
                return (
                  <div key={member.repId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      {/* The person themselves (access, role, every membership) is in People. */}
                      {platformManager ? (
                        <Link href={`/admin/reps/${member.repId}`} className="block truncate font-medium text-white hover:text-blue-200">{member.displayName}</Link>
                      ) : (
                        <p className="truncate font-medium text-white">{member.displayName}</p>
                      )}
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
        {tab === "inventory" && (
          <RecordList query={inventory} empty={t("noPieces")} rowHref={(row) => (platformManager ? `/admin/tags/pieces/${row.id}` : `/tags/pieces/${encodeURIComponent(row.publicCode)}`)}
            render={(row) => <><span className="font-mono text-sm text-white">{row.publicCode}</span><span className="text-xs text-white/45">{lookup(tt, `product_${row.productType}`, String(row.productType ?? ""))} · {lookup(tt, `status_${row.status}`, String(row.status ?? ""))}</span></>} />
        )}
        {tab === "kits" && (
          <RecordList query={kits} empty={t("noKits")} rowHref={(row) => (platformManager ? `/admin/tags/kits${row.repId ? `?kitRep=${row.repId}` : ""}` : "/tags/pieces")}
            render={(row) => <><span className="text-sm text-white">{t("kitOf", { date: formatDate(row.createdAt) })}{row.note ? <span className="text-white/45"> · {row.note}</span> : null}</span><span className="text-xs text-white/45">{repName(row.repId)}</span></>} />
        )}
        {tab === "customers" && (
          <RecordList query={customers} empty={t("noCustomers")} rowHref={(row) => (usesVisits ? `/leads/${row.id}` : `/tags/customers/${row.id}`)}
            render={(row) => <><span className="text-sm font-medium text-white">{row.name}</span><span className="text-xs text-white/45">{lookup(t, `customer_${row.status}`, String(row.status ?? ""))} · {repName(row.ownerRepId)}</span></>} />
        )}
        {tab === "settings" && <OrganizationSettings key={`${org.name}|${org.isActive}`} organization={org} mayEdit={platformManager} />}
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

/** Someone who already has an account joins, with a role; new people are made in People. */
function AddExistingPerson({ organizationId, members }: { organizationId: number; members: Member[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = useT(organizationsMessages);
  const tw = useT(peopleWorkspaceMessages);
  const base = `/api/xpot/organizations/${organizationId}`;
  const people = useQuery<Person[]>({ queryKey: ["/api/xpot/admin/reps"] });
  const [repId, setRepId] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const memberIds = new Set(members.map((m) => m.repId));
  // Refused and blocked accounts can't use Xpot, so they are not offered.
  const options = (people.data ?? []).filter((p) => !memberIds.has(p.id) && p.access !== "blocked");
  const add = useMutation({
    mutationFn: () => json("POST", `${base}/members`, { repId: Number(repId), membershipRole: role }),
    onSuccess: () => {
      const name = options.find((p) => String(p.id) === repId)?.displayName ?? "";
      toast({ title: t("memberAdded", { name }), variant: "success" });
      void qc.invalidateQueries({ queryKey: [`${base}/members`] });
      void qc.invalidateQueries({ queryKey: [base] });
      void qc.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
      void qc.invalidateQueries({ queryKey: [`/api/xpot/admin/reps/${repId}/organizations`] });
      setRepId("");
      setRole("member");
    },
  });
  return (
    <div className={`space-y-3 rounded-2xl ${GLASS_CLASS} p-4`} data-testid="organization-add-existing">
      <p className="text-sm font-semibold text-white">{tw("addExisting")}</p>
      {people.data && options.length === 0 ? (
        <p className="text-xs text-white/45">{tw("allPeopleJoined")}</p>
      ) : (
        <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={(event) => { event.preventDefault(); add.mutate(); }}>
          <Select value={repId} onChange={(event) => setRepId(event.target.value)} aria-label={tw("choosePerson")} placeholder={tw("choosePerson")} required
            options={options.map((p) => ({ value: String(p.id), label: p.displayName }))} data-testid="organization-add-person" />
          <Select value={role} onChange={(event) => setRole(event.target.value as "admin" | "member")} aria-label={tw("orgRole")}
            options={[{ value: "member", label: tw("orgRoleMember") }, { value: "admin", label: tw("orgRoleAdmin") }]} />
          <Button type="submit" variant="brand" disabled={!repId} loading={add.isPending}><UserPlus />{tw("add")}</Button>
        </form>
      )}
      {role === "admin" && <p className="text-xs text-white/45">{tw("orgAdminWarning")}</p>}
      {add.error && <InlineAlert tone="error">{describeApiError(add.error)}</InlineAlert>}
      <Link href="/admin/reps?new=1" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200">
        {tw("createInPeople")}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function Overview({ organization, onOpen }: { organization: Organization; onOpen: (tab: WorkspaceTab) => void }) {
  const t = useT(organizationsMessages);
  const cards: Array<[string, number, WorkspaceTab]> = [
    [t("cardMembers"), organization.counts?.members ?? 0, "team"],
    [t("cardInventory"), organization.counts?.pieces ?? 0, "inventory"],
    [t("cardKits"), organization.counts?.kits ?? 0, "kits"],
    [t("cardCustomers"), organization.counts?.customers ?? 0, "customers"],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map(([label, value, tab]) => (
        <button key={tab} type="button" onClick={() => onOpen(tab)} className="rounded-2xl text-left transition-colors hover:bg-white/[0.03]">
          <Stat card label={label} value={value} />
        </button>
      ))}
    </div>
  );
}

/** The organization's records, by name, each opening on its own screen. */
function RecordList({ query, empty, render, rowHref }: {
  query: { data?: any[]; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  empty: string;
  render: (row: any) => ReactNode;
  rowHref: (row: any) => string;
}) {
  const tw = useT(peopleWorkspaceMessages);
  if (query.isLoading) return <ListSkeleton rows={3} />;
  if (query.isError) return <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />;
  const rows = query.data ?? [];
  if (!rows.length) return <EmptyState compact icon={Package} title={empty} />;
  return (
    <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`}>
      {rows.map((row) => (
        <Link key={row.id} href={rowHref(row)} className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] focus-visible:!-outline-offset-2">
          <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">{render(row)}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-white/25" aria-label={tw("openRow")} />
        </Link>
      ))}
    </div>
  );
}

function OrganizationSettings({ organization, mayEdit }: { organization: Organization; mayEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = useT(organizationsMessages);
  const tw = useT(peopleWorkspaceMessages);
  const tc = useT(commonMessages);
  const [name, setName] = useState(organization.name);
  const [isActive, setIsActive] = useState(organization.isActive);
  const dirty = name.trim() !== organization.name || isActive !== organization.isActive;
  const save = useMutation({
    mutationFn: () => json<Organization>("PATCH", `/api/xpot/organizations/${organization.id}`, {
      ...(name.trim() !== organization.name ? { name: name.trim() } : {}),
      ...(isActive !== organization.isActive ? { isActive } : {}),
    }),
    onSuccess: () => {
      toast({ title: t("orgSaved"), variant: "success" });
      void qc.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organization.id}`] });
      void qc.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
    },
    onError: (error) => toast({ title: t("couldNotSave"), description: describeApiError(error), variant: "destructive" }),
  });
  return (
    <div className={`max-w-xl space-y-4 rounded-2xl ${GLASS_CLASS} p-5`}>
      <Field label={t("orgName")} hint={!mayEdit ? t("settingsReadOnly") : undefined}>
        <Input value={name} onChange={(event) => setName(event.target.value)} disabled={!mayEdit} />
      </Field>
      <SwitchRow checked={isActive} onCheckedChange={setIsActive} label={tw("orgActive")} hint={tw("orgActiveHint")} disabled={!mayEdit} testId="organization-active" />
      {mayEdit && (
        <FormFooter dirty={dirty} onCancel={dirty ? () => { setName(organization.name); setIsActive(organization.isActive); } : undefined}>
          <Button variant="brand" onClick={() => save.mutate()} disabled={!dirty || !name.trim()} loading={save.isPending}>{tc("save")}</Button>
        </FormFooter>
      )}
    </div>
  );
}
