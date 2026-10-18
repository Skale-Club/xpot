import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { Copy, Eye, EyeOff, RotateCcw, Webhook } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { maskInboundKey, visibleXphereRows, type XphereRow } from "./integrationsUi";

const XPHERE_KEY = ["/api/xpot/admin/xphere"];
const FIELD =
  "w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50";
const ICON_BTN =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40";
const CHIP = "rounded-md px-2 py-0.5 text-[11px]";

function useCopy() {
  const { toast } = useToast();
  const t = useT(integrationsMessages);
  const tc = useT(commonMessages);
  return (value: string) =>
    navigator.clipboard?.writeText(value).then(
      () => toast({ title: tc("copied") }),
      () => toast({ title: t("couldNotCopy"), variant: "destructive" }),
    );
}

/** Account › Integrations › Xphere: each person's link to the Xphere CRM, set by the global admin. */
export function AdminXphere() {
  const query = useQuery<XphereRow[]>({ queryKey: XPHERE_KEY });
  const t = useT(integrationsMessages);
  const tc = useT(commonMessages);
  const copy = useCopy();
  const [showAll, setShowAll] = useState(false);
  const endpoint = `${window.location.origin}/api/xpot/inbound`;

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
        {t("xphereLoadFailed")}
        <button type="button" onClick={() => void query.refetch()} className="rounded-lg border border-white/10 px-3 py-1 text-white/70 hover:bg-white/5">
          {tc("retry")}
        </button>
      </div>
    );
  }

  const rows = visibleXphereRows(query.data, showAll);

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="flex items-start gap-2 text-sm text-white/60">
          <Webhook className="mt-0.5 h-4 w-4 shrink-0" />
          {t("xphereIntro")}
        </p>
        <div>
          <p className="mb-1 text-xs font-medium text-white/50">{t("xphereEndpoint")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-xs text-white/75" data-testid="xphere-endpoint">
              {endpoint}
            </code>
            <button type="button" onClick={() => void copy(endpoint)} className={ICON_BTN} aria-label={t("copyAddress")} title={t("copyAddress")}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-white/70">
          <Switch checked={showAll} onCheckedChange={setShowAll} data-testid="xphere-show-all" />
          {t("showAll")}
        </label>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-white/40">{query.data.length && !showAll ? t("noRepsHidden") : t("noRepsYet")}</p>
      )}
      {rows.map((row) => (
        <XphereRowCard key={row.repId} row={row} />
      ))}
    </div>
  );
}

function XphereRowCard({ row }: { row: XphereRow }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(integrationsMessages);
  const tm = useT(manageMessages);
  const tc = useT(commonMessages);
  const copy = useCopy();
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState(row.apiUrl);
  const [isEnabled, setIsEnabled] = useState(row.isEnabled);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const editable = Boolean(row.userId) && !row.deleted;
  const dirty = apiKey.trim() !== "" || apiUrl.trim() !== row.apiUrl || isEnabled !== row.isEnabled;
  const labels: Record<string, string> = { apiUrl: t("apiUrl"), apiKey: t("outboundToken") };

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
      queryClient.invalidateQueries({ queryKey: XPHERE_KEY });
    },
    onError: (e: Error) => toast({ title: tm("errorSaving"), description: describeApiError(e, (path) => labels[path]), variant: "destructive" }),
  });

  const rotate = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/xpot/admin/xphere/${row.userId}/rotate-inbound-key`)).json(),
    onSuccess: () => {
      toast({ title: t("keyRotated", { name: row.displayName }), variant: "success" });
      setRotating(false);
      setRevealed(true);
      queryClient.invalidateQueries({ queryKey: XPHERE_KEY });
    },
    onError: (e: Error) => {
      setRotating(false);
      toast({ title: tm("error"), description: describeApiError(e), variant: "destructive" });
    },
  });

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${editable ? "" : "opacity-60"}`} data-testid={`xphere-${row.repId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{row.displayName}</h3>
            <span className={`${CHIP} ${row.apiKeySet ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/40"}`}>
              {row.apiKeySet ? t("tokenSaved") : t("noToken")}
            </span>
            {row.access === "blocked" && <span className={`${CHIP} bg-red-500/15 text-red-300`}>{t("statusBlocked")}</span>}
            {row.access === "pending" && <span className={`${CHIP} bg-amber-500/15 text-amber-300`}>{t("statusPending")}</span>}
            {!row.usesVisits && <span className={`${CHIP} bg-white/10 text-white/50`}>{t("statusTagsOnly")}</span>}
          </div>
          <p className="mt-1 text-xs text-white/40">{row.email ?? "—"}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-white/70">
          {t("xphereEnabled")}
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} disabled={!editable} />
        </label>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-white/50">{t("inboundKey")}</label>
        {row.inboundApiKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-xs text-white/70" data-testid={`xphere-key-${row.repId}`}>
              {revealed ? row.inboundApiKey : maskInboundKey(row.inboundApiKey)}
            </code>
            <button type="button" onClick={() => setRevealed((v) => !v)} className={ICON_BTN} aria-label={revealed ? t("hideKey") : t("revealKey")} title={revealed ? t("hideKey") : t("revealKey")}>
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={() => void copy(row.inboundApiKey!)} className={ICON_BTN} aria-label={t("copyKey")} title={t("copyKey")}>
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setRotating(true)} disabled={!editable || rotate.isPending} className={ICON_BTN} data-testid={`xphere-rotate-${row.repId}`}>
              <RotateCcw className="h-3.5 w-3.5" />
              {t("rotateKey")}
            </button>
          </div>
        ) : (
          <p className="text-xs text-white/40">{t("noInboundKeyYet")}</p>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-white/50">{t("outboundToken")}</label>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={row.apiKeySet ? t("keepCurrentToken") : "xph_..."}
            disabled={!editable}
            className={FIELD}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-white/50">{t("apiUrl")}</label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://xphere.app"
            disabled={!editable}
            className={FIELD}
          />
          <p className="mt-1 text-[11px] text-white/35">{t("apiUrlHint")}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !editable || !dirty}
          title={!row.userId ? t("repNoUser") : ""}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {tc("save")}
        </button>
        {dirty && <span className="text-xs text-amber-300">{t("unsavedChanges")}</span>}
      </div>

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
