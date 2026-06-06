import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircle2,
  XCircle,
  Plug,
  KeyRound,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Search,
  Check,
} from "lucide-react";
import {
  INTEGRATION_PROVIDERS,
  getMutexSiblings,
  type IntegrationProviderDef,
  type IntegrationStatus,
} from "#shared/integrations-registry.js";

type IntegrationsResponse = { providers: IntegrationProviderDef[]; status: IntegrationStatus[] };

const CATEGORY_COLORS: Record<string, string> = {
  Maps: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  Voice: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  AI: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  Pipeline: "bg-amber-500/15 text-amber-300 border-amber-500/20",
};

/**
 * Sidebar item health colors based on saved state.
 *   green  = enabled AND has key (live)
 *   red    = enabled but no key (broken / misconfigured)
 *   amber  = disabled but has key (idle — turn on to activate)
 *   muted  = disabled and no key (off)
 */
type StatusKey = "live" | "broken" | "idle" | "off";
function statusKey(s: IntegrationStatus | undefined): StatusKey {
  if (!s) return "off";
  if (s.enabled && s.hasApiKey) return "live";
  if (s.enabled && !s.hasApiKey) return "broken";
  if (!s.enabled && s.hasApiKey) return "idle";
  return "off";
}
const STATUS_LEFT_BAR: Record<StatusKey, string> = {
  live: "bg-emerald-500",
  broken: "bg-red-500",
  idle: "bg-amber-400",
  off: "bg-white/10",
};
const STATUS_CHIP: Record<StatusKey, string> = {
  live: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  broken: "bg-red-500/15 text-red-300 border-red-500/30",
  idle: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  off: "bg-white/5 text-white/40 border-white/10",
};
const CONNECTION_DOT: Record<StatusKey, string> = {
  live: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]",
  broken: "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.45)]",
  idle: "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.45)]",
  off: "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.45)]",
};
const SAVED_SECRET_MASK = "••••••••";

function displayFieldValue(
  key: IntegrationProviderDef["fields"][number]["key"],
  fields: Record<string, string>,
  status: IntegrationStatus
) {
  if (fields[key] !== undefined) return fields[key];
  if (key === "model") return status.model ?? "";
  if (key === "locationId") return status.locationId ?? "";
  if (key === "calendarId") return status.calendarId ?? "";
  return "";
}

export function AdminIntegrations() {
  const query = useQuery<IntegrationsResponse>({ queryKey: ["/api/xpot/admin/integrations"] });
  const [selectedProvider, setSelectedProvider] = useState<string>(INTEGRATION_PROVIDERS[0]?.provider ?? "");

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-red-400">Failed to load integrations.</p>;
  }

  const statusByProvider = new Map(query.data.status.map((s) => [s.provider, s]));
  const selectedDef = INTEGRATION_PROVIDERS.find((p) => p.provider === selectedProvider) ?? INTEGRATION_PROVIDERS[0];
  const selectedStatus = statusByProvider.get(selectedDef.provider)!;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-white/55">
        <Plug className="h-4 w-4" />
        Register API keys. Keys are masked after saving — the server never returns the value.
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px,1fr]">
        {/* Sidebar */}
        <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-2">
          <ul className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-x-visible">
            {INTEGRATION_PROVIDERS.map((def) => {
              const status = statusByProvider.get(def.provider)!;
              const isActive = def.provider === selectedDef.provider;
              const sk = statusKey(status);
              return (
                <li key={def.provider} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => setSelectedProvider(def.provider)}
                    className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl pl-4 pr-3 py-3 text-left transition-colors ${
                      isActive
                        ? "bg-blue-500/15 text-white"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {/* Status left bar — red/green/amber/muted */}
                    <span
                      aria-hidden
                      className={`absolute left-0 top-0 h-full w-1 ${STATUS_LEFT_BAR[sk]}`}
                    />
                    <span
                      aria-label={sk === "live" ? "Connected" : "Not connected"}
                      className={`h-2 w-2 shrink-0 rounded-full ${CONNECTION_DOT[sk]}`}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{def.label}</span>
                        <span
                          className={`hidden shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide sm:inline-flex ${STATUS_CHIP[sk]}`}
                        >
                          {sk === "live" && "Live"}
                          {sk === "broken" && "Needs key"}
                          {sk === "idle" && "Idle"}
                          {sk === "off" && "Off"}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                        {def.category}
                        {status?.hasApiKey && (
                          <span className="inline-flex items-center gap-1 text-white/40">
                            <KeyRound className="h-2.5 w-2.5" />
                            ••{status.apiKeyLast4}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight
                      className={`hidden h-4 w-4 shrink-0 transition-all lg:block ${
                        isActive ? "text-white/60 opacity-100" : "text-white/20 opacity-0 group-hover:opacity-100"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Detail pane */}
        <ProviderDetail
          key={selectedDef.provider}
          def={selectedDef}
          status={selectedStatus}
          categoryColor={CATEGORY_COLORS[selectedDef.category] ?? "bg-white/10 text-white/60 border-white/10"}
        />
      </div>
    </div>
  );
}

function ProviderDetail({
  def,
  status,
  categoryColor,
}: {
  def: IntegrationProviderDef;
  status: IntegrationStatus;
  categoryColor: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<boolean>(status.enabled);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const hasApiKeyForTest = Boolean(fields.apiKey?.trim() || status.hasApiKey);

  // Sync local enabled state when the server-side status changes (after save/refetch).
  useEffect(() => {
    setEnabled(status.enabled);
  }, [status.enabled]);

  // Reset test result and dirty fields whenever the user switches providers.
  useEffect(() => {
    setTestResult(null);
    setFields({});
  }, [def.provider]);

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { enabled };
      for (const f of def.fields) {
        const v = fields[f.key];
        if (v !== undefined && v !== "" && v !== SAVED_SECRET_MASK) body[f.key] = v;
      }
      const res = await apiRequest("PUT", `/api/xpot/admin/integrations/${def.provider}`, body);
      return res.json() as Promise<IntegrationStatus>;
    },
    onSuccess: (savedStatus) => {
      toast({ title: `${def.label} saved` });
      setFields({});
      queryClient.setQueryData<IntegrationsResponse>(["/api/xpot/admin/integrations"], (current) => {
        if (!current) return current;
        const siblingProviders = enabled ? new Set(getMutexSiblings(def.provider).map((s) => s.provider)) : new Set();
        return {
          ...current,
          status: current.status.map((item) => {
            if (item.provider === savedStatus.provider) return savedStatus;
            if (siblingProviders.has(item.provider)) return { ...item, enabled: false };
            return item;
          }),
        };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/integrations"] });
    },
    onError: (e: Error) => toast({ title: "Error saving", description: e.message, variant: "destructive" }),
  });

  const test = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      for (const f of def.fields) {
        const value = fields[f.key]?.trim();
        if (value && value !== SAVED_SECRET_MASK) body[f.key] = value;
      }
      const res = await apiRequest("POST", `/api/xpot/admin/integrations/${def.provider}/test`, body);
      return res.json() as Promise<{ ok: boolean; message: string }>;
    },
    onSuccess: (r) => setTestResult(r),
    onError: (e: Error) =>
      setTestResult({ ok: false, message: `Network error: ${e.message || "request failed"}` }),
  });

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{def.label}</h3>
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${categoryColor}`}>
              {def.category}
            </span>
            {status.hasApiKey && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                <KeyRound className="h-3 w-3" />
                key •••• {status.apiKeyLast4}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-white/55">{def.description}</p>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-3 text-sm text-white/70">
          <span className={enabled ? "text-emerald-400" : "text-white/40"}>
            {enabled ? "Enabled" : "Disabled"}
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              if (v && def.mutexGroup) {
                const siblings = getMutexSiblings(def.provider);
                if (siblings.length) {
                  toast({
                    title: `${def.label} exclusive`,
                    description: `Enabling ${def.label} will turn off: ${siblings.map((s) => s.label).join(", ")}.`,
                  });
                }
              }
              setEnabled(v);
            }}
            aria-label={`Toggle ${def.label}`}
          />
        </label>
      </div>

      {/* Broken-state warning — enabled but no key saved */}
      {status.enabled && !status.hasApiKey && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Missing API key</div>
            <div className="text-red-200/80">This provider is enabled but has no key on file — calls will fail. Paste a key and click Save.</div>
          </div>
        </div>
      )}

      {/* Fields */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {def.fields.map((f) => (
          <div key={f.key} className={def.fields.length === 1 ? "sm:col-span-2" : ""}>
            <label className="mb-1.5 block text-xs font-medium text-white/55">
              {f.label} {f.optional && <span className="text-white/30">(optional)</span>}
            </label>
            {f.options ? (
              <SearchableSelect
                value={displayFieldValue(f.key, fields, status)}
                placeholder={f.placeholder ?? ""}
                options={f.options}
                onChange={(value) => {
                  setTestResult(null);
                  setFields((prev) => ({ ...prev, [f.key]: value }));
                }}
              />
            ) : (
              <input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={fields[f.key] ?? (f.secret && status.hasApiKey ? SAVED_SECRET_MASK : displayFieldValue(f.key, fields, status))}
                onFocus={() => {
                  if (f.secret && status.hasApiKey && fields[f.key] === undefined) {
                    setFields((prev) => ({ ...prev, [f.key]: "" }));
                  }
                }}
                onChange={(e) => {
                  setTestResult(null);
                  setFields((prev) => ({ ...prev, [f.key]: e.target.value }));
                }}
                placeholder={f.secret && status.hasApiKey ? `current: ${status.apiKeyLast4 ?? "saved"}` : f.placeholder ?? ""}
                className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none transition-colors focus:border-blue-500/50"
              />
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
        <button
          onClick={() => test.mutate()}
          disabled={test.isPending || !hasApiKeyForTest}
          title={!hasApiKeyForTest ? "Paste or save a key before testing" : "Test credentials"}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {test.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Test
        </button>
      </div>

      {/* Test result block */}
      {testResult && (
        <div
          className={`mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${
            testResult.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1 break-words whitespace-pre-wrap">{testResult.message}</div>
        </div>
      )}
    </section>
  );
}

function SearchableSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = options.filter((option) => option.toLowerCase().includes(normalizedSearch));
  const exactMatch = options.some((option) => option.toLowerCase() === normalizedSearch);
  const customValue = search.trim();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setSearch("");
        }}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border bg-[#0a0f1e] px-3 py-2.5 text-left text-sm outline-none transition-colors ${
          open ? "border-blue-500/50" : "border-white/10 hover:border-white/20"
        }`}
      >
        <span className={value ? "min-w-0 truncate text-white" : "min-w-0 truncate text-white/25"}>
          {value || placeholder || "Select model"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-lg border border-white/10 bg-[#080d19] shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-white/35" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && customValue) {
                  onChange(customValue);
                  setOpen(false);
                }
              }}
              placeholder="Search or type a model"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white placeholder-white/25 outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {customValue && !exactMatch && (
              <button
                type="button"
                onClick={() => {
                  onChange(customValue);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-blue-200 transition-colors hover:bg-blue-500/10"
              >
                <Check className="h-4 w-4 shrink-0 text-blue-300" />
                <span className="min-w-0 truncate">Use "{customValue}"</span>
              </button>
            )}
            {filtered.map((option) => {
              const selected = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    selected ? "bg-blue-500/15 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Check className={`h-4 w-4 shrink-0 ${selected ? "text-blue-300 opacity-100" : "opacity-0"}`} />
                  <span className="min-w-0 truncate">{option}</span>
                </button>
              );
            })}
            {!filtered.length && !customValue && (
              <div className="px-3 py-4 text-center text-sm text-white/35">No models found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
