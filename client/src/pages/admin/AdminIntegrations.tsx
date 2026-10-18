import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { shellMessages } from "@/i18n/messages/shell";
import { Tabs } from "@/components/xpot/Tabs";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { JourneyMcpCard } from "./tags/JourneyMcpCard";
import { AdminXphere } from "./AdminXphere";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
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
  Webhook,
  Bot,
  Server,
  Trash2,
} from "lucide-react";
import {
  INTEGRATION_PROVIDERS,
  isConfigFieldKey,
  type IntegrationProviderDef,
  type IntegrationStatus,
} from "#shared/integrations-registry.js";
import { useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { integrationsMessages } from "@/i18n/messages/integrations";
import {
  INTEGRATIONS_TABS,
  integrationStatusKey,
  integrationsTabFromPath,
  integrationsTabPath,
  locksOutSignIn,
  type IntegrationsTab,
  type StatusKey,
} from "./integrationsUi";

type IntegrationsResponse = { providers: IntegrationProviderDef[]; status: IntegrationStatus[] };
const INTEGRATIONS_KEY = ["/api/xpot/admin/integrations"];

const CATEGORY_COLORS: Record<string, string> = {
  Maps: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  Voice: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  AI: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  Pipeline: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  Messaging: "bg-sky-500/15 text-sky-300 border-sky-500/20",
};

/** One tone per status for the left bar, the dot and the chip, so the three never disagree. */
const STATUS_TONE: Record<StatusKey, { bar: string; dot: string; chip: string }> = {
  live: {
    bar: "bg-emerald-500",
    dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  broken: {
    bar: "bg-red-500",
    dot: "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.45)]",
    chip: "bg-red-500/15 text-red-300 border-red-500/30",
  },
  idle: {
    bar: "bg-amber-400",
    dot: "bg-amber-400",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  off: {
    bar: "bg-white/10",
    dot: "bg-white/20",
    chip: "bg-white/5 text-white/40 border-white/10",
  },
};
const SAVED_SECRET_MASK = "••••••••";
const BADGE = "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide";

type IntT = Translate<typeof integrationsMessages.en>;

// The registry is shared with the server and written in English; these keys give the
// screen its words. A provider or field missing here shows the registry's text.
const STATUS_LABEL_KEYS = {
  live: "intStatus_live",
  broken: "intStatus_broken",
  idle: "intStatus_idle",
  off: "intStatus_off",
} as const satisfies Record<StatusKey, keyof typeof integrationsMessages.en>;
const CATEGORY_KEYS = {
  Maps: "category_Maps",
  Voice: "category_Voice",
  AI: "category_AI",
  Pipeline: "category_Pipeline",
  Messaging: "category_Messaging",
} as const satisfies Record<IntegrationProviderDef["category"], keyof typeof integrationsMessages.en>;
type IntKey = keyof typeof integrationsMessages.en;
const PROVIDER_KEYS: Record<string, { label?: IntKey; description: IntKey }> = {
  google_places: { description: "descGooglePlaces" },
  groq: { label: "providerGroq", description: "descGroq" },
  openai: { label: "providerOpenai", description: "descOpenai" },
  openrouter: { label: "providerOpenrouter", description: "descOpenrouter" },
  gemini: { label: "providerGemini", description: "descGemini" },
  gohighlevel: { description: "descGohighlevel" },
  twilio: { description: "descTwilio" },
};
const FIELD_LABEL_KEYS: Record<string, IntKey> = {
  "API Key": "fieldApiKey",
  Model: "fieldModel",
  "Location ID": "fieldLocationId",
  "Calendar ID": "fieldCalendarId",
  "From number (E.164)": "fieldFromNumber",
  "Account SID": "fieldAccountSid",
  "Auth Token": "fieldAuthToken",
  "Messaging Service SID": "fieldMessagingServiceSid",
};

function providerLabel(t: IntT, def: IntegrationProviderDef) {
  const key = PROVIDER_KEYS[def.provider]?.label;
  return key ? t(key) : def.label;
}

function providerDescription(t: IntT, def: IntegrationProviderDef) {
  const key = PROVIDER_KEYS[def.provider]?.description;
  return key ? t(key) : def.description;
}

function fieldLabel(t: IntT, label: string) {
  const key = FIELD_LABEL_KEYS[label];
  return key ? t(key) : label;
}

function problemText(t: IntT, status: IntegrationStatus) {
  return status.problemCode ? t(`problem_${status.problemCode}`) : status.problem;
}

function displayFieldValue(
  key: IntegrationProviderDef["fields"][number]["key"],
  fields: Record<string, string>,
  status: IntegrationStatus
) {
  if (fields[key] !== undefined) return fields[key];
  if (key === "model") return status.model ?? "";
  if (key === "locationId") return status.locationId ?? "";
  if (key === "calendarId") return status.calendarId ?? "";
  if (isConfigFieldKey(key)) return status.config?.[key] ?? "";
  return "";
}

/** "Primary" / "Fallback", "Legacy", "Required for sign-in": what the provider is for, at a glance. */
function ProviderBadges({ def, t }: { def: IntegrationProviderDef; t: IntT }) {
  return (
    <>
      {def.role && (
        <span className={`${BADGE} border-white/10 bg-white/5 text-white/55`}>{t(def.role === "primary" ? "rolePrimary" : "roleFallback")}</span>
      )}
      {def.legacy && <span className={`${BADGE} border-white/10 bg-white/5 text-white/45`}>{t("legacyBadge")}</span>}
      {def.requiredForSignIn && (
        <span className={`${BADGE} border-sky-500/30 bg-sky-500/10 text-sky-300`}>{t("requiredForSignIn")}</span>
      )}
    </>
  );
}

function ProvidersPanel() {
  const query = useQuery<IntegrationsResponse>({ queryKey: INTEGRATIONS_KEY });
  const [selectedProvider, setSelectedProvider] = useState<string>(INTEGRATION_PROVIDERS[0]?.provider ?? "");
  // The detail pane says when it holds unsaved edits; picking another provider then asks first.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const t = useT(integrationsMessages);
  const tc = useT(commonMessages);

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-red-400">
        {t("integrationsLoadFailed")}
        <button type="button" onClick={() => void query.refetch()} className="rounded-lg border border-white/10 px-3 py-1 text-white/70 hover:bg-white/5">
          {tc("retry")}
        </button>
      </div>
    );
  }

  const statusByProvider = new Map(query.data.status.map((s) => [s.provider, s]));
  const selectedDef = INTEGRATION_PROVIDERS.find((p) => p.provider === selectedProvider) ?? INTEGRATION_PROVIDERS[0];
  const selectedStatus = statusByProvider.get(selectedDef.provider)!;
  const select = (provider: string) => {
    if (provider === selectedDef.provider) return;
    if (dirty) setPending(provider);
    else setSelectedProvider(provider);
  };
  const pendingDef = pending ? INTEGRATION_PROVIDERS.find((p) => p.provider === pending) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-white/55">
        <Plug className="h-4 w-4 shrink-0" />
        {t("integrationsIntro")}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px,1fr]">
        {/* Sidebar */}
        <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-2">
          <ul className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-x-visible">
            {INTEGRATION_PROVIDERS.map((def) => {
              const status = statusByProvider.get(def.provider)!;
              const isActive = def.provider === selectedDef.provider;
              const sk = integrationStatusKey(status);
              const tone = STATUS_TONE[sk];
              return (
                <li key={def.provider} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => select(def.provider)}
                    className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl pl-4 pr-3 py-3 text-left transition-colors ${
                      isActive
                        ? "bg-blue-500/15 text-white"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                    data-testid={`integration-${def.provider}`}
                  >
                    <span aria-hidden className={`absolute left-0 top-0 h-full w-1 ${tone.bar}`} />
                    <span role="img" aria-label={t(STATUS_LABEL_KEYS[sk])} className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{providerLabel(t, def)}</span>
                        <span className={`hidden shrink-0 sm:inline-flex ${BADGE} ${tone.chip}`}>{t(STATUS_LABEL_KEYS[sk])}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/40">
                        {t(CATEGORY_KEYS[def.category])}
                        {def.role && <span>· {t(def.role === "primary" ? "rolePrimary" : "roleFallback")}</span>}
                        {def.legacy && <span>· {t("legacyBadge")}</span>}
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
          onDirtyChange={setDirty}
        />
      </div>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("discardTitle")}
        description={t("discardBody", { name: providerLabel(t, selectedDef) })}
        confirmLabel={t("discardConfirm")}
        destructive
        onConfirm={() => {
          if (pendingDef) setSelectedProvider(pendingDef.provider);
          setDirty(false);
          setPending(null);
        }}
        testId="integrations-discard"
      />
    </div>
  );
}

function ProviderDetail({
  def,
  status,
  categoryColor,
  onDirtyChange,
}: {
  def: IntegrationProviderDef;
  status: IntegrationStatus;
  categoryColor: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(integrationsMessages);
  const tm = useT(manageMessages);
  const tc = useT(commonMessages);
  const label = providerLabel(t, def);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<boolean>(status.enabled);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirming, setConfirming] = useState<"signInOff" | "removeKey" | null>(null);
  const hasApiKeyForTest = Boolean(fields.apiKey?.trim() || status.hasApiKey);

  // Sync local enabled state when the server-side status changes (after save/refetch).
  useEffect(() => {
    setEnabled(status.enabled);
  }, [status.enabled]);

  const fieldsDirty = def.fields.some((f) => {
    const value = fields[f.key];
    if (value === undefined || value === SAVED_SECRET_MASK) return false;
    if (f.secret) return value.trim() !== "";
    return value !== displayFieldValue(f.key, {}, status);
  });
  const dirty = fieldsDirty || enabled !== status.enabled;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const labelOfPath = (path: string) => {
    const field = def.fields.find((f) => f.key === path);
    return field ? fieldLabel(t, field.label) : null;
  };

  const save = useMutation({
    mutationFn: async (opts: { clearApiKey?: boolean } = {}) => {
      const body: Record<string, unknown> = opts.clearApiKey ? { enabled: false, clearApiKey: true } : { enabled };
      if (!opts.clearApiKey) {
        for (const f of def.fields) {
          const v = fields[f.key];
          if (v === undefined || v === SAVED_SECRET_MASK) continue;
          // Provider settings can be cleared (empty string); the older columns keep ignoring empties.
          if (v !== "" || (isConfigFieldKey(f.key) && !f.secret)) body[f.key] = v;
        }
      }
      const res = await apiRequest("PUT", `/api/xpot/admin/integrations/${def.provider}`, body);
      return res.json() as Promise<IntegrationStatus>;
    },
    onSuccess: (savedStatus, opts) => {
      toast({ title: opts?.clearApiKey ? t("keyRemoved", { name: label }) : t("integrationSaved", { name: label }), variant: "success" });
      setFields({});
      setConfirming(null);
      queryClient.setQueryData<IntegrationsResponse>(INTEGRATIONS_KEY, (current) =>
        current ? { ...current, status: current.status.map((item) => (item.provider === savedStatus.provider ? savedStatus : item)) } : current,
      );
      queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY });
    },
    onError: (e: Error) => {
      setConfirming(null);
      toast({ title: tm("errorSaving"), description: describeApiError(e, labelOfPath), variant: "destructive" });
    },
  });

  const requestSave = () => {
    if (locksOutSignIn(def, status, { enabled })) setConfirming("signInOff");
    else save.mutate({});
  };
  const removeLocksOut = locksOutSignIn(def, status, { enabled: false, clearApiKey: true });

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
      setTestResult({ ok: false, message: t("networkError", { message: describeApiError(e, labelOfPath) || t("requestFailedShort") }) }),
  });

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{label}</h3>
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${categoryColor}`}>
              {t(CATEGORY_KEYS[def.category])}
            </span>
            <ProviderBadges def={def} t={t} />
            {status.hasApiKey && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                <KeyRound className="h-3 w-3" />
                {t("keyLast4", { last4: status.apiKeyLast4 ?? "" })}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-white/55">{providerDescription(t, def)}</p>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-3 text-sm text-white/70">
          <span className={enabled ? "text-emerald-400" : "text-white/40"}>
            {enabled ? tm("enabled") : tm("disabled")}
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label={t("toggleProvider", { name: label })}
          />
        </label>
      </div>

      {/* The server's own settings are the ones in force. */}
      {status.source === "env" && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-sky-500/25 bg-sky-500/[0.07] px-3.5 py-3 text-sm text-sky-100" data-testid="integration-env-source">
          <Server className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t("envSourceTitle")}</div>
            <div className="text-sky-100/75">{t(def.envMode === "override" ? "envSourceOverride" : "envSourceFallback")}</div>
          </div>
        </div>
      )}

      {/* Broken-state warning — enabled but something is missing */}
      {status.enabled && status.problem && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t("setupIncomplete")}</div>
            <div className="text-red-200/80">{problemText(t, status)}</div>
          </div>
        </div>
      )}

      {/* Fields */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {def.fields.map((f) => (
          <div key={f.key} className={def.fields.length === 1 ? "sm:col-span-2" : ""}>
            <label className="mb-1.5 block text-xs font-medium text-white/55">
              {fieldLabel(t, f.label)} {f.optional && <span className="text-white/30">({tm("optional")})</span>}
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
                placeholder={f.secret && status.hasApiKey ? t("currentKey", { last4: status.apiKeyLast4 ?? t("savedKey") }) : f.placeholder ?? ""}
                className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none transition-colors focus:border-blue-500/50"
              />
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={requestSave}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          data-testid="integration-save"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {tc("save")}
        </button>
        <button
          onClick={() => test.mutate()}
          disabled={test.isPending || !hasApiKeyForTest}
          title={!hasApiKeyForTest ? t("testNeedsKey") : t("testCredentials")}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {test.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("test")}
        </button>
        {status.hasApiKey && (
          <button
            type="button"
            onClick={() => setConfirming("removeKey")}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-40"
            data-testid="integration-remove-key"
          >
            <Trash2 className="h-4 w-4" />
            {t("removeKey")}
          </button>
        )}
        {dirty && <span className="text-xs text-amber-300">{t("unsavedChanges")}</span>}
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

      <ConfirmDialog
        open={confirming === "signInOff"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={t("signInOffTitle")}
        description={t("signInOffBody")}
        confirmLabel={t("signInOffConfirm")}
        destructive
        busy={save.isPending}
        onConfirm={() => save.mutate({})}
        testId="integration-signin-off"
      />
      <ConfirmDialog
        open={confirming === "removeKey"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={t("removeKeyTitle", { name: label })}
        description={removeLocksOut ? `${t("removeKeyBody", { name: label })}\n\n${t("signInOffBody")}` : t("removeKeyBody", { name: label })}
        confirmLabel={t("removeKey")}
        destructive
        busy={save.isPending}
        onConfirm={() => save.mutate({ clearApiKey: true })}
        testId="integration-remove-key-dialog"
      />
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
  const t = useT(integrationsMessages);
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
          {value || placeholder || t("selectModel")}
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
              placeholder={t("searchModel")}
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
                <span className="min-w-0 truncate">{t("useCustomValue", { value: customValue })}</span>
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
              <div className="px-3 py-4 text-center text-sm text-white/35">{t("noModels")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TAB_KEYS = { providers: "tabApiKeys", xphere: "tabXphere", mcp: "tabAiAccess" } as const;
const TAB_ICONS = { providers: KeyRound, xphere: Webhook, mcp: Bot };

/**
 * Account -> Integrations, one tab per kind of connection: outside services
 * Xpot calls (API keys), each rep's Xphere sync, and the AI sessions that
 * reach Xpot over /mcp. The tab is in the URL (integrationsUi.ts).
 */
export function AdminIntegrations() {
  const t = useT(integrationsMessages);
  const ts = useT(shellMessages);
  const [location, navigate] = useLocation();
  const tab: IntegrationsTab = integrationsTabFromPath(location);
  return (
    <div className="space-y-4">
      <Tabs
        tabs={INTEGRATIONS_TABS.map((id) => ({ id, label: t(TAB_KEYS[id]), icon: TAB_ICONS[id], testId: `integrations-tab-${id}` }))}
        value={tab}
        onChange={(id) => navigate(integrationsTabPath(id))}
        ariaLabel={ts("orgIntegrations")}
        idPrefix="integrations"
        testId="integrations-tabs"
      />
      {tab === "providers" && <ProvidersPanel />}
      {tab === "xphere" && <AdminXphere />}
      {tab === "mcp" && <JourneyMcpCard />}
    </div>
  );
}
