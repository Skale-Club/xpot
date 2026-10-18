import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ClipboardList, Undo2 } from "lucide-react";
import type { TagKitItem, TagListItem } from "@shared/tagsApi";
import { matchesStockMetric } from "@shared/tagMetrics";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CompactDataTable } from "@/components/xpot/CompactDataTable";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { CopyButton } from "@/components/xpot/CopyButton";
import { EmptyState } from "@/components/xpot/EmptyState";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, withQuery } from "./api";
import { usePieces } from "./batches-shared";
import { Loading, LoadError } from "./pieces-shared";
import { PieceTable } from "./piece-table";
import { useTagLabels } from "./labels";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";

/** Send unsold pieces back to house stock. Sold pieces are refused by the server (409). */
export function useReturnToHouse(onDone?: (returned: number) => void) {
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);
  return useMutation({
    mutationFn: (codes: string[]) =>
      sendJson<{ returned: number; alreadyInHouse: string[] }>("POST", "/api/xpot/admin/tag-kits/return", { codes }),
    onSuccess: ({ returned, alreadyInHouse }) => {
      void invalidateAdminTags();
      const home = alreadyInHouse.length ? ` ${t("alreadyInHouse", { codes: alreadyInHouse.join(", ") })}` : "";
      toast({ title: t("backInHouse"), description: `${t.plural("returnedCount", returned)}${home}` });
      onDone?.(returned);
    },
    onError: (err) => toast({ title: t("couldNotReturn"), description: errorMessage(err), variant: "destructive" }),
  });
}

/** What "Return unsold" takes back: still with the kit's rep, unsold and not set up (shared/tagMetrics.ts). */
const returnableFrom = (kit: TagKitItem) => (p: TagListItem) => matchesStockMetric(p, "returnable") && p.repId === kit.repId;

/**
 * The kit's packing list: the exact codes to put in the box, with product, rep and date. Opens right after a kit
 * is given (Give a kit) and from each kit row. Lists the pieces still in the kit.
 */
export function PackingListDialog({ kit, onOpenChange }: { kit: TagKitItem | null; onOpenChange: (open: boolean) => void }) {
  const t = useT(manageTagsBatchesMessages);
  const tm = useT(manageTagsMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const { data: pieces = [], isLoading, error, refetch } = usePieces({ kitId: kit?.id }, !!kit);
  const codes = pieces.map((p) => p.publicCode);
  const rep = kit ? kit.repName ?? t("resellerNumber", { id: kit.repId }) : "";
  return (
    <Dialog open={!!kit} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="kit-packing-list">
        <DialogHeader>
          <DialogTitle>{t("packingListTitle")}</DialogTitle>
          <DialogDescription>
            {kit ? t("packingListMeta", { name: rep, date: formatDateTime(kit.createdAt) }) : null}
            {kit?.note ? ` · ${kit.note}` : ""}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Loading rows={3} />
        ) : error ? (
          <LoadError compact what={t("theKitPieces")} error={error} onRetry={() => void refetch()} />
        ) : pieces.length === 0 ? (
          <EmptyState compact dense tone="tags" icon={ClipboardList} title={t("kitAllReturned")} />
        ) : (
          <CompactDataTable
            columns={[
              { key: "code", label: tm("colCode"), cellClassName: "font-mono text-white/85", render: (p) => p.publicCode },
              {
                key: "product",
                label: t("fieldProduct"),
                cellClassName: "text-white/70",
                render: (p) => [labels.product(p.productType), p.face ? labels.face(p.face) : null].filter(Boolean).join(" · "),
              },
              {
                key: "batch",
                label: tm("colBatch"),
                cellClassName: "whitespace-nowrap font-mono text-xs text-white/50",
                render: (p) => (p.batchCode ? `${p.batchCode}${p.serialNumber ? ` #${p.serialNumber}` : ""}` : "—"),
              },
            ]}
            rows={pieces}
            getRowKey={(p) => p.id}
          />
        )}
        <DialogFooter className="gap-2">
          {codes.length > 0 ? (
            <span data-testid="kit-packing-copy">
              <CopyButton value={codes.join("\n")} label={t.plural("packingCopyCodes", codes.length)} className="min-h-11" />
            </span>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tc("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KitPieces({ kit, go }: { kit: TagKitItem; go: (path: string) => void }) {
  const t = useT(manageTagsBatchesMessages);
  const { data: pieces = [], isLoading, error, refetch } = usePieces({ kitId: kit.id });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const ret = useReturnToHouse(() => {
    setSelected(new Set());
    setConfirm(false);
  });
  const returnable = returnableFrom(kit);

  if (isLoading) return <div className="p-3"><Loading rows={2} /></div>;
  if (error) return <div className="p-3"><LoadError compact what={t("theKitPieces")} error={error} onRetry={() => void refetch()} /></div>;

  const toggle = (code: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const toggleAll = (codes: string[], on: boolean) => setSelected(on ? new Set(codes) : new Set());
  const codes = Array.from(selected);

  return (
    <div className="space-y-2 border-t border-white/5 bg-black/10 p-3">
      <PieceTable
        pieces={pieces}
        onOpen={(id) => go(`/pieces/${id}`)}
        columns={["customer", "scans", "sold", "batch"]}
        selection={{ canSelect: returnable, selected, onToggle: toggle, onToggleAll: toggleAll }}
        pageSize={25}
        empty={t("kitAllReturned")}
      />
      {pieces.some(returnable) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-xs text-white/40">{t("tickToReturn")}</p>
          <Button type="button" variant="secondary" disabled={codes.length === 0 || ret.isPending} onClick={() => setConfirm(true)}>
            <Undo2 className="h-4 w-4" />
            {codes.length ? t.plural("returnSelected", codes.length) : t("returnSelectedNone")}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.plural("returnConfirmTitle", codes.length)}
        description={kit.repName ? t("leaveKit", { name: kit.repName }) : t("leaveKitNoName")}
        confirmLabel={t("returnToHouse")}
        busy={ret.isPending}
        onConfirm={() => ret.mutate(codes)}
      />
    </div>
  );
}

function KitRow({ kit, go }: { kit: TagKitItem; go: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [packing, setPacking] = useState(false);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);
  const ret = useReturnToHouse(() => setConfirm(false));
  // Unsold set-up pieces (a customer or a link) cannot go back until the customer is cleared.
  const blockedBySetup = kit.unsoldCount > 0 && kit.returnableCount === 0;

  const returnAllUnsold = async () => {
    setLoadingCodes(true);
    try {
      const pieces = await getJson<TagListItem[]>(withQuery("/api/xpot/tags", { kitId: kit.id, limit: 2000 }));
      const codes = pieces.filter(returnableFrom(kit)).map((p) => p.publicCode);
      if (codes.length === 0) {
        setConfirm(false);
        toast({ title: t("nothingToReturn"), description: t("nothingToReturnDesc") });
        void invalidateAdminTags();
        return;
      }
      ret.mutate(codes);
    } catch (err) {
      toast({ title: t("couldNotLoadKitPieces"), description: errorMessage(err), variant: "destructive" });
    } finally {
      setLoadingCodes(false);
    }
  };

  return (
    <li className={`overflow-hidden rounded-2xl ${GLASS_CLASS}`} data-testid={`admin-tags-kit-${kit.id}`}>
      <div className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 min-w-0 flex-1 basis-48 items-center gap-3 text-left"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-white/40" /> : <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{kit.repName ?? t("resellerNumber", { id: kit.repId })}</p>
            <p className="truncate text-xs text-white/40">
              {formatDateTime(kit.createdAt)}
              {kit.note ? ` · ${kit.note}` : ""}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-2 text-right text-xs tabular-nums">
          <div>
            <p className="text-base font-bold text-white">{kit.pieceCount}</p>
            <p className="text-white/40">{t("kitPieces")}</p>
          </div>
          <div>
            <p className="text-base font-bold text-amber-300">{kit.unsoldCount}</p>
            <p className="text-white/40">{t("kitUnsold")}</p>
            {kit.returnableCount !== kit.unsoldCount ? (
              <p className="text-[11px] text-white/40" data-testid="kit-returnable">{t.plural("kitReturnable", kit.returnableCount)}</p>
            ) : null}
          </div>
          <div>
            {/* Blue: a sale, never read as "Live" (components/xpot/StatusPill.tsx SOLD_TONE). */}
            <p className="text-base font-bold text-blue-300">{kit.soldCount}</p>
            <p className="text-white/40">{t("kitSold")}</p>
          </div>
          <Button type="button" variant="secondary" size="sm" className="min-h-10" onClick={() => setPacking(true)} title={t("packingListTitle")} aria-label={t("packingListTitle")} data-testid="kit-packing-open">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">{t("packingList")}</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-10"
            aria-label={t("returnUnsold")}
            disabled={kit.returnableCount === 0 || ret.isPending || loadingCodes}
            onClick={() => setConfirm(true)}
            title={blockedBySetup ? t("returnBlockedSetUp") : kit.returnableCount === 0 ? t("nothingToReturnDesc") : t("returnUnsoldTitle")}
          >
            <Undo2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t("returnUnsold")}</span>
          </Button>
        </div>
      </div>
      {blockedBySetup ? <p className="-mt-1 px-3 pb-2 text-right text-[11px] text-white/40">{t("returnBlockedSetUp")}</p> : null}
      {open && <KitPieces kit={kit} go={go} />}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("returnUnsoldConfirmTitle")}
        description={
          kit.repName
            ? t.plural("returnUnsoldDesc", kit.returnableCount, { name: kit.repName })
            : t.plural("returnUnsoldDescNoName", kit.returnableCount)
        }
        confirmLabel={t("returnUnsold")}
        busy={ret.isPending || loadingCodes}
        onConfirm={() => void returnAllUnsold()}
      />
      <PackingListDialog kit={packing ? kit : null} onOpenChange={setPacking} />
    </li>
  );
}

export function KitList({ kits, go }: { kits: TagKitItem[]; go: (path: string) => void }) {
  const paged = usePagedList(kits, { pageSize: 30, resetKey: `${kits.length}:${kits[0]?.id ?? ""}` });
  return (
    <>
      <ul className="space-y-2" data-testid="admin-tags-kit-list">
        {paged.visible.map((kit) => (
          <KitRow key={kit.id} kit={kit} go={go} />
        ))}
      </ul>
      <ListPager shown={paged.shown} total={paged.total} hasMore={paged.hasMore} onMore={paged.showMore} pageSize={30} />
    </>
  );
}
