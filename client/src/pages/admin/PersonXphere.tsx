import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Eye, EyeOff, RotateCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { CopyButton } from "@/components/xpot/CopyButton";
import { ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input } from "@/components/xpot/Field";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { INTEGRATION_TONE, Pill, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { manageMessages, type ManageKey } from "@/i18n/messages/manage";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { isXphereQueryKey, maskInboundKey } from "./integrationsUi";
import { SERVICES_KEY } from "./platform/servicesUi";
import { send, Setting, type Rep } from "./PersonDetail";

const SYNC_STATUS_TONE: Record<string, PillTone> = { synced: "green", pending: "slate", needs_review: "amber", failed: "red" };
const SYNC_STATUS_KEYS: Record<string, ManageKey> = {
  pending: "syncStatus_pending",
  synced: "syncStatus_synced",
  failed: "syncStatus_failed",
  needs_review: "syncStatus_needs_review",
};

// Account › People › one person › Visits · Xphere CRM: their link to the CRM (the platform admin's).

type XphereDetail = {
  userId: string;
  repId: number;
  inboundApiKey: string | null;
  apiUrl: string;
  apiKeySet: boolean;
  isEnabled: boolean;
  lastSync: { status: string; at: string | null; error: string | null } | null;
};

export function XphereConnection({ rep, userId }: { rep: Rep; userId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(integrationsMessages);
  const tm = useT(manageMessages);
  const tc = useT(commonMessages);
  const tw = useT(peopleWorkspaceMessages);
  const key = [`/api/xpot/admin/xphere/${userId}`];
  const query = useQuery<XphereDetail>({ queryKey: key });
  const [token, setToken] = useState("");
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);
  // This person's connection and the Integrations › Xphere list.
  const refresh = () => void queryClient.invalidateQueries({ predicate: (q) => isXphereQueryKey(q.queryKey) });
  const fail = (e: Error) => toast({ title: tm("errorSaving"), description: e.message, variant: "destructive" });

  const put = useMutation({
    mutationFn: (body: { apiKey?: string; isEnabled?: boolean; apiUrl?: string }) => send(`/api/xpot/admin/xphere/${userId}`, body, "PUT"),
    onSuccess: (_d, body) => {
      if (body.isEnabled !== undefined) toast({ title: tw(body.isEnabled ? "syncOnSaved" : "syncOffSaved", { name: rep.displayName }), variant: "success" });
      else toast({ title: t("xphereSavedFor", { name: rep.displayName }), variant: "success" });
      setToken("");
      setApiUrl(null);
      refresh();
      // Integrations › Services and Status count who is connected.
      void queryClient.invalidateQueries({ queryKey: [...SERVICES_KEY] });
    },
    onError: fail,
  });
  const rotate = useMutation({
    mutationFn: () => send(`/api/xpot/admin/xphere/${userId}/rotate-inbound-key`),
    onSuccess: () => {
      setRotating(false);
      setRevealed(true);
      toast({ title: t("keyRotated", { name: rep.displayName }), variant: "success" });
      refresh();
    },
    onError: (e: Error) => {
      setRotating(false);
      fail(e);
    },
  });

  if (query.isLoading) return <ListSkeleton rows={2} rowClassName="h-11 rounded-xl" />;
  if (query.isError || !query.data) return <ErrorState compact message={tw("xphereLoadFailed")} onRetry={() => void query.refetch()} />;
  const x = query.data;
  const tokenTone = INTEGRATION_TONE[x.apiKeySet ? (x.isEnabled ? "live" : "idle") : "off"];
  const sync = x.lastSync;
  const endpoint = `${window.location.origin}/api/xpot/inbound`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pill tone={tokenTone}>{x.apiKeySet ? t("tokenSaved") : t("noToken")}</Pill>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-white/70">
          {t("xphereEnabled")}
          <Switch checked={x.isEnabled} disabled={put.isPending} onCheckedChange={(on) => put.mutate({ isEnabled: on })} data-testid="person-xphere-enabled" />
        </label>
      </div>

      <Setting label={t("inboundKey")}>
        {x.inboundApiKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 font-mono text-xs text-white/75" data-testid="person-xphere-key">
              {revealed ? x.inboundApiKey : maskInboundKey(x.inboundApiKey)}
            </code>
            <Button variant="secondary" size="icon" onClick={() => setRevealed((v) => !v)} aria-label={revealed ? t("hideKey") : t("revealKey")} title={revealed ? t("hideKey") : t("revealKey")}>
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
            <CopyButton value={x.inboundApiKey} label={t("copyKey")} iconOnly />
            <Button variant="secondary" size="sm" onClick={() => setRotating(true)} loading={rotate.isPending}>
              <RotateCw />
              {t("rotateKey")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-white/40">{t("noInboundKeyYet")}</p>
        )}
      </Setting>

      <Setting label={t("xphereEndpoint")}>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 font-mono text-xs text-white/75" data-testid="person-xphere-endpoint">{endpoint}</code>
          <CopyButton value={endpoint} label={t("copyAddress")} iconOnly />
        </div>
      </Setting>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label={t("outboundToken")} className="min-w-0 flex-1">
          <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={x.apiKeySet ? t("keepCurrentToken") : "xph_..."} />
        </Field>
        <Button variant="brand" disabled={!token.trim()} loading={put.isPending && !!token} onClick={() => put.mutate({ apiKey: token.trim() })}>
          {tc("save")}
        </Button>
      </div>

      <details className="group rounded-xl border border-white/[0.07]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-white/60 marker:content-none">
          {t("advanced")}
          <span className="text-base font-light text-white/35 transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="flex flex-col gap-2 border-t border-white/[0.07] p-3 sm:flex-row sm:items-end">
          <Field label={t("apiUrl")} hint={t("apiUrlHint")} className="min-w-0 flex-1">
            <Input value={apiUrl ?? x.apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://xphere.app" />
          </Field>
          <Button variant="secondary" disabled={apiUrl === null || apiUrl.trim() === x.apiUrl} loading={put.isPending && apiUrl !== null} onClick={() => put.mutate({ apiUrl: (apiUrl ?? "").trim() })}>
            {tc("save")}
          </Button>
        </div>
      </details>

      <Setting label={tw("lastSync")}>
        {sync ? (
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm text-white/70">
              <Pill tone={toneOf(SYNC_STATUS_TONE, sync.status, "amber")}>{SYNC_STATUS_KEYS[sync.status] ? tm(SYNC_STATUS_KEYS[sync.status]) : sync.status}</Pill>
              {sync.at ? formatDateTime(sync.at) : null}
            </p>
            {sync.error && <p className="break-words text-xs text-red-300">{sync.error}</p>}
          </div>
        ) : (
          <p className="text-xs text-white/40">{tw("noSyncYet")}</p>
        )}
      </Setting>

      <Link href="/admin/integrations/xphere" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200">
        {tw("allConnections")}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>

      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title={t("rotateTitle", { name: rep.displayName })}
        description={t("rotateBody")}
        confirmLabel={t("rotateKey")}
        destructive
        busy={rotate.isPending}
        onConfirm={() => rotate.mutate()}
      />
    </div>
  );
}
