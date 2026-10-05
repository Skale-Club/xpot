import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { Switch } from "@/components/ui/switch";
import { Webhook } from "lucide-react";
import { translate, useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { settingsMessages } from "@/i18n/messages/settings";

type XphereRow = {
  userId: string | null;
  repId: number;
  displayName: string;
  email: string | null;
  inboundApiKey: string | null;
  apiUrl: string;
  apiKeySet: boolean;
  isEnabled: boolean;
};

export function AdminXphere() {
  const query = useQuery<XphereRow[]>({ queryKey: ["/api/xpot/admin/xphere"] });
  const t = useT(manageMessages);

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-red-400">{t("xphereLoadFailed")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-white/50">
        <Webhook className="h-4 w-4" />
        {t("xphereIntro")}
      </div>
      {query.data.length === 0 && <p className="text-sm text-white/40">{t("noRepsYet")}</p>}
      {query.data.map((row) => (
        <XphereRowCard key={row.repId} row={row} />
      ))}
    </div>
  );
}

function XphereRowCard({ row }: { row: XphereRow }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tse = useT(settingsMessages);
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState(row.apiUrl);
  const [isEnabled, setIsEnabled] = useState(row.isEnabled);

  const save = useMutation({
    mutationFn: async () => {
      if (!row.userId) throw new Error(translate(manageMessages, "repNoUser"));
      const body: Record<string, unknown> = { isEnabled, apiUrl };
      if (apiKey) body.apiKey = apiKey;
      const res = await apiRequest("PUT", `/api/xpot/admin/xphere/${row.userId}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("xphereSavedFor", { name: row.displayName }) });
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/xphere"] });
    },
    onError: (e: Error) => toast({ title: t("errorSaving"), description: e.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{row.displayName}</h3>
            {row.apiKeySet && (
              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">{t("tokenOk")}</span>
            )}
            <span className={`rounded-md px-2 py-0.5 text-[11px] ${row.isEnabled ? "bg-blue-500/15 text-blue-300" : "bg-white/10 text-white/40"}`}>
              {row.isEnabled ? t("xphereActive") : t("xphereInactive")}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/40">{row.email ?? "—"}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-white/70">
          {tse("enabled")}
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
        </label>
      </div>

      {row.inboundApiKey && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-white/50">{tse("inboundKey")}</label>
          <code className="block break-all rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-xs text-white/70">
            {row.inboundApiKey}
          </code>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-white/50">{tse("outboundToken")}</label>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={row.apiKeySet ? tse("keepCurrentKey") : "xph_..."}
            className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-white/50">{t("apiUrl")}</label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://xphere.app"
            className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !row.userId}
          title={!row.userId ? t("repNoUser") : ""}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {tc("save")}
        </button>
      </div>
    </div>
  );
}
