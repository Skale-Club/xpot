import { useState, useRef, useEffect } from "react";
import {
  Check,
  TrendingUp,
  ListTodo,
  ChevronDown,
  Plus,
  Search,
  Building2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from '@/components/ui/loader';
import { useLeads } from "./hooks/useLeads";
import { useSales } from "./hooks/useSales";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { formatCurrency, formatDateTime } from "./utils";
import type { EnrichedSalesOpportunity } from "./types";

const GLASS = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
} as const;

const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 focus:outline-none transition-colors";
const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", colorScheme: "dark" as const };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="text-xs font-semibold uppercase tracking-widest text-white/30">{children}</div>
    </div>
  );
}

function LeadPicker({ leads, value, onChange }: {
  leads: { id: number; name: string; industry?: string | null }[];
  value: string;
  onChange: (id: string) => void;
}) {
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
          <span className="text-white/25">Choose a lead</span>
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
                placeholder="Search leads..."
                className="w-full h-8 rounded-lg pl-8 pr-3 text-xs text-white placeholder:text-white/25 focus:outline-none"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-xs text-white/30">No leads found</div>
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
          <option value="">Pipeline</option>
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
          <option value="">Stage</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
      </div>
    </div>
  );
}

export function XpotSales() {
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
    <div className="space-y-6">

      {/* Opportunities section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <SectionLabel>Opportunities</SectionLabel>
          <button
            onClick={() => setOppExpanded((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/8 hover:text-white/70"
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
              placeholder="Opportunity title"
              className={inputCls}
              style={inputStyle}
            />
            <input
              value={opportunityForm.value}
              onChange={(e) => setOpportunityForm((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="Value ($)"
              inputMode="decimal"
              className={inputCls}
              style={inputStyle}
            />
            {pipelinesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-white/30">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading pipelines...
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
              <div className="text-xs text-white/25 px-0.5">No pipelines configured in GHL</div>
            )}
            <button
              disabled={createOpportunityMutation.isPending || !opportunityForm.leadId || !opportunityForm.title.trim()}
              onClick={() => { createOpportunityMutation.mutate(undefined as any); setOppExpanded(false); }}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }}
            >
              {createOpportunityMutation.isPending ? <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> : null}
              Create Opportunity
            </button>
          </div>
        )}

        {/* Opportunities list */}
        {opportunitiesQuery.data?.length ? (
          <div className="space-y-2">
            {opportunitiesQuery.data.map((opp: EnrichedSalesOpportunity) => (
              <div
                key={opp.id}
                className="relative overflow-hidden rounded-2xl p-4"
                style={{
                  background: "rgba(16,185,129,0.07)",
                  border: "1px solid rgba(16,185,129,0.2)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl" style={{ background: "#10b981" }} />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{opp.title}</div>
                    <div className="text-xs text-white/40">{opp.lead?.name || `Lead #${opp.leadId}`}</div>
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
                      <span className="text-[10px] text-white/30">{opp.syncStatus}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !oppExpanded ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl py-8 text-center" style={GLASS}>
            <TrendingUp className="h-6 w-6 text-white/20" />
            <div className="text-xs text-white/30">No opportunities yet — tap + to create one</div>
          </div>
        ) : null}
      </div>

      {/* Tasks section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <SectionLabel>Follow-Up Tasks</SectionLabel>
          <button
            onClick={() => setTaskExpanded((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/8 hover:text-white/70"
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
              placeholder="Task title"
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
              Create Task
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
                  className="flex items-center gap-3 rounded-2xl p-4 transition-opacity"
                  style={{
                    background: done ? "rgba(255,255,255,0.02)" : "rgba(245,158,11,0.07)",
                    border: `1px solid ${done ? "rgba(255,255,255,0.05)" : "rgba(245,158,11,0.2)"}`,
                    opacity: done ? 0.5 : 1,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium text-white ${done ? "line-through" : ""}`}>{task.title}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <ListTodo className="h-3 w-3 text-white/25" />
                      <span className="text-xs text-white/35">{task.dueAt ? formatDateTime(task.dueAt) : "No due date"}</span>
                    </div>
                  </div>
                  {!done && (
                    <button
                      onClick={() => updateTaskStatus(task.id, "completed")}
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
          <div className="flex flex-col items-center gap-2 rounded-2xl py-8 text-center" style={GLASS}>
            <ListTodo className="h-6 w-6 text-white/20" />
            <div className="text-xs text-white/30">No tasks yet — tap + to add a follow-up</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
