import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Check, KeyRound, Link2 } from "lucide-react";
import { MCP_TOKEN_SCOPES, type McpConnectionItem, type McpTokenCreated, type McpTokenItem } from "@shared/tagsApi";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { CopyButton } from "@/components/xpot/CopyButton";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Input } from "@/components/xpot/Field";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { Pill } from "@/components/xpot/StatusPill";
import { EYEBROW, GLASS_CLASS } from "@/components/xpot/surface";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, getJson, sendJson } from "./api";
import { queryClient } from "@/lib/queryClient";

// Account › Integrations › "AI access (MCP)": two ways for an AI session to
// reach /mcp (the Tags journey, prospecting and tasks, acting as the admin who
// connected it). Apps that connect themselves (Claude, ChatGPT) sign in over
// OAuth and show up under "Connected apps" with what they were granted;
// clients that take a pasted header (Claude Code) use a token, whose secret is
// shown once. Account page: the shared kit only (not the Tags admin's own parts).

/** The outline button that opens a revoke confirmation. */
const DANGER_OUTLINE = "border-red-400/30 text-red-300 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200";

const TOKENS_KEY = [ADMIN_TAGS_KEY, "mcp-tokens"];
const CONNECTIONS_KEY = [ADMIN_TAGS_KEY, "mcp-connections"];

function CopyField({ label, value }: { label: string; value: string }) {
  const t = useT(manageTagsMessages);
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-semibold text-white/60">{label}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-white/80">{value}</code>
        <CopyButton value={value} label={t("copyLabel", { label: label.toLowerCase() })} iconOnly />
      </div>
    </div>
  );
}

/** What an app or token may do, in the same words as the intro. */
const SCOPE_KEYS: Record<string, "scope_journey" | "scope_prospecting" | "scope_tasks"> = {
  "xpot:journey": "scope_journey",
  "xpot:prospecting": "scope_prospecting",
  "xpot:tasks": "scope_tasks",
};

function Scopes({ scopes }: { scopes: readonly string[] }) {
  const ti = useT(integrationsMessages);
  if (!scopes.length) return null;
  return (
    <p className="text-[11px] text-white/45" data-testid="journey-mcp-scopes">
      {ti("scopesLabel")} {scopes.map((scope) => (SCOPE_KEYS[scope] ? ti(SCOPE_KEYS[scope]) : scope)).join(" · ")}
    </p>
  );
}

/**
 * The new token's secret, the endpoint and the command to connect Claude Code.
 * Shown once, so it closes only on an explicit "I've copied it".
 */
function SecretPanel({ created, onClose }: { created: McpTokenCreated; onClose: () => void }) {
  const t = useT(manageTagsMessages);
  const ti = useT(integrationsMessages);
  const endpoint = `${window.location.origin}/mcp`;
  const command = `claude mcp add --transport http xpot ${endpoint} --header "Authorization: Bearer ${created.secret}"`;
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4" data-testid="journey-mcp-secret">
      <p className="text-sm font-semibold text-emerald-200">
        {t("tokenCreatedNotice", { name: created.token.name })}
      </p>
      <CopyField label={t("secretLabel")} value={created.secret} />
      <CopyField label={t("endpointLabel")} value={endpoint} />
      <CopyField label={t("addToClaudeCode")} value={command} />
      <div className="flex flex-wrap items-center gap-3 border-t border-emerald-500/20 pt-3">
        <Button variant="brand" onClick={onClose} data-testid="journey-mcp-secret-done">
          <Check />
          {ti("secretCopied")}
        </Button>
        <span className="text-xs text-emerald-100/60">{ti("secretCopiedHint")}</span>
      </div>
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (created: McpTokenCreated) => void }) {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => sendJson<McpTokenCreated>("POST", "/api/xpot/admin/mcp-tokens", { name: name.trim() }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
      setName("");
      onCreated(created);
    },
    onError: (err) => toast({ title: t("couldNotCreateToken"), description: errorMessage(err), variant: "destructive" }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && !create.isPending) create.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        placeholder={t("tokenNamePlaceholder")}
        aria-label={t("tokenNamePlaceholder")}
        className="sm:flex-1"
        data-testid="journey-mcp-name"
      />
      <Button type="submit" variant="brand" disabled={!name.trim()} loading={create.isPending} data-testid="journey-mcp-create">
        <KeyRound />
        {t("createToken")}
      </Button>
    </form>
  );
}

/** Apps connected over OAuth, with the endpoint to paste into a new one. */
function ConnectedApps() {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  const [revoking, setRevoking] = useState<McpConnectionItem | null>(null);
  const { data: connections, isLoading, isError, error, refetch } = useQuery<McpConnectionItem[]>({
    queryKey: CONNECTIONS_KEY,
    queryFn: () => getJson("/api/xpot/admin/mcp-connections"),
    staleTime: STALE_MS,
  });
  const revoke = useMutation({
    mutationFn: (clientId: string) => sendJson<{ revoked: number }>("POST", `/api/xpot/admin/mcp-connections/${clientId}/revoke`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      setRevoking(null);
      toast({ title: t("connectionRevoked"), variant: "success" });
    },
    onError: (err) => toast({ title: t("couldNotRevokeConnection"), description: errorMessage(err), variant: "destructive" }),
  });
  const appName = (c: McpConnectionItem) => c.clientName || c.redirectHost || t("unnamedApp");

  return (
    <div className="min-w-0 space-y-3" data-testid="journey-mcp-connections">
      <div>
        <h4 className={`flex items-center gap-2 ${EYEBROW}`}>
          <Link2 className="h-3.5 w-3.5" />
          {t("connectedApps")}
        </h4>
        <p className="mt-1 text-xs text-white/40">
          {t("connectedAppsHint")}
        </p>
      </div>
      <CopyField label={t("connectorUrl")} value={`${window.location.origin}/mcp`} />
      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : isError ? (
        <ErrorState compact title={t("connectionsLoadError")} message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : !connections || connections.length === 0 ? (
        <EmptyState compact dense icon={Link2} title={t("noApps")} />
      ) : (
        <ul className="divide-y divide-white/5">
          {connections.map((c) => (
            <li key={`${c.clientId}:${c.userId}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5" data-testid="journey-mcp-connection">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-white">{appName(c)}</p>
                {c.redirectHost && <p className="break-all font-mono text-[11px] text-white/45">{c.redirectHost}</p>}
                <p className="text-[11px] text-white/40">
                  {t("approvedBy", { user: c.userLabel ?? t("deletedUser"), date: formatDateTime(c.connectedAt) })} ·{" "}
                  {c.lastUsedAt ? t("lastUsedAt", { date: formatDateTime(c.lastUsedAt) }) : t("neverUsed")}
                </p>
                <Scopes scopes={c.scopes ?? []} />
              </div>
              <Button variant="outline" size="sm" className={DANGER_OUTLINE} onClick={() => setRevoking(c)} data-testid="journey-mcp-connection-revoke">
                {t("revoke")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t("revokeNamedTitle", { name: revoking ? appName(revoking) : "" })}
        description={t("revokeAppDesc")}
        confirmLabel={t("revoke")}
        destructive
        busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.clientId)}
      />
    </div>
  );
}


export function JourneyMcpCard() {
  const t = useT(manageTagsMessages);
  const ti = useT(integrationsMessages);
  const { toast } = useToast();
  const [created, setCreated] = useState<McpTokenCreated | null>(null);
  const [revoking, setRevoking] = useState<McpTokenItem | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const { data: tokens, isLoading, isError, error, refetch } = useQuery<McpTokenItem[]>({
    queryKey: TOKENS_KEY,
    queryFn: () => getJson("/api/xpot/admin/mcp-tokens"),
    staleTime: STALE_MS,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => sendJson<McpTokenItem>("POST", `/api/xpot/admin/mcp-tokens/${id}/revoke`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
      setRevoking(null);
      toast({ title: t("tokenRevoked"), variant: "success" });
    },
    onError: (err) => toast({ title: t("couldNotRevokeToken"), description: errorMessage(err), variant: "destructive" }),
  });
  const revokedCount = tokens?.filter((tok) => tok.revokedAt).length ?? 0;
  const listed = (tokens ?? []).filter((tok) => showRevoked || !tok.revokedAt);

  return (
    <section className={`rounded-2xl ${GLASS_CLASS} min-w-0 space-y-4 p-4`} data-testid="journey-mcp-card">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Bot className="h-4 w-4 text-white/50" />
          {t("mcpTitle")}
        </h3>
        <p className="mt-1 text-xs text-white/40">
          {ti("mcpIntro")}
        </p>
      </div>

      <ConnectedApps />

      <div className="border-t border-white/5 pt-4">
        <h4 className={`flex items-center gap-2 ${EYEBROW}`}>
          <KeyRound className="h-3.5 w-3.5" />
          {t("tokens")}
        </h4>
        <p className="mt-1 text-xs text-white/40">{t("tokensHint")}</p>
        <Scopes scopes={MCP_TOKEN_SCOPES} />
      </div>
      {created && <SecretPanel created={created} onClose={() => setCreated(null)} />}
      <CreateForm onCreated={setCreated} />

      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : isError ? (
        <ErrorState compact title={t("tokensLoadError")} message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : !tokens || tokens.length === 0 ? (
        <EmptyState compact dense icon={KeyRound} title={t("noTokens")} />
      ) : (
        <>
          {listed.length > 0 && (
            <ul className="divide-y divide-white/5">
              {listed.map((tok) => (
                <li key={tok.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${tok.revokedAt ? "opacity-50" : ""}`} data-testid="journey-mcp-token">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-white">
                      {tok.name}
                      {/* Revoked is finished and out of play: muted, the same as a revoked device. */}
                      {tok.revokedAt && <Pill tone="muted" className="ml-2">{t("tokenRevokedBadge")}</Pill>}
                    </p>
                    <p className="break-all font-mono text-[11px] text-white/45">{tok.tokenPrefix}…</p>
                    <p className="text-[11px] text-white/40">
                      {t("tokenCreatedAt", { date: formatDateTime(tok.createdAt) })} ·{" "}
                      {tok.lastUsedAt ? t("lastUsedAt", { date: formatDateTime(tok.lastUsedAt) }) : t("neverUsed")}
                      {tok.revokedAt ? ` · ${t("tokenRevokedAt", { date: formatDateTime(tok.revokedAt) })}` : ""}
                    </p>
                  </div>
                  {!tok.revokedAt && (
                    <Button variant="outline" size="sm" className={DANGER_OUTLINE} onClick={() => setRevoking(tok)} data-testid="journey-mcp-revoke">
                      {t("revoke")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {revokedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowRevoked((v) => !v)}
              className="min-h-10 text-xs font-semibold text-white/45 hover:text-white/75"
              data-testid="journey-mcp-show-revoked"
            >
              {showRevoked ? ti("hideRevoked") : ti("showRevoked", { count: revokedCount })}
            </button>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t("revokeNamedTitle", { name: revoking?.name ?? "" })}
        description={t("revokeTokenDesc")}
        confirmLabel={t("revoke")}
        destructive
        busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </section>
  );
}
