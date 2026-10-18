import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Package, PackageOpen, Settings, ShieldCheck, Users } from "lucide-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/xpot/AppLayout";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
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

const FIELD = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-blue-400/50";
const BUTTON = "rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10";
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
        <div>
          <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
          <p className="mt-1 text-sm text-white/50">{t("intro")}</p>
        </div>

        {mayCreate && (
          <form
            className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => { event.preventDefault(); create.mutate(); }}
          >
            <input className={FIELD} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("namePlaceholder")} required />
            <select className={FIELD} value={repAdminId} onChange={(event) => setRepAdminId(event.target.value)} required>
              <option value="">{t("chooseRepAdmin")}</option>
              {reps.map((rep) => <option key={rep.id} value={rep.id}>{rep.displayName}</option>)}
            </select>
            <button className={`${BUTTON} bg-blue-500/20 text-blue-100`} disabled={create.isPending}>{t("createOrganization")}</button>
            {create.error && <p className="text-sm text-red-300 md:col-span-3">{describeApiError(create.error)}</p>}
          </form>
        )}

        {isLoading ? <p className="text-sm text-white/50">{t("loadingList")}</p> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                onClick={() => navigate(`/organizations/${organization.id}`)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:border-blue-400/30 hover:bg-white/[0.06]"
              >
                <div className="flex items-start justify-between gap-3">
                  <Building2 className="h-6 w-6 text-blue-300" />
                  {organization.membershipRole && (
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                      {organization.membershipRole === "admin" ? t("roleRepAdmin") : t("roleRep")}
                    </span>
                  )}
                </div>
                <h2 className="mt-4 font-semibold text-white">{organization.name}</h2>
                <p className="mt-1 text-xs text-white/35">{organization.isActive ? t("active") : t("inactive")}</p>
              </button>
            ))}
            {!organizations.length && <p className="text-sm text-white/45">{t("emptyList")}</p>}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

type WorkspaceTab = "overview" | "team" | "inventory" | "kits" | "customers" | "settings";

function OrganizationWorkspace({ organizationId }: { organizationId: number }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
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

  if (organization.isLoading) return <AppLayout title={t("title")}><p className="text-sm text-white/50">{t("loadingOne")}</p></AppLayout>;
  if (organization.error || !organization.data) {
    return <AppLayout title={t("title")}><p className="text-sm text-red-300">{organization.error ? describeApiError(organization.error) : t("notFound")}</p></AppLayout>;
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button onClick={() => navigate("/organizations")} className="mb-2 text-xs font-semibold text-blue-300 hover:text-blue-200">← {t("backToList")}</button>
            <h1 className="text-2xl font-bold text-white">{org.name}</h1>
            <p className="mt-1 text-sm text-white/45">{membership?.role === "admin" ? t("roleRepAdmin") : platformManager ? t("platformManagement") : t("roleRep")}</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium ${tab === id ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>

        {tab === "overview" && <Overview organization={org} inventory={inventory.data ?? []} kits={kits.data ?? []} customers={customers.data ?? []} />}
        {tab === "team" && (
          <div className="space-y-4">
            {mayManageTeam && (
              <form className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[1fr_1fr_auto_auto]" onSubmit={(event) => { event.preventDefault(); addMember.mutate(); }}>
                <input className={FIELD} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t("repName")} required />
                <input className={FIELD} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t("phoneWithCode")} required />
                {platformManager && <select className={FIELD} value={newRole} onChange={(event) => setNewRole(event.target.value as "admin" | "member")}><option value="member">{t("roleRep")}</option><option value="admin">{t("roleRepAdmin")}</option></select>}
                <button className={BUTTON} disabled={addMember.isPending}>{t("addRep")}</button>
                {addMember.error && <p className="text-sm text-red-300 md:col-span-4">{describeApiError(addMember.error)}</p>}
              </form>
            )}
            <div className="overflow-hidden rounded-2xl border border-white/10">
              {(members.data ?? []).map((member) => {
                const canChange = mayManageTeam && member.repId !== me?.rep.id && (platformManager || member.membershipRole !== "admin");
                const suspended = !member.isActive || !!member.blockedAt;
                return (
                  <div key={member.repId} className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{member.displayName}</p>
                      <p className="truncate text-xs text-white/40">{member.phone || member.email || t("noContact")}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase text-white/60">
                      {member.membershipRole === "admin" && <ShieldCheck className="h-3 w-3" />}{member.membershipRole === "admin" ? t("roleRepAdmin") : t("roleRep")}
                    </span>
                    <span className={`text-xs ${suspended ? "text-red-300" : "text-emerald-300"}`}>{suspended ? t("memberSuspended") : t("memberActive")}</span>
                    {canChange && <>
                      <button className={BUTTON} onClick={() => setPending({ member, kind: member.blockedAt ? "reactivate" : "suspend" })}>{member.blockedAt ? t("reactivate") : t("suspend")}</button>
                      {platformManager && <button className={BUTTON} onClick={() => setPending({ member, kind: member.membershipRole === "admin" ? "makeRep" : "makeAdmin" })}>{member.membershipRole === "admin" ? t("makeRep") : t("makeRepAdmin")}</button>}
                      <button className={`${BUTTON} text-red-200`} onClick={() => setPending({ member, kind: "remove" })}>{t("remove")}</button>
                    </>}
                  </div>
                );
              })}
            </div>
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
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-xs font-semibold uppercase tracking-wide text-white/40">{label}</p><p className="mt-2 text-3xl font-bold text-white">{value}</p></div>)}</div>;
}

function SimpleList({ rows, empty, render }: { rows: any[]; empty: string; render: (row: any) => ReactNode }) {
  if (!rows.length) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/45">{empty}</p>;
  return <div className="overflow-hidden rounded-2xl border border-white/10">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-3 last:border-0">{render(row)}</div>)}</div>;
}

function OrganizationSettings({ organization, mayEdit }: { organization: Organization; mayEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = useT(organizationsMessages);
  const tc = useT(commonMessages);
  const [name, setName] = useState(organization.name);
  const save = useMutation({
    mutationFn: () => json<Organization>("PATCH", `/api/xpot/organizations/${organization.id}`, { name }),
    onSuccess: () => {
      toast({ title: t("orgSaved"), variant: "success" });
      void qc.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organization.id}`] });
    },
    onError: (error) => toast({ title: t("couldNotSave"), description: describeApiError(error), variant: "destructive" }),
  });
  return <div className="max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-5"><label className="text-xs font-semibold uppercase text-white/40">{t("orgName")}</label><div className="mt-2 flex gap-2"><input className={FIELD} value={name} onChange={(event) => setName(event.target.value)} disabled={!mayEdit} /><button className={BUTTON} onClick={() => save.mutate()} disabled={!mayEdit || save.isPending}>{tc("save")}</button></div>{!mayEdit && <p className="mt-3 text-xs text-white/40">{t("settingsReadOnly")}</p>}</div>;
}
