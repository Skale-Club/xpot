import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, CheckCircle2, LayoutDashboard, Users } from "lucide-react";
import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { shellMessages } from "@/i18n/messages/shell";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { EmptyState } from "@/components/xpot/EmptyState";
import { ADMIN_TAGS_KEY, STALE_MS, getJson } from "./tags/api";
import { useTagOverview } from "./tags/OverviewTab";
import { usePrintRequests } from "./tags/production-shared";
import { Loading } from "./tags/pieces-shared";
import { todayRows, type TodayRow } from "./home-model";

/** Pending Stuscle wholesale orders: the same cache KitsTab fills ([ADMIN_TAGS_KEY, "acquisitions"]). */
function usePendingOrders() {
  return useQuery<Array<{ acquisition: { status: string } }>>({
    queryKey: [ADMIN_TAGS_KEY, "acquisitions"],
    queryFn: () => getJson("/api/xpot/admin/tag-acquisitions"),
    staleTime: STALE_MS,
  });
}

type Today = { rows: TodayRow[]; loading: boolean };

/** Super admin: print plates, wholesale orders and every Tags queue (the print and order endpoints are theirs alone). */
function useSuperToday(): Today {
  const overview = useTagOverview();
  const requests = usePrintRequests("open");
  const orders = usePendingOrders();
  return {
    loading: overview.isLoading || requests.isLoading || orders.isLoading,
    rows: todayRows({ isSuperAdmin: true, requests: requests.data, queues: overview.data?.queues, pendingOrders: orders.data?.filter((item) => item.acquisition.status === "pending").length }),
  };
}

/** A manager: only the Tags queues they can open. A viewer without Tags access gets a 403 there, which is just no rows. */
function useManagerToday(): Today {
  const overview = useTagOverview();
  return { loading: overview.isLoading, rows: todayRows({ isSuperAdmin: false, queues: overview.data?.queues }) };
}

/** "Today": what waits for the owner, one row per thing with a count and the list behind it. Rows at zero are hidden. */
function TodayList({ rows, loading }: Today) {
  const t = useT(workspacesMessages);
  const tf = useT(adminTagsFlowMessages);
  const words = (word: TodayRow["label"]) => (word.dict === "home" ? t(word.key) : tf(word.key));
  if (loading) return <Loading rows={3} />;
  if (!rows.length) return <EmptyState compact dense tone="tags" icon={CheckCircle2} title={t("todayNothing")} hint={t("todayNothingHint")} />;
  return <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]" data-testid="today-list">
    {rows.map((row) => <li key={row.id}>
      <Link href={row.href} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.04]" data-testid={`today-${row.id}`}>
        <span className="w-12 shrink-0 text-right text-2xl font-semibold tabular-nums text-amber-200">{row.count}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-white">{words(row.label)}</span><span className="mt-0.5 block text-xs leading-relaxed text-white/50">{words(row.hint)}</span></span>
        <ArrowRight className="h-4 w-4 shrink-0 text-white/35 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </Link>
    </li>)}
  </ul>;
}

function SuperToday() { return <TodayList {...useSuperToday()} />; }
function ManagerToday() { return <TodayList {...useManagerToday()} />; }

export function AdminHome() {
  const t = useT(workspacesMessages);
  const s = useT(shellMessages);
  const superAdmin = useIsSuperAdmin();
  // A manager's team shortcuts; the super admin reaches everything from the sidebar, so the home is only the list.
  const shortcuts = [
    { href: "/admin/overview", title: s("manageTeam"), icon: LayoutDashboard },
    { href: "/admin/reps", title: s("orgPeople"), icon: Users },
    { href: "/organizations", title: s("navOrganizations"), icon: Building2 },
  ];
  return <div className="space-y-6" data-testid="management-home">
    <header><p className="text-xs font-semibold uppercase tracking-wider text-amber-200/70">{t(superAdmin ? "superAdmin" : "management")}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">{t("todayTitle")}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50">{t("todayIntro")}</p></header>
    {superAdmin ? <SuperToday /> : <ManagerToday />}
    {superAdmin ? null : <section aria-label={t("todayShortcuts")} className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{t("todayShortcuts")}</h2>
      <p className="text-sm text-white/50">{t("teamIntro")}</p>
      <div className="grid gap-2 sm:grid-cols-3">{shortcuts.map(({ href, title, icon: Icon }) => <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.04]">
        <Icon className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{title}</span><ArrowRight className="h-4 w-4 shrink-0 text-white/35 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </Link>)}</div>
    </section>}
  </div>;
}
