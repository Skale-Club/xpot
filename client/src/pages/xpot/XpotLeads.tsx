import { useCallback, useMemo, useState } from "react";
import { useRoute } from "wouter";
import {
  Plus,
  Search,
  Trash2,
  LogIn,
  X,
  MapPinned,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { leadMatchesSearch, useLeads } from "./hooks/useLeads";
import { useToast } from "@/hooks/use-toast";
import { usePlaceSearch } from "./usePlaceSearch";
import { useXpotShared } from "./hooks/useXpotShared";
import { apiRequest } from "@/lib/queryClient";
import { DollarSign } from "lucide-react";
import { LeadSalesPanel } from "./components/sales/LeadSalesPanel";
import { SheetDialog } from "./components/sales/ui";
import { Loader2 } from '@/components/ui/loader';
import { GoogleLogo } from "@/components/ui/google-logo";
import { StateSelect } from "@/components/StateSelect";
import { parseAddress, findMatchingLead } from "./utils";
import type { EnrichedSalesVisit, FullSalesLead, GooglePlaceResult } from "./types";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { BottomSheet } from "@/pages/tags/ui";
import { leadPiecesPath } from "@/pages/tags/lib";
import { useViewerAccess } from "@/lib/adminMode";
import { LeadsTable } from "./components/leads/LeadsTable";
import { LeadDetailPane } from "./components/leads/LeadDetailPane";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { checkinMessages } from "@/i18n/messages/checkin";
import { BRAND_GRADIENT, GLASS } from "@/components/xpot/surface";
import { EmptyState } from "@/components/xpot/EmptyState";
import { FilterBar, FilterChips, FilterDay, FilterSearch, FilterToggle, fromDayKey, toDayKey } from "@/components/xpot/filters";
import { currentSearch, useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { selectLeadForDetail } from "./lead-detail-selection";


// ─── Shared Add Company Dialog ────────────────────────────────────────────────

const MANUAL_FIELD_KEYS = {
  name: "fieldBusinessRequired",
  phone: "fieldPhone",
  email: "fieldEmail",
  website: "fieldWebsite",
  industry: "fieldIndustry",
  address: "fieldAddress",
  city: "fieldCity",
  state: "fieldState",
} as const;

function AddCompanyDialog({
  open,
  onOpenChange,
  allLeads,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allLeads: FullSalesLead[];
}) {
  const { toast } = useToast();
  const t = useT(leadsMessages);
  const tCheckin = useT(checkinMessages);
  const { geoState, loadCurrentLocation, invalidateXpotData } = useXpotShared();
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualForm, setManualForm] = useState<null | {
    name: string; phone: string; email: string; website: string;
    industry: string; address: string; city: string; state: string;
  }>(null);

  const placeQuery = usePlaceSearch(search, open, geoState);

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 focus:outline-none transition-colors";
  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" };
  async function createFromPayload(payload: any) {
    setSaving(true);
    try {
      await apiRequest("POST", "/api/xpot/leads", { ...payload, status: "lead", source: payload.source || "manual" });
      await invalidateXpotData();
      toast({ title: t("leadAdded"), variant: "success" });
      onOpenChange(false);
      setSearch("");
      setManualForm(null);
    } catch (err: any) {
      toast({ title: t("createFailed"), description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function pickPlace(place: GooglePlaceResult) {
    setDropdownOpen(false);
    const parsed = parseAddress(place.address);
    setManualForm({
      name: place.name,
      phone: place.phone || "",
      email: "",
      website: place.website || "",
      industry: place.primaryType || "",
      address: parsed.addressLine1,
      city: parsed.city,
      state: parsed.state,
    });
    setSearch(place.name);
  }

  function openManual() {
    setDropdownOpen(false);
    setManualForm({
      name: search.trim(),
      phone: "", email: "", website: "", industry: "", address: "", city: "", state: "",
    });
  }

  async function saveManual() {
    if (!manualForm || !manualForm.name.trim()) return;
    await createFromPayload({
      name: manualForm.name.trim(),
      phone: manualForm.phone || undefined,
      email: manualForm.email || undefined,
      website: manualForm.website || undefined,
      industry: manualForm.industry || undefined,
      primaryLocation: manualForm.address ? {
        label: "Main",
        addressLine1: manualForm.address,
        city: manualForm.city || undefined,
        state: manualForm.state || undefined,
        isPrimary: true,
      } : undefined,
    });
  }

  const mf = (key: keyof NonNullable<typeof manualForm>) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setManualForm((p) => p ? { ...p, [key]: e.target.value } : p);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSearch(""); setManualForm(null); setDropdownOpen(false); } }}>
      <DialogContent
        className="max-w-sm rounded-2xl border-0 p-0 overflow-visible"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base font-semibold text-white capitalize">{t("addLeadTitle")}</DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Search pill */}
          {!manualForm && (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 z-10" />
              <input
                autoFocus
                value={search}
                onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                placeholder={t("searchBusiness")}
                className={`w-full h-[52px] bg-white pl-10 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none shadow-sm ${dropdownOpen ? "rounded-t-2xl" : "rounded-2xl"}`}
                style={{ border: "1px solid #e2e8f0" }}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="p-1.5 text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors"
                  onClick={async () => { await loadCurrentLocation(); setSearch(tCheckin("nearbyQuery")); setDropdownOpen(true); }}
                >
                  <MapPinned className="h-4 w-4" />
                </button>
              </div>

              {/* Dropdown */}
              {dropdownOpen && (
                <div
                  className="absolute left-0 right-0 top-full z-50 max-h-64 overflow-y-auto rounded-b-2xl"
                  style={{ background: "#fff", border: "1px solid #e2e8f0", borderTop: "none", boxShadow: "0 12px 32px rgba(0,0,0,0.12)" }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {/* Manual create */}
                  <button
                    type="button"
                    onClick={openManual}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(99,102,241,0.1)" }}>
                      <Plus className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {search.trim().length >= 2 ? t("createNamed", { name: search.trim() }) : t("addNewLead")}
                      </div>
                      <div className="text-xs text-slate-500">{t("fillManually")}</div>
                    </div>
                  </button>

                  {/* Google Places loading */}
                  {placeQuery.isFetching && (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500" style={{ borderTop: "1px solid #f1f5f9" }}>
                      <Loader2 className="h-4 w-4 animate-spin" />{t("searchingPlaces")}
                    </div>
                  )}

                  {/* Google Places results */}
                  {placeQuery.data?.results.map((place) => {
                    const existing = findMatchingLead(place, allLeads);
                    return (
                      <button
                        key={place.placeId}
                        type="button"
                        onClick={() => pickPlace(place)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                        style={{ borderTop: "1px solid #f1f5f9" }}
                      >
                        {/* Badge under the icon — beside the text it pushed the
                            name and address into an ellipsis. */}
                        <div className="flex w-14 shrink-0 flex-col items-center gap-1">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50">
                            <Building2 className="h-4 w-4 text-indigo-500" />
                          </div>
                          {existing ? (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600">{t("exists")}</span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                              <GoogleLogo className="h-2.5 w-2.5" />
                              Google
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900 break-words">{place.name}</div>
                          <div className="text-xs text-slate-500 break-words">{place.address}</div>
                        </div>
                      </button>
                    );
                  })}

                  {!placeQuery.isFetching && !placeQuery.data?.results?.length && search.trim().length < 3 && (
                    <div className="px-4 py-3 text-sm text-slate-400">{t("typeMore")}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manual form */}
          {manualForm && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setManualForm(null)}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mb-1"
              >
                {t("backToSearch")}
              </button>
              {(["name", "phone", "email", "website", "industry", "address", "city"] as const).map((key) => (
                <input
                  key={key}
                  value={manualForm[key]}
                  onChange={mf(key)}
                  placeholder={t(MANUAL_FIELD_KEYS[key])}
                  className={inputCls}
                  style={inputStyle}
                />
              ))}
              <StateSelect
                value={manualForm.state}
                onValueChange={(state) => setManualForm((previous) => previous ? { ...previous, state } : previous)}
                placeholder={t("fieldState")}
              />
              <button
                disabled={saving || !manualForm.name.trim()}
                onClick={saveManual}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40 mt-1"
                style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
              >
                {saving ? <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> : null}
                {t("saveLead")}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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

function LeadCard({ lead, onOpen, onMore, pieces, onOpenPieces }: {
  lead: FullSalesLead;
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
      className="w-full cursor-pointer rounded-2xl p-4 text-left transition-all"
      style={{ ...GLASS, boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
    >
      <LeadCardBody
        lead={lead}
        subtitle={pieces && onOpenPieces ? <LeadPiecesChip lead={lead} summary={pieces} onOpen={onOpenPieces} /> : undefined}
        right={
          <button
            type="button"
            title={t("moreActions")}
            aria-label={t("moreActions")}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            onClick={(e) => { e.stopPropagation(); onMore(); }}
            data-testid={`lead-${lead.id}-more`}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
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
    { key: "delete", label: t("delete"), icon: Trash2, run: onDelete, cls: "text-red-400" },
  ];
  return (
    <BottomSheet open={Boolean(lead)} onClose={onClose} title={lead?.name}>
      <div className="space-y-1.5 pb-1">
        {items.map(({ key, label, icon: Icon, run, cls }) => (
          <button
            key={key}
            type="button"
            onClick={() => { onClose(); run(); }}
            className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-semibold text-white/85 active:bg-white/10"
            style={{ background: "rgba(255,255,255,0.04)" }}
            data-testid={`lead-action-${key}`}
          >
            <Icon className={`h-5 w-5 ${cls}`} />
            {label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const LEAD_FILTERS = ["all", "followup", "lead", "customer"] as const;
type LeadFilter = (typeof LEAD_FILTERS)[number];
const LEAD_FILTER_LABEL = {
  all: "filterAll",
  followup: "filterFollowUp",
  lead: "filterLeads",
  customer: "filterCustomers",
} as const satisfies Record<LeadFilter, string>;

/** `lead` covers worked prospects too: a check-in makes a company a lead even if its row still says prospect. */
function matchesLeadFilter(lead: FullSalesLead, filter: LeadFilter): boolean {
  if (filter === "followup") return Boolean(lead.nextVisitDueAt);
  if (filter === "lead") return ["lead", "active", "prospect"].includes(lead.status);
  if (filter === "customer") return lead.status === "customer";
  return true;
}

export function XpotLeads() {
  const t = useT(leadsMessages);
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
    (lead: FullSalesLead) => lead.status !== "prospect" || checkedInLeadIds.has(lead.id),
    [checkedInLeadIds],
  );
  // Legacy prospect rows may already have completed visits. A real check-in is
  // authoritative: the company belongs in the worked-leads portfolio even if
  // an older record was never promoted from `prospect` in the database.
  const leads = allLeads.filter(isWorkedLead);
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
  const baseList = useMemo(
    () => leads.filter((lead) => leadMatchesSearch(lead, search) && (!visitedOnDay || visitedOnDay.has(lead.id))),
    [leads, search, visitedOnDay],
  );
  const displayList = useMemo(() => {
    const filtered = baseList.filter((lead) => matchesLeadFilter(lead, leadFilter));
    return [...filtered].sort((a, b) => {
      const aDue = a.nextVisitDueAt ? new Date(a.nextVisitDueAt).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.nextVisitDueAt ? new Date(b.nextVisitDueAt).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      const aVisited = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
      const bVisited = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
      if (aVisited !== bVisited) return bVisited - aVisited;
      return a.name.localeCompare(b.name);
    });
  }, [baseList, leadFilter]);

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
  const closeLead = useCallback(() => setLocation(`/leads${currentSearch()}`, { replace: true }), [setLocation]);

  const handleDeleteLead = async () => {
    if (!leadPendingDelete) return;
    try {
      // Close the detail first: once the list refetches without it, the page
      // would flash "not found".
      if (leadPendingDelete.id === routeId) closeLead();
      await deleteLeadMutation.mutateAsync(leadPendingDelete.id);
      setLeadPendingDelete(null);
    } catch {}
  };

  const filterChips = LEAD_FILTERS.map((id) => ({
    id,
    label: t(LEAD_FILTER_LABEL[id]),
    count: baseList.filter((lead) => matchesLeadFilter(lead, id)).length,
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
        <button
          onClick={() => setAddOpen(true)}
          title={t("newLead")}
          data-shortcut="new"
          className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-80 lg:w-auto lg:px-4"
          style={{ background: BRAND_GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden lg:inline">{t("newLead")}</span>
        </button>
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
      summary={{ shown: displayList.length, total: leads.length, active: filters.activeCount() > 0, onClear: () => filters.reset() }}
    />
  );

  const emptyStates = leads.length === 0 && !search ? (
    <EmptyState icon={Building2} title={t("noLeads")} hint={t("noLeadsHint")} cardStyle={GLASS}>
      <button
        onClick={() => setAddOpen(true)}
        className="rounded-xl px-4 py-2 text-xs font-semibold text-white hover:opacity-80"
        style={{ background: BRAND_GRADIENT }}
      >
        {t("addLead")}
      </button>
    </EmptyState>
  ) : displayList.length > 0 ? null : search ? (
    <EmptyState icon={Search} title={t("noResults", { query: search })} hint={t("chooseAnotherFilter")} cardStyle={GLASS} />
  ) : day ? (
    <EmptyState icon={CalendarDays} title={t("noCompaniesOnDate")} hint={t("chooseAnotherDate")} cardStyle={GLASS} />
  ) : (
    <EmptyState icon={SlidersHorizontal} title={t("noLeadsInFilter")} hint={t("chooseAnotherFilter")} cardStyle={GLASS} />
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
            onDelete={() => setLeadPendingDelete(selectedLead)}
            onConvertToCustomer={() => convertToCustomer.mutate(selectedLead.id)}
            converting={convertToCustomer.isPending}
          />
        ) : leadDetailQuery.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>
        ) : (
          <EmptyState icon={Building2} title={t("leadNotFound")} cardStyle={GLASS} />
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
        title={salesLead?.name ?? "Sales"}
      >
        {salesLead && <LeadSalesPanel leadId={salesLead.id} leadName={salesLead.name} compact />}
      </SheetDialog>

      {/* Manual creation is reserved for referrals and unplanned encounters. */}
      <AddCompanyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        allLeads={allLeads}
      />

      <AlertDialog
        open={Boolean(leadPendingDelete)}
        onOpenChange={(open) => { if (!open && !deleteLeadMutation.isPending) setLeadPendingDelete(null); }}
      >
        <AlertDialogContent
          className="max-w-xs rounded-2xl border-0 p-6"
          style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-white">
              {t("deleteLeadTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-white/45">
              {leadPendingDelete ? t("deleteNamed", { name: leadPendingDelete.name }) : t("deleteGeneric")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 flex-row gap-2 sm:space-x-0">
            <AlertDialogCancel
              disabled={deleteLeadMutation.isPending}
              className="flex-1 rounded-xl border-0 text-sm font-medium text-white/60 hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              {t("keep")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteLeadMutation.isPending}
              onClick={(e) => { e.preventDefault(); void handleDeleteLead(); }}
              className="flex-1 rounded-xl border-0 text-sm font-medium text-white"
              style={{ background: "rgba(239,68,68,0.85)" }}
            >
              {deleteLeadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
