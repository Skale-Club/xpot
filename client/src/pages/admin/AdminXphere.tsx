import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { CopyButton } from "@/components/xpot/CopyButton";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input } from "@/components/xpot/Field";
import { FilterBar, FilterSearch, FilterToggle } from "@/components/xpot/filters";
import { FormFooter } from "@/components/xpot/FormFooter";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { INTEGRATION_TONE, Pill } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { Eye, EyeOff, RotateCw, Users, Webhook } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { isXphereQueryKey, maskInboundKey, visibleXphereRows, type XphereRow } from "./integrationsUi";

const XPHERE_KEY = ["/api/xpot/admin/xphere"];
/** The read-only value boxes (endpoint, inbound key): the field's shape without being editable. */
const CODE_BOX = "min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 font-mono text-xs text-white/75";

/** Name or email contains the search (any case). */
function matches(row: XphereRow, search: string) {
  const q = search.trim().toLowerCase();
  return !q || [row.displayName, row.email].some((value) => value?.toLowerCase().includes(q));
}

/** Account › Integrations › Xphere: each person's link to the Xphere CRM, set by the global admin. */
export function AdminXphere() {
  const query = useQuery<XphereRow[]>({ queryKey: XPHERE_KEY });
  const t = useT(integrationsMessages);
  const tm = useT(manageMessages);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const endpoint = `${window.location.origin}/api/xpot/inbound`;
  const visible = visibleXphereRows(query.data ?? [], showAll);
  const rows = visible.filter((row) => matches(row, search));
  const page = usePagedList(rows, { resetKey: `${search}|${showAll}` });

  if (query.isLoading) return <ListSkeleton rows={3} rowClassName="h-40 rounded-2xl" />;
  if (query.isError || !query.data) {
    return <ErrorState message={t("xphereLoadFailed")} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className={`space-y-3 rounded-2xl ${GLASS_CLASS} p-5`}>
        <p className="flex items-start gap-2 text-sm text-white/60">
          <Webhook className="mt-0.5 h-4 w-4 shrink-0" />
          {t("xphereIntro")}
        </p>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-white/60">{t("xphereEndpoint")}</p>
          <div className="flex items-center gap-2">
            <code className={CODE_BOX} data-testid="xphere-endpoint">
              {endpoint}
            </code>
            <CopyButton value={endpoint} label={t("copyAddress")} iconOnly />
          </div>
        </div>
      </div>

      <FilterBar
        search={<FilterSearch value={search} onChange={setSearch} placeholder={tm("searchPeople")} testId="xphere-search" />}
        controls={<FilterToggle pressed={showAll} onChange={setShowAll} label={t("showAll")} testId="xphere-show-all" />}
        summary={{ active: search.trim() !== "", shown: rows.length, total: visible.length, onClear: () => setSearch("") }}
      />

      {rows.length === 0 && (
        <EmptyState
          compact
          icon={Users}
          title={search.trim() ? tm("noPeopleMatch") : query.data.length && !showAll ? t("noRepsHidden") : t("noRepsYet")}
        />
      )}
      {page.visible.map((row) => (
        <XphereRowCard key={row.repId} row={row} />
      ))}
      <ListPager shown={page.shown} total={page.total} hasMore={page.hasMore} onMore={page.showMore} />
    </div>
  );
}

function XphereRowCard({ row }: { row: XphereRow }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(integrationsMessages);
  const tm = useT(manageMessages);
  const tc = useT(commonMessages);
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState(row.apiUrl);
  const [isEnabled, setIsEnabled] = useState(row.isEnabled);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const editable = Boolean(row.userId) && !row.deleted;
  const dirty = apiKey.trim() !== "" || apiUrl.trim() !== row.apiUrl || isEnabled !== row.isEnabled;
  const labels: Record<string, string> = { apiUrl: t("apiUrl"), apiKey: t("outboundToken") };
  // The token chip reads like an integration: saved and switched on is live, saved but off is idle.
  const tokenTone = INTEGRATION_TONE[row.apiKeySet ? (row.isEnabled ? "live" : "idle") : "off"];
  const reset = () => {
    setApiKey("");
    setApiUrl(row.apiUrl);
    setIsEnabled(row.isEnabled);
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { isEnabled, apiUrl: apiUrl.trim() };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const res = await apiRequest("PUT", `/api/xpot/admin/xphere/${row.userId}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("xphereSavedFor", { name: row.displayName }), variant: "success" });
      setApiKey("");
      // The list and the person's own view in People (its key is per user).
      void queryClient.invalidateQueries({ predicate: (q) => isXphereQueryKey(q.queryKey) });
    },
    onError: (e: Error) => toast({ title: tm("errorSaving"), description: describeApiError(e, (path) => labels[path]), variant: "destructive" }),
  });

  const rotate = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/xpot/admin/xphere/${row.userId}/rotate-inbound-key`)).json(),
    onSuccess: () => {
      toast({ title: t("keyRotated", { name: row.displayName }), variant: "success" });
      setRotating(false);
      setRevealed(true);
      // The list and the person's own view in People (its key is per user).
      void queryClient.invalidateQueries({ predicate: (q) => isXphereQueryKey(q.queryKey) });
    },
    onError: (e: Error) => {
      setRotating(false);
      toast({ title: tm("error"), description: describeApiError(e), variant: "destructive" });
    },
  });

  return (
    <div className={`rounded-2xl ${GLASS_CLASS} p-5 ${editable ? "" : "opacity-60"}`} data-testid={`xphere-${row.repId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{row.displayName}</h3>
            <Pill tone={tokenTone}>{row.apiKeySet ? t("tokenSaved") : t("noToken")}</Pill>
            {row.access === "blocked" && <Pill tone="red">{t("statusBlocked")}</Pill>}
            {row.access === "pending" && <Pill tone="amber">{t("statusPending")}</Pill>}
            {!row.usesVisits && <Pill tone="slate">{t("statusTagsOnly")}</Pill>}
          </div>
          <p className="mt-1 text-xs text-white/40">{row.email ?? "—"}</p>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-white/70">
          {t("xphereEnabled")}
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} disabled={!editable} />
        </label>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-semibold text-white/60">{t("inboundKey")}</p>
        {row.inboundApiKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className={CODE_BOX} data-testid={`xphere-key-${row.repId}`}>
              {revealed ? row.inboundApiKey : maskInboundKey(row.inboundApiKey)}
            </code>
            <Button variant="secondary" size="sm" className="w-9 px-0" onClick={() => setRevealed((v) => !v)} aria-label={revealed ? t("hideKey") : t("revealKey")} title={revealed ? t("hideKey") : t("revealKey")}>
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
            <CopyButton value={row.inboundApiKey} label={t("copyKey")} iconOnly />
            <Button variant="secondary" size="sm" onClick={() => setRotating(true)} disabled={!editable} loading={rotate.isPending} data-testid={`xphere-rotate-${row.repId}`}>
              <RotateCw />
              {t("rotateKey")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-white/40">{t("noInboundKeyYet")}</p>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t("outboundToken")}>
          <Input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={row.apiKeySet ? t("keepCurrentToken") : "xph_..."}
            disabled={!editable}
          />
        </Field>
        <Field label={t("apiUrl")} hint={t("apiUrlHint")}>
          <Input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://xphere.app"
            disabled={!editable}
          />
        </Field>
      </div>

      <FormFooter dirty={dirty} onCancel={dirty ? reset : undefined} className="mt-4">
        <Button
          variant="brand"
          onClick={() => save.mutate()}
          disabled={!editable || !dirty}
          loading={save.isPending}
          title={!row.userId ? t("repNoUser") : undefined}
        >
          {tc("save")}
        </Button>
      </FormFooter>

      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title={t("rotateTitle", { name: row.displayName })}
        description={t("rotateBody")}
        confirmLabel={t("rotateKey")}
        destructive
        busy={rotate.isPending}
        onConfirm={() => rotate.mutate()}
      />
    </div>
  );
}
