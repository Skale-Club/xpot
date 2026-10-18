import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, ClipboardList, Copy, Undo2 } from "lucide-react";
import type { TagKitItem, TagListItem } from "@shared/tagsApi";
import { matchesStockMetric } from "@shared/tagMetrics";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, withQuery } from "./api";
import { BTN_GHOST, CARD, TD, TH } from "./ui";
import { ConfirmDialog, ErrorLine, Loading, PieceTable, usePieces } from "./batches-shared";
import { copyText } from "./pieces-shared";
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
  const [copied, setCopied] = useState(false);
  const { data: pieces = [], isLoading, isError } = usePieces({ kitId: kit?.id }, !!kit);
  const codes = pieces.map((p) => p.publicCode);
  const rep = kit ? kit.repName ?? t("resellerNumber", { id: kit.repId }) : "";
  return (
    <Dialog open={!!kit} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0d1326] text-white" data-testid="kit-packing-list">
        <DialogHeader>
          <DialogTitle>{t("packingListTitle")}</DialogTitle>
          <DialogDescription className="text-white/50">
            {kit ? t("packingListMeta", { name: rep, date: formatDateTime(kit.createdAt) }) : null}
            {kit?.note ? ` · ${kit.note}` : ""}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <ErrorLine>{tm("couldNotLoad", { what: t("theKitPieces") })}</ErrorLine>
        ) : pieces.length === 0 ? (
          <p className="py-4 text-center text-sm text-white/40">{t("kitAllReturned")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr>
                  <th className={TH}>{tm("colCode")}</th>
                  <th className={TH}>{t("fieldProduct")}</th>
                  <th className={TH}>{tm("colBatch")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pieces.map((p) => (
                  <tr key={p.id}>
                    <td className={`${TD} font-mono`}>{p.publicCode}</td>
                    <td className={TD}>{[labels.product(p.productType), p.face ? labels.face(p.face) : null].filter(Boolean).join(" · ")}</td>
                    <td className={`${TD} font-mono text-xs text-white/50`}>{p.batchCode ? `${p.batchCode}${p.serialNumber ? ` #${p.serialNumber}` : ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter className="gap-2">
          <button
            type="button"
            className={BTN_GHOST}
            disabled={codes.length === 0}
            onClick={async () => {
              if (await copyText(codes.join("\n"))) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            data-testid="kit-packing-copy"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? t("packingCopied") : t.plural("packingCopyCodes", codes.length)}
          </button>
          <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>{tc("close")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KitPieces({ kit, go }: { kit: TagKitItem; go: (path: string) => void }) {
  const t = useT(manageTagsBatchesMessages);
  const tm = useT(manageTagsMessages);
  const { data: pieces = [], isLoading, isError } = usePieces({ kitId: kit.id });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const ret = useReturnToHouse(() => {
    setSelected(new Set());
    setConfirm(false);
  });
  const returnable = returnableFrom(kit);

  if (isLoading) return <Loading />;
  if (isError) return <div className="p-4"><ErrorLine>{tm("couldNotLoad", { what: t("theKitPieces") })}</ErrorLine></div>;

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
    <div className="border-t border-white/5 bg-black/10">
      <PieceTable
        pieces={pieces}
        go={go}
        showReseller={false}
        selectable={returnable}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
        empty={t("kitAllReturned")}
      />
      {pieces.some(returnable) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
          <p className="text-xs text-white/40">{t("tickToReturn")}</p>
          <button type="button" className={BTN_GHOST} disabled={codes.length === 0 || ret.isPending} onClick={() => setConfirm(true)}>
            <Undo2 className="h-4 w-4" />
            {codes.length ? t.plural("returnSelected", codes.length) : t("returnSelectedNone")}
          </button>
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
    <li className={`${CARD} overflow-hidden`} data-testid={`admin-tags-kit-${kit.id}`}>
      <div className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
        <div className="flex shrink-0 items-center gap-4 text-right text-xs tabular-nums">
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
          <button type="button" className={BTN_GHOST} onClick={() => setPacking(true)} title={t("packingListTitle")} data-testid="kit-packing-open">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">{t("packingList")}</span>
          </button>
          <button
            type="button"
            className={BTN_GHOST}
            disabled={kit.returnableCount === 0 || ret.isPending || loadingCodes}
            onClick={() => setConfirm(true)}
            title={blockedBySetup ? t("returnBlockedSetUp") : kit.returnableCount === 0 ? t("nothingToReturnDesc") : t("returnUnsoldTitle")}
          >
            <Undo2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t("returnUnsold")}</span>
          </button>
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
      <ul className="space-y-2">
        {paged.visible.map((kit) => (
          <KitRow key={kit.id} kit={kit} go={go} />
        ))}
      </ul>
      <ListPager shown={paged.shown} total={paged.total} hasMore={paged.hasMore} onMore={paged.showMore} pageSize={30} />
    </>
  );
}
