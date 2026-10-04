import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Check, Copy, KeyRound, X } from "lucide-react";
import type { McpTokenCreated, McpTokenItem } from "@shared/tagsApi";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDateTime, getJson, sendJson } from "./api";
import { BTN, BTN_DANGER, CARD, INPUT } from "./ui";
import { ConfirmDialog, ErrorLine } from "./batches-shared";
import { Loading } from "./pieces-shared";
import { queryClient } from "@/lib/queryClient";

// "AI access (MCP)": tokens an AI session uses on /mcp to read the journey
// and record into it. The secret is shown once, right after creating it.

const TOKENS_KEY = [ADMIN_TAGS_KEY, "mcp-tokens"];

function CopyField({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-lg bg-black/30 px-2 py-1.5 text-xs text-white/80">{value}</code>
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => toast({ title: "Could not copy", variant: "destructive" }),
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
  const endpoint = `${window.location.origin}/mcp`;
  const command = `claude mcp add --transport http xpot ${endpoint} --header "Authorization: Bearer ${created.secret}"`;
  return (
    <div className="relative space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4" data-testid="journey-mcp-secret">
      <button type="button" onClick={onClose} aria-label="Hide the secret" className="absolute right-3 top-3 rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white">
        <X className="h-4 w-4" />
      </button>
      <p className="pr-8 text-sm font-semibold text-emerald-200">
        Token "{created.token.name}" created. Copy the secret now: it is shown only once and cannot be recovered.
      </p>
      <CopyField label="Secret" value={created.secret} />
      <CopyField label="Endpoint" value={endpoint} />
      <CopyField label="Add to Claude Code" value={command} />
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (created: McpTokenCreated) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => sendJson<McpTokenCreated>("POST", "/api/xpot/admin/mcp-tokens", { name: name.trim() }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
      setName("");
      onCreated(created);
    },
    onError: (err) => toast({ title: "Could not create the token", description: errorMessage(err), variant: "destructive" }),
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
        placeholder="Name, e.g. Claude Code on my laptop"
        className={`${INPUT} sm:flex-1`}
        data-testid="journey-mcp-name"
      />
      <button type="submit" className={BTN} disabled={!name.trim() || create.isPending} data-testid="journey-mcp-create">
        <KeyRound className="h-4 w-4" />
        {create.isPending ? "Creating…" : "Create token"}
      </button>
    </form>
  );
}

export function JourneyMcpCard() {
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
      toast({ title: "Token revoked" });
    },
    onError: (err) => toast({ title: "Could not revoke the token", description: errorMessage(err), variant: "destructive" }),
  });

  return (
    <section className={`${CARD} min-w-0 space-y-4 p-4`} data-testid="journey-mcp-card">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Bot className="h-4 w-4 text-white/50" />
          AI access (MCP)
        </h3>
        <p className="mt-1 text-xs text-white/40">
          An AI session with a token can read the journey and plans and record what it does (art, slicing, printing, decisions). Entries it
          marks as proposed wait for your approval. Tokens only work on /mcp, never on this admin.
        </p>
      </div>

      {created && <SecretPanel created={created} onClose={() => setCreated(null)} />}
      <CreateForm onCreated={setCreated} />

      {isLoading ? (
        <Loading className="py-6" />
      ) : isError ? (
        <ErrorLine>Could not load the tokens. {errorMessage(error)}</ErrorLine>
      ) : !tokens || tokens.length === 0 ? (
        <p className="text-sm text-white/40">No tokens yet.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {tokens.map((t) => (
            <li key={t.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${t.revokedAt ? "opacity-50" : ""}`} data-testid="journey-mcp-token">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-white">
                  {t.name}
                  {t.revokedAt && <span className="ml-2 rounded-full bg-red-400/10 px-2 py-0.5 text-xs font-semibold text-red-300">revoked</span>}
                </p>
                <p className="break-all font-mono text-[11px] text-white/45">{t.tokenPrefix}…</p>
                <p className="text-[11px] text-white/40">
                  Created {formatDateTime(t.createdAt)} · {t.lastUsedAt ? `last used ${formatDateTime(t.lastUsedAt)}` : "never used"}
                  {t.revokedAt ? ` · revoked ${formatDateTime(t.revokedAt)}` : ""}
                </p>
              </div>
              {!t.revokedAt && (
                <button type="button" className={BTN_DANGER} onClick={() => setRevoking(t)} data-testid="journey-mcp-revoke">
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke "${revoking?.name ?? ""}"?`}
        description="Any AI session using this token loses access immediately. This cannot be undone."
        confirmLabel="Revoke"
        destructive
        busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </section>
  );
}
