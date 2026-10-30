import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, DollarSign, ListTodo, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { Link, useSearchParams } from "wouter";
import { AppLayout } from "@/components/xpot/AppLayout";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { PageHeader } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { useViewerAccess } from "@/lib/adminMode";
import { describeApiError } from "@/lib/apiErrors";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";
import { useT } from "@/i18n";
import { organizationsMessages } from "@/i18n/messages/organizations";
import { shellMessages } from "@/i18n/messages/shell";
import { StatusBadge } from "./components/VisitStatus";
import { LeadStatePill } from "./components/leads/LeadStatePill";
import type { SaleWithItems } from "./hooks/useSalesModule";
import { salesPath } from "./salesPath";
import type { EnrichedSalesVisit, FullSalesLead, SalesTask } from "./types";

// Organizations › an organization › Team › one person: what they work on, in
// four lists (companies, visits, tasks, sales), picked from four count tiles,
// each row opening the record.
// The lists come from the usual endpoints with ?repId=; the server keeps a Rep
// Admin to the organizations they run (server/routes/xpot/middleware.ts
// listScope, visitsInOrganizations) and a manager sees anyone. Organization
// URLs use the management scope without changing the user's personal application.

type Member = {
  repId: number;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  platformRole: "rep" | "manager" | "admin";
  membershipRole: "admin" | "member";
};

const VIEWS = ["companies", "visits", "tasks", "sales"] as const;
type PersonView = (typeof VIEWS)[number];

const OPEN_TASK_STATUSES = "pending,in_progress";

export function OrganizationPerson({ organizationId, repId }: { organizationId: number; repId: number }) {
  const t = useT(organizationsMessages);
  const ts = useT(shellMessages);
  const access = useViewerAccess();
  const [params, setParams] = useSearchParams();
  const view: PersonView = VIEWS.find((id) => id === params.get("view")) ?? "companies";
  const setView = (next: PersonView) =>
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === "companies") updated.delete("view");
      else updated.set("view", next);
      return updated;
    }, { replace: true });

  // The management frame identifies whose workspace is open.
  const ready = access.adminMode;

  const base = `/api/xpot/organizations/${organizationId}`;
  const members = useQuery<Member[]>({ queryKey: [`${base}/members`], enabled: ready });
  const organization = useQuery<{ name: string }>({ queryKey: [base], enabled: ready });
  const person = members.data?.find((member) => member.repId === repId);
  const listsOn = ready && !!person;
  const companies = useQuery<FullSalesLead[]>({ queryKey: [`/api/xpot/leads?repId=${repId}&limit=200`], enabled: listsOn });
  const visits = useQuery<EnrichedSalesVisit[]>({ queryKey: [`/api/xpot/visits?repId=${repId}`], enabled: listsOn });
  const tasks = useQuery<SalesTask[]>({ queryKey: [`/api/xpot/tasks?repId=${repId}&status=${OPEN_TASK_STATUSES}`], enabled: listsOn });
  const sales = useQuery<SaleWithItems[]>({ queryKey: [`/api/xpot/sales?repId=${repId}&limit=100`], enabled: listsOn });

  const back = `/organizations/${organizationId}?tab=team`;
  const header = (description?: ReactNode, actions?: ReactNode) => (
    <PageHeader
      backHref={back}
      backLabel={organization.data?.name ?? t("backToList")}
      eyebrow={organization.data?.name}
      title={person?.displayName ?? t("tabTeam")}
      description={description}
      actions={actions}
      className="mb-0"
    />
  );

  if (!access.reach) {
    return (
      <AppLayout title={t("title")}>
        <EmptyState icon={UserRound} title={t("personNotAllowed")} />
      </AppLayout>
    );
  }
  if (!ready || members.isLoading) {
    return <AppLayout title={t("title")}><ListSkeleton rows={4} /></AppLayout>;
  }
  if (members.isError || !person) {
    return (
      <AppLayout title={t("title")}>
        <div className="space-y-5">
          {header()}
          {members.isError ? (
            <ErrorState message={describeApiError(members.error)} onRetry={() => void members.refetch()} />
          ) : (
            <EmptyState icon={UserRound} title={t("personNotMember")} />
          )}
        </div>
      </AppLayout>
    );
  }

  const platformManager = access.hasAdminAccess;
  const contact = person.phone ? formatPhone(person.phone) : person.email || t("noContact");
  const count = (rows: unknown[] | undefined) => (rows ? rows.length : undefined);
  const tabs = [
    { id: "companies" as const, label: ts("tabLeads"), icon: Building2, badge: count(companies.data) },
    { id: "visits" as const, label: ts("tabVisits"), icon: MapPin, badge: count(visits.data) },
    { id: "tasks" as const, label: ts("tabTasks"), icon: ListTodo, badge: count(tasks.data) },
    { id: "sales" as const, label: ts("tabSales"), icon: DollarSign, badge: count(sales.data) },
  ];

  return (
    <AppLayout title={person.displayName} size="wide">
      <div className="space-y-5" data-testid="organization-person">
        {header(
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{contact}</span>
            <Pill tone="slate" className="gap-1">
              {person.membershipRole === "admin" && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
              {person.membershipRole === "admin" ? t("roleRepAdmin") : t("roleRep")}
            </Pill>
          </span>,
          platformManager ? (
            <Link href={`/admin/reps/${repId}`} className="text-sm font-semibold text-blue-300 hover:text-blue-200" data-testid="organization-person-people">
              {t("openInPeople")}
            </Link>
          ) : undefined,
        )}

        {/* Four tiles, two by two on a phone: the counts at a glance and the list switch, with nothing to swipe sideways. */}
        <div role="group" aria-label={person.displayName} className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="organization-person-views">
          {tabs.map(({ id, label, icon: Icon, badge }) => {
            const on = id === view;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={on}
                className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                  on ? "border-blue-400/40 bg-blue-500/15" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
                data-testid={`organization-person-view-${id}`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${on ? "text-blue-300" : "text-white/45"}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xl font-bold leading-none tabular-nums text-white">{badge ?? "–"}</span>
                  <span className={`mt-1 block truncate text-xs font-medium ${on ? "text-blue-200" : "text-white/55"}`}>{label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {view === "companies" && (
          <PersonList
            query={companies}
            empty={t("personNoCompanies")}
            icon={Building2}
            rows={(companies.data ?? []).map((lead) => ({
              key: lead.id,
              href: `/admin/work/leads/${lead.id}`,
              title: lead.name,
              detail: lead.lastVisitAt ? t("lastVisit", { date: formatDate(lead.lastVisitAt) }) : t("neverVisited"),
              trailing: <LeadStatePill status={lead.status} />,
            }))}
          />
        )}
        {view === "visits" && (
          <PersonList
            query={visits}
            empty={t("personNoVisits")}
            icon={MapPin}
            rows={(visits.data ?? []).map((visit) => ({
              key: visit.id,
              href: `/admin/work/leads/${visit.leadId}`,
              title: visit.lead?.name ?? "—",
              detail: formatDate(visit.checkedInAt ?? visit.scheduledAt ?? visit.createdAt),
              trailing: <StatusBadge status={visit.status} />,
            }))}
          />
        )}
        {view === "tasks" && (
          <PersonList
            query={tasks}
            empty={t("personNoTasks")}
            icon={ListTodo}
            rows={(tasks.data ?? []).map((task) => {
              const overdue = !!task.dueAt && new Date(task.dueAt).getTime() < Date.now();
              return {
                key: task.id,
                href: task.leadId ? `/admin/work/leads/${task.leadId}` : undefined,
                title: task.title,
                detail: task.dueAt ? <span className={overdue ? "text-red-300" : undefined}>{formatDate(task.dueAt)}</span> : t("noDueDate"),
              };
            })}
          />
        )}
        {view === "sales" && (
          <PersonList
            query={sales}
            empty={t("personNoSales")}
            icon={DollarSign}
            rows={(sales.data ?? []).map(({ sale, lead }) => ({
              key: sale.id,
              href: `/admin/work${salesPath("sales", sale.id)}`,
              title: lead?.name ?? "—",
              detail: formatDate(sale.soldAt),
              trailing: <span className="text-sm font-semibold tabular-nums text-white">{formatMoney(sale.totalCents)}</span>,
            }))}
          />
        )}
      </div>
    </AppLayout>
  );
}

type Row = { key: number; href?: string; title: string; detail: ReactNode; trailing?: ReactNode };

function PersonList({ query, rows, empty, icon }: {
  query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  rows: Row[];
  empty: string;
  icon: typeof Building2;
}) {
  if (query.isLoading) return <ListSkeleton rows={4} />;
  if (query.isError) return <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />;
  if (!rows.length) return <EmptyState compact icon={icon} title={empty} />;
  return (
    <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`}>
      {rows.map((row) => {
        const body = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{row.title}</span>
              <span className="block truncate text-xs text-white/45">{row.detail}</span>
            </span>
            {row.trailing}
            {row.href && <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />}
          </>
        );
        return row.href ? (
          <Link key={row.key} href={row.href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]">
            {body}
          </Link>
        ) : (
          <div key={row.key} className="flex min-h-14 items-center gap-3 px-4 py-3">{body}</div>
        );
      })}
    </div>
  );
}
