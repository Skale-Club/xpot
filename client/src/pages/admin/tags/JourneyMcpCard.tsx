import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Check, Copy, KeyRound, Link2, X } from "lucide-react";
import type { McpConnectionItem, McpTokenCreated, McpTokenItem } from "@shared/tagsApi";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDateTime, getJson, sendJson } from "./api";
import { BTN, BTN_DANGER, CARD, INPUT } from "./ui";
import { ConfirmDialog, ErrorLine } from "./batches-shared";
import { Loading } from "./pieces-shared";
import { queryClient } from "@/lib/queryClient";

// "AI access (MCP)": two ways for an AI session to reach /mcp and read and
// record the journey. Apps that connect themselves (Claude, ChatGPT) sign in
// over OAuth and show up under "Connected apps"; clients that take a pasted
// header (Claude Code) use a token, whose secret is shown once.

const TOKENS_KEY = [ADMIN_TAGS_KEY, "mcp-tokens"];
const CONNECTIONS_KEY = [ADMIN_TAGS_KEY, "mcp-connections"];

function CopyField({ label, value }: { label: string; value: string }) {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-lg bg-black/30 px-2 py-1.5 text-xs text-white/80">{value}</code>
        <button
          type="button"
          aria-label={t("copyLabel", { label: label.toLowerCase() })}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => toast({ title: t("couldNotCopy"), variant: "destructive" }),
            );
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

/** The new token's secret, the endpoint and the command to connect Claude Code. Shown once. */
function SecretPanel({ created, onClose }: { created: McpTokenCreated; onClose: () => void }) {
  const t = useT(manageTagsMessages);
  const endpoint = `${window.location.origin}/mcp`;
  const command = `claude mcp add --transport http xpot ${endpoint} --header "Authorization: Bearer ${created.secret}"`;
  return (
    <div className="relative space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4" data-testid="journey-mcp-secret">
      <button type="button" onClick={onClose} aria-label={t("hideSecret")} className="absolute right-3 top-3 rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white">
        <X className="h-4 w-4" />
      </button>
      <p className="pr-8 text-sm font-semibold text-emerald-200">
        {t("tokenCreatedNotice", { name: created.token.name })}
      </p>
      <CopyField label={t("secretLabel")} value={created.secret} />
      <CopyField label={t("endpointLabel")} value={endpoint} />
      <CopyField label={t("addToClaudeCode")} value={command} />
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
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        placeholder={t("tokenNamePlaceholder")}
        className={`${INPUT} sm:flex-1`}
        data-testid="journey-mcp-name"
      />
      <button type="submit" className={BTN} disabled={!name.trim() || create.isPending} data-testid="journey-mcp-create">
        <KeyRound className="h-4 w-4" />
        {create.isPending ? t("creating") : t("createToken")}
      </button>
    </form>
  );
}

/** Apps connected over OAuth, with the endpoint to paste into a new one. */
function ConnectedApps() {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  const [revoking, setRevoking] = useState<McpConnectionItem | null>(null);
  const { data: connections, isLoading, isError, error } = useQuery<McpConnectionItem[]>({
    queryKey: CONNECTIONS_KEY,
    queryFn: () => getJson("/api/xpot/admin/mcp-connections"),
    staleTime: STALE_MS,
  });
  const revoke = useMutation({
    mutationFn: (clientId: string) => sendJson<{ revoked: number }>("POST", `/api/xpot/admin/mcp-connections/${clientId}/revoke`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      setRevoking(null);
      toast({ title: t("connectionRevoked") });
    },
    onError: (err) => toast({ title: t("couldNotRevokeConnection"), description: errorMessage(err), variant: "destructive" }),
  });
  const appName = (c: McpConnectionItem) => c.clientName || c.redirectHost || t("unnamedApp");

  return (
    <div className="min-w-0 space-y-3" data-testid="journey-mcp-connections">
      <div>
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
          <Link2 className="h-3.5 w-3.5" />
          {t("connectedApps")}
        </h4>
        <p className="mt-1 text-xs text-white/40">
          {t("connectedAppsHint")}
        </p>
      </div>
      <CopyField label={t("connectorUrl")} value={`${window.location.origin}/mcp`} />
      {isLoading ? (
        <Loading className="py-4" />
      ) : isError ? (
        <ErrorLine>{t("connectionsLoadError")} {errorMessage(error)}</ErrorLine>
      ) : !connections || connections.length === 0 ? (
        <p className="text-sm text-white/40">{t("noApps")}</p>
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
              </div>
              <button type="button" className={BTN_DANGER} onClick={() => setRevoking(c)} data-testid="journey-mcp-connection-revoke">
                {t("revoke")}
              </button>
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
  const { toast } = useToast();
  const [created, setCreated] = useState<McpTokenCreated | null>(null);
  const [revoking, setRevoking] = useState<McpTokenItem | null>(null);
  const { data: tokens, isLoading, isError, error } = useQuery<McpTokenItem[]>({
    queryKey: TOKENS_KEY,
    queryFn: () => getJson("/api/xpot/admin/mcp-tokens"),
    staleTime: STALE_MS,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => sendJson<McpTokenItem>("POST", `/api/xpot/admin/mcp-tokens/${id}/revoke`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
      setRevoking(null);
      toast({ title: t("tokenRevoked") });
    },
    onError: (err) => toast({ title: t("couldNotRevokeToken"), description: errorMessage(err), variant: "destructive" }),
  });

  return (
    <section className={`${CARD} min-w-0 space-y-4 p-4`} data-testid="journey-mcp-card">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Bot className="h-4 w-4 text-white/50" />
          {t("mcpTitle")}
        </h3>
        <p className="mt-1 text-xs text-white/40">
          {t("mcpIntro")}
        </p>
      </div>

      <ConnectedApps />

      <div className="border-t border-white/5 pt-4">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
          <KeyRound className="h-3.5 w-3.5" />
          {t("tokens")}
        </h4>
        <p className="mt-1 text-xs text-white/40">{t("tokensHint")}</p>
      </div>
      {created && <SecretPanel created={created} onClose={() => setCreated(null)} />}
      <CreateForm onCreated={setCreated} />

      {isLoading ? (
        <Loading className="py-6" />
      ) : isError ? (
        <ErrorLine>{t("tokensLoadError")} {errorMessage(error)}</ErrorLine>
      ) : !tokens || tokens.length === 0 ? (
        <p className="text-sm text-white/40">{t("noTokens")}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {tokens.map((tok) => (
            <li key={tok.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${tok.revokedAt ? "opacity-50" : ""}`} data-testid="journey-mcp-token">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-white">
                  {tok.name}
                  {tok.revokedAt && <span className="ml-2 rounded-full bg-red-400/10 px-2 py-0.5 text-xs font-semibold text-red-300">{t("tokenRevokedBadge")}</span>}
                </p>
                <p className="break-all font-mono text-[11px] text-white/45">{tok.tokenPrefix}…</p>
                <p className="text-[11px] text-white/40">
                  {t("tokenCreatedAt", { date: formatDateTime(tok.createdAt) })} ·{" "}
                  {tok.lastUsedAt ? t("lastUsedAt", { date: formatDateTime(tok.lastUsedAt) }) : t("neverUsed")}
                  {tok.revokedAt ? ` · ${t("tokenRevokedAt", { date: formatDateTime(tok.revokedAt) })}` : ""}
                </p>
              </div>
              {!tok.revokedAt && (
                <button type="button" className={BTN_DANGER} onClick={() => setRevoking(tok)} data-testid="journey-mcp-revoke">
                  {t("revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
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
