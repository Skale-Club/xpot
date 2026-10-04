import { useRef, useState } from "react";
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
import type { FullSalesLead, GooglePlaceResult } from "./types";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { checkinMessages } from "@/i18n/messages/checkin";

const GLASS = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
} as const;


function parseCsvText(text: string) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return {
      name: row["name"] || row["business_name"] || row["company"] || "",
      phone: row["phone"] || row["phone_number"] || "",
      email: row["email"] || "",
      website: row["website"] || row["url"] || "",
      industry: row["industry"] || row["type"] || row["category"] || "",
      addressLine1: row["address"] || row["address_line_1"] || row["street"] || "",
      city: row["city"] || "",
      state: row["state"] || "",
      postalCode: row["postal_code"] || row["zip"] || row["zip_code"] || "",
    };
  }).filter((r) => r.name.length > 0);
}

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

// ─── Lead Card ────────────────────────────────────────────────────────────────

/** "2 pieces · 1 live · 14 scans in 30 days", opening the customer's pieces in Tags. */
function LeadPiecesChip({ lead, summary, onOpen }: { lead: FullSalesLead; summary: LeadTagSummary; onOpen: () => void }) {
  const t = useT(leadsMessages);
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpen(); } }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-400/20"
      data-testid={`lead-${lead.id}-pieces`}
    >
      <Nfc className="h-3 w-3 shrink-0" />
      <span>
        {[t.plural("piecesCount", summary.pieces), t("piecesLive", { n: summary.live }), t("piecesScans", { n: summary.scansLast30 })].join(" · ")}
      </span>
    </span>
  );
}

function LeadCard({
  lead, onEdit, onDelete, onCheckIn, onSell, onSyncGhl, onPromote, isSyncing, isProspect, pieces, onOpenPieces,
}: {
  lead: FullSalesLead;
  pieces?: LeadTagSummary;
  onOpenPieces?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCheckIn: () => void;
  onSell: () => void;
  onSyncGhl?: () => void;
  onPromote?: () => void;
  isSyncing?: boolean;
  isProspect?: boolean;
}) {
  const t = useT(leadsMessages);
  return (
    <button
      type="button"
      className="group w-full rounded-2xl p-4 text-left transition-all"
      style={{ ...GLASS, boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
      onClick={onEdit}
    >
      <LeadCardBody
        lead={lead}
        subtitle={pieces && onOpenPieces ? <LeadPiecesChip lead={lead} summary={pieces} onOpen={onOpenPieces} /> : undefined}
        right={
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {isProspect && onPromote && (
              <button
                type="button"
                title={t("promote")}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-purple-500/20 hover:text-purple-400"
                onClick={(e) => { e.stopPropagation(); onPromote(); }}
              >
                <UserCheck className="h-3.5 w-3.5" />
              </button>
            )}
            {isProspect && onSyncGhl && (
              <button
                type="button"
                title={t("sendGhl")}
                disabled={isSyncing}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-emerald-500/20 hover:text-emerald-400 disabled:opacity-40"
                onClick={(e) => { e.stopPropagation(); onSyncGhl(); }}
              >
                {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              type="button"
              title={t("salesAndConsignment")}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-emerald-500/20 hover:text-emerald-400"
              onClick={(e) => { e.stopPropagation(); onSell(); }}
            >
              <DollarSign className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={t("checkIn")}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-blue-500/20 hover:text-blue-400"
              onClick={(e) => { e.stopPropagation(); onCheckIn(); }}
            >
              <LogIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={t("delete")}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-red-500/20 hover:text-red-400"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function XpotLeads() {
  const t = useT(leadsMessages);
  const { setLocation } = useXpotQueries();
  const [tab, setTab] = useState<"leads" | "prospects">("leads");
  // Selling from the company card, outside any visit — the second entry point.
  const [salesLead, setSalesLead] = useState<FullSalesLead | null>(null);
  const [leadPendingDelete, setLeadPendingDelete] = useState<FullSalesLead | null>(null);
  const [editLead, setEditLead] = useState<FullSalesLead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
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

  const displayList = tab === "prospects"
    ? prospects.filter((l) => !leadLookupSearch || l.name.toLowerCase().includes(leadLookupSearch.toLowerCase()))
    : filteredLeadsForList.filter((l) => l.status !== "prospect");

  const handleDeleteLead = async () => {
    if (!leadPendingDelete) return;
    try {
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
    if (!file) return;
    const rows = parseCsvText(await file.text());
    if (rows.length === 0) return;
    await importCsvMutation.mutateAsync(rows);
    e.target.value = "";
  };

  const TABS = [
    { id: "leads" as const, label: t("tabLeads"), count: leads.length },
    { id: "prospects" as const, label: t("tabProspects"), count: prospects.length },
  ];

  return (
    <>
      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {TABS.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="relative flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
            style={tab === id
              ? { background: "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.3))", color: "white" }
              : { color: "rgba(255,255,255,0.35)" }
            }
          >
            {label}
            {count > 0 && (
              <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(255,255,255,0.1)" }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + actions */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={leadLookupSearch}
            onChange={(e) => setLeadLookupSearch(e.target.value)}
            placeholder={tab === "prospects" ? t("searchProspects") : t("searchLeads")}
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
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/60 transition-all hover:opacity-80 disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              {importCsvMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
          </>
        )}

        {/* Add button — both tabs */}
        <button
          onClick={() => setAddOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-all hover:opacity-80"
          style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Empty state for prospects */}
      {tab === "prospects" && prospects.length === 0 && !leadLookupSearch && (
        <div className="flex flex-col items-center gap-3 rounded-2xl py-10 text-center" style={GLASS}>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(99,102,241,0.15)" }}>
            <Upload className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-white/60">{t("noProspects")}</div>
            <div className="mt-0.5 text-xs text-white/30">{t("noProspectsHint")}</div>
          </div>
          <div className="flex gap-2 mt-1">
            <button onClick={() => setAddOpen(true)} className="rounded-xl px-4 py-2 text-xs font-semibold text-white hover:opacity-80" style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}>
              {t("addProspect")}
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="rounded-xl px-4 py-2 text-xs font-semibold text-white/60 hover:text-white/80 transition-colors" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}>
              {t("importCsv")}
            </button>
          </div>
        </div>
      )}

      {/* Lead list */}
      <div className="space-y-2">
        {/* Leads tab — no leads yet */}
        {tab === "leads" && leads.length === 0 && !leadLookupSearch && (
          <div className="flex flex-col items-center gap-3 rounded-2xl py-10 text-center" style={GLASS}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(99,102,241,0.15)" }}>
              <Building2 className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-white/60">{t("noLeads")}</div>
              <div className="mt-0.5 text-xs text-white/30">{t("noLeadsHint")}</div>
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white hover:opacity-80"
              style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
            >
              {t("addLead")}
            </button>
          </div>
        )}
        {/* Search returned nothing */}
        {displayList.length === 0 && leadLookupSearch && (
          <div className="flex flex-col items-center gap-3 rounded-2xl py-10 text-center" style={GLASS}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(99,102,241,0.15)" }}>
              <Search className="h-5 w-5 text-indigo-400" />
            </div>
            <div className="text-sm font-medium text-white/60">{t("noResults", { query: leadLookupSearch })}</div>
          </div>
        )}
        {displayList.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            isProspect={tab === "prospects"}
            isSyncing={syncingId === lead.id}
            onEdit={() => setEditLead(lead)}
            onDelete={() => setLeadPendingDelete(lead)}
            onCheckIn={() => setLocation(`/check-in?leadId=${lead.id}`)}
            onSell={() => setSalesLead(lead)}
            onSyncGhl={() => handleSyncGhl(lead)}
            onPromote={() => handlePromote(lead)}
            pieces={piecesFor(lead.id)}
            onOpenPieces={() => setLocation(`/tags/pieces?lead=${lead.id}&name=${encodeURIComponent(lead.name)}`)}
          />
        ))}
      </div>

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

      {editLead && (
        <EditLeadDialog
          lead={editLead}
          open={Boolean(editLead)}
          onOpenChange={(v) => { if (!v) setEditLead(null); }}
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
              {t(tab === "prospects" ? "deleteProspectTitle" : "deleteLeadTitle")}
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
