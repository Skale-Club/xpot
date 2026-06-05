import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { CheckCircle2, XCircle, Plug } from "lucide-react";
import {
  INTEGRATION_PROVIDERS,
  type IntegrationProviderDef,
  type IntegrationStatus,
} from "#shared/integrations-registry.js";

type IntegrationsResponse = { providers: IntegrationProviderDef[]; status: IntegrationStatus[] };

const CATEGORY_COLORS: Record<string, string> = {
  Maps: "bg-emerald-500/15 text-emerald-300",
  Voice: "bg-violet-500/15 text-violet-300",
  AI: "bg-blue-500/15 text-blue-300",
  CRM: "bg-amber-500/15 text-amber-300",
};

export function AdminIntegrations() {
  const query = useQuery<IntegrationsResponse>({ queryKey: ["/api/xpot/admin/integrations"] });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-red-400">Falha ao carregar integrações.</p>;
  }

  const statusByProvider = new Map(query.data.status.map((s) => [s.provider, s]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-white/50">
        <Plug className="h-4 w-4" />
        Cadastre as chaves de API. As chaves são mascaradas após salvar — o servidor nunca devolve o valor.
      </div>
      {INTEGRATION_PROVIDERS.map((def) => (
        <ProviderCard
          key={def.provider}
          def={def}
          status={statusByProvider.get(def.provider)!}
          categoryColor={CATEGORY_COLORS[def.category] ?? "bg-white/10 text-white/60"}
        />
      ))}
    </div>
  );
}

function ProviderCard({
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
  const [enabled, setEnabled] = useState(status.enabled);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { enabled };
      for (const f of def.fields) {
        const v = fields[f.key];
        if (v !== undefined && v !== "") body[f.key] = v;
      }
      const res = await apiRequest("PUT", `/api/xpot/admin/integrations/${def.provider}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: `${def.label} salvo` });
      setFields({});
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/integrations"] });
    },
    onError: (e: Error) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const test = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/xpot/admin/integrations/${def.provider}/test`);
      return res.json() as Promise<{ ok: boolean; message: string }>;
    },
    onSuccess: (r) => setTestResult(r),
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{def.label}</h3>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${categoryColor}`}>{def.category}</span>
            {status.hasApiKey && (
              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                key •••• {status.apiKeyLast4}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/45">{def.description}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-blue-500"
          />
          Ativo
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {def.fields.map((f) => (
          <div key={f.key} className={def.fields.length === 1 ? "sm:col-span-2" : ""}>
            <label className="mb-1 block text-xs font-medium text-white/50">
              {f.label} {f.optional && <span className="text-white/30">(opcional)</span>}
            </label>
            <input
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              value={fields[f.key] ?? ""}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={
                f.secret && status.hasApiKey
                  ? "•••••••• (manter atual)"
                  : f.key === "model" && status.model
                  ? status.model
                  : f.placeholder ?? ""
              }
              className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar
        </button>
        <button
          onClick={() => test.mutate()}
          disabled={test.isPending || !status.hasApiKey}
          title={!status.hasApiKey ? "Salve uma chave antes de testar" : "Testar credenciais"}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {test.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Testar
        </button>
        {testResult && (
          <span className={`inline-flex items-center gap-1.5 text-sm ${testResult.ok ? "text-emerald-400" : "text-red-400"}`}>
            {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}
