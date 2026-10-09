import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Package, PackageOpen, Settings, ShieldCheck, Users } from "lucide-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/xpot/AppLayout";
import { apiRequest } from "@/lib/queryClient";
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

const FIELD = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-blue-400/50";
const BUTTON = "rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10";

async function json<T>(method: string, url: string, body?: unknown): Promise<T> {
  return (await apiRequest(method, url, body)).json() as Promise<T>;
}

export function OrganizationsPage({ organizationId }: { organizationId?: number }) {
  return organizationId ? <OrganizationWorkspace organizationId={organizationId} /> : <OrganizationsList />;
}

function OrganizationsList() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
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
    <AppLayout title="Organizations" size="wide">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Organizations</h1>
          <p className="mt-1 text-sm text-white/50">Teams of Reps that share customers, inventory, kits, and reporting.</p>
        </div>

        {mayCreate && (
          <form
            className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => { event.preventDefault(); create.mutate(); }}
          >
            <input className={FIELD} value={name} onChange={(event) => setName(event.target.value)} placeholder="Organization name" required />
            <select className={FIELD} value={repAdminId} onChange={(event) => setRepAdminId(event.target.value)} required>
              <option value="">Choose the first Rep Admin</option>
              {reps.map((rep) => <option key={rep.id} value={rep.id}>{rep.displayName}</option>)}
            </select>
            <button className={`${BUTTON} bg-blue-500/20 text-blue-100`} disabled={create.isPending}>Create Organization</button>
            {create.error && <p className="text-sm text-red-300 md:col-span-3">{(create.error as Error).message}</p>}
          </form>
        )}

        {isLoading ? <p className="text-sm text-white/50">Loading Organizations…</p> : (
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
                      {organization.membershipRole === "admin" ? "Rep Admin" : "Rep"}
                    </span>
                  )}
                </div>
                <h2 className="mt-4 font-semibold text-white">{organization.name}</h2>
                <p className="mt-1 text-xs text-white/35">{organization.isActive ? "Active" : "Inactive"}</p>
              </button>
            ))}
            {!organizations.length && <p className="text-sm text-white/45">No Organizations available.</p>}
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
      setDisplayName(""); setPhone(""); setNewRole("member");
      void qc.invalidateQueries({ queryKey: [`${base}/members`] });
      void qc.invalidateQueries({ queryKey: [base] });
    },
  });
  const changeMember = useMutation({
    mutationFn: ({ repId, patch }: { repId: number; patch: object }) => json("PATCH", `${base}/members/${repId}`, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [`${base}/members`] }),
  });
  const removeMember = useMutation({
    mutationFn: (repId: number) => json("DELETE", `${base}/members/${repId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [`${base}/members`] }),
  });

  const tabs = useMemo<Array<{ id: WorkspaceTab; label: string; icon: typeof Users }>>(() => [
    { id: "overview", label: "Overview", icon: Building2 },
    { id: "team", label: "Team", icon: Users },
    { id: "inventory", label: "Inventory", icon: Package },
    { id: "kits", label: "Kits", icon: PackageOpen },
    { id: "customers", label: "Customers", icon: Users },
    { id: "settings", label: "Settings", icon: Settings },
  ], []);

  if (organization.isLoading) return <AppLayout title="Organization"><p className="text-sm text-white/50">Loading Organization…</p></AppLayout>;
  if (organization.error || !organization.data) return <AppLayout title="Organization"><p className="text-sm text-red-300">{(organization.error as Error)?.message ?? "Organization not found"}</p></AppLayout>;
  const org = organization.data;

  return (
    <AppLayout title={org.name} size="wide">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button onClick={() => navigate("/organizations")} className="mb-2 text-xs font-semibold text-blue-300 hover:text-blue-200">← Organizations</button>
            <h1 className="text-2xl font-bold text-white">{org.name}</h1>
            <p className="mt-1 text-sm text-white/45">{membership?.role === "admin" ? "Rep Admin" : platformManager ? "Platform management" : "Rep"}</p>
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
                <input className={FIELD} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Rep name" required />
                <input className={FIELD} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone with country code" required />
                {platformManager && <select className={FIELD} value={newRole} onChange={(event) => setNewRole(event.target.value as "admin" | "member")}><option value="member">Rep</option><option value="admin">Rep Admin</option></select>}
                <button className={BUTTON} disabled={addMember.isPending}>Add Rep</button>
                {addMember.error && <p className="text-sm text-red-300 md:col-span-4">{(addMember.error as Error).message}</p>}
              </form>
            )}
            <div className="overflow-hidden rounded-2xl border border-white/10">
              {(members.data ?? []).map((member) => {
                const canChange = mayManageTeam && member.repId !== me?.rep.id && (platformManager || member.membershipRole !== "admin");
                return (
                  <div key={member.repId} className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{member.displayName}</p>
                      <p className="truncate text-xs text-white/40">{member.phone || member.email || "No contact"}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase text-white/60">
                      {member.membershipRole === "admin" && <ShieldCheck className="h-3 w-3" />}{member.membershipRole === "admin" ? "Rep Admin" : "Rep"}
                    </span>
                    <span className={`text-xs ${member.isActive && !member.blockedAt ? "text-emerald-300" : "text-red-300"}`}>{member.isActive && !member.blockedAt ? "Active" : "Blocked"}</span>
                    {canChange && <>
                      <button className={BUTTON} onClick={() => changeMember.mutate({ repId: member.repId, patch: { blockedReason: member.blockedAt ? null : "Blocked by Organization manager" } })}>{member.blockedAt ? "Activate" : "Block"}</button>
                      {platformManager && <button className={BUTTON} onClick={() => changeMember.mutate({ repId: member.repId, patch: { role: member.membershipRole === "admin" ? "member" : "admin" } })}>{member.membershipRole === "admin" ? "Make Rep" : "Make Rep Admin"}</button>}
                      <button className={`${BUTTON} text-red-200`} onClick={() => removeMember.mutate(member.repId)}>Remove</button>
                    </>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tab === "inventory" && <SimpleList rows={inventory.data ?? []} empty="No pieces in this Organization." render={(row) => <><span className="font-mono text-sm text-white">{row.publicCode}</span><span className="text-xs text-white/45">{row.productType} · {row.status}</span></>} />}
        {tab === "kits" && <SimpleList rows={kits.data ?? []} empty="No kits in this Organization." render={(row) => <><span className="text-sm text-white">Kit {String(row.id).slice(0, 8)}</span><span className="text-xs text-white/45">Rep #{row.repId}</span></>} />}
        {tab === "customers" && <SimpleList rows={customers.data ?? []} empty="No customers in this Organization." render={(row) => <><span className="text-sm font-medium text-white">{row.name}</span><span className="text-xs text-white/45">{row.status} · Rep #{row.ownerRepId ?? "—"}</span></>} />}
        {tab === "settings" && <OrganizationSettings organization={org} mayEdit={platformManager} />}
      </div>
    </AppLayout>
  );
}

function Overview({ organization, inventory, kits, customers }: { organization: Organization; inventory: any[]; kits: any[]; customers: any[] }) {
  const cards = [
    ["Team members", organization.counts?.members ?? 0],
    ["Inventory", organization.counts?.pieces ?? inventory.length],
    ["Kits", organization.counts?.kits ?? kits.length],
    ["Customers", organization.counts?.customers ?? customers.length],
  ];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-xs font-semibold uppercase tracking-wide text-white/40">{label}</p><p className="mt-2 text-3xl font-bold text-white">{value}</p></div>)}</div>;
}

function SimpleList({ rows, empty, render }: { rows: any[]; empty: string; render: (row: any) => ReactNode }) {
  if (!rows.length) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/45">{empty}</p>;
  return <div className="overflow-hidden rounded-2xl border border-white/10">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-3 last:border-0">{render(row)}</div>)}</div>;
}

function OrganizationSettings({ organization, mayEdit }: { organization: Organization; mayEdit: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState(organization.name);
  const save = useMutation({
    mutationFn: () => json<Organization>("PATCH", `/api/xpot/organizations/${organization.id}`, { name }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organization.id}`] }),
  });
  return <div className="max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-5"><label className="text-xs font-semibold uppercase text-white/40">Organization name</label><div className="mt-2 flex gap-2"><input className={FIELD} value={name} onChange={(event) => setName(event.target.value)} disabled={!mayEdit} /><button className={BUTTON} onClick={() => save.mutate()} disabled={!mayEdit || save.isPending}>Save</button></div>{!mayEdit && <p className="mt-3 text-xs text-white/40">Only an Admin or Manager can edit Organization settings.</p>}</div>;
}
