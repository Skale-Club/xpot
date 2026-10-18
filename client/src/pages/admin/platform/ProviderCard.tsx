import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { KeyRound, Server, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { Field, Input } from "@/components/xpot/Field";
import { FormFooter } from "@/components/xpot/FormFooter";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { INTEGRATION_TONE, Pill } from "@/components/xpot/StatusPill";
import { DANGER_OUTLINE, GLASS_CLASS } from "@/components/xpot/surface";
import {
  isConfigFieldKey,
  type IntegrationProviderDef,
  type IntegrationStatus,
  type ServiceStatus,
} from "@shared/integrations-registry";
import { useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { platformAdminMessages } from "@/i18n/messages/platformAdmin";
import { systemHealthMessages } from "@/i18n/messages/systemHealth";
import { useAgo } from "../systemHealthUi";
import { integrationStatusKey, locksOutSignIn, type StatusKey } from "../integrationsUi";
import { SearchableSelect } from "./SearchableSelect";
import { SERVICES_KEY, serviceAnchor } from "./servicesUi";
import { useReportUnsaved } from "../unsavedEdits";

// One provider of the Integrations hub: what it is, whether it works (the same
// status, source, last test and last error Status shows), what stops if it is
// off, and its settings with Test, Save, Replace key and Remove key.

export type IntegrationsResponse = { providers: IntegrationProviderDef[]; status: IntegrationStatus[] };
export const INTEGRATIONS_KEY = ["/api/xpot/admin/integrations"];

type IntT = Translate<typeof integrationsMessages.en>;
type IntKey = keyof typeof integrationsMessages.en;
type PlatKey = keyof typeof platformAdminMessages.en;

export const STATUS_LABEL_KEYS = {
  live: "intStatus_live",
  broken: "intStatus_broken",
  idle: "intStatus_idle",
  off: "intStatus_off",
} as const satisfies Record<StatusKey, IntKey>;

// The registry is shared with the server and written in English; these keys give the
// screen its words. A provider or field missing here shows the registry's text.
const DESCRIPTION_KEYS: Record<string, IntKey> = {
  google_places: "descGooglePlaces",
  groq: "descGroq",
  openai: "descOpenai",
  openrouter: "descOpenrouter",
  gemini: "descGemini",
  gohighlevel: "descGohighlevel",
  twilio: "descTwilio",
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

function providerDescription(t: IntT, def: IntegrationProviderDef) {
  const key = DESCRIPTION_KEYS[def.provider];
  return key ? t(key) : def.description;
}

function fieldLabel(t: IntT, label: string) {
  const key = FIELD_LABEL_KEYS[label];
  return key ? t(key) : label;
}

function problemText(t: IntT, status: IntegrationStatus) {
  return status.problemCode ? t(`problem_${status.problemCode}`) : status.problem;
}

function savedFieldValue(key: IntegrationProviderDef["fields"][number]["key"], status: IntegrationStatus) {
  if (key === "model") return status.model ?? "";
  if (key === "locationId") return status.locationId ?? "";
  if (key === "calendarId") return status.calendarId ?? "";
  if (isConfigFieldKey(key)) return status.config?.[key] ?? "";
  return "";
}

type PlatT = Translate<typeof platformAdminMessages.en>;
const hasKey = (key: string): key is PlatKey => key in platformAdminMessages.en;

/** A service's short name (Status rows, the attention list); the id when the screen has no word for it. */
export function serviceName(tp: PlatT, id: string) {
  const key = `svc_${id}`;
  return hasKey(key) ? tp(key) : id;
}

/** What is configured, e.g. file storage "Cloudflare R2" or "Supabase (fallback)". */
export function variantName(tp: PlatT, variant: string) {
  const key = `variant_${variant}`;
  return hasKey(key) ? tp(key) : variant;
}

/** A label over a value, for the card's "is it working" lines. */
export function Meta({ label, children, tone }: { label: string; children: ReactNode; tone?: "bad" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/40">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm ${tone === "bad" ? "text-red-300" : "text-white/75"}`}>{children}</dd>
    </div>
  );
}

/** Last test / last error lines, shared with the Xphere and assistants summaries. */
export function useServiceLines() {
  const tp = useT(platformAdminMessages);
  const ago = useAgo(useT(systemHealthMessages));
  return {
    lastTest: (service: ServiceStatus | undefined) =>
      service?.lastTest
        ? tp(service.lastTest.ok ? "lastTestOk" : "lastTestFailed", { time: ago(service.lastTest.at) })
        : tp("neverTested"),
    lastError: (service: ServiceStatus | undefined) =>
      service?.lastError ? `${ago(service.lastError.at)} · ${service.lastError.message}` : null,
    ago,
  };
}

export function ProviderCard({
  def,
  status,
  service,
  badges,
}: {
  def: IntegrationProviderDef;
  status: IntegrationStatus;
  service: ServiceStatus | undefined;
  /** Extra pills after the name ("In use now"). */
  badges?: ReactNode;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(integrationsMessages);
  const tp = useT(platformAdminMessages);
  const tm = useT(manageMessages);
  const tc = useT(commonMessages);
  const lines = useServiceLines();
  // The job is the section's title, so the card is just the vendor ("Groq", "Twilio").
  const label = serviceName(tp, def.provider);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<boolean>(status.enabled);
  const [replacingKey, setReplacingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirming, setConfirming] = useState<"signInOff" | "removeKey" | null>(null);
  const secretField = def.fields.find((f) => f.secret);
  const statusKey = integrationStatusKey(status);
  const hasApiKeyForTest = Boolean(fields.apiKey?.trim() || status.hasApiKey);

  // The switch follows the saved state after a save or a refetch.
  useEffect(() => {
    setEnabled(status.enabled);
  }, [status.enabled]);

  const fieldsDirty = def.fields.some((f) => {
    const value = fields[f.key];
    if (value === undefined) return false;
    if (f.secret) return value.trim() !== "";
    return value !== savedFieldValue(f.key, status);
  });
  const dirty = fieldsDirty || enabled !== status.enabled;
  useReportUnsaved(`provider:${def.provider}`, dirty);

  const labelOfPath = (path: string) => {
    const field = def.fields.find((f) => f.key === path);
    return field ? fieldLabel(t, field.label) : null;
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: [...SERVICES_KEY] });
  };

  const save = useMutation({
    mutationFn: async (opts: { clearApiKey?: boolean } = {}) => {
      const body: Record<string, unknown> = opts.clearApiKey ? { enabled: false, clearApiKey: true } : { enabled };
      if (!opts.clearApiKey) {
        for (const f of def.fields) {
          const v = fields[f.key];
          if (v === undefined) continue;
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
      setReplacingKey(false);
      setConfirming(null);
      queryClient.setQueryData<IntegrationsResponse>(INTEGRATIONS_KEY, (current) =>
        current ? { ...current, status: current.status.map((item) => (item.provider === savedStatus.provider ? savedStatus : item)) } : current,
      );
      refresh();
    },
    onError: (e: Error) => {
      setConfirming(null);
      toast({ title: tm("errorSaving"), description: describeApiError(e, labelOfPath), variant: "destructive" });
    },
  });

  const reset = () => {
    setFields({});
    setEnabled(status.enabled);
    setReplacingKey(false);
    setTestResult(null);
  };
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
        if (value) body[f.key] = value;
      }
      const res = await apiRequest("POST", `/api/xpot/admin/integrations/${def.provider}/test`, body);
      return res.json() as Promise<{ ok: boolean; message: string }>;
    },
    onSuccess: (r) => {
      setTestResult(r);
      // The result is kept as this provider's "last test" (and Status shows it).
      void queryClient.invalidateQueries({ queryKey: [...SERVICES_KEY] });
    },
    onError: (e: Error) =>
      setTestResult({ ok: false, message: t("networkError", { message: describeApiError(e, labelOfPath) || t("requestFailedShort") }) }),
  });

  const setField = (key: string, value: string) => {
    setTestResult(null);
    setFields((prev) => ({ ...prev, [key]: value }));
  };
  const lastError = lines.lastError(service);
  const impactKey = `impact_${def.provider}`;

  return (
    <section id={serviceAnchor(def.provider)} className={`scroll-mt-24 rounded-2xl ${GLASS_CLASS} p-4 sm:p-5`} data-testid={`integration-card-${def.provider}`}>
      {/* Header: name, status and what it is for */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white">{label}</h3>
            <Pill tone={INTEGRATION_TONE[statusKey] ?? "slate"} dot>{t(STATUS_LABEL_KEYS[statusKey])}</Pill>
            {def.requiredForSignIn && <Pill tone="amber" bordered>{tp("required")}</Pill>}
            {def.legacy && <Pill tone="muted">{t("legacyBadge")}</Pill>}
            {badges}
          </div>
          <p className="mt-1.5 text-sm text-white/55">{providerDescription(t, def)}</p>
        </div>
        <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-3 text-sm text-white/70">
          <span className={enabled ? "text-white/80" : "text-white/40"}>{enabled ? tm("enabled") : tm("disabled")}</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t("toggleProvider", { name: label })} />
        </label>
      </div>

      {/* Is it working: the same lines as on Status */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-white/[0.06] bg-black/10 p-3 lg:grid-cols-4">
        <Meta label={tp("source")}>{tp(`source_${status.source}`)}</Meta>
        <Meta label={tp("lastTest")} tone={service?.lastTest && !service.lastTest.ok ? "bad" : undefined}>{lines.lastTest(service)}</Meta>
        {lastError && (
          <div className="col-span-2 lg:col-span-1">
            <Meta label={tp("lastError")} tone="bad">
              {service?.lastError?.eventId ? (
                <Link href={`/admin/health/events/${service.lastError.eventId}`} className="underline-offset-2 hover:underline">{lastError}</Link>
              ) : (
                lastError
              )}
            </Meta>
          </div>
        )}
        {hasKey(impactKey) && (
          <div className={lastError ? "col-span-2 lg:col-span-1" : "col-span-2"}>
            <Meta label={tp("ifOff")}>{tp(impactKey)}</Meta>
          </div>
        )}
      </dl>

      {status.source === "env" && (
        <InlineAlert tone="info" icon={Server} title={t("envSourceTitle")} className="mt-4">
          {t(def.envMode === "override" ? "envSourceOverride" : "envSourceFallback")}
        </InlineAlert>
      )}
      {status.enabled && status.problem && (
        <InlineAlert tone="error" title={t("setupIncomplete")} className="mt-4">
          {problemText(t, status)}
        </InlineAlert>
      )}

      {/* Settings */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {def.fields.map((f) => {
          const fieldName = <>{fieldLabel(t, f.label)} {f.optional && <span className="font-normal text-white/30">({tm("optional")})</span>}</>;
          if (f.secret && status.hasApiKey && !replacingKey) {
            // A saved key is a line with its last 4 and "Replace key", never a field that empties on focus.
            return (
              <Field key={f.key} className={def.fields.length === 1 ? "sm:col-span-2" : ""} label={fieldName}>
                <div className="flex min-h-11 flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm text-white/70">
                    <KeyRound className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
                    {tp("keySavedLast4", { last4: status.apiKeyLast4 ?? "••••" })}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => setReplacingKey(true)} data-testid={`integration-replace-key-${def.provider}`}>
                    {tp("replaceKey")}
                  </Button>
                </div>
              </Field>
            );
          }
          return (
            <Field key={f.key} className={def.fields.length === 1 ? "sm:col-span-2" : ""} label={fieldName}>
              {f.options ? (
                <SearchableSelect
                  value={fields[f.key] ?? savedFieldValue(f.key, status)}
                  placeholder={f.placeholder ?? ""}
                  options={f.options}
                  onChange={(value) => setField(f.key, value)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type={f.secret ? "password" : "text"}
                    autoComplete="off"
                    autoFocus={f.secret && replacingKey}
                    value={fields[f.key] ?? savedFieldValue(f.key, status)}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.placeholder ?? ""}
                  />
                  {f.secret && replacingKey && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setReplacingKey(false);
                        setFields(({ [f.key]: _dropped, ...rest }) => rest);
                      }}
                    >
                      {tp("keepKey")}
                    </Button>
                  )}
                </div>
              )}
            </Field>
          );
        })}
      </div>

      {testResult && (
        <InlineAlert tone={testResult.ok ? "success" : "error"} className="mt-4">
          <span className="block whitespace-pre-wrap break-words">{testResult.message}</span>
        </InlineAlert>
      )}

      {/* Test and Remove key on the left, Cancel and Save on the right */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => test.mutate()}
          disabled={!hasApiKeyForTest}
          loading={test.isPending}
          title={!hasApiKeyForTest ? t("testNeedsKey") : t("testCredentials")}
          data-testid={`integration-test-${def.provider}`}
        >
          {t("test")}
        </Button>
        {status.hasApiKey && secretField && (
          <Button
            variant="outline"
            className={DANGER_OUTLINE}
            onClick={() => setConfirming("removeKey")}
            disabled={save.isPending}
            data-testid="integration-remove-key"
          >
            <Trash2 />
            {t("removeKey")}
          </Button>
        )}
        <FormFooter dirty={dirty} onCancel={dirty ? reset : undefined} className="ml-auto">
          <Button variant="brand" onClick={requestSave} disabled={!dirty} loading={save.isPending} data-testid="integration-save">
            {tc("save")}
          </Button>
        </FormFooter>
      </div>

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
