import { useCallback, useMemo, useState } from "react";
import { useRoute, useRouter } from "wouter";
import {
  Plus,
  Search,
  Trash2,
  LogIn,
  Building2,
  Navigation,
  Nfc,
  MoreVertical,
  CalendarDays,
  SlidersHorizontal,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadTagSummary } from "@shared/tagsApi";
import { useXpotModules } from "@/components/ModuleSwitch";
import { LeadCardBody, buildRouteUrl } from "./components/LeadCardBody";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { leadMatchesSearch, useLeads } from "./hooks/useLeads";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DollarSign } from "lucide-react";
import { LeadSalesPanel } from "./components/sales/LeadSalesPanel";
import { SheetDialog } from "./components/sales/ui";
import type { EnrichedSalesVisit, FullSalesLead } from "./types";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { BottomSheet } from "@/pages/tags/ui";
import { leadPiecesPath } from "@/pages/tags/lib";
import { useViewerAccess } from "@/lib/adminMode";
import { CheckInAction, LeadRowFacts, LeadsTable, RowAction } from "./components/leads/LeadsTable";
import { LeadDetailPane } from "./components/leads/LeadDetailPane";
import { CreateLeadDialog } from "./components/CreateLeadDialog";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { commonMessages } from "@/i18n/messages/common";
import { backLeavesSection } from "@/lib/inAppHistory";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { EmptyState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { RetryButton } from "@/components/xpot/RetryButton";
import { FilterBar, FilterChips, FilterDay, FilterSearch, FilterSelect, FilterToggle, fromDayKey, toDayKey } from "@/components/xpot/filters";
import { currentSearch, useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { selectLeadForDetail } from "./lead-detail-selection";
import { companyStage, followUpDueTime, isWorkedCompany, needsFollowUp } from "./visitRules";
import { Segmented } from "@/components/xpot/Segmented";
import { leadAccess } from "./leadAccess";
import { EMPTY_LEAD_DELETION, leadDeletionVerdict } from "@shared/leadDeletion";
import { useLeadDeletionText } from "./leadDeletionText";
import { isFinishedVisitStatus } from "@shared/visit-status";


// ─── Lead Card (phone) ────────────────────────────────────────────────────────

/** "2 pieces · 1 live · 14 scans in 30 days", opening the customer's pieces in Tags. */
function LeadPiecesChip({ lead, summary, onOpen }: { lead: FullSalesLead; summary: LeadTagSummary; onOpen: () => void }) {
  const t = useT(leadsMessages);
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpen(); } }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-violet-400/10 px-2 py-0.5 text-[11px] font-semibold text-violet-300 hover:bg-violet-400/20"
      data-testid={`lead-${lead.id}-pieces`}
    >
      <Nfc className="h-3 w-3 shrink-0" />
      <span>
        {[t.plural("piecesCount", summary.pieces), t("piecesLive", { n: summary.live }), t("piecesScans", { n: summary.scansLast30 })].join(" · ")}
      </span>
    </span>
  );
}

function LeadCard({ lead, onOpen, onMore, onSell, pieces, onOpenPieces, lastVisit, worked, followUp, activeVisitLeadId, onCheckIn, onBackToVisit }: {
  lead: FullSalesLead;
  onSell: (lead: FullSalesLead) => void;
  activeVisitLeadId: number | null;
  onCheckIn: (lead: FullSalesLead) => void;
  onBackToVisit: () => void;
  lastVisit: Date | null;
  worked: boolean;
  followUp: boolean;
  pieces?: LeadTagSummary;
  onOpenPieces?: () => void;
  onOpen: () => void;
  /** Opens the action sheet (sell, check in, delete…). */
  onMore: () => void;
}) {
  const t = useT(leadsMessages);
  const routeUrl = buildRouteUrl(lead.locations?.[0]);
  return (
    <div
      role="button"
      tabIndex={0}
      className={`w-full cursor-pointer rounded-2xl p-4 text-left transition-colors hover:bg-white/[0.06] ${GLASS_CLASS}`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
    >
      <LeadCardBody
        lead={lead}
        compact
        subtitle={
          <div className="space-y-1.5">
            <LeadRowFacts lead={lead} lastVisit={lastVisit} worked={worked} followUp={followUp} />
            {pieces && onOpenPieces ? <LeadPiecesChip lead={lead} summary={pieces} onOpen={onOpenPieces} /> : null}
          </div>
        }
        right={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={t("moreActions")}
            aria-label={t("moreActions")}
            className="text-white/45"
            onClick={(e) => { e.stopPropagation(); onMore(); }}
            data-testid={`lead-${lead.id}-more`}
          >
            <MoreVertical aria-hidden="true" />
          </Button>
        }
      />
      {/* What the rep does on the street: go there, then start the visit. */}
      <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3" onClick={(e) => e.stopPropagation()}>
        <RowAction title={t("salesAndConsignment")} onClick={() => onSell(lead)} className="border border-white/10 text-emerald-300 hover:text-emerald-200">
          <DollarSign aria-hidden="true" />
        </RowAction>
        <CheckInAction lead={lead} activeVisitLeadId={activeVisitLeadId} onCheckIn={onCheckIn} onBackToVisit={onBackToVisit} />
        {routeUrl ? (
          <Button asChild variant="secondary" size="sm">
            <a href={routeUrl} target="_blank" rel="noopener noreferrer"><Navigation aria-hidden="true" />{t("directions")}</a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LeadActionSheet({ lead, onClose, onSell, onCheckIn, onDelete, canDelete, keptBecause }: {
  lead: FullSalesLead | null;
  onClose: () => void;
  onSell: () => void;
  onCheckIn: () => void;
  onDelete: () => void;
  /** Only the owner, a Rep Admin of its organization or a manager may delete it (leadAccess). */
  canDelete: boolean;
  /** Why an owner cannot delete it (a sale, a consignment or a piece keeps it): one quiet sentence instead of the action. */
  keptBecause?: string | null;
}) {
  const t = useT(leadsMessages);
  const items = [
    { key: "checkin", label: t("checkIn"), icon: LogIn, run: onCheckIn, cls: "text-blue-300" },
    { key: "sell", label: t("salesAndConsignment"), icon: DollarSign, run: onSell, cls: "text-emerald-300" },
    ...(canDelete ? [{ key: "delete", label: t("deleteCompany"), icon: Trash2, run: onDelete, cls: "text-red-300" }] : []),
  ];
  return (
    <BottomSheet open={Boolean(lead)} onClose={onClose} title={lead?.name}>
      <div className="space-y-1.5 pb-1">
        {items.map(({ key, label, icon: Icon, run, cls }) => (
          <button
            key={key}
            type="button"
            onClick={() => { onClose(); run(); }}
            className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-semibold text-white/85 active:bg-white/10 ${GLASS_CLASS}`}
            data-testid={`lead-action-${key}`}
          >
            <Icon className={`h-5 w-5 ${cls}`} aria-hidden="true" />
            {label}
          </button>
        ))}
        {keptBecause ? <p className="px-1 pt-2 text-xs text-white/45" data-testid="lead-action-kept">{keptBecause}</p> : null}
      </div>
    </BottomSheet>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// The chips narrow "My companies" and add up inside it. The companies not visited yet are a tab of their own
// (status=prospect in the link), never a chip that counts a different group.
const LEAD_FILTERS = ["all", "followup", "lead", "customer"] as const;
type LeadFilter = (typeof LEAD_FILTERS)[number];
const LEAD_FILTER_LABEL = {
  all: "filterAll",
  followup: "filterFollowUp",
  lead: "filterLeads",
  customer: "filterCustomers",
} as const satisfies Record<LeadFilter, string>;

/**
 * `lead` covers worked prospects too: a check-in makes a company a lead even if its row still says prospect.
 * `lastOutcome` is the status of the company's latest finished visit (for "Follow-up").
 */
function matchesLeadFilter(lead: FullSalesLead, filter: LeadFilter, lastOutcome?: string | null): boolean {
  if (filter === "followup") return needsFollowUp(lead, lastOutcome);
  if (filter === "lead") return ["lead", "prospect"].includes(companyStage(lead.status));
  if (filter === "customer") return companyStage(lead.status) === "customer";
  // "prospect" lists the unvisited prospects, a separate pool (see `prospects` below).
  return true;
}

export function XpotLeads() {
  const t = useT(leadsMessages);
  const tc = useT(commonMessages);
  const deletionText = useLeadDeletionText();
  const { setLocation, me } = useXpotQueries();
  // The panel is for looking at the portfolio, My work is for working it: the first tab is named for that.
  const inPanel = useRouter().base.startsWith("/admin");
  const activeVisitLeadId = me?.activeVisit?.leadId ?? null;
  const checkIn = (lead: FullSalesLead) => setLocation(`/route/check-in?leadId=${lead.id}`);
  const backToVisit = () => setLocation("/route/check-in");
  // A rep who only holds a piece at a company may not delete it (the server refuses).
  // A company with a sale, a consignment or a piece is kept (the server refuses it too): Delete is not offered, the detail says why.
  const canDelete = useCallback((lead: FullSalesLead) => leadAccess(me, lead).owner && leadDeletionVerdict(lead.deletion ?? EMPTY_LEAD_DELETION).canDelete, [me]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  // Management mode: the piece chips count every rep's pieces (getLeadTagSummaries).
  const { canManage, adminMode } = useViewerAccess();
  const [routeMatch, routeParams] = useRoute("/leads/:id");
  const routeId = routeMatch && /^\d+$/.test(routeParams.id) ? Number(routeParams.id) : null;
  // ?status=customer&day=2026-10-12&q=bakery&org=4 — survives reloads and opening a company.
  const filters = useUrlFilters({ status: "all", day: "", q: "", org: "" });
  // One organization's companies: a manager in management mode (the server ignores it for anyone else).
  const organizationId = canManage && /^\d+$/.test(filters.values.org) ? Number(filters.values.org) : undefined;
  const organizationOptions = (me?.organizations ?? [])
    .filter((organization) => !organization.personal || organization.id === organizationId)
    .map((organization) => ({ value: String(organization.id), label: organization.name }));
  const toVisitTab = filters.values.status === "prospect";
  const leadFilter: LeadFilter = (LEAD_FILTERS as readonly string[]).includes(filters.values.status) ? (filters.values.status as LeadFilter) : "all";
  const search = filters.values.q;
  const day = fromDayKey(filters.values.day);
  // Selling from the company card, outside any visit — the second entry point.
  const [salesLead, setSalesLead] = useState<FullSalesLead | null>(null);
  const [leadPendingDelete, setLeadPendingDelete] = useState<FullSalesLead | null>(null);
  const [actionLead, setActionLead] = useState<FullSalesLead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // What was searched when "Add" was tapped, so the new company starts with that name.
  const [addName, setAddName] = useState("");
  const openAdd = (name = "") => { setAddName(name); setAddOpen(true); };

  const { leadsQuery, deleteLeadMutation } = useLeads(routeId === null, organizationId);
  const leadDetailQuery = useQuery<{
    lead: Omit<FullSalesLead, "locations" | "contacts">;
    locations: FullSalesLead["locations"];
    contacts: FullSalesLead["contacts"];
    visits: EnrichedSalesVisit[];
    opportunities: Array<{ status: string }>;
    deletion?: FullSalesLead["deletion"];
  }>({
    queryKey: ["/api/xpot/leads", routeId],
    enabled: routeId !== null,
  });
  const convertToCustomer = useMutation({
    mutationFn: async (leadId: number) => {
      await apiRequest("PATCH", `/api/xpot/leads/${leadId}`, { status: "customer" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      toast({ title: t("promoted"), variant: "success" });
    },
    onError: () => toast({ title: t("promoteFailed"), variant: "destructive" }),
  });

  const allLeads = leadsQuery.data ?? [];
  // Pieces sold to each customer, when this rep sells tags.
  const canSellTags = useXpotModules().includes("tags");
  const { data: piecesByLead } = useQuery<LeadTagSummary[]>({
    queryKey: ["/api/xpot/tags/by-lead"],
    enabled: canSellTags,
    staleTime: 60_000,
  });
  const piecesFor = (leadId: number) => piecesByLead?.find((p) => p.leadId === leadId);

  // Visits are already loaded by the shell; group them per company for the
  // "last visit" column and the pane's recent visits.
  const { data: visits } = useQuery<EnrichedSalesVisit[]>({ queryKey: ["/api/xpot/visits"] });
  const checkedInLeadIds = useMemo(
    () => new Set((visits ?? []).filter((visit) => Boolean(visit.checkedInAt)).map((visit) => visit.leadId)),
    [visits],
  );
  const isWorkedLead = useCallback(
    (lead: FullSalesLead) => isWorkedCompany(lead, checkedInLeadIds),
    [checkedInLeadIds],
  );
  // Legacy prospect rows may already have completed visits. A real check-in is
  // authoritative: the company belongs in the worked-leads portfolio even if
  // an older record was never promoted from `prospect` in the database.
  const leads = allLeads.filter(isWorkedLead);
  // Businesses saved (e.g. picked on the Dashboard) but never checked in stay out
  // of the default view; the Prospects chip is where they can be found.
  const prospects = allLeads.filter((lead) => !isWorkedLead(lead));
  const pool = toVisitTab ? prospects : leads;
  const visitsByLead = useMemo(() => {
    const map = new Map<number, EnrichedSalesVisit[]>();
    for (const v of visits ?? []) {
      if (!map.has(v.leadId)) map.set(v.leadId, []);
      map.get(v.leadId)!.push(v);
    }
    const at = (v: EnrichedSalesVisit) => new Date(v.checkedInAt ?? v.createdAt ?? 0).getTime();
    map.forEach((list) => list.sort((a, b) => at(b) - at(a)));
    return map;
  }, [visits]);
  const lastOutcomeFor = useCallback(
    (leadId: number) => visitsByLead.get(leadId)?.find((visit) => isFinishedVisitStatus(visit.status))?.status ?? null,
    [visitsByLead],
  );
  // The company's own last visit (anyone's) when it has one: the visits loaded here may be only the viewer's.
  const lastVisitAtOf = useMemo(() => new Map(allLeads.map((lead) => [lead.id, lead.lastVisitAt] as const)), [allLeads]);
  const lastVisitFor = useCallback((leadId: number) => {
    const v = visitsByLead.get(leadId)?.[0];
    const when = lastVisitAtOf.get(leadId) ?? v?.checkedInAt ?? v?.createdAt;
    return when ? new Date(when) : null;
  }, [visitsByLead, lastVisitAtOf]);

  const selectedLead = routeId !== null && leadDetailQuery.data
    ? {
        ...leadDetailQuery.data.lead,
        locations: leadDetailQuery.data.locations,
        contacts: leadDetailQuery.data.contacts,
        deletion: leadDetailQuery.data.deletion,
        openOpportunities: leadDetailQuery.data.opportunities.filter((opportunity) => opportunity.status === "open").length,
      } as FullSalesLead
    : selectLeadForDetail(allLeads, routeId);

  const isFollowUp = useCallback((lead: FullSalesLead) => needsFollowUp(lead, lastOutcomeFor(lead.id)), [lastOutcomeFor]);

  // Companies visited (checked in) on the chosen day.
  const visitedOnDay = useMemo(() => {
    if (!day) return null;
    const key = toDayKey(day);
    return new Set(
      (visits ?? [])
        .filter((visit) => visit.checkedInAt && toDayKey(new Date(visit.checkedInAt)) === key)
        .map((visit) => visit.leadId),
    );
  }, [day, visits]);

  // Search and day narrow first; the status chips count what is left.
  const narrow = useCallback(
    (list: FullSalesLead[]) => list.filter((lead) => leadMatchesSearch(lead, search) && (!visitedOnDay || visitedOnDay.has(lead.id))),
    [search, visitedOnDay],
  );
  const baseList = useMemo(() => narrow(pool), [narrow, pool]);
  const displayList = useMemo(() => {
    const filtered = toVisitTab ? baseList : baseList.filter((lead) => matchesLeadFilter(lead, leadFilter, lastOutcomeFor(lead.id)));
    return [...filtered].sort((a, b) => {
      const aDue = followUpDueTime(a);
      const bDue = followUpDueTime(b);
      if (aDue !== bDue) return aDue - bDue;
      const aVisited = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
      const bVisited = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
      if (aVisited !== bVisited) return bVisited - aVisited;
      return a.name.localeCompare(b.name);
    });
  }, [baseList, leadFilter, toVisitTab, lastOutcomeFor]);

  // Big portfolios render 50 at a time; a new filter starts from the top.
  const pagedLeads = usePagedList(displayList, { resetKey: `${toVisitTab}|${leadFilter}|${search}|${filters.values.day}` });

  const countsByDay = useMemo(() => {
    const relevantIds = new Set(leads.map((lead) => lead.id));
    const idsByDay = new Map<string, Set<number>>();
    for (const visit of visits ?? []) {
      if (!visit.checkedInAt || !relevantIds.has(visit.leadId)) continue;
      const key = toDayKey(new Date(visit.checkedInAt));
      if (!idsByDay.has(key)) idsByDay.set(key, new Set());
      idsByDay.get(key)!.add(visit.leadId);
    }
    return new Map(Array.from(idsByDay, ([key, ids]) => [key, ids.size]));
  }, [leads, visits]);

  // Moving between companies and closing replace history; only the first open
  // pushes. The query string rides along so the filters stay put.
  const openLead = (lead: FullSalesLead) => setLocation(`/leads/${lead.id}${currentSearch()}`, { replace: routeId != null });
  // A company opened from the Route, a task or a visit goes back there; else to the list.
  const backOut = routeId != null && backLeavesSection("/leads");
  const closeLead = useCallback(() => {
    if (backLeavesSection("/leads")) window.history.back();
    else setLocation(`/leads${currentSearch()}`, { replace: true });
  }, [setLocation]);

  // Stays open with the loader until the server answers (ConfirmDialog); a failure keeps it open.
  const handleDeleteLead = async () => {
    if (!leadPendingDelete) return;
    // Close the detail first: once the list refetches without it, the page
    // would flash "not found".
    if (leadPendingDelete.id === routeId) closeLead();
    await deleteLeadMutation.mutateAsync(leadPendingDelete.id);
  };

  const worked = narrow(leads);
  const filterChips = LEAD_FILTERS.map((id) => ({
    id,
    label: t(LEAD_FILTER_LABEL[id]),
    count: worked.filter((lead) => matchesLeadFilter(lead, id, lastOutcomeFor(lead.id))).length,
  }));
  const companyTabs = [
    // "My companies" is the owner's organizations; this tab is the saved companies: the person's own, or in the panel everyone's in scope.
    { id: "mine", label: t(adminMode ? "tabAllCompanies" : "tabMine"), count: worked.length },
    { id: "tovisit", label: t("tabProspects"), count: narrow(prospects).length },
  ];
  const nothingSaved = !leadsQuery.isLoading && !leadsQuery.isError && allLeads.length === 0;

  const filterBar = (
    <FilterBar
      testId="leads-filters"
      search={<FilterSearch value={search} onChange={(q) => filters.set({ q })} placeholder={t("searchLeads")} />}
      controls={
        <>
          {canManage && organizationOptions.length > 0 ? (
            <FilterSelect
              value={organizationId ? String(organizationId) : ""}
              onChange={(org) => filters.set({ org: org || null })}
              placeholder={t("filterAllOrganizations")}
              options={organizationOptions}
              icon={Building2}
              testId="leads-filter-organization"
            />
          ) : null}
          <FilterToggle
            pressed={Boolean(day)}
            onChange={(on) => filters.set({ day: on ? toDayKey(new Date()) : null })}
            label={t("filterDate")}
            icon={CalendarDays}
            testId="leads-filter-day"
          />
        </>
      }
      actions={
        <Button
          type="button"
          variant="brand"
          onClick={() => openAdd()}
          title={t("newLead")}
          aria-label={t("newLead")}
          data-shortcut="new"
          className="w-11 shrink-0 px-0 lg:w-auto lg:px-4"
        >
          <Plus aria-hidden="true" />
          <span className="hidden lg:inline">{t("newLead")}</span>
        </Button>
      }
      secondary={
        <div className="space-y-2.5">
          {day ? (
            <FilterDay
              value={day}
              onChange={(next) => filters.set({ day: toDayKey(next) })}
              counts={countsByDay}
              detail={t.plural("companyCount", displayList.length)}
            />
          ) : null}
          <Segmented
            ariaLabel={t("tabLeads")}
            className="w-full lg:max-w-md"
            itemClassName="min-h-10 px-1"
            value={toVisitTab ? "tovisit" : "mine"}
            onChange={(tab) => filters.set({ status: tab === "tovisit" ? "prospect" : null })}
            items={companyTabs}
          />
          {toVisitTab ? null : <FilterChips items={filterChips} value={leadFilter} onChange={(status) => filters.set({ status })} ariaLabel={t("filterByStatus")} />}
        </div>
      }
      summary={{ shown: displayList.length, total: pool.length, active: filters.activeCount() > 0, onClear: () => filters.reset() }}
    />
  );

  // Loading and failure come before any "nothing here" message, which used to
  // show "No companies yet" (with its Add button) while the list was loading.
  const emptyStates = leadsQuery.isLoading ? (
    <ListSkeleton rows={5} testId="leads-loading" />
  ) : leadsQuery.isError ? (
    <EmptyState tone="red" icon={Building2} title={t("loadFailed")} hint={(leadsQuery.error as Error).message}>
      <RetryButton onRetry={() => void leadsQuery.refetch()} busy={leadsQuery.isFetching} />
    </EmptyState>
  ) : toVisitTab && prospects.length === 0 ? (
    <EmptyState icon={Building2} title={t("noProspects")} hint={t("noProspectsHint")} />
  ) : leads.length === 0 && !search && !toVisitTab ? (
    <EmptyState icon={Building2} title={t("noLeads")} hint={t("noLeadsHint")}>
      <Button type="button" variant="brand" size="sm" onClick={() => openAdd()}>
        <Plus aria-hidden="true" /> {t("addLead")}
      </Button>
    </EmptyState>
  ) : displayList.length > 0 ? null : search ? (
    <EmptyState icon={Search} title={t("noResults", { query: search })} hint={t("checkSpelling")}>
      <Button type="button" variant="brand" size="sm" onClick={() => openAdd(search)}>
        <Plus aria-hidden="true" /> {t("addNamed", { query: search })}
      </Button>
    </EmptyState>
  ) : day ? (
    <EmptyState icon={CalendarDays} title={t("noCompaniesOnDate")} hint={t("chooseAnotherDate")} />
  ) : (
    <EmptyState icon={SlidersHorizontal} title={t("noLeadsInFilter")} hint={t("chooseAnotherFilter")} />
  );

  return (
    <>
      {routeId != null ? (
        selectedLead ? (
          <LeadDetailPane
            key={selectedLead.id}
            lead={selectedLead}
            pieces={piecesFor(selectedLead.id)}
            visits={visitsByLead.get(selectedLead.id) ?? []}
            onClose={closeLead}
            backLabel={backOut ? tc("back") : undefined}
            onDelete={() => setLeadPendingDelete(selectedLead)}
            onConvertToCustomer={() => convertToCustomer.mutate(selectedLead.id)}
            converting={convertToCustomer.isPending}
          />
        ) : leadDetailQuery.isLoading ? (
          <ListSkeleton rows={3} rowClassName="h-28 rounded-2xl" testId="lead-detail-loading" />
        ) : (
          <EmptyState icon={Building2} title={t("leadNotFound")} />
        )
      ) : (
        <>
          {nothingSaved ? null : filterBar}
          {isDesktop ? (
            <>
              {emptyStates}
              {displayList.length > 0 && (
                <LeadsTable
                  leads={pagedLeads.visible}
                  selectedId={null}
                  onSelect={openLead}
                  piecesFor={piecesFor}
                  lastVisitFor={lastVisitFor}
                  worked={!toVisitTab}
                  isFollowUp={isFollowUp}
                  onSell={setSalesLead}
                  onCheckIn={checkIn}
                  activeVisitLeadId={activeVisitLeadId}
                  onBackToVisit={backToVisit}
                  onDelete={setLeadPendingDelete}
                  canDelete={canDelete}
                />
              )}
              <ListPager shown={pagedLeads.shown} total={pagedLeads.total} hasMore={pagedLeads.hasMore} onMore={pagedLeads.showMore} />
            </>
          ) : (
            <div className="space-y-2">
              {emptyStates}
              {pagedLeads.visible.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onOpen={() => openLead(lead)}
                  onMore={() => setActionLead(lead)}
                  onSell={setSalesLead}
                  activeVisitLeadId={activeVisitLeadId}
                  onCheckIn={checkIn}
                  onBackToVisit={backToVisit}
                  lastVisit={lastVisitFor(lead.id)}
                  worked={!toVisitTab}
                  followUp={isFollowUp(lead)}
                  pieces={piecesFor(lead.id)}
                  onOpenPieces={() => setLocation(`${canManage ? "~" : ""}${leadPiecesPath(lead.id, lead.name, canManage)}`)}
                />
              ))}
              <ListPager shown={pagedLeads.shown} total={pagedLeads.total} hasMore={pagedLeads.hasMore} onMore={pagedLeads.showMore} />
            </div>
          )}
        </>
      )}

      <LeadActionSheet
        lead={actionLead}
        onClose={() => setActionLead(null)}
        onSell={() => actionLead && setSalesLead(actionLead)}
        onCheckIn={() => actionLead && setLocation(`/route/check-in?leadId=${actionLead.id}`)}
        onDelete={() => actionLead && setLeadPendingDelete(actionLead)}
        canDelete={actionLead ? canDelete(actionLead) : false}
        keptBecause={actionLead && leadAccess(me, actionLead).owner ? deletionText.blocked(actionLead.deletion) : null}
      />

      {/* Sales & consignment for one company, with no visit attached. */}
      <SheetDialog
        open={Boolean(salesLead)}
        onOpenChange={(o) => { if (!o) setSalesLead(null); }}
        title={salesLead?.name ?? t("salesAndConsignment")}
      >
        {salesLead && <LeadSalesPanel leadId={salesLead.id} leadName={salesLead.name} lead={salesLead} compact />}
      </SheetDialog>

      {/* The same "New company" dialog as check-in and the Dashboard (Google
          autofill with coordinates, phone mask); created here as a lead, the
          status this list shows. */}
      <CreateLeadDialog open={addOpen} onOpenChange={setAddOpen} initialName={addName} status="lead" />

      <ConfirmDialog
        open={Boolean(leadPendingDelete)}
        onOpenChange={(open) => { if (!open) setLeadPendingDelete(null); }}
        tone="danger"
        title={t("deleteLeadTitle")}
        description={leadPendingDelete ? deletionText.confirm(leadPendingDelete.name, leadPendingDelete.deletion) : t("deleteGeneric")}
        confirmLabel={t("delete")}
        cancelLabel={t("keep")}
        onConfirm={handleDeleteLead}
      />
    </>
  );
}
