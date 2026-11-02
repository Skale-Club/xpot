import { useState, useRef, useEffect } from "react";
import { useLocation, useRouter } from "wouter";
import { parseSalesPath, salesPath, type SalesTab } from "./salesPath";
import { currentSearch } from "@/hooks/use-url-filters";
import {
  Check,
  ChevronDown,
  Plus,
  Search,
  Building2,
  TrendingUp,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useXpotShared } from "./hooks/useXpotShared";
import { SheetDialog } from "./components/sales/ui";
import { apiRequest } from "@/lib/queryClient";
import { useLeads } from "./hooks/useLeads";
import { useSales } from "./hooks/useSales";
import { useOpportunitiesQuery } from "./hooks/useOpportunities";
import { useVisits } from "./hooks/useVisits";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { formatCents } from "./utils";
import { SalesOverview } from "./components/sales/SalesOverview";
import { SalesList, ConsignmentsList } from "./components/sales/SalesLists";
import type { EnrichedSalesOpportunity } from "./types";
import { useT } from "@/i18n";
import { salesMessages } from "@/i18n/messages/sales";
import { Button } from "@/components/ui/button";
import { DotsLoader } from "@/components/ui/spinner";
import { FIELD_CONTROL, Input, Select } from "@/components/xpot/Field";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { PageHeader } from "@/components/xpot/PageHeader";
import { RetryButton } from "@/components/xpot/RetryButton";
import { Segmented } from "@/components/xpot/Segmented";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_CLASS, SURFACE_MODAL_CLASS } from "@/components/xpot/surface";

const SYNC_STATUS_KEYS: Record<string, "sync_pending" | "sync_synced" | "sync_failed" | "sync_needs_review"> = {
  pending: "sync_pending",
  synced: "sync_synced",
  failed: "sync_failed",
  needs_review: "sync_needs_review",
};

/** An empty section body: the kit EmptyState without a second card around it. */
const SECTION_EMPTY = { background: "transparent", border: "none" } as const;

function LeadPicker({ leads, value, onChange }: {
  leads: { id: number; name: string; industry?: string | null }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useT(salesMessages);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = leads.find((l) => String(l.id) === value);

  const filtered = leads.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.industry || "").toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${FIELD_CONTROL} flex items-center justify-between py-2 text-left`}
      >
        {selected ? (
          <span className="truncate text-white">{selected.name}</span>
        ) : (
          <span className="text-white/30">{t("chooseLead")}</span>
        )}
        <ChevronDown className={`ml-2 h-4 w-4 shrink-0 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className={`absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.6)] ${SURFACE_MODAL_CLASS}`}>
          <div className="border-b border-white/[0.06] p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" aria-hidden="true" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchLeads")}
                aria-label={t("searchLeads")}
                className="pl-8"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto" role="listbox">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-xs text-white/40">{t("noLeadsFound")}</div>
            )}
            {filtered.map((lead) => (
              <button
                key={lead.id}
                type="button"
                role="option"
                aria-selected={String(lead.id) === value}
                onClick={() => { onChange(String(lead.id)); setOpen(false); setSearch(""); }}
                className="flex min-h-11 w-full items-center gap-3 border-t border-white/[0.04] px-3 py-2.5 text-left transition-colors first:border-t-0 hover:bg-white/[0.04]"
              >
                <Building2 className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{lead.name}</div>
                  {lead.industry && <div className="truncate text-xs text-white/40">{lead.industry}</div>}
                </div>
                {String(lead.id) === value && <Check className="h-3.5 w-3.5 shrink-0 text-blue-300" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface GHLStage { id: string; name: string; }
interface GHLPipeline { id: string; name: string; stages?: GHLStage[]; }

function PipelinePicker({ pipelines, pipelineId, stageId, onPipelineChange, onStageChange }: {
  pipelines: GHLPipeline[];
  pipelineId: string;
  stageId: string;
  onPipelineChange: (id: string) => void;
  onStageChange: (id: string) => void;
}) {
  const t = useT(salesMessages);
  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);
  const stages = selectedPipeline?.stages ?? [];

  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        aria-label={t("pipeline")}
        value={pipelineId}
        onChange={(e) => { onPipelineChange(e.target.value); onStageChange(""); }}
        placeholder={t("pipeline")}
        options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
      />
      <Select
        aria-label={t("stage")}
        value={stageId}
        onChange={(e) => onStageChange(e.target.value)}
        disabled={!pipelineId || stages.length === 0}
        placeholder={t("stage")}
        options={stages.map((s) => ({ value: s.id, label: s.name }))}
      />
    </div>
  );
}

const SALES_TABS: { id: SalesTab; labelKey: "tabOverview" | "tabSales" | "tabStock" | "tabPipeline" }[] = [
  { id: "overview", labelKey: "tabOverview" },
  { id: "sales", labelKey: "tabSales" },
  { id: "consignments", labelKey: "tabStock" },
  { id: "pipeline", labelKey: "tabPipeline" },
];

export function XpotSales() {
  const t = useT(salesMessages);
  const [location, navigate] = useLocation();
  // Inside the management panel the panel already names the screen and carries its switch.
  const inPanel = useRouter().base.startsWith("/admin");
  const { tab, id } = parseSalesPath(location);
  const setTab = (next: SalesTab) => navigate(salesPath(next), { replace: true });
  // Moving between items and closing replace history; only the first open pushes,
  // so Back leaves the screen instead of replaying every row J/K visited.
  const select = (which: SalesTab) => (itemId: number | null) =>
    navigate(`${salesPath(which, itemId)}${currentSearch()}`, { replace: id != null });
  // The Deals tab is for deals: with GoHighLevel off and none saved here it would be an empty tab.
  const { xpotMeQuery } = useXpotQueries();
  const dealsQuery = useOpportunitiesQuery<unknown>();
  const pipelinesQuery = useQuery<{ pipelines: GHLPipeline[]; _reason?: string }>({
    queryKey: ["/api/xpot/opportunities/pipelines"],
    queryFn: async () => (await apiRequest("GET", "/api/xpot/opportunities/pipelines")).json(),
    enabled: xpotMeQuery.isSuccess,
    staleTime: 5 * 60 * 1000,
  });
  const showDeals = tab === "pipeline" || (dealsQuery.data?.length ?? 0) > 0 || (pipelinesQuery.isSuccess && !pipelinesQuery.data?._reason);

  return (
    <div className="min-w-0 space-y-5 lg:space-y-6">
      <div className="space-y-4">
        {inPanel ? null : <PageHeader safeArea={false} className="!mb-0" accent="visits" title={t("pageTitle")} />}
        {/* The view switch of the Sales screen (Segmented, as its doc says). */}
        <Segmented
          ariaLabel={t("pageTitle")}
          className="w-full lg:max-w-2xl"
          itemClassName="min-h-10 px-1"
          value={tab}
          onChange={setTab}
          items={SALES_TABS.filter((item) => item.id !== "pipeline" || showDeals).map((item) => ({ id: item.id, label: t(item.labelKey) }))}
        />
      </div>

      {tab === "overview" && <SalesOverview onGoToConsignments={() => setTab("consignments")} onNewSale={() => navigate(`${salesPath("sales")}?new=1`)} />}
      {tab === "sales" && <SalesList selectedId={id} onSelect={select("sales")} />}
      {tab === "consignments" && <ConsignmentsList selectedId={id} onSelect={select("consignments")} />}
      {tab === "pipeline" && <DealsTab selectedId={id} onSelect={select("pipeline")} pipelines={pipelinesQuery.data?.pipelines ?? []} pipelinesLoading={pipelinesQuery.isLoading} connected={!pipelinesQuery.data?._reason} />}
    </div>
  );
}

const DEAL_STATUSES = ["open", "won", "lost"] as const;

/** One deal opened for editing: its value, stage and whether it was won or lost. */
function DealDialog({ deal, pipelines, onClose }: { deal: EnrichedSalesOpportunity | null; pipelines: GHLPipeline[]; onClose: () => void }) {
  const t = useT(salesMessages);
  const { toast } = useToast();
  const { invalidateXpotData } = useXpotShared();
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string>("open");
  const [pipelineKey, setPipelineKey] = useState("");
  const [stageKey, setStageKey] = useState("");

  useEffect(() => {
    if (!deal) return;
    setTitle(deal.title);
    setValue(deal.value ? String(deal.value) : "");
    setStatus(deal.status === "won" || deal.status === "lost" ? deal.status : "open");
    setPipelineKey(deal.pipelineKey ?? "");
    setStageKey(deal.stageKey ?? "");
  }, [deal?.id]);

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/xpot/opportunities/${deal!.id}`, {
      title: title.trim(),
      value: value.trim() ? Number(value) : 0,
      status,
      ...(pipelineKey ? { pipelineKey, stageKey: stageKey || null } : {}),
    })).json(),
    onSuccess: async () => {
      toast({ title: t("dealSaved"), variant: "success" });
      await invalidateXpotData();
      onClose();
    },
    onError: (error: Error) => toast({ title: t("dealSaveFailed"), description: error.message, variant: "destructive" }),
  });

  const valueOk = !value.trim() || Number.isFinite(Number(value));
  return (
    <SheetDialog open={deal !== null} onOpenChange={(open) => { if (!open) onClose(); }} title={deal?.lead?.name ?? t("deals")}>
      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("oppTitle")} aria-label={t("oppTitle")} />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("oppValue")} aria-label={t("oppValue")} inputMode="decimal" />
        <Select
          aria-label={t("dealStatus")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={DEAL_STATUSES.map((value) => ({ value, label: t(`dealStatus_${value}`) }))}
        />
        {pipelines.length > 0 ? (
          <PipelinePicker pipelines={pipelines} pipelineId={pipelineKey} stageId={stageKey} onPipelineChange={setPipelineKey} onStageChange={setStageKey} />
        ) : null}
        <Button type="button" variant="brand" className="w-full" disabled={!title.trim() || !valueOk} loading={save.isPending} onClick={() => save.mutate()}>
          {t("saveDeal")}
        </Button>
        {!title.trim() ? <p className="text-xs text-white/45">{t("dealNeedsTitle")}</p> : !valueOk ? <p className="text-xs text-white/45">{t("dealNeedsNumber")}</p> : null}
      </div>
    </SheetDialog>
  );
}

// Open deals: what a company might still buy, with its value. They live in Xpot; with GoHighLevel connected
// they also sync there, which is only worth saying when it fails.
function DealsTab({ pipelines, pipelinesLoading, connected, selectedId, onSelect }: {
  pipelines: GHLPipeline[]; pipelinesLoading: boolean; connected: boolean;
  /** The deal in the address (/sales/pipeline/12): its dialog is open. */
  selectedId: number | null; onSelect: (id: number | null) => void;
}) {
  const t = useT(salesMessages);
  const { leadsQuery } = useLeads();
  const { opportunitiesQuery, opportunityForm, setOpportunityForm, createOpportunityMutation } = useSales();
  const [oppExpanded, setOppExpanded] = useState(false);
  // The list opens on what is still to win; won and lost deals are one chip away, with their status on the card.
  const [show, setShow] = useState<(typeof DEAL_STATUSES)[number]>("open");
  const everyDeal = opportunitiesQuery.data ?? [];
  const statusOf = (opp: EnrichedSalesOpportunity) => (opp.status === "won" || opp.status === "lost" ? opp.status : "open");
  const deals = everyDeal.filter((opp) => statusOf(opp) === show);
  const editing = selectedId == null ? null : everyDeal.find((opp) => opp.id === selectedId) ?? null;

  return (
    <div className="grid min-w-0 gap-4">
      <Segmented
        ariaLabel={t("dealStatus")}
        className="w-full lg:max-w-md"
        itemClassName="min-h-10 px-1"
        value={show}
        onChange={setShow}
        items={DEAL_STATUSES.map((status) => ({ id: status, label: t(`dealStatus_${status}`), count: everyDeal.filter((opp) => statusOf(opp) === status).length }))}
      />
      <SectionCard
        title={<span className="flex items-center">{show === "open" ? t("openDeals") : t("deals")}<span className="ml-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] tabular-nums text-white/45">{deals.length}</span></span>}
        icon={TrendingUp}
        bodyClassName="space-y-3 p-4"
        actions={(
          <Button type="button" variant="brand" size="sm" onClick={() => setOppExpanded((v) => !v)} aria-expanded={oppExpanded}>
            <Plus aria-hidden="true" /> {t("newOpp")}
          </Button>
        )}
      >
        {oppExpanded && (
          <div className={`space-y-3 rounded-2xl p-4 ${GLASS_CLASS}`}>
            <LeadPicker
              leads={leadsQuery.data ?? []}
              value={opportunityForm.leadId}
              onChange={(leadId) => setOpportunityForm((prev) => ({ ...prev, leadId }))}
            />
            <Input
              value={opportunityForm.title}
              onChange={(e) => setOpportunityForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={t("oppTitle")}
              aria-label={t("oppTitle")}
            />
            <Input
              value={opportunityForm.value}
              onChange={(e) => setOpportunityForm((prev) => ({ ...prev, value: e.target.value }))}
              placeholder={t("oppValue")}
              aria-label={t("oppValue")}
              inputMode="decimal"
            />
            {pipelinesLoading ? (
              <div className="flex items-center gap-2 text-xs text-white/40">
                <DotsLoader size="xs" tone="muted" />
                {t("loadingPipelines")}
              </div>
            ) : pipelines.length > 0 ? (
              <PipelinePicker
                pipelines={pipelines}
                pipelineId={opportunityForm.pipelineKey}
                stageId={opportunityForm.stageKey}
                onPipelineChange={(pipelineKey) => setOpportunityForm((prev) => ({ ...prev, pipelineKey }))}
                onStageChange={(stageKey) => setOpportunityForm((prev) => ({ ...prev, stageKey }))}
              />
            ) : null}
            {/* The form stays until the server answers, so the loader is seen and a failure keeps what was typed. */}
            <Button
              type="button"
              variant="brand"
              className="w-full"
              disabled={!opportunityForm.leadId || !opportunityForm.title.trim()}
              loading={createOpportunityMutation.isPending}
              onClick={() => createOpportunityMutation.mutate(undefined as any, { onSuccess: () => setOppExpanded(false) })}
            >
              {t("createOpp")}
            </Button>
            {!opportunityForm.leadId ? <p className="text-xs text-white/45">{t("dealNeedsCompany")}</p> : !opportunityForm.title.trim() ? <p className="text-xs text-white/45">{t("dealNeedsTitle")}</p> : null}
          </div>
        )}

        {/* The list; loading and failure come before "No deals yet". */}
        {opportunitiesQuery.isLoading ? (
          <ListSkeleton rows={2} />
        ) : opportunitiesQuery.isError ? (
          <EmptyState compact dense tone="red" icon={TrendingUp} title={t("listLoadFailed")}>
            <RetryButton onRetry={() => void opportunitiesQuery.refetch()} busy={opportunitiesQuery.isFetching} />
          </EmptyState>
        ) : deals.length ? (
          <div className="space-y-2">
            {deals.map((opp: EnrichedSalesOpportunity) => {
              // Stage names only when they can be told in words; the stored keys are internal.
              const pipeline = pipelines.find((p) => p.id === opp.pipelineKey);
              const stageName = pipeline?.stages?.find((s) => s.id === opp.stageKey)?.name;
              const where = [pipeline?.name, stageName].filter(Boolean).join(" · ");
              const syncLabel = connected && SYNC_STATUS_KEYS[opp.syncStatus] && opp.syncStatus !== "synced" ? t(SYNC_STATUS_KEYS[opp.syncStatus]) : null;
              return (
                <button key={opp.id} type="button" onClick={() => onSelect(opp.id)} className={`block w-full rounded-2xl p-4 text-left transition-colors hover:bg-white/[0.06] ${GLASS_CLASS}`} data-testid={`deal-${opp.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{opp.title}</div>
                      <div className="truncate text-xs text-white/45">{opp.lead?.name || t("leadNumber", { id: opp.leadId })}</div>
                      {where ? <div className="mt-1 truncate text-[11px] text-white/40">{where}</div> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      {/* Same money format as every sale: two decimals in the opportunity's currency. Green is for what can still be won. */}
                      <div className={`text-base font-bold tabular-nums ${statusOf(opp) === "open" ? "text-emerald-300" : statusOf(opp) === "won" ? "text-white" : "text-white/35"}`}>{formatCents(Math.round((opp.value || 0) * 100), opp.currency)}</div>
                      {statusOf(opp) === "won" ? <Pill tone="green" className="mt-1">{t("dealStatus_won")}</Pill> : statusOf(opp) === "lost" ? <Pill tone="slate" className="mt-1">{t("dealStatus_lost")}</Pill> : null}
                      {syncLabel ? <div className="mt-0.5 text-[11px] text-amber-300">{syncLabel}</div> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : !oppExpanded ? (
          <EmptyState compact dense icon={TrendingUp} title={everyDeal.length === 0 ? t("noOpps") : t("noDealsOfStatus")} cardStyle={SECTION_EMPTY} />
        ) : null}
      </SectionCard>

      <DealDialog deal={editing} pipelines={pipelines} onClose={() => onSelect(null)} />
    </div>
  );
}
