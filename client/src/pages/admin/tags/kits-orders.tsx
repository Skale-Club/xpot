import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Inbox, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { formatMoney } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { ADMIN_TAGS_KEY, AdminHttpError, STALE_MS, errorMessage, getJson, invalidateAdminTags, sendJson } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { CodeCheckList, useOrderCheck } from "./code-check-list";
import { addCodes } from "./distribution-model";
import { readCode } from "./batches-model";
import { CameraButton, CodeEntry, ContinuousCamera, feedback } from "./scan-station";

// Distribution › Wholesale orders: paid Stuscle orders waiting for their pieces. Each order is a collapsed card, one
// open at a time; the platform scans the exact pieces it packs (checked as Hand out checks them) and gives them to the buyer.

export type AcquisitionInboxItem = {
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
    productName: string | null;
    quantity: number;
    subtotalCents: number;
    fulfilledUnits: number;
  }>;
};

/** Wholesale orders (Stuscle) waiting for their physical pieces; shared by the inbox and its tab's count. */
export function useAcquisitions() {
  return useQuery<AcquisitionInboxItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "acquisitions"],
    queryFn: () => getJson("/api/xpot/admin/tag-acquisitions"),
    staleTime: STALE_MS,
  });
}
export const pendingOf = (list: AcquisitionInboxItem[] | undefined) => (list ?? []).filter((item) => item.acquisition.status === "pending");

function OrderCard({ item, open, onToggle }: { item: AcquisitionInboxItem; open: boolean; onToggle: () => void }) {
  const t = useT(manageTagsBatchesMessages);
  const tf = useT(adminTagsFlowMessages);
  const { toast } = useToast();
  const [codes, setCodes] = useState<string[]>([]);
  const [camera, setCamera] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const expected = item.lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = item.lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const buyer = item.repName ?? t("resellerNumber", { id: item.acquisition.repId });
  const firstName = buyer.split(" ")[0];
  const products = item.lines.map((line) => `${line.productName ?? line.externalSku ?? t("catalogProduct")} × ${line.quantity}`).join(", ");

  const check = useOrderCheck(item.acquisition.id, codes);
  const okCodes = useMemo(() => codes.filter((code) => check.data?.items.find((i) => i.code === code)?.ok), [codes, check.data]);
  const checked = !check.isFetching && !!check.data && codes.every((code) => check.data!.items.some((i) => i.code === code));
  const complete = checked && codes.length === expected && okCodes.length === expected;

  // What is still missing, per product: "Small Plate 6/8 · Large Plate 0/2"; a single product reads "6 of 8 codes".
  const lineProgress = check.data?.lines ?? [];
  const progress = lineProgress.length > 1
    ? lineProgress.map((line) => `${line.productName ?? t("catalogProduct")} ${line.filled}/${line.quantity}`).join(" · ")
    : t("acquisitionCodesProgress", { count: okCodes.length, expected });

  const fulfill = useMutation({
    mutationFn: () => sendJson("POST", `/api/xpot/admin/tag-acquisitions/${item.acquisition.id}/fulfill`, { codes }),
    onSuccess: async () => {
      toast({ title: tf("orderDone", { name: buyer }) });
      await invalidateAdminTags();
    },
    // An unexpected failure (a 500) gets a plain sentence; every refusal the server words itself comes through as it is.
    onError: (err) => toast({
      title: t("acquisitionFulfillFailed"),
      description: err instanceof AdminHttpError && err.status >= 500 ? tf("orderUnexpected") : errorMessage(err),
      variant: "destructive",
    }),
  });

  /** Camera or hand-scanner reads join the order's list, once each; what is not a code is refused. */
  const addReads = (reads: string[], fromCamera = false) => {
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const raw of reads) {
      const code = readCode(raw, [window.location.hostname]);
      if (code) valid.push(code);
      else invalid.push(raw);
    }
    const result = addCodes(codes, valid);
    setCodes(result.list);
    setEntryError(invalid.length ? t("notACode", { codes: invalid.slice(0, 6).join(", ") }) : result.repeated.length ? tf("alreadyOnList", { codes: result.repeated.slice(0, 6).join(", ") }) : null);
    if (invalid.length) feedback("error");
    else if (!result.added.length && (fromCamera || reads.length === 1)) feedback("warn");
    else if (result.added.length) feedback("ok");
  };

  return (
    <div className={`rounded-2xl ${GLASS_CLASS}`} data-testid={`stuscle-order-${item.acquisition.id}`}>
      <button
        type="button"
        onClick={() => {
          if (open) setCamera(false);
          onToggle();
        }}
        className="flex min-h-14 w-full items-center gap-3 p-4 text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{buyer}</p>
          <p className="truncate text-xs text-white/50">{products} · {formatMoney(total, item.acquisition.currency)}</p>
        </div>
        {codes.length > 0 && !open ? <Pill tone="slate">{codes.length}/{expected}</Pill> : null}
      </button>
      {open ? (
        <div className="space-y-3 border-t border-white/5 p-4">
          <p className="text-sm text-white/65">{tf.plural("orderHint", expected, { name: buyer })}</p>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1 basis-56">
              <CodeEntry onReads={(reads) => addReads(reads)} autoFocus={false} testId={`stuscle-code-entry-${item.acquisition.id}`} />
            </div>
            <CameraButton on={camera} onToggle={() => setCamera((v) => !v)} />
          </div>
          {camera ? <ContinuousCamera onRead={(text) => addReads([text], true)} onClose={() => setCamera(false)} /> : null}
          {entryError ? <p className="text-xs text-amber-300" role="status">{entryError}</p> : null}
          <CodeCheckList
            kind="handOut"
            codes={codes}
            check={check.data}
            checking={check.isFetching}
            error={check.error}
            onRemove={(code) => setCodes((list) => list.filter((c) => c !== code))}
            onRemoveBlocked={() => setCodes(okCodes)}
            onClear={() => setCodes([])}
            testId={`stuscle-code-list-${item.acquisition.id}`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-white/40">
              {progress}
              {item.acquisition.externalRef ? ` · ${tf("orderRef", { ref: item.acquisition.externalRef })}` : ""}
            </p>
            <Button type="button" variant="brand" accent="tags" disabled={!complete || fulfill.isPending} loading={fulfill.isPending} onClick={() => fulfill.mutate()} data-testid="stuscle-fulfill">
              <PackageCheck className="h-4 w-4" /> {tf.plural("orderGive", expected, { name: firstName })}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AcquisitionInbox() {
  const t = useT(manageTagsBatchesMessages);
  const query = useAcquisitions();
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = pendingOf(query.data);
  if (query.isLoading) return <Loading rows={2} />;
  if (query.isError) return <LoadError compact what={t("acquisitionsLoadFailed")} error={query.error} onRetry={() => void query.refetch()} />;
  if (!pending.length) return <EmptyState compact dense tone="tags" icon={Inbox} title={t("noPendingAcquisitions")} cardStyle={{}} />;
  // A lone order opens by itself; with several, one at a time.
  const shown = openId ?? (pending.length === 1 ? pending[0].acquisition.id : null);
  return (
    <div className="space-y-2" data-testid="admin-tags-stuscle-orders">
      {pending.map((item) => (
        <OrderCard key={item.acquisition.id} item={item} open={shown === item.acquisition.id} onToggle={() => setOpenId(shown === item.acquisition.id ? "" : item.acquisition.id)} />
      ))}
    </div>
  );
}
