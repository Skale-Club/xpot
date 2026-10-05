import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import {
  Plus,
  Search,
  Trash2,
  LogIn,
  Upload,
  Send,
  FileUp,
  X,
  UserCheck,
  MapPinned,
  Building2,
  Nfc,
  MoreVertical,
  MousePointerClick,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { LeadTagSummary } from "@shared/tagsApi";
import { useXpotModules } from "@/components/ModuleSwitch";
import { EditLeadDialog } from "./components/EditLeadDialog";
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
import { useLeads } from "./hooks/useLeads";
import { useToast } from "@/hooks/use-toast";
import { usePlaceSearch } from "./usePlaceSearch";
import { useXpotShared } from "./hooks/useXpotShared";
import { apiRequest } from "@/lib/queryClient";
import { DollarSign } from "lucide-react";
import { LeadSalesPanel } from "./components/sales/LeadSalesPanel";
import { SheetDialog } from "./components/sales/ui";
import { Loader2 } from '@/components/ui/loader';
import { GoogleLogo } from "@/components/ui/google-logo";
import { parseAddress, findMatchingLead } from "./utils";
import type { EnrichedSalesVisit, FullSalesLead, GooglePlaceResult } from "./types";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { BottomSheet } from "@/pages/tags/ui";
import { LeadsTable } from "./components/leads/LeadsTable";
import { LeadDetailPane } from "./components/leads/LeadDetailPane";
import { CsvImportDialog } from "./components/leads/CsvImportDialog";
import { parseCsvText, type CsvLeadRow } from "./csvLeads";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { checkinMessages } from "@/i18n/messages/checkin";
import { BRAND_GRADIENT, GLASS } from "@/components/xpot/surface";
import { Segmented } from "@/components/xpot/Segmented";
import { EmptyState } from "@/components/xpot/EmptyState";


// ─── Shared Add Company Dialog ────────────────────────────────────────────────

type AddStatus = "prospect" | "lead";

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
  status,
  allLeads,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  status: AddStatus;
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
  const isProspect = status === "prospect";

  async function createFromPayload(payload: any) {
    setSaving(true);
    try {
      await apiRequest("POST", "/api/xpot/leads", { ...payload, status, source: payload.source || "manual" });
      await invalidateXpotData();
      toast({ title: t(isProspect ? "prospectAdded" : "leadAdded"), variant: "success" });
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
          <DialogTitle className="text-base font-semibold text-white capitalize">{t(isProspect ? "addProspectTitle" : "addLeadTitle")}</DialogTitle>
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
                        {search.trim().length >= 2 ? t("createNamed", { name: search.trim() }) : t(isProspect ? "addNewProspect" : "addNewLead")}
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
              {(["name", "phone", "email", "website", "industry", "address", "city", "state"] as const).map((key) => (
                <input
                  key={key}
                  value={manualForm[key]}
                  onChange={mf(key)}
                  placeholder={t(MANUAL_FIELD_KEYS[key])}
                  className={inputCls}
                  style={inputStyle}
                />
              ))}
              <button
                disabled={saving || !manualForm.name.trim()}
                onClick={saveManual}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40 mt-1"
                style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
              >
                {saving ? <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> : null}
                {t(isProspect ? "saveProspect" : "saveLead")}
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

function LeadCard({ lead, onEdit, onMore, pieces, onOpenPieces }: {
  lead: FullSalesLead;
  pieces?: LeadTagSummary;
  onOpenPieces?: () => void;
  onEdit: () => void;
  /** Opens the action sheet (sell, check in, promote, delete…). */
  onMore: () => void;
}) {
  const t = useT(leadsMessages);
  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full cursor-pointer rounded-2xl p-4 text-left transition-all"
      style={{ ...GLASS, boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
      onClick={onEdit}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onEdit(); } }}
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

function LeadActionSheet({ lead, isProspect, onClose, onSell, onCheckIn, onPromote, onSyncGhl, onDelete }: {
  lead: FullSalesLead | null;
  isProspect: boolean;
  onClose: () => void;
  onSell: () => void;
  onCheckIn: () => void;
  onPromote: () => void;
  onSyncGhl: () => void;
  onDelete: () => void;
}) {
  const t = useT(leadsMessages);
  const items = [
    { key: "sell", label: t("salesAndConsignment"), icon: DollarSign, run: onSell, cls: "text-emerald-300" },
    { key: "checkin", label: t("checkIn"), icon: LogIn, run: onCheckIn, cls: "text-blue-300" },
    ...(isProspect
      ? [
          { key: "promote", label: t("promote"), icon: UserCheck, run: onPromote, cls: "text-purple-300" },
          { key: "ghl", label: t("sendGhl"), icon: Send, run: onSyncGhl, cls: "text-emerald-300" },
        ]
      : []),
    { key: "delete", label: t("delete"), icon: Trash2, run: onDelete, cls: "text-red-400" },
  ];
  return (
    <BottomSheet open={Boolean(lead)} onClose={onClose} title={lead?.name}>
      <p className="mb-3 truncate px-1 text-base font-bold text-white">{lead?.name}</p>
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

export function XpotLeads() {
  const t = useT(leadsMessages);
  const { setLocation } = useXpotQueries();
  const isDesktop = useIsDesktop();
  const [routeMatch, routeParams] = useRoute("/leads/:id");
  const routeId = routeMatch ? Number(routeParams.id) : null;
  const [tab, setTab] = useState<"leads" | "prospects">("leads");
  // Selling from the company card, outside any visit — the second entry point.
  const [salesLead, setSalesLead] = useState<FullSalesLead | null>(null);
  const [leadPendingDelete, setLeadPendingDelete] = useState<FullSalesLead | null>(null);
  const [editLead, setEditLead] = useState<FullSalesLead | null>(null);
  const [actionLead, setActionLead] = useState<FullSalesLead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [csvRows, setCsvRows] = useState<CsvLeadRow[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    leadsQuery,
    filteredLeadsForList,
    deleteLeadMutation,
    leadLookupSearch,
    setLeadLookupSearch,
    syncToGhlMutation,
    promoteToLeadMutation,
    importCsvMutation,
  } = useLeads();

  const allLeads = leadsQuery.data ?? [];
  // Pieces sold to each customer, when this rep sells tags.
  const canSellTags = useXpotModules().includes("tags");
  const { data: piecesByLead } = useQuery<LeadTagSummary[]>({
    queryKey: ["/api/xpot/tags/by-lead"],
    enabled: canSellTags,
    staleTime: 60_000,
  });
  const piecesFor = (leadId: number) => piecesByLead?.find((p) => p.leadId === leadId);
  const prospects = allLeads.filter((l) => l.status === "prospect");
  const leads = allLeads.filter((l) => l.status !== "prospect");

  // Visits are already loaded by the shell; group them per company for the
  // "last visit" column and the pane's recent visits.
  const { data: visits } = useQuery<EnrichedSalesVisit[]>({ queryKey: ["/api/xpot/visits"], enabled: isDesktop });
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

  const selectedLead = routeId ? allLeads.find((l) => l.id === routeId) ?? null : null;

  // A link straight to a prospect opens the Prospects tab.
  useEffect(() => {
    if (selectedLead) setTab(selectedLead.status === "prospect" ? "prospects" : "leads");
  }, [selectedLead?.id, selectedLead?.status]);

  const displayList = tab === "prospects"
    ? prospects.filter((l) => !leadLookupSearch || l.name.toLowerCase().includes(leadLookupSearch.toLowerCase()))
    : filteredLeadsForList.filter((l) => l.status !== "prospect");

  // Moving between companies and closing replace history; only the first open pushes.
  const openLead = (lead: FullSalesLead) => setLocation(`/leads/${lead.id}`, { replace: routeId != null });
  const closeLead = useCallback(() => setLocation("/leads", { replace: true }), [setLocation]);

  const handleDeleteLead = async () => {
    if (!leadPendingDelete) return;
    try {
      // Close the pane first: once the list refetches without it, the pane
      // would flash "not found".
      if (leadPendingDelete.id === routeId) closeLead();
      await deleteLeadMutation.mutateAsync(leadPendingDelete.id);
      setLeadPendingDelete(null);
    } catch {}
  };

  const handleSyncGhl = async (lead: FullSalesLead) => {
    setSyncingId(lead.id);
    try { await syncToGhlMutation.mutateAsync(lead.id); }
    finally { setSyncingId(null); }
  };

  const handlePromote = async (lead: FullSalesLead) => {
    await promoteToLeadMutation.mutateAsync(lead.id);
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCsvRows(parseCsvText(await file.text()));
  };

  const confirmCsvImport = async () => {
    if (!csvRows?.length) return;
    try {
      await importCsvMutation.mutateAsync(csvRows);
      setCsvRows(null);
    } catch {
      // The hook shows the error; keep the preview open to retry.
    }
  };

  const TABS = [
    { id: "leads" as const, label: t("tabLeads"), count: leads.length },
    { id: "prospects" as const, label: t("tabProspects"), count: prospects.length },
  ];

  const emptyStates = (
    <>
      {/* Empty state for prospects */}
      {tab === "prospects" && prospects.length === 0 && !leadLookupSearch && (
        <EmptyState icon={Upload} title={t("noProspects")} hint={t("noProspectsHint")} cardStyle={GLASS}>
          <div className="flex gap-2 mt-1">
            <button onClick={() => setAddOpen(true)} className="rounded-xl px-4 py-2 text-xs font-semibold text-white hover:opacity-80" style={{ background: BRAND_GRADIENT }}>
              {t("addProspect")}
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="rounded-xl px-4 py-2 text-xs font-semibold text-white/60 hover:text-white/80 transition-colors" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}>
              {t("importCsv")}
            </button>
          </div>
        </EmptyState>
      )}
      {/* Leads tab — no leads yet */}
      {tab === "leads" && leads.length === 0 && !leadLookupSearch && (
        <EmptyState icon={Building2} title={t("noLeads")} hint={t("noLeadsHint")} cardStyle={GLASS}>
          <button
            onClick={() => setAddOpen(true)}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-white hover:opacity-80"
            style={{ background: BRAND_GRADIENT }}
          >
            {t("addLead")}
          </button>
        </EmptyState>
      )}
      {/* Search returned nothing */}
      {displayList.length === 0 && leadLookupSearch && (
        <EmptyState icon={Search} title={t("noResults", { query: leadLookupSearch })} cardStyle={GLASS} />
      )}
    </>
  );

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {/* Sub-tabs */}
        <Segmented items={TABS} value={tab} onChange={setTab} className="lg:w-80 lg:shrink-0" />

        {/* Search + actions */}
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={leadLookupSearch}
              onChange={(e) => setLeadLookupSearch(e.target.value)}
              placeholder={tab === "prospects" ? t("searchProspects") : t("searchLeads")}
              data-shortcut="search"
              className="w-full h-11 rounded-xl pl-10 pr-4 text-sm text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
            />
          </div>

          {/* CSV import — prospects only */}
          {tab === "prospects" && (
            <>
              <button
                title={t("importCsv")}
                onClick={() => fileInputRef.current?.click()}
                disabled={importCsvMutation.isPending}
                className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white/60 transition-all hover:opacity-80 disabled:opacity-40 lg:w-auto lg:px-4"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}
              >
                {importCsvMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                <span className="hidden lg:inline">{t("importCsv")}</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
            </>
          )}

          {/* Add button — both tabs */}
          <button
            onClick={() => setAddOpen(true)}
            title={t(tab === "prospects" ? "newProspect" : "newLead")}
            data-shortcut="new"
            className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-80 lg:w-auto lg:px-4"
            style={{ background: BRAND_GRADIENT }}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden lg:inline">{t(tab === "prospects" ? "newProspect" : "newLead")}</span>
          </button>
        </div>
      </div>

      {isDesktop ? (
        <MasterDetail
          closeLabel={t("closePane")}
          onClose={closeLead}
          list={
            <>
              {emptyStates}
              {displayList.length > 0 && (
                <LeadsTable
                  leads={displayList}
                  isProspect={tab === "prospects"}
                  selectedId={routeId}
                  onSelect={openLead}
                  piecesFor={piecesFor}
                  lastVisitFor={lastVisitFor}
                  onDelete={setLeadPendingDelete}
                  onPromote={handlePromote}
                  onSyncGhl={handleSyncGhl}
                  syncingId={syncingId}
                />
              )}
            </>
          }
          detail={routeId == null ? null : selectedLead ? (
            <LeadDetailPane
              key={selectedLead.id}
              lead={selectedLead}
              isProspect={selectedLead.status === "prospect"}
              pieces={piecesFor(selectedLead.id)}
              visits={visitsByLead.get(selectedLead.id) ?? []}
              onClose={closeLead}
              onDelete={() => setLeadPendingDelete(selectedLead)}
              onPromote={() => handlePromote(selectedLead)}
              onSyncGhl={() => handleSyncGhl(selectedLead)}
              isSyncing={syncingId === selectedLead.id}
            />
          ) : leadsQuery.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>
          ) : (
            <EmptyState icon={Building2} title={t("leadNotFound")} cardStyle={GLASS} />
          )}
          placeholder={<EmptyState icon={MousePointerClick} title={t("selectLead")} hint={t("selectLeadHint")} cardStyle={GLASS} />}
        />
      ) : (
        <div className="space-y-2">
          {emptyStates}
          {displayList.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onEdit={() => setEditLead(lead)}
              onMore={() => setActionLead(lead)}
              pieces={piecesFor(lead.id)}
              onOpenPieces={() => setLocation(`/tags/pieces?lead=${lead.id}&name=${encodeURIComponent(lead.name)}`)}
            />
          ))}
        </div>
      )}

      <LeadActionSheet
        lead={actionLead}
        isProspect={actionLead?.status === "prospect"}
        onClose={() => setActionLead(null)}
        onSell={() => actionLead && setSalesLead(actionLead)}
        onCheckIn={() => actionLead && setLocation(`/check-in?leadId=${actionLead.id}`)}
        onPromote={() => actionLead && void handlePromote(actionLead)}
        onSyncGhl={() => actionLead && void handleSyncGhl(actionLead)}
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

      {/* Add dialog — shared, status-aware */}
      <AddCompanyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        status={tab === "prospects" ? "prospect" : "lead"}
        allLeads={allLeads}
      />

      <CsvImportDialog
        rows={csvRows}
        onCancel={() => setCsvRows(null)}
        onConfirm={() => void confirmCsvImport()}
        importing={importCsvMutation.isPending}
      />

      {/* Phone: the card opens the edit form; a /leads/:id link does too. */}
      {!isDesktop && (editLead || selectedLead) && (
        <EditLeadDialog
          key={(editLead ?? selectedLead)!.id}
          lead={(editLead ?? selectedLead)!}
          open
          onOpenChange={(v) => { if (!v) { setEditLead(null); if (routeId) closeLead(); } }}
          onSaved={() => setEditLead(null)}
        />
      )}

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
              {t(leadPendingDelete?.status === "prospect" ? "deleteProspectTitle" : "deleteLeadTitle")}
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
