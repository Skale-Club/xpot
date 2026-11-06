import { TagModelChips } from "@/components/xpot/TagProductThumbnail";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, Package, PackageOpen, Plus, Settings, ShieldCheck, ShoppingBag, UserPlus, Users } from "lucide-react";
import { Link, Redirect, useLocation, useSearchParams } from "wouter";
import { currentSearch, useUrlFilters } from "@/hooks/use-url-filters";
import { PieceStatusPill, usePieceStatusLabel } from "@/components/piece/PieceStatusPill";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/xpot/AppLayout";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input, Select } from "@/components/xpot/Field";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { FilterBar, FilterSearch, FilterSelect, FilterToggle } from "@/components/xpot/filters";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { BackLink, PageHeader } from "@/components/xpot/PageHeader";
import { Stat } from "@/components/xpot/Stat";
import { Pill } from "@/components/xpot/StatusPill";
import { DANGER_OUTLINE, GLASS_CLASS, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { Tabs } from "@/components/xpot/Tabs";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { managementReach, ownedOrganizationId, profileOfMe } from "@/lib/adminMode";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatPhone } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useT } from "@/i18n";
import { addPersonMessages } from "@/i18n/messages/addPerson";
import { commonMessages } from "@/i18n/messages/common";
import { organizationsMessages } from "@/i18n/messages/organizations";
import { COMPANY_ORGANIZATION_SLUG, type Distribution } from "@shared/organizations";
import { OrganizationSettings } from "./OrganizationSettings";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { repModules } from "@shared/modules";
import { kitCode } from "@shared/tagKits";
import { teamPeriodSince, type TeamActivityResponse } from "@shared/teamActivity";
import type { XpotMeResponse } from "./types";
import { AddPersonForm } from "./components/AddPersonForm";
import { NewPartnerDialog } from "./components/NewPartnerDialog";
import { MemberMenu } from "./components/MemberMenu";

// Organizations. The platform sees them all, each a Producer or a Seller (prints_own_pieces), and can filter by that.
// An owner or a partner who runs exactly one goes straight to its workspace, which is their panel's Team, Team
// purchases and Settings (the sidebar opens it with ?tab=). People are created, approved and blocked only in
// People (/admin/reps); here an organization's members are existing people,
// added and given a role. The automatic one-person workspace each new rep gets
// (`personal`, shared/organizations.ts) is tucked away behind a toggle. The
// Inventory, Kits and Companies tabs list the organization's records by name,
// each row opening it on its own screen; for platform management, "See all in
// Inventory / Distribution / Companies" opens the full list filtered to the organization (?org=).
// On desktop an organization is a tab bar (Overview, Team, Inventory, Kits,
// Companies, Settings); on a phone, a list of those sections with their counts,
// each opening its own screen (?tab=). A member's name opens their work
// (OrganizationPerson.tsx).

type Organization = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  printsOwnPieces?: boolean;
  /** Who handles its orders: Xpot (Stuscle) or the partner (migrations/0070). */
  distribution?: Distribution;
  /** The models it may print (slugs); null = every model (migrations/0069). */
  releasedPrintModels?: string[] | null;
  membershipRole?: "admin" | "member";
  memberCount?: number;
  personal?: boolean;
  counts?: { members: number; pieces: number; kits: number; customers: number };
  createdAt?: string;
};

type Member = {
  repId: number;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  platformRole: "rep" | "admin";
  membershipRole: "admin" | "member";
  isActive: boolean;
  blockedAt?: string | null;
  /** The person's own block (People), which suspends them in every organization. */
  personBlockedAt?: string | null;
};

type Person = { id: number; displayName: string; access: "pending" | "active" | "blocked"; refused?: boolean };

/** What the team bought (GET /organizations/:id/purchases): a Stuscle order with its lines, read only. */
type Purchase = {
  acquisition: { id: string; status: string; currency: string; purchasedAt: string };
  repName: string | null;
  lines: Array<{ id: string; productName: string | null; quantity: number; subtotalCents: number }>;
};

/** Producer: prints its own pieces (the company included). Seller: sells what it buys. */
const isProducer = (organization: Pick<Organization, "slug" | "printsOwnPieces">) => !!organization.printsOwnPieces || organization.slug === COMPANY_ORGANIZATION_SLUG;

/** What a member action does, for its confirmation and its toast. */
type MemberAction = { member: Member; kind: "suspend" | "reactivate" | "makeAdmin" | "makeRep" | "remove" };

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

const isPlatformManager = (me: XpotMeResponse | undefined) => !!me && me.user.isAdmin;

/** "Live 3 · Ready, not live 3 · No customer yet 7": how many pieces are in each status, the biggest first. */
function statusSummary(rows: any[], label: (piece: any) => string): string {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(label(row), (counts.get(label(row)) ?? 0) + 1);
  return Array.from(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} ${count}`).join(" · ");
}

export function OrganizationsPage({ organizationId }: { organizationId?: number }) {
  return organizationId ? <OrganizationWorkspace organizationId={organizationId} /> : <OrganizationsEntry />;
}

/** An owner or a partner with one organization has no list to choose from: their panel's organization opens. */
function OrganizationsEntry() {
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"] });
  const only = ownedOrganizationId(me);
  return only ? <Redirect to={`/organizations/${only}`} /> : <OrganizationsList />;
}

/**
 * The organizations as one table (the app's CompactDataTable, as in Tags › Customers), so thirty of them still read
 * at a glance: name, type (platform) or your role, members, status and created date, each row opening its workspace.
 * The shared filter bar searches by name and narrows by type and status; on a phone the rows become a compact list.
 */
function OrganizationsList() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const t = useT(organizationsMessages);
  const tw = useT(peopleWorkspaceMessages);
  const isDesktop = useIsDesktop();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"] });
  const { data: organizations = [], isLoading, error, refetch } = useQuery<Organization[]>({ queryKey: ["/api/xpot/organizations"] });
  const mayCreate = isPlatformManager(me);
  const { data: reps = [] } = useQuery<Person[]>({ queryKey: ["/api/xpot/admin/reps"], enabled: mayCreate });
  const [name, setName] = useState("");
  const [repAdminId, setRepAdminId] = useState("");
  const [creating, setCreating] = useState(false);
  // On a phone the filters wait behind one button, so the first organization is not a screen away (as in People).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = useUrlFilters({ q: "", personal: "", type: "", status: "" });
  const query = filters.values.q.trim().toLocaleLowerCase();
  const showPersonal = filters.values.personal === "1";
  const type = filters.values.type === "producer" || filters.values.type === "seller" ? filters.values.type : "";
  const status = filters.values.status === "active" || filters.values.status === "inactive" ? filters.values.status : "";
  const personalCount = organizations.filter((o) => o.personal).length;
  const listed = showPersonal ? organizations : organizations.filter((o) => !o.personal);
  const shown = listed.filter((o) =>
    (!type || (type === "producer") === isProducer(o))
    && (!status || (status === "active") === o.isActive)
    && (!query || o.name.toLocaleLowerCase().includes(query)));
  const narrowed = Boolean(query || type || status);
  const paged = usePagedList(shown, { resetKey: `${query}|${type}|${status}|${showPersonal}` });
  const showControls = isDesktop || filtersOpen || narrowed || showPersonal;
  const create = useMutation({
    mutationFn: () => json<Organization>("POST", "/api/xpot/organizations", { name, repAdminId: Number(repAdminId) }),
    onSuccess: (organization) => {
      void qc.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
      navigate(`/organizations/${organization.id}`);
    },
  });

  const open = (organization: Organization) => navigate(`/organizations/${organization.id}${currentSearch()}`);
  const typeLabel = (organization: Organization) => (isProducer(organization) ? t("typeProducer") : t("typeSeller"));
  const roleLabel = (organization: Organization) => (organization.membershipRole === "admin" ? t("roleRepAdmin") : t("roleRep"));

  const columns: CompactDataColumn<Organization>[] = [
    {
      key: "organization",
      label: t("columnOrganization"),
      render: (organization) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/60">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm font-semibold text-white/90">{organization.name}</strong>
            {organization.personal && <span className="mt-0.5 block truncate text-[11px] text-white/35">{tw("personalWorkspace")}</span>}
          </span>
        </div>
      ),
    },
    mayCreate
      ? { key: "type", label: t("typeFilter"), width: 170, render: (organization) => <Pill tone={isProducer(organization) ? "violet" : "blue"}>{typeLabel(organization)}</Pill> }
      : { key: "role", label: t("columnRole"), width: 150, render: (organization) => (organization.membershipRole ? <Pill tone="slate">{roleLabel(organization)}</Pill> : null) },
    {
      key: "members",
      label: t("columnMembers"),
      width: 110,
      align: "right",
      render: (organization) => <span className="font-semibold text-white/75">{organization.memberCount ?? 0}</span>,
    },
    {
      key: "status",
      label: t("columnStatus"),
      width: 130,
      render: (organization) => <Pill tone={organization.isActive ? "green" : "slate"} dot>{organization.isActive ? t("active") : t("inactive")}</Pill>,
    },
    {
      key: "created",
      label: t("columnCreated"),
      width: 140,
      render: (organization) => <span className="text-white/55">{formatDate(organization.createdAt)}</span>,
    },
    {
      key: "open",
      label: <span className="sr-only">{t("columnOrganization")}</span>,
      width: 48,
      align: "right",
      render: () => <ChevronRight className="ml-auto h-4 w-4 text-white/20" aria-hidden="true" />,
    },
  ];

  return (
    <AppLayout title={t("title")} size="wide">
      <div className="space-y-4">
        <PageHeader
          backHref={mayCreate ? "/admin" : undefined}
          title={t("title")}
          description={t("intro")}
          className="mb-2"
          actions={mayCreate ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setCreating((open) => !open)} aria-expanded={creating} data-testid="new-organization-open"><Plus />{t("newOrganization")}</Button>
              <NewPartnerDialog />
            </div>
          ) : undefined}
        />

        {mayCreate && creating && (
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

        {isLoading ? <ListSkeleton rows={5} /> : error ? (
          <ErrorState message={describeApiError(error)} onRetry={() => void refetch()} />
        ) : !organizations.length ? (
          <EmptyState icon={Building2} title={t("emptyList")} />
        ) : (
          <>
            <FilterBar
              testId="organizations-filters"
              search={<FilterSearch value={filters.values.q} onChange={(q) => filters.set({ q })} placeholder={t("searchOrganizations")} testId="organizations-search" />}
              actions={isDesktop ? undefined : <FilterToggle pressed={showControls} onChange={setFiltersOpen} label={tw("filters")} testId="organizations-filters-toggle" />}
              controls={!showControls ? undefined : (
                <>
                  {mayCreate && (
                    <FilterSelect value={type} onChange={(next) => filters.set({ type: next })} placeholder={t("typeAll")} testId="organizations-type-filter"
                      options={[{ value: "producer", label: t("typeProducer") }, { value: "seller", label: t("typeSeller") }]} />
                  )}
                  <FilterSelect value={status} onChange={(next) => filters.set({ status: next })} placeholder={t("statusAll")} testId="organizations-status-filter"
                    options={[{ value: "active", label: t("active") }, { value: "inactive", label: t("inactive") }]} />
                  {personalCount > 0 && <FilterToggle pressed={showPersonal} onChange={(on) => filters.set({ personal: on ? "1" : "" })} label={tw("showPersonal")} testId="organizations-show-personal" />}
                </>
              )}
              summary={{ shown: shown.length, total: listed.length, active: narrowed, onClear: () => filters.set({ q: "", type: "", status: "" }) }}
            />

            {!shown.length ? (
              <EmptyState compact icon={Building2} title={narrowed ? t("noMatch") : tw("onlyPersonal")} />
            ) : (
              <div>
                <CompactDataTable
                  columns={columns}
                  rows={paged.visible}
                  getRowKey={(organization) => organization.id}
                  onRowClick={open}
                  getRowAriaLabel={(organization) => t("openOrganization", { name: organization.name })}
                  getRowClassName={(organization) => (organization.isActive ? "" : "opacity-60")}
                  className="hidden sm:block"
                  testId="organizations-list"
                  getRowTestId={(organization) => `organization-row-${organization.id}`}
                />

                <div className={`divide-y divide-white/[0.055] overflow-hidden rounded-2xl sm:hidden ${GLASS_SUBTLE_CLASS}`}>
                  {paged.visible.map((organization) => (
                    <button
                      key={organization.id}
                      type="button"
                      onClick={() => open(organization)}
                      className={`group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-white/[0.05] ${organization.isActive ? "" : "opacity-60"}`}
                      aria-label={t("openOrganization", { name: organization.name })}
                      data-testid={`organization-card-${organization.id}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/60">
                        <Building2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-semibold text-white/90">{organization.name}</strong>
                        <span className="mt-1 block truncate text-[11px] text-white/40">
                          {[
                            mayCreate ? typeLabel(organization) : organization.membershipRole ? roleLabel(organization) : null,
                            tw.plural("membersCount", organization.memberCount ?? 0),
                            organization.isActive ? t("active") : t("inactive"),
                            organization.personal ? tw("personalWorkspace") : null,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/20 transition-transform group-active:translate-x-0.5" aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <ListPager shown={paged.shown} total={paged.total} hasMore={paged.hasMore} onMore={paged.showMore} />
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

const WORKSPACE_TABS = ["overview", "team", "inventory", "kits", "purchases", "customers", "settings"] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

function OrganizationWorkspace({ organizationId }: { organizationId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = useT(organizationsMessages);
  const tt = useT(tagsMessages);
  const tw = useT(peopleWorkspaceMessages);
  const ts = useT(shellMessages);
  const twp = useT(workspacesMessages);
  const tc = useT(commonMessages);
  const ta = useT(addPersonMessages);
  const statusLabel = usePieceStatusLabel();
  // The open section rides in the URL (?tab=team: a person's page links back to
  // the team it came from). Desktop shows a tab bar, Overview first. A phone has
  // no tab strip to swipe: its first screen lists the sections with their
  // counts, and each opens its own screen (a history entry, so Back returns).
  const isDesktop = useIsDesktop();
  const [, navigate] = useLocation();
  const [params, setParams] = useSearchParams();
  const urlTab = WORKSPACE_TABS.find((id) => id === params.get("tab")) ?? null;
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"] });
  const platformManager = isPlatformManager(me);
  // The owner or partner of this one organization has the sidebar for Team, Team purchases, Stock, Hand out and Companies:
  // here they get the team, with no tab strip that says the same things again (AD-06, NAV-28).
  const ownPanel = !platformManager && ownedOrganizationId(me) === organizationId;
  const tab: WorkspaceTab | null = urlTab ?? (ownPanel ? "team" : isDesktop ? "overview" : null);
  const home = `/organizations/${organizationId}`;
  const setTab = (next: WorkspaceTab) => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (isDesktop && next === "overview") updated.delete("tab");
      else updated.set("tab", next);
      return updated;
    }, { replace: isDesktop });
  };
  const base = `/api/xpot/organizations/${organizationId}`;
  const organization = useQuery<Organization>({ queryKey: [base] });
  const members = useQuery<Member[]>({ queryKey: [`${base}/members`] });
  const inventory = useQuery<any[]>({ queryKey: [`${base}/inventory`], enabled: tab === "inventory" });
  const kits = useQuery<any[]>({ queryKey: [`${base}/kits`], enabled: tab === "kits" });
  const customers = useQuery<any[]>({ queryKey: [`${base}/customers`], enabled: tab === "customers" });
  const membership = me?.organizationMemberships?.find((item) => item.organizationId === organizationId && item.isActive && !item.blockedAt);
  const mayManageTeam = platformManager || membership?.role === "admin";
  // The owner or partner of this one organization has no list above it: Back goes to their panel.
  const listParams = new URLSearchParams();
  for (const key of ["personal", "type"]) {
    const value = params.get(key);
    if (value) listParams.set(key, value);
  }
  const listHref = `/organizations${listParams.size ? `?${listParams}` : ""}`;
  // (An owner's Today is the Overview of their Company group.)
  const [backHref, backLabel] = ownedOrganizationId(me) === organizationId ? ["/admin", profileOfMe(me) === "owner" ? twp("companyOverview") : twp("todayTitle")] : [listHref, t("backToList")];
  // The owner follows what the team bought; an employee has no list of it (the server refuses).
  const purchases = useQuery<Purchase[]>({ queryKey: [`${base}/purchases`], enabled: tab === "purchases" && mayManageTeam });
  // Companies open where this viewer works with them: Visits if they have it, else Tags.
  const usesVisits = !!me && repModules({ role: me.rep.role, modules: me.rep.modules }).includes("visits");
  const [pending, setPending] = useState<MemberAction | null>(null);
  const [adding, setAdding] = useState(false);
  // Kits and companies name their rep, not "Rep #12".
  const repNames = useMemo(() => new Map((members.data ?? []).map((m) => [m.repId, m.displayName])), [members.data]);
  const repName = (repId: number | null | undefined) => (repId ? repNames.get(repId) ?? "-" : t("unassigned"));

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

  // Settings are only worth a tab to whoever can change them, or where there is a summary to read (a partner that prints).
  const hasSettings = platformManager || !!organization.data?.printsOwnPieces;
  const tabs = useMemo<Array<{ id: WorkspaceTab; label: string; icon: typeof Users }>>(() => [
    ...(ownPanel ? [] : [{ id: "overview" as const, label: t("tabOverview"), icon: Building2 }]),
    { id: "team", label: t("tabTeam"), icon: Users },
    ...(ownPanel ? [] : [
      { id: "inventory" as const, label: t("tabInventory"), icon: Package },
      { id: "kits" as const, label: t("tabKits"), icon: PackageOpen },
    ]),
    ...(mayManageTeam ? [{ id: "purchases" as const, label: t("tabPurchases"), icon: ShoppingBag }] : []),
    ...(ownPanel ? [] : [{ id: "customers" as const, label: t("tabCustomers"), icon: Building2 }]),
    ...(hasSettings && !ownPanel ? [{ id: "settings" as const, label: t("tabSettings"), icon: Settings }] : []),
  ], [t, mayManageTeam, ownPanel, hasSettings]);

  if (organization.isLoading) return <AppLayout title={t("title")}><ListSkeleton rows={4} /></AppLayout>;
  if (organization.error || !organization.data) {
    return (
      <AppLayout title={t("title")}>
        <BackLink href={backHref} className="mb-3">{backLabel}</BackLink>
        {organization.error ? (
          <ErrorState message={describeApiError(organization.error)} onRetry={() => void organization.refetch()} />
        ) : (
          <EmptyState icon={Building2} title={t("notFound")} />
        )}
      </AppLayout>
    );
  }
  const org = organization.data;
  // A phone inside one section: its header names the section, Back returns to the list.
  const phoneSection = !isDesktop && tab && !ownPanel ? tabs.find((item) => item.id === tab) : undefined;
  // Their own panel names the screen the sidebar opened (Team, Team purchases, Company details), under the company's name.
  const ownTitle = tab === "purchases" ? t("tabPurchases") : tab === "settings" ? t("companyDetails") : t("tabTeam");
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
        {phoneSection ? (
          <PageHeader backHref={`${home}${currentSearch(["tab"])}`} backLabel={org.name} eyebrow={org.name} title={phoneSection.label} className="mb-0" />
        ) : (
          <PageHeader
            backHref={backHref}
            backLabel={backLabel}
            eyebrow={ownPanel ? org.name : undefined}
            title={ownPanel ? ownTitle : org.name}
            description={ownPanel ? undefined : membership?.role === "admin" ? t("roleYouOwner") : platformManager ? undefined : t("roleYouEmployee")}
            className="mb-0"
          />
        )}

        {isDesktop && tab && !ownPanel && <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel={org.name} idPrefix="organization" fill={false} accent="account" />}
        {!tab && <SectionList organization={org} tabs={tabs} onOpen={setTab} />}

        {tab === "overview" && <Overview organization={org} onOpen={setTab} activityBase={mayManageTeam && usesVisits ? base : null} />}
        {tab === "team" && (
          <div className="space-y-4">
            {/* The team comes first. An owner adds a person by name and phone, always an employee; the platform also picks existing people and makes owners. */}
            {mayManageTeam && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 basis-56 text-sm text-white/55">{t("teamHint")}</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => setAdding((open) => !open)} aria-expanded={adding} data-testid="team-add-open"><UserPlus />{adding ? tc("close") : ta("title")}</Button>
              </div>
            )}
            {mayManageTeam && adding && <AddPersonForm organizationId={organizationId} />}
            {platformManager && adding && <AddExistingPerson organizationId={organizationId} members={members.data ?? []} />}
            {ownPanel && hasSettings ? (
              <button type="button" onClick={() => setTab("settings")} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-blue-300 hover:text-blue-200" data-testid="organization-company-details">
                {t("companyDetails")}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {members.isLoading ? <ListSkeleton rows={3} /> : members.isError ? (
              <ErrorState message={describeApiError(members.error)} onRetry={() => void members.refetch()} />
            ) : (
            <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`} data-testid="organization-members">
              {(members.data ?? []).map((member) => {
                const personBlocked = !!member.personBlockedAt;
                const suspended = !member.isActive || !!member.blockedAt;
                // The server keeps the last owner: no button to suspend, remove or demote them.
                const lastOwner = member.membershipRole === "admin" && !suspended && (members.data ?? []).filter((m) => m.membershipRole === "admin" && m.isActive && !m.blockedAt).length === 1;
                // A blocked person is changed in People (Unblock), not here: Reactivate would not give them access back.
                const canChange = mayManageTeam && !personBlocked && member.repId !== me?.rep.id && (platformManager || member.membershipRole !== "admin") && !lastOwner;
                return (
                  <div key={member.repId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      {/* Their work (companies, visits, tasks, sales) for whoever manages the team; the person themselves (access, role, every membership) is in People. */}
                      {mayManageTeam ? (
                        <Link href={`/organizations/${organizationId}/people/${member.repId}${currentSearch(["tab"])}`} className="block truncate font-medium text-white hover:text-blue-200" data-testid={`organization-member-${member.repId}`}>{member.displayName}</Link>
                      ) : (
                        <p className="truncate font-medium text-white">{member.displayName}</p>
                      )}
                      <p className="truncate text-xs text-white/40">{member.phone ? formatPhone(member.phone) : member.email || t("noContact")}</p>
                    </div>
                    <Pill tone="slate" className="gap-1">
                      {member.membershipRole === "admin" && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}{member.membershipRole === "admin" ? t("roleRepAdmin") : t("roleRep")}
                    </Pill>
                    <Pill tone={suspended || personBlocked ? "red" : "green"}>{personBlocked ? t("memberBlocked") : suspended ? t("memberSuspended") : t("memberActive")}</Pill>
                    {personBlocked && platformManager && (
                      <Link href={`/admin/reps/${member.repId}`} className="text-xs font-medium text-blue-300 hover:text-blue-200" data-testid={`member-unblock-${member.repId}`}>{t("unblockInPeople")}</Link>
                    )}
                    {canChange && <MemberMenu label={t("memberActions")} testId={`member-menu-${member.repId}`} items={[
                      { key: member.blockedAt ? "reactivate" : "suspend", label: member.blockedAt ? t("reactivate") : t("suspend"), hint: member.blockedAt ? undefined : t("suspendHint"), onSelect: () => setPending({ member, kind: member.blockedAt ? "reactivate" : "suspend" }) },
                      ...(platformManager ? [{ key: "role", label: member.membershipRole === "admin" ? t("makeRep") : t("makeRepAdmin"), onSelect: () => setPending({ member, kind: member.membershipRole === "admin" ? "makeRep" as const : "makeAdmin" as const }) }] : []),
                      { key: "remove", label: t("remove"), hint: t("removeHint"), danger: true, onSelect: () => setPending({ member, kind: "remove" }) },
                    ]} />}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}
        {tab === "inventory" && (
          <RecordList query={inventory} empty={t("noPieces")} rowHref={(row) => (platformManager ? `/admin/tags/pieces/${row.id}` : `${managementReach(me) ? "/admin/work" : ""}/tags/pieces/${encodeURIComponent(row.publicCode)}`)}
            seeAll={platformManager ? { href: `/admin/tags/pieces?org=${organizationId}`, label: t("seeAllIn", { screen: ts("managePieces") }), testId: "organization-inventory-all" } : undefined}
            summary={(rows) => <p className="text-sm text-white/60" data-testid="organization-inventory-summary">{statusSummary(rows, statusLabel)}</p>}
            render={(row) => <><span className="font-mono text-sm text-white">{row.publicCode}</span><span className="flex items-center gap-2 text-xs text-white/45"><TagModelChips productType={String(row.productType ?? "")} face={row.face} batchCode={row.batchCode} /><PieceStatusPill piece={row} /></span></>} />
        )}
        {tab === "kits" && (
          <RecordList query={kits} empty={t("noKits")} rowHref={(row) => (platformManager ? `/admin/tags/kits?view=kits&org=${organizationId}${row.repId ? `&kitRep=${row.repId}` : ""}` : `${managementReach(me) ? "/admin/work" : ""}/tags/pieces`)}
            seeAll={platformManager ? { href: `/admin/tags/kits?view=kits&org=${organizationId}`, label: t("seeAllIn", { screen: ts("manageKits") }), testId: "organization-kits-all" } : undefined}
            render={(row) => <><span className="text-sm text-white"><span className="font-mono">{kitCode(row.kitNumber)}</span><span className="text-white/45"> · {t.plural("kitPieces", row.pieceCount ?? 0)} · {formatDate(row.createdAt)}</span>{row.note ? <span className="text-white/45"> · {row.note}</span> : null}</span><span className="text-xs text-white/45">{repName(row.repId)}</span></>} />
        )}
        {tab === "purchases" && mayManageTeam && <PurchasesList query={purchases} />}
        {tab === "customers" && (
          <RecordList query={customers} empty={t("noCustomers")} rowHref={(row) => `${managementReach(me) ? "/admin/work" : ""}${usesVisits ? `/leads/${row.id}` : `/tags/customers/${row.id}`}`}
            // Companies (Visits) has the organization filter, for platform management in management mode.
            seeAll={platformManager && usesVisits ? { href: `/admin/work/leads?org=${organizationId}`, label: t("seeAllIn", { screen: ts("tabLeads") }), testId: "organization-customers-all" } : undefined}
            render={(row) => <><span className="text-sm font-medium text-white">{row.name}</span><span className="text-xs text-white/45">{lookup(t, `customer_${row.status}`, String(row.status ?? ""))} · {repName(row.ownerRepId)}</span></>} />
        )}
        {tab === "settings" && <OrganizationSettings key={`${org.name}|${org.isActive}|${org.printsOwnPieces}|${org.distribution}|${org.releasedPrintModels?.join(",") ?? "*"}`} organization={org} mayEdit={platformManager} owner={!!me?.user.isAdmin} />}
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

function Overview({ organization, onOpen, activityBase }: { organization: Organization; onOpen: (tab: WorkspaceTab) => void; activityBase: string | null }) {
  const t = useT(organizationsMessages);
  const cards: Array<[string, number, WorkspaceTab]> = [
    [t("cardMembers"), organization.counts?.members ?? 0, "team"],
    [t("cardInventory"), organization.counts?.pieces ?? 0, "inventory"],
    [t("cardKits"), organization.counts?.kits ?? 0, "kits"],
    [t("cardCustomers"), organization.counts?.customers ?? 0, "customers"],
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(([label, value, tab]) => (
          <button key={tab} type="button" onClick={() => onOpen(tab)} className="relative rounded-2xl text-left transition-colors hover:bg-white/[0.03]">
            <Stat card label={label} value={value} />
            <ChevronRight className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-white/30" aria-hidden="true" />
          </button>
        ))}
      </div>
      {activityBase ? <TeamActivity base={activityBase} /> : null}
    </div>
  );
}

/** The team's visits and sales over the last 30 days (GET /organizations/:id/activity), the platform's Overview for one organization. */
function TeamActivity({ base }: { base: string }) {
  const t = useT(organizationsMessages);
  const tw = useT(peopleWorkspaceMessages);
  // Fixed per mount, so the query key stays put.
  const since = useMemo(() => teamPeriodSince("30").toISOString(), []);
  const query = useQuery<TeamActivityResponse>({ queryKey: [`${base}/activity?since=${encodeURIComponent(since)}`] });
  if (query.isLoading) return <ListSkeleton rows={1} className="grid grid-cols-2 gap-3 xl:grid-cols-4" rowClassName="h-20 rounded-2xl" />;
  if (query.isError || !query.data) return <ErrorState message={t("activityFailed")} onRetry={() => void query.refetch()} />;
  const m = query.data.metrics;
  return (
    <section className="space-y-2" aria-label={t("activityTitle")} data-testid="organization-activity">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{t("activityTitle")}</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat card label={t("activityVisits")} value={m.visits} detail={tw("kpiVisitsDetail")} />
        <Stat card label={t("activityFinished")} value={m.finishedVisits} detail={tw("kpiFinishedDetail")} />
        <Stat card label={t("activitySales")} value={m.salesCount} />
        <Stat card label={t("activityRevenue")} value={formatMoney(m.salesTotalCents, m.currency)} tone={m.salesTotalCents > 0 ? "money" : undefined} />
      </div>
    </section>
  );
}

/** What the team bought, newest first. Read only: the payment is Stuscle's and the owner does not approve. */
function PurchasesList({ query }: { query: { data?: Purchase[]; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown } }) {
  const t = useT(organizationsMessages);
  if (query.isLoading) return <ListSkeleton rows={3} />;
  if (query.isError) return <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />;
  const rows = query.data ?? [];
  if (!rows.length) return <EmptyState compact icon={ShoppingBag} title={t("noPurchases")} />;
  const tone = (status: string) => (status === "fulfilled" ? "green" : "slate");
  return (
    <div className="space-y-2">
      <p className="text-xs text-white/45">{t("purchasesHint")}</p>
      <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`} data-testid="organization-purchases">
        {rows.map(({ acquisition, repName, lines }) => (
          <div key={acquisition.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3" data-testid={`organization-purchase-${acquisition.id}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{repName ?? "-"}</p>
              <p className="text-xs text-white/45">{lines.map((line) => (line.productName ? t("purchaseLine", { count: line.quantity, name: line.productName }) : t.plural("purchaseNoName", line.quantity))).join(", ")}</p>
            </div>
            <span className="text-xs tabular-nums text-white/45">{formatMoney(lines.reduce((sum, line) => sum + line.subtotalCents, 0), acquisition.currency)} · {formatDate(acquisition.purchasedAt)}</span>
            <Pill tone={tone(acquisition.status)}>{lookup(t, `purchaseStatus_${acquisition.status}`, acquisition.status)}</Pill>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A phone's first screen: each section of the organization as a row with its count, opening its own screen. */
function SectionList({ organization, tabs, onOpen }: {
  organization: Organization;
  tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof Users }>;
  onOpen: (tab: WorkspaceTab) => void;
}) {
  const counts: Partial<Record<WorkspaceTab, number>> = {
    team: organization.counts?.members ?? organization.memberCount,
    inventory: organization.counts?.pieces,
    kits: organization.counts?.kits,
    customers: organization.counts?.customers,
  };
  return (
    <nav aria-label={organization.name} className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_CLASS}`} data-testid="organization-sections">
      {tabs.filter((item) => item.id !== "overview").map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/[0.06]"
          data-testid={`organization-open-${id}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">{label}</span>
          {counts[id] != null && <span className="shrink-0 text-sm tabular-nums text-white/45">{counts[id]}</span>}
          <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
        </button>
      ))}
    </nav>
  );
}

/**
 * The organization's records, by name, each opening on its own screen. `seeAll` (platform management) links to the
 * full list filtered to this organization, with its search, filters and actions.
 */
const RECORDS_SHOWN = 10;

function RecordList({ query, empty, render, rowHref, seeAll, summary }: {
  query: { data?: any[]; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  empty: string;
  render: (row: any) => ReactNode;
  rowHref: (row: any) => string;
  seeAll?: { href: string; label: string; testId?: string };
  /** A line above the list: what it holds, counted (Stock by status). */
  summary?: (rows: any[]) => ReactNode;
}) {
  const tw = useT(peopleWorkspaceMessages);
  const t = useT(organizationsMessages);
  const [showAll, setShowAll] = useState(false);
  const link = seeAll ? (
    <div className="flex justify-end">
      <Link href={seeAll.href} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-blue-300 hover:text-blue-200" data-testid={seeAll.testId}>
        {seeAll.label}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  ) : null;
  if (query.isLoading) return <ListSkeleton rows={3} />;
  if (query.isError) return <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />;
  const rows = query.data ?? [];
  if (!rows.length) return <div className="space-y-2">{link}<EmptyState compact icon={Package} title={empty} /></div>;
  const visible = showAll ? rows : rows.slice(0, RECORDS_SHOWN);
  return (
    <div className="space-y-2">
      {link}
      {summary ? summary(rows) : null}
      <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`}>
        {visible.map((row) => (
          <Link key={row.id} href={rowHref(row)} className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] focus-visible:!-outline-offset-2">
            <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">{render(row)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/25" aria-label={tw("openRow")} />
          </Link>
        ))}
      </div>
      {rows.length > visible.length ? <Button type="button" variant="ghost" className="w-full" onClick={() => setShowAll(true)} data-testid="records-see-all">{t("seeAllRows", { count: rows.length })}</Button> : null}
    </div>
  );
}
