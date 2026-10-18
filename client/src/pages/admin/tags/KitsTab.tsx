import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Inbox, PackageCheck, PackageOpen, Users } from "lucide-react";
import { FilterBar, FilterSelect } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { TagKitItem } from "@shared/tagsApi";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Textarea } from "@/components/xpot/Field";
import { Segmented } from "@/components/xpot/Segmented";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { formatMoney } from "@/lib/format";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, getJson, invalidateAdminTags, sendJson, withQuery } from "./api";
import { hasTagsModule, useResellers } from "./batches-shared";
import { Loading, LoadError } from "./pieces-shared";
import { HandOutFlow, parseCodes } from "./kits-give-form";
import { KitList } from "./kits-list";
import { ReturnsStation } from "./returns-station";
import { distributionView, type DistributionView } from "./distribution-model";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { useToast } from "@/hooks/use-toast";

type AcquisitionInboxItem = {
  acquisition: {
    id: string;
    repId: number;
    source: string;
    externalRef: string | null;
    currency: string;
    status: string;
    purchasedAt: string;
  };
  repName: string | null;
  lines: Array<{
    id: string;
    externalSku: string | null;
    quantity: number;
    subtotalCents: number;
    fulfilledUnits: number;
  }>;
};

/** Wholesale orders (Stuscle) waiting for their physical pieces; shared by the inbox and its tab's count. */
function useAcquisitions() {
  return useQuery<AcquisitionInboxItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "acquisitions"],
    queryFn: () => getJson("/api/xpot/admin/tag-acquisitions"),
    staleTime: STALE_MS,
  });
}
const pendingOf = (list: AcquisitionInboxItem[] | undefined) => (list ?? []).filter((item) => item.acquisition.status === "pending");

function AcquisitionInbox() {
  const t = useT(manageTagsBatchesMessages);
  const { toast } = useToast();
  const [codesById, setCodesById] = useState<Record<string, string>>({});
  const query = useAcquisitions();
  const fulfill = useMutation({
    mutationFn: ({ id, codes }: { id: string; codes: string[] }) =>
      sendJson("POST", `/api/xpot/admin/tag-acquisitions/${id}/fulfill`, { codes }),
    onSuccess: async () => {
      toast({ title: t("acquisitionFulfilled") });
      await invalidateAdminTags();
    },
    onError: (err) => toast({ title: t("acquisitionFulfillFailed"), description: errorMessage(err), variant: "destructive" }),
  });
  const pending = pendingOf(query.data);
  if (query.isLoading) return <Loading rows={2} />;
  if (query.isError) return <LoadError compact what={t("acquisitionsLoadFailed")} error={query.error} onRetry={() => void query.refetch()} />;
  if (!pending.length) return <EmptyState compact dense tone="tags" icon={Inbox} title={t("noPendingAcquisitions")} cardStyle={{}} />;
  return (
    <div className="space-y-3" data-testid="admin-tags-stuscle-orders">
      {pending.map((item) => {
        const expected = item.lines.reduce((sum, line) => sum + line.quantity, 0);
        const total = item.lines.reduce((sum, line) => sum + line.subtotalCents, 0);
        const parsed = parseCodes(codesById[item.acquisition.id] ?? "");
        const valid = parsed.invalid.length === 0 && parsed.codes.length === expected;
        return (
          <div key={item.acquisition.id} className={`rounded-2xl ${GLASS_CLASS} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{item.repName ?? `#${item.acquisition.repId}`}</p>
                <p className="mt-0.5 text-xs text-white/40">{item.acquisition.externalRef ?? item.acquisition.source} · {formatMoney(total, item.acquisition.currency)}</p>
              </div>
              <Pill tone="amber">{t.plural("acquisitionPiecesExpected", expected)}</Pill>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.lines.map((line) => <span key={line.id} className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs text-white/55">{line.externalSku ?? t("catalogProduct")} · {line.quantity}</span>)}
            </div>
            <Textarea value={codesById[item.acquisition.id] ?? ""}
              onChange={(event) => setCodesById((current) => ({ ...current, [item.acquisition.id]: event.target.value }))}
              rows={3} className="mt-3 font-mono" placeholder={t("acquisitionCodesPlaceholder")} aria-label={t("acquisitionCodesPlaceholder")} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className={`text-xs ${parsed.invalid.length ? "text-red-300" : "text-white/40"}`}>
                {parsed.invalid.length ? t("notACode", { codes: parsed.invalid.slice(0, 6).join(", ") }) : t("acquisitionCodesProgress", { count: parsed.codes.length, expected })}
              </p>
              <Button type="button" variant="brand" accent="tags" disabled={!valid || fulfill.isPending} loading={fulfill.isPending && fulfill.variables?.id === item.acquisition.id}
                onClick={() => fulfill.mutate({ id: item.acquisition.id, codes: parsed.codes })}>
                <PackageCheck className="h-4 w-4" /> {t("fulfillAcquisition")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The kits handed out so far, newest first, filtered by reseller (?kitRep=12). */
function KitsView({ go }: { go: (path: string) => void }) {
  const kitFilters = useUrlFilters({ kitRep: "" });
  const repFilter = /^\d+$/.test(kitFilters.values.kitRep) ? Number(kitFilters.values.kitRep) : null;
  const { data: resellers = [] } = useResellers();
  const t = useT(manageTagsBatchesMessages);
  const tm = useT(manageTagsMessages);
  const kitsUrl = withQuery("/api/xpot/admin/tag-kits", { repId: repFilter });
  const kits = useQuery<TagKitItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "kits", kitsUrl],
    queryFn: () => getJson(kitsUrl),
    staleTime: STALE_MS,
  });
  const list = kits.data ?? [];
  return (
    <div className="space-y-3">
      <FilterBar
        testId="kits-filters"
        controls={
          <FilterSelect
            value={repFilter ? String(repFilter) : ""}
            onChange={(kitRep) => kitFilters.set({ kitRep })}
            placeholder={tm("allResellers")}
            icon={Users}
            options={resellers.map((r) => ({
              value: String(r.id),
              label: `${r.displayName}${r.team ? ` · ${r.team}` : ""}${!r.isActive ? tm("resellerInactive") : !hasTagsModule(r) ? tm("resellerNoTags") : ""}`,
            }))}
            testId="admin-tags-reseller-select"
          />
        }
        summary={{ shown: list.length, active: repFilter != null, onClear: () => kitFilters.reset() }}
      />
      {kits.isLoading ? (
        <Loading rows={3} />
      ) : kits.isError ? (
        <LoadError what={t("theKits")} error={kits.error} onRetry={() => void kits.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState compact tone="tags" icon={PackageOpen} title={repFilter ? t("noKitsForReseller") : t("noKitsYet")} cardStyle={{}} />
      ) : (
        <KitList kits={list} go={go} />
      )}
    </div>
  );
}

const VIEW_LABELS = { handout: "viewHandOut", orders: "viewOrders", kits: "viewKits", returns: "viewReturns" } as const satisfies Record<DistributionView, string>;

/**
 * Distribution (/admin/tags/kits): pieces from house stock to resellers and back. Views, kept in `?view=`: Hand out
 * (step by step), Stuscle orders (wholesale orders waiting for their pieces), Kits (what each hand-over gave, for
 * good) and Take back (a scan station).
 */
export function KitsTab({ go }: { go: (path: string) => void }) {
  const t = useT(adminTagsFlowMessages);
  const url = useUrlFilters({ view: "handout" });
  const view = distributionView(url.values.view);
  const orders = useAcquisitions();
  const pendingOrders = pendingOf(orders.data).length;

  return (
    <div className="min-w-0 space-y-4" data-testid="admin-tags-distribution">
      <div className="min-w-0 space-y-1">
        <h1 className="text-lg font-semibold text-white">{t("distributionTitle")}</h1>
        <p className="text-sm text-white/50">{t("distributionIntro")}</p>
      </div>
      <Segmented<DistributionView>
        items={(Object.keys(VIEW_LABELS) as DistributionView[]).map((id) => ({ id, label: t(VIEW_LABELS[id]), count: id === "orders" ? pendingOrders : undefined }))}
        value={view}
        onChange={(next) => url.set({ view: next, ...(next !== "handout" ? { batch: null } : {}) } as never)}
        accent="tags"
        ariaLabel={t("distributionTitle")}
        className="max-w-2xl"
      />
      {view === "handout" && <HandOutFlow />}
      {view === "orders" && <AcquisitionInbox />}
      {view === "kits" && <KitsView go={go} />}
      {view === "returns" && <ReturnsStation />}
    </div>
  );
}
