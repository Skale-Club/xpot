import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { parseSalesPath, salesPath, type SalesTab } from "./salesPath";
import { currentSearch } from "@/hooks/use-url-filters";
import {
  BarChart3,
  Boxes,
  Check,
  ClipboardCheck,
  ChevronDown,
  GitBranch,
  Landmark,
  ListTodo,
  Plus,
  ReceiptText,
  Search,
  Building2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from '@/components/ui/loader';
import { useLeads } from "./hooks/useLeads";
import { useSales } from "./hooks/useSales";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { formatCurrency, formatDateTime } from "./utils";
import { SalesOverview } from "./components/sales/SalesOverview";
import { SalesList, ConsignmentsList } from "./components/sales/SalesLists";
import type { EnrichedSalesOpportunity } from "./types";
import { useT } from "@/i18n";
import { salesMessages } from "@/i18n/messages/sales";
import { GLASS } from "@/components/xpot/surface";
import { EmptyState } from "@/components/xpot/EmptyState";

const SYNC_STATUS_KEYS: Record<string, "sync_pending" | "sync_synced" | "sync_failed" | "sync_needs_review"> = {
  pending: "sync_pending",
  synced: "sync_synced",
  failed: "sync_failed",
  needs_review: "sync_needs_review",
};


const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 focus:outline-none transition-colors";
const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", colorScheme: "dark" as const };

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
        className="flex h-10 w-full items-center justify-between rounded-xl px-3 text-sm transition-colors"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
      >
        {selected ? (
          <span className="text-white truncate">{selected.name}</span>
        ) : (
          <span className="text-white/25">{t("chooseLead")}</span>
        )}
        <ChevronDown className={`h-4 w-4 text-white/30 shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl"
          style={{ background: "#0e1117", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 16px 40px rgba(0,0,0,0.6)" }}
        >
          <div className="p-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchLeads")}
                className="w-full h-8 rounded-lg pl-8 pr-3 text-xs text-white placeholder:text-white/25 focus:outline-none"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-xs text-white/30">{t("noLeadsFound")}</div>
            )}
            {filtered.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => { onChange(String(lead.id)); setOpen(false); setSearch(""); }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(99,102,241,0.15)" }}>
                  <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{lead.name}</div>
                  {lead.industry && <div className="truncate text-xs text-white/35">{lead.industry}</div>}
                </div>
                {String(lead.id) === value && <Check className="h-3.5 w-3.5 shrink-0 text-indigo-400" />}
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
      {/* Pipeline select */}
      <div className="relative">
        <select
          value={pipelineId}
          onChange={(e) => { onPipelineChange(e.target.value); onStageChange(""); }}
          className="w-full h-10 appearance-none rounded-xl pl-3 pr-8 text-sm focus:outline-none"
          style={{ ...inputStyle, color: pipelineId ? "white" : "rgba(255,255,255,0.25)" }}
        >
          <option value="">{t("pipeline")}</option>
          {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
      </div>

      {/* Stage select */}
      <div className="relative">
        <select
          value={stageId}
          onChange={(e) => onStageChange(e.target.value)}
          disabled={!pipelineId || stages.length === 0}
          className="w-full h-10 appearance-none rounded-xl pl-3 pr-8 text-sm focus:outline-none disabled:opacity-40"
          style={{ ...inputStyle, color: stageId ? "white" : "rgba(255,255,255,0.25)" }}
        >
          <option value="">{t("stage")}</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
      </div>
    </div>
  );
}


const SALES_TABS: {
  id: SalesTab;
  labelKey: "tabOverview" | "tabSales" | "tabStock" | "tabPipeline";
  descriptionKey: "tabOverviewHint" | "tabSalesHint" | "tabStockHint" | "tabPipelineHint";
  icon: LucideIcon;
}[] = [
  { id: "overview", labelKey: "tabOverview", descriptionKey: "tabOverviewHint", icon: BarChart3 },
  { id: "sales", labelKey: "tabSales", descriptionKey: "tabSalesHint", icon: ReceiptText },
  { id: "consignments", labelKey: "tabStock", descriptionKey: "tabStockHint", icon: Boxes },
  { id: "pipeline", labelKey: "tabPipeline", descriptionKey: "tabPipelineHint", icon: GitBranch },
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
    <div className="space-y-5 lg:space-y-6">
      <section
        className="relative isolate overflow-hidden rounded-[28px] border border-white/[0.09] px-4 pb-4 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:px-5 lg:px-7 lg:pb-6 lg:pt-7"
        style={{ background: "linear-gradient(135deg, rgba(12,24,42,0.98) 0%, rgba(10,17,32,0.96) 48%, rgba(10,30,32,0.92) 100%)" }}
      >
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-emerald-400/[0.09] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-60 w-60 rounded-full bg-blue-500/[0.08] blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.32) 1px, transparent 0)", backgroundSize: "24px 24px" }}
        />

        <div className="relative mb-5 flex items-start gap-4 lg:mb-7">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Landmark className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300/75">{t("pageEyebrow")}</div>
            <h2 className="text-xl font-bold tracking-[-0.03em] text-white sm:text-2xl lg:text-[28px]">{t("pageTitle")}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/45 sm:text-sm">{t("pageSubtitle")}</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45 lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            {t("liveView")}
          </div>
        </div>

        <nav className="relative grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label={t("pageTitle")}>
          {SALES_TABS.map(({ id: itemId, labelKey, descriptionKey, icon: Icon }) => {
            const active = tab === itemId;
            return (
              <button
                key={itemId}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(itemId)}
                className={`group flex min-h-[64px] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all duration-200 lg:min-h-[72px] lg:px-4 ${active
                  ? "border-emerald-300/25 bg-emerald-300/[0.10] shadow-[0_10px_30px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "border-white/[0.06] bg-black/[0.12] hover:border-white/[0.12] hover:bg-white/[0.045]"
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${active
                  ? "border-emerald-300/25 bg-emerald-300/[0.12] text-emerald-300"
                  : "border-white/[0.07] bg-white/[0.035] text-white/35 group-hover:text-white/60"
                }`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-xs font-bold sm:text-sm ${active ? "text-white" : "text-white/55 group-hover:text-white/75"}`}>{t(labelKey)}</span>
                  <span className={`mt-0.5 hidden truncate text-[10px] lg:block ${active ? "text-emerald-100/45" : "text-white/25"}`}>{t(descriptionKey)}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </section>

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
  const {
    opportunitiesQuery,
    tasksQuery,
    opportunityForm,
    setOpportunityForm,
    taskForm,
    setTaskForm,
    createOpportunityMutation,
    createTaskMutation,
    updateTaskStatus,
  } = useSales();

  const pipelinesQuery = useQuery<{ pipelines: GHLPipeline[] }>({
    queryKey: ["/api/xpot/opportunities/pipelines"],
    queryFn: async () => (await apiRequest("GET", "/api/xpot/opportunities/pipelines")).json(),
    enabled: xpotMeQuery.isSuccess,
    staleTime: 5 * 60 * 1000,
  });

  const [oppExpanded, setOppExpanded] = useState(false);
  const [taskExpanded, setTaskExpanded] = useState(false);
  const [taskLeadId, setTaskLeadId] = useState("");

  const pipelines = pipelinesQuery.data?.pipelines ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">

      {/* Opportunities section */}
      <section className="space-y-3 rounded-[26px] border border-white/[0.075] bg-white/[0.025] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] lg:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.08]">
              <TrendingUp className="h-4 w-4 text-emerald-300" />
            </span>
            <div>
              <div className="text-sm font-bold text-white">{t("opportunities")}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">{opportunitiesQuery.data?.length ?? 0}</div>
            </div>
          </div>
          <button
            onClick={() => setOppExpanded((v) => !v)}
            aria-label={t("newOpp")}
            title={t("newOpp")}
            aria-expanded={oppExpanded}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/45 transition-all hover:border-emerald-300/25 hover:bg-emerald-300/[0.08] hover:text-emerald-200"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Create form — collapsible */}
        {oppExpanded && (
          <div className="rounded-2xl p-4 space-y-3" style={GLASS}>
            <LeadPicker
              leads={leadsQuery.data ?? []}
              value={opportunityForm.leadId}
              onChange={(id) => setOpportunityForm((prev) => ({ ...prev, leadId: id }))}
            />
            <input
              value={opportunityForm.title}
              onChange={(e) => setOpportunityForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={t("oppTitle")}
              className={inputCls}
              style={inputStyle}
            />
            <input
              value={opportunityForm.value}
              onChange={(e) => setOpportunityForm((prev) => ({ ...prev, value: e.target.value }))}
              placeholder={t("oppValue")}
              inputMode="decimal"
              className={inputCls}
              style={inputStyle}
            />
            {pipelinesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-white/30">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("loadingPipelines")}
              </div>
            ) : pipelines.length > 0 ? (
              <PipelinePicker
                pipelines={pipelines}
                pipelineId={opportunityForm.pipelineKey}
                stageId={opportunityForm.stageKey}
                onPipelineChange={(id) => setOpportunityForm((prev) => ({ ...prev, pipelineKey: id }))}
                onStageChange={(id) => setOpportunityForm((prev) => ({ ...prev, stageKey: id }))}
              />
            ) : (
              <div className="text-xs text-white/25 px-0.5">{t("noPipelines")}</div>
            )}
            <button
              disabled={createOpportunityMutation.isPending || !opportunityForm.leadId || !opportunityForm.title.trim()}
              onClick={() => { createOpportunityMutation.mutate(undefined as any); setOppExpanded(false); }}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }}
            >
              {createOpportunityMutation.isPending ? <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> : null}
              {t("createOpp")}
            </button>
          </div>
        )}

        {/* Opportunities list */}
        {opportunitiesQuery.data?.length ? (
          <div className="space-y-2">
            {opportunitiesQuery.data.map((opp: EnrichedSalesOpportunity) => (
              <div
                key={opp.id}
                className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-black/[0.13] p-4 shadow-[inset_3px_0_0_rgba(52,211,153,0.45)]"
                style={{
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl" style={{ background: "#10b981" }} />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{opp.title}</div>
                    <div className="text-xs text-white/40">{opp.lead?.name || t("leadNumber", { id: opp.leadId })}</div>
                    {opp.pipelineKey && (
                      <div className="mt-1 text-[11px] text-white/25">
                        {pipelines.find((p) => p.id === opp.pipelineKey)?.name ?? opp.pipelineKey}
                        {opp.stageKey ? ` · ${pipelines.find((p) => p.id === opp.pipelineKey)?.stages?.find((s) => s.id === opp.stageKey)?.name ?? opp.stageKey}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold text-emerald-400">{formatCurrency(opp.value, opp.currency)}</div>
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      <TrendingUp className="h-3 w-3 text-white/25" />
                      <span className="text-[10px] text-white/30">{SYNC_STATUS_KEYS[opp.syncStatus] ? t(SYNC_STATUS_KEYS[opp.syncStatus]) : opp.syncStatus}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !oppExpanded ? (
          <EmptyState compact dense icon={TrendingUp} title={t("noOpps")} cardStyle={GLASS} />
        ) : null}
      </section>

      {/* Tasks section */}
      <section className="space-y-3 rounded-[26px] border border-white/[0.075] bg-white/[0.025] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] lg:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/[0.08]">
              <ClipboardCheck className="h-4 w-4 text-amber-300" />
            </span>
            <div>
              <div className="text-sm font-bold text-white">{t("followUpTasks")}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">{tasksQuery.data?.length ?? 0}</div>
            </div>
          </div>
          <button
            onClick={() => setTaskExpanded((v) => !v)}
            aria-label={t("newTask")}
            title={t("newTask")}
            aria-expanded={taskExpanded}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/45 transition-all hover:border-amber-300/25 hover:bg-amber-300/[0.08] hover:text-amber-200"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Create form */}
        {taskExpanded && (
          <div className="rounded-2xl p-4 space-y-3" style={GLASS}>
            <LeadPicker
              leads={leadsQuery.data ?? []}
              value={taskLeadId}
              onChange={setTaskLeadId}
            />
            <input
              value={taskForm.title}
              onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={t("taskTitle")}
              className={inputCls}
              style={inputStyle}
            />
            <input
              type="datetime-local"
              value={taskForm.dueAt}
              onChange={(e) => setTaskForm((prev) => ({ ...prev, dueAt: e.target.value }))}
              className={`${inputCls} [color-scheme:dark]`}
              style={inputStyle}
            />
            <button
              disabled={createTaskMutation.isPending || !taskForm.title.trim() || !taskLeadId}
              onClick={() => { createTaskMutation.mutate({ selectedLeadId: Number(taskLeadId) }); setTaskExpanded(false); setTaskLeadId(""); }}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
            >
              {createTaskMutation.isPending ? <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> : null}
              {t("createTask")}
            </button>
          </div>
        )}

        {/* Tasks list */}
        {tasksQuery.data?.length ? (
          <div className="space-y-2">
            {tasksQuery.data.map((task) => {
              const done = task.status === "completed";
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/[0.13] p-4 transition-opacity"
                  style={{
                    boxShadow: done ? undefined : "inset 3px 0 0 rgba(251,191,36,0.42)",
                    opacity: done ? 0.5 : 1,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium text-white ${done ? "line-through" : ""}`}>{task.title}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <ListTodo className="h-3 w-3 text-white/25" />
                      <span className="text-xs text-white/35">{task.dueAt ? formatDateTime(task.dueAt) : t("noDueDate")}</span>
                    </div>
                  </div>
                  {!done && (
                    <button
                      onClick={() => updateTaskStatus(task.id, "completed")}
                      aria-label={t("markTaskDone")}
                      title={t("markTaskDone")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all hover:scale-105"
                      style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}
                    >
                      <Check className="h-4 w-4 text-emerald-400" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : !taskExpanded ? (
          <EmptyState compact dense icon={ListTodo} title={t("noTasks")} cardStyle={GLASS} />
        ) : null}
      </section>
    </div>
  );
}
