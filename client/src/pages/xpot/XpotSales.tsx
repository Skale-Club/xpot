import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { parseSalesPath, salesPath, type SalesTab } from "./salesPath";
import { currentSearch } from "@/hooks/use-url-filters";
import {
  Check,
  ClipboardCheck,
  ChevronDown,
  ListTodo,
  Plus,
  Search,
  Building2,
  TrendingUp,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLeads } from "./hooks/useLeads";
import { useSales } from "./hooks/useSales";
import { useVisits } from "./hooks/useVisits";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { formatCents, formatDateTime } from "./utils";
import { SalesOverview } from "./components/sales/SalesOverview";
import { SalesList, ConsignmentsList } from "./components/sales/SalesLists";
import { NewTaskDialog } from "./components/leads/TaskForm";
import type { EnrichedSalesOpportunity } from "./types";
import { useT } from "@/i18n";
import { salesMessages } from "@/i18n/messages/sales";
import { Button } from "@/components/ui/button";
import { DotsLoader } from "@/components/ui/spinner";
import { FIELD_CONTROL, Input, Select } from "@/components/xpot/Field";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { PageHeader } from "@/components/xpot/PageHeader";
import { RetryButton } from "@/components/xpot/RetryButton";
import { Segmented } from "@/components/xpot/Segmented";
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
  const { tab, id } = parseSalesPath(location);
  const setTab = (next: SalesTab) => navigate(salesPath(next), { replace: true });
  // Moving between items and closing replace history; only the first open pushes,
  // so Back leaves the screen instead of replaying every row J/K visited.
  const select = (which: SalesTab) => (itemId: number | null) =>
    navigate(`${salesPath(which, itemId)}${currentSearch()}`, { replace: id != null });

  return (
    <div className="min-w-0 space-y-5 lg:space-y-6">
      <div className="space-y-4">
        <PageHeader
          safeArea={false}
          className="!mb-0"
          accent="visits"
          eyebrow={t("pageEyebrow")}
          title={t("pageTitle")}
          description={t("pageSubtitle")}
        />
        {/* The view switch of the Sales screen (Segmented, as its doc says). */}
        <Segmented
          ariaLabel={t("pageTitle")}
          className="w-full lg:max-w-2xl"
          itemClassName="min-h-10 px-1"
          value={tab}
          onChange={setTab}
          items={SALES_TABS.map((item) => ({ id: item.id, label: t(item.labelKey) }))}
        />
      </div>

      {tab === "overview" && <SalesOverview onGoToConsignments={() => setTab("consignments")} />}
      {tab === "sales" && <SalesList selectedId={id} onSelect={select("sales")} />}
      {tab === "consignments" && <ConsignmentsList selectedId={id} onSelect={select("consignments")} />}
      {tab === "pipeline" && <PipelineTab />}
    </div>
  );
}

// The original CRM pipeline (GoHighLevel opportunities + follow-up tasks),
// moved into its own tab. Unchanged — its fate is a separate decision.
function PipelineTab() {
  const t = useT(salesMessages);
  const { leadsQuery } = useLeads();
  const { xpotMeQuery } = useXpotQueries();
  const { activeVisit } = useVisits();
  const {
    opportunitiesQuery,
    tasksQuery,
    opportunityForm,
    setOpportunityForm,
    createOpportunityMutation,
    updateTaskStatus,
  } = useSales();

  // `_reason` is set when GoHighLevel (legacy) is not set up (opportunities.ts).
  const pipelinesQuery = useQuery<{ pipelines: GHLPipeline[]; _reason?: string }>({
    queryKey: ["/api/xpot/opportunities/pipelines"],
    queryFn: async () => (await apiRequest("GET", "/api/xpot/opportunities/pipelines")).json(),
    enabled: xpotMeQuery.isSuccess,
    staleTime: 5 * 60 * 1000,
  });

  const [oppExpanded, setOppExpanded] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  // The task being marked done, so only its button shows the loader.
  const [completingId, setCompletingId] = useState<number | null>(null);

  const pipelines = pipelinesQuery.data?.pipelines ?? [];
  const ghlOff = Boolean(pipelinesQuery.data?._reason);

  const count = (n: number | undefined) => <span className="ml-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] tabular-nums text-white/45">{n ?? 0}</span>;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
      {ghlOff && (
        <InlineAlert tone="info" title={t("ghlOffTitle")} className="lg:col-span-2">
          <span data-testid="pipeline-ghl-off">{t("ghlOffBody")}</span>
        </InlineAlert>
      )}

      <SectionCard
        title={<span className="flex items-center">{t("opportunities")}{count(opportunitiesQuery.data?.length)}</span>}
        icon={TrendingUp}
        bodyClassName="space-y-3 p-4"
        actions={(
          <Button type="button" variant="ghost" size="icon" onClick={() => setOppExpanded((v) => !v)} aria-label={t("newOpp")} title={t("newOpp")} aria-expanded={oppExpanded} className="text-white/55">
            <Plus aria-hidden="true" />
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
            {pipelinesQuery.isLoading ? (
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
            ) : (
              <div className="px-0.5 text-xs text-white/40">{t("noPipelines")}</div>
            )}
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
          </div>
        )}

        {/* Opportunities list; loading and failure come before "No opportunities yet". */}
        {opportunitiesQuery.isLoading ? (
          <ListSkeleton rows={2} />
        ) : opportunitiesQuery.isError ? (
          <EmptyState compact dense tone="red" icon={TrendingUp} title={t("listLoadFailed")}>
            <RetryButton onRetry={() => void opportunitiesQuery.refetch()} busy={opportunitiesQuery.isFetching} />
          </EmptyState>
        ) : opportunitiesQuery.data?.length ? (
          <div className="space-y-2">
            {opportunitiesQuery.data.map((opp: EnrichedSalesOpportunity) => (
              <div key={opp.id} className={`rounded-2xl p-4 ${GLASS_CLASS}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{opp.title}</div>
                    <div className="truncate text-xs text-white/45">{opp.lead?.name || t("leadNumber", { id: opp.leadId })}</div>
                    {opp.pipelineKey && (
                      <div className="mt-1 truncate text-[11px] text-white/40">
                        {pipelines.find((p) => p.id === opp.pipelineKey)?.name ?? opp.pipelineKey}
                        {opp.stageKey ? ` · ${pipelines.find((p) => p.id === opp.pipelineKey)?.stages?.find((s) => s.id === opp.stageKey)?.name ?? opp.stageKey}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {/* Same money format as every sale: two decimals in the opportunity's currency. */}
                    <div className="text-base font-bold tabular-nums text-emerald-300">{formatCents(Math.round((opp.value || 0) * 100), opp.currency)}</div>
                    <div className="mt-0.5 text-[11px] text-white/40">{SYNC_STATUS_KEYS[opp.syncStatus] ? t(SYNC_STATUS_KEYS[opp.syncStatus]) : opp.syncStatus}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !oppExpanded ? (
          <EmptyState compact dense icon={TrendingUp} title={t("noOpps")} cardStyle={SECTION_EMPTY} />
        ) : null}
      </SectionCard>

      <SectionCard
        title={<span className="flex items-center">{t("followUpTasks")}{count(tasksQuery.data?.length)}</span>}
        icon={ClipboardCheck}
        bodyClassName="space-y-3 p-4"
        actions={(
          <Button type="button" variant="ghost" size="icon" onClick={() => setTaskOpen(true)} aria-label={t("newTask")} title={t("newTask")} className="text-white/55">
            <Plus aria-hidden="true" />
          </Button>
        )}
      >
        {tasksQuery.isLoading ? (
          <ListSkeleton rows={2} />
        ) : tasksQuery.isError ? (
          <EmptyState compact dense tone="red" icon={ListTodo} title={t("listLoadFailed")}>
            <RetryButton onRetry={() => void tasksQuery.refetch()} busy={tasksQuery.isFetching} />
          </EmptyState>
        ) : tasksQuery.data?.length ? (
          <div className="space-y-2">
            {tasksQuery.data.map((task) => {
              const done = task.status === "completed";
              return (
                <div key={task.id} className={`flex items-center gap-3 rounded-2xl p-4 transition-opacity ${GLASS_CLASS} ${done ? "opacity-50" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium text-white ${done ? "line-through" : ""}`}>{task.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <ListTodo className="h-3 w-3 text-white/30" aria-hidden="true" />
                      <span className="text-xs text-white/40">{task.dueAt ? formatDateTime(task.dueAt) : t("noDueDate")}</span>
                    </div>
                  </div>
                  {!done && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={async () => { setCompletingId(task.id); try { await updateTaskStatus(task.id, "completed"); } finally { setCompletingId(null); } }}
                      loading={completingId === task.id}
                      aria-label={t("markTaskDone")}
                      title={t("markTaskDone")}
                      className="h-10 w-10 text-emerald-300"
                    >
                      <Check aria-hidden="true" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState compact dense icon={ListTodo} title={t("noTasks")} cardStyle={SECTION_EMPTY} />
        )}
      </SectionCard>

      {/* The same task form as the company page and the Tasks screen. */}
      <NewTaskDialog open={taskOpen} onOpenChange={setTaskOpen} leads={leadsQuery.data ?? []} visitId={activeVisit?.id ?? null} />
    </div>
  );
}
