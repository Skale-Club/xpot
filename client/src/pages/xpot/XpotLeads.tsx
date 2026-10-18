import { useCallback, useMemo, useState } from "react";
import { useRoute } from "wouter";
import {
  Plus,
  Search,
  Trash2,
  LogIn,
  Building2,
  Nfc,
  MoreVertical,
  CalendarDays,
  SlidersHorizontal,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadTagSummary } from "@shared/tagsApi";
import { useXpotModules } from "@/components/ModuleSwitch";
import { LeadCardBody } from "./components/LeadCardBody";
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
import { LeadRowFacts, LeadsTable } from "./components/leads/LeadsTable";
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
import { FilterBar, FilterChips, FilterDay, FilterSearch, FilterToggle, fromDayKey, toDayKey } from "@/components/xpot/filters";
import { currentSearch, useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { selectLeadForDetail } from "./lead-detail-selection";
import { followUpDueTime, isWorkedCompany, needsFollowUp } from "./visitRules";
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

function LeadCard({ lead, onOpen, onMore, pieces, onOpenPieces, lastVisit }: {
  lead: FullSalesLead;
  lastVisit: Date | null;
  pieces?: LeadTagSummary;
  onOpenPieces?: () => void;
  onOpen: () => void;
  /** Opens the action sheet (sell, check in, delete…). */
  onMore: () => void;
}) {
  const t = useT(leadsMessages);
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
        subtitle={
          <div className="space-y-1.5">
            <LeadRowFacts lead={lead} lastVisit={lastVisit} />
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
    </div>
  );
}

function LeadActionSheet({ lead, onClose, onSell, onCheckIn, onDelete }: {
  lead: FullSalesLead | null;
  onClose: () => void;
  onSell: () => void;
  onCheckIn: () => void;
  onDelete: () => void;
}) {
  const t = useT(leadsMessages);
  const items = [
    { key: "sell", label: t("salesAndConsignment"), icon: DollarSign, run: onSell, cls: "text-emerald-300" },
    { key: "checkin", label: t("checkIn"), icon: LogIn, run: onCheckIn, cls: "text-blue-300" },
    { key: "delete", label: t("delete"), icon: Trash2, run: onDelete, cls: "text-red-300" },
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
      </div>
    </BottomSheet>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const LEAD_FILTERS = ["all", "followup", "lead", "customer", "prospect"] as const;
type LeadFilter = (typeof LEAD_FILTERS)[number];
const LEAD_FILTER_LABEL = {
  all: "filterAll",
  followup: "filterFollowUp",
  lead: "filterLeads",
  customer: "filterCustomers",
  prospect: "tabProspects",
} as const satisfies Record<LeadFilter, string>;

/**
 * `lead` covers worked prospects too: a check-in makes a company a lead even if its row still says prospect.
 * `lastOutcome` is the status of the company's latest finished visit (for "Follow-up").
 */
function matchesLeadFilter(lead: FullSalesLead, filter: LeadFilter, lastOutcome?: string | null): boolean {
  if (filter === "followup") return needsFollowUp(lead, lastOutcome);
  if (filter === "lead") return ["lead", "active", "prospect"].includes(lead.status);
  if (filter === "customer") return lead.status === "customer";
  // "prospect" lists the unvisited prospects, a separate pool (see `prospects` below).
  return true;
}

export function XpotLeads() {
  const t = useT(leadsMessages);
  const tc = useT(commonMessages);
  const { setLocation } = useXpotQueries();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  // Management mode: the piece chips count every rep's pieces (getLeadTagSummaries).
  const { canManage } = useViewerAccess();
  const [routeMatch, routeParams] = useRoute("/leads/:id");
  const routeId = routeMatch && /^\d+$/.test(routeParams.id) ? Number(routeParams.id) : null;
  // ?status=customer&day=2026-10-12&q=bakery — survives reloads and opening a company.
  const filters = useUrlFilters({ status: "all", day: "", q: "" });
  const leadFilter: LeadFilter = (LEAD_FILTERS as readonly string[]).includes(filters.values.status) ? (filters.values.status as LeadFilter) : "all";
  const search = filters.values.q;
  const day = fromDayKey(filters.values.day);
  // Selling from the company card, outside any visit — the second entry point.
  const [salesLead, setSalesLead] = useState<FullSalesLead | null>(null);
  const [leadPendingDelete, setLeadPendingDelete] = useState<FullSalesLead | null>(null);
  const [actionLead, setActionLead] = useState<FullSalesLead | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { leadsQuery, deleteLeadMutation } = useLeads(routeId === null);
  const leadDetailQuery = useQuery<{
    lead: Omit<FullSalesLead, "locations" | "contacts">;
    locations: FullSalesLead["locations"];
    contacts: FullSalesLead["contacts"];
    visits: EnrichedSalesVisit[];
    opportunities: Array<{ status: string }>;
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
  const pool = leadFilter === "prospect" ? prospects : leads;
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
  const lastVisitFor = useCallback((leadId: number) => {
    const v = visitsByLead.get(leadId)?.[0];
    const when = v?.checkedInAt ?? v?.createdAt;
    return when ? new Date(when) : null;
  }, [visitsByLead]);

  const selectedLead = routeId !== null && leadDetailQuery.data
    ? {
        ...leadDetailQuery.data.lead,
        locations: leadDetailQuery.data.locations,
        contacts: leadDetailQuery.data.contacts,
        openOpportunities: leadDetailQuery.data.opportunities.filter((opportunity) => opportunity.status === "open").length,
      } as FullSalesLead
    : selectLeadForDetail(allLeads, routeId);

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
    const filtered = baseList.filter((lead) => matchesLeadFilter(lead, leadFilter, lastOutcomeFor(lead.id)));
    return [...filtered].sort((a, b) => {
      const aDue = followUpDueTime(a);
      const bDue = followUpDueTime(b);
      if (aDue !== bDue) return aDue - bDue;
      const aVisited = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
      const bVisited = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
      if (aVisited !== bVisited) return bVisited - aVisited;
      return a.name.localeCompare(b.name);
    });
  }, [baseList, leadFilter, lastOutcomeFor]);

  // Big portfolios render 50 at a time; a new filter starts from the top.
  const pagedLeads = usePagedList(displayList, { resetKey: `${leadFilter}|${search}|${filters.values.day}` });

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
    count: id === "prospect"
      ? narrow(prospects).length
      : worked.filter((lead) => matchesLeadFilter(lead, id, lastOutcomeFor(lead.id))).length,
  }));

  const filterBar = (
    <FilterBar
      testId="leads-filters"
      search={<FilterSearch value={search} onChange={(q) => filters.set({ q })} placeholder={t("searchLeads")} />}
      controls={
        <FilterToggle
          pressed={Boolean(day)}
          onChange={(on) => filters.set({ day: on ? toDayKey(new Date()) : null })}
          label={t("filterDate")}
          icon={CalendarDays}
          testId="leads-filter-day"
        />
      }
      actions={
        <Button
          type="button"
          variant="brand"
          onClick={() => setAddOpen(true)}
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
          <FilterChips items={filterChips} value={leadFilter} onChange={(status) => filters.set({ status })} ariaLabel={t("filterByStatus")} />
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
  ) : leadFilter === "prospect" && prospects.length === 0 ? (
    <EmptyState icon={Building2} title={t("noProspects")} hint={t("noProspectsHint")} />
  ) : leads.length === 0 && !search && leadFilter !== "prospect" ? (
    <EmptyState icon={Building2} title={t("noLeads")} hint={t("noLeadsHint")}>
      <Button type="button" variant="brand" size="sm" onClick={() => setAddOpen(true)}>
        <Plus aria-hidden="true" /> {t("addLead")}
      </Button>
    </EmptyState>
  ) : displayList.length > 0 ? null : search ? (
    <EmptyState icon={Search} title={t("noResults", { query: search })} hint={t("chooseAnotherFilter")} />
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
          {filterBar}
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
                  onSell={setSalesLead}
                  onCheckIn={(lead) => setLocation(`/route/check-in?leadId=${lead.id}`)}
                  onDelete={setLeadPendingDelete}
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
                  lastVisit={lastVisitFor(lead.id)}
                  pieces={piecesFor(lead.id)}
                  onOpenPieces={() => setLocation(leadPiecesPath(lead.id, lead.name, canManage))}
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
      />

      {/* Sales & consignment for one company, with no visit attached. */}
      <SheetDialog
        open={Boolean(salesLead)}
        onOpenChange={(o) => { if (!o) setSalesLead(null); }}
        title={salesLead?.name ?? t("salesAndConsignment")}
      >
        {salesLead && <LeadSalesPanel leadId={salesLead.id} leadName={salesLead.name} compact />}
      </SheetDialog>

      {/* The same "New company" dialog as check-in and the Dashboard (Google
          autofill with coordinates, phone mask); created here as a lead, the
          status this list shows. */}
      <CreateLeadDialog open={addOpen} onOpenChange={setAddOpen} initialName="" status="lead" />

      <ConfirmDialog
        open={Boolean(leadPendingDelete)}
        onOpenChange={(open) => { if (!open) setLeadPendingDelete(null); }}
        tone="danger"
        title={t("deleteLeadTitle")}
        description={leadPendingDelete ? t("deleteNamed", { name: leadPendingDelete.name }) : t("deleteGeneric")}
        confirmLabel={t("delete")}
        cancelLabel={t("keep")}
        onConfirm={handleDeleteLead}
      />
    </>
  );
}
