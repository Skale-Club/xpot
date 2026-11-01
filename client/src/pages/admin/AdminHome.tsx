import { Link } from "wouter";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Package, PackageOpen, Users } from "lucide-react";
import { COMPANY_ORGANIZATION_SLUG } from "@shared/organizations";
import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { EmptyState } from "@/components/xpot/EmptyState";
import { usePanelNames } from "@/components/xpot/panelNames";
import { useXpotModules } from "@/components/ModuleSwitch";
import { ownedOrganizationId, ownedOrganizations, profileOfMe } from "@/lib/adminMode";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { ADMIN_TAGS_KEY, STALE_MS, getJson } from "./tags/api";
import { useTagOverview } from "./tags/OverviewTab";
import { usePrintRequests } from "./tags/production-shared";
import { Loading, LoadError } from "./tags/pieces-shared";
import { todayBlocks, todayFailure, type TodayBlock, type TodayRow } from "./home-model";

type Pending = Array<{ acquisition: { status: string } }>;
const pendingOf = (list: Pending | undefined) => list?.filter((item) => item.acquisition.status === "pending").length;

/** Pending Stuscle wholesale orders: the same cache KitsTab fills ([ADMIN_TAGS_KEY, "acquisitions"]). */
function usePendingOrders() {
  return useQuery<Pending>({
    queryKey: [ADMIN_TAGS_KEY, "acquisitions"],
    queryFn: () => getJson("/api/xpot/admin/tag-acquisitions"),
    staleTime: STALE_MS,
  });
}

type Today = { blocks: TodayBlock[]; loading: boolean; error: unknown; retry: () => void };

/** Platform: people to approve and Stuscle orders to separate, then its own company's production and Tags queues. */
function usePlatformToday(me: XpotMeResponse | undefined): Today {
  // The company's numbers, not the whole fleet's: the company is one of the platform's organizations.
  const companyId = me?.organizations?.find((organization) => organization.slug === COMPANY_ORGANIZATION_SLUG)?.id;
  const overview = useTagOverview(companyId);
  const requests = usePrintRequests("all", undefined, companyId);
  const orders = usePendingOrders();
  const people = useQuery<Array<{ access: string }>>({ queryKey: ["/api/xpot/admin/reps"] });
  return {
    loading: overview.isLoading || requests.isLoading || orders.isLoading || people.isLoading,
    blocks: todayBlocks({ profile: "platform", requests: requests.data, queues: overview.data?.queues, pendingOrders: pendingOf(orders.data), pendingPeople: people.data?.filter((person) => person.access === "pending").length }),
    error: overview.error ?? requests.error ?? orders.error ?? people.error,
    retry: () => { void overview.refetch(); void requests.refetch(); void orders.refetch(); void people.refetch(); },
  };
}

/** Partner: production and the Tags queues of their own organization (the server scopes every list to it). */
function usePartnerToday(): Today {
  const overview = useTagOverview();
  const requests = usePrintRequests("all");
  return {
    loading: overview.isLoading || requests.isLoading,
    blocks: todayBlocks({ profile: "partner", requests: requests.data, queues: overview.data?.queues }),
    error: todayFailure(overview.error) ?? requests.error,
    retry: () => { void overview.refetch(); void requests.refetch(); },
  };
}

/** Owner: the team's purchases still to arrive, then the Tags queues of the organization. A 403 on Tags is just no rows. */
function useOwnerToday(me: XpotMeResponse | undefined): Today {
  const overview = useTagOverview();
  const owned = ownedOrganizations(me?.organizations);
  const purchases = useQueries({ queries: owned.map((organization) => ({ queryKey: [`/api/xpot/organizations/${organization.id}/purchases`], staleTime: STALE_MS })) });
  const organizationId = ownedOrganizationId(me);
  const pending = purchases.reduce((sum, query) => sum + (pendingOf(query.data as Pending | undefined) ?? 0), 0);
  return {
    loading: overview.isLoading || purchases.some((query) => query.isLoading),
    blocks: todayBlocks({ profile: "owner", queues: overview.data?.queues, teamPurchases: pending, teamPurchasesHref: organizationId ? `/organizations/${organizationId}?tab=purchases` : "/organizations" }),
    error: todayFailure(overview.error) ?? purchases.find((query) => query.error)?.error,
    retry: () => { void overview.refetch(); purchases.forEach((query) => void query.refetch()); },
  };
}

/** "Today": what waits for the person, one row per thing with a count and the list behind it. Rows at zero are hidden. */
function TodayList({ blocks, loading, error, retry }: Today) {
  const t = useT(workspacesMessages);
  const tf = useT(adminTagsFlowMessages);
  const words = (word: TodayRow["label"]) => (word.dict === "home" ? t(word.key) : tf(word.key));
  if (loading) return <Loading rows={3} />;
  // A list that failed to load is never "Nothing waiting": say so, and keep whatever did load.
  const failure = error ? <LoadError compact what={t("todayWhat")} error={error} onRetry={retry} /> : null;
  if (!blocks.length) return failure ?? <EmptyState compact dense tone="tags" icon={CheckCircle2} title={t("todayNothing")} hint={t("todayNothingHint")} />;
  // Only the platform's home is split in two, each with its heading; one list needs none.
  const headings: Partial<Record<TodayBlock["id"], string>> = { platform: t("panelPlatform"), company: t("panelCompany") };
  return <div className="space-y-5">{failure}{blocks.map((block) => <section key={block.id} className="space-y-2" aria-label={headings[block.id]} data-testid={`today-block-${block.id}`}>
    {headings[block.id] ? <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{headings[block.id]}</h2> : null}
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]" data-testid="today-list">
      {block.rows.map((row) => <li key={row.id}>
        <Link href={row.href} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.04]" data-testid={`today-${row.id}`}>
          <span className="w-12 shrink-0 text-right text-2xl font-semibold tabular-nums text-amber-200">{row.count}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-white">{words(row.label)}</span><span className="mt-0.5 block text-xs leading-relaxed text-white/50">{words(row.hint)}</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/35 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </li>)}
    </ul>
  </section>)}</div>;
}

function PlatformToday({ me }: { me: XpotMeResponse | undefined }) { return <TodayList {...usePlatformToday(me)} />; }
function PartnerToday() { return <TodayList {...usePartnerToday()} />; }
function OwnerToday({ me }: { me: XpotMeResponse | undefined }) { return <TodayList {...useOwnerToday(me)} />; }

export function AdminHome() {
  const t = useT(workspacesMessages);
  const { panelName } = usePanelNames();
  const modules = useXpotModules();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const profile = profileOfMe(me);
  const organizationId = ownedOrganizationId(me);
  // The organization's own shortcuts (an owner's or a partner's); the platform reaches everything from the sidebar, so its home is only the list.
  const shortcuts = [
    { href: organizationId ? `/organizations/${organizationId}?tab=team` : "/organizations", title: t("panelTeam"), icon: Users },
    ...(modules.includes("tags") ? [
      { href: "/admin/tags/pieces", title: t("panelStock"), icon: Package },
      { href: "/admin/tags/kits", title: t("panelKits"), icon: PackageOpen },
    ] : []),
  ];
  return <div className="space-y-6" data-testid="management-home">
    <header><p className="text-xs font-semibold uppercase tracking-wider text-amber-200/70">{panelName(profile)}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">{t("todayTitle")}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50">{t("todayIntro")}</p></header>
    {profile === "platform" ? <PlatformToday me={me} /> : profile === "partner" ? <PartnerToday /> : profile === "owner" ? <OwnerToday me={me} /> : null}
    {profile === "owner" || profile === "partner" ? <section aria-label={t("todayShortcuts")} className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{t("todayShortcuts")}</h2>
      <p className="text-sm text-white/50">{t("teamIntro")}</p>
      <div className="grid gap-2 sm:grid-cols-3">{shortcuts.map(({ href, title, icon: Icon }) => <Link key={title} href={href} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.04]">
        <Icon className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{title}</span><ArrowRight className="h-4 w-4 shrink-0 text-white/35 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </Link>)}</div>
    </section> : null}
  </div>;
}
