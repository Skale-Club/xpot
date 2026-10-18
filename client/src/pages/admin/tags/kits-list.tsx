import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ClipboardList, Undo2 } from "lucide-react";
import type { TagKitItem, TagKitPiece, TagListItem } from "@shared/tagsApi";
import { matchesStockMetric } from "@shared/tagMetrics";
import { KIT_COST_CURRENCY } from "@shared/tagKits";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CompactDataTable } from "@/components/xpot/CompactDataTable";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { CopyButton } from "@/components/xpot/CopyButton";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Pill, SOLD_TONE, type PillTone } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { formatMoney } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, withQuery } from "./api";
import { usePieces } from "./batches-shared";
import { Loading, LoadError } from "./pieces-shared";
import { PieceTable } from "./piece-table";
import { useTagLabels } from "./labels";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";

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

/** What "Take back unsold" takes: still with the kit's rep, unsold and not set up (shared/tagMetrics.ts). */
const returnableFrom = (kit: TagKitItem) => (p: TagListItem) => matchesStockMetric(p, "returnable") && p.repId === kit.repId;

const PIECE_STATE_TONE: Record<TagKitPiece["state"], PillTone> = { in_kit: "violet", sold: SOLD_TONE, returned: "muted", moved: "slate" };
const PIECE_STATE_KEY = { in_kit: "pieceInKit", sold: "pieceSold", returned: "pieceReturned", moved: "pieceMoved" } as const;

/** A kit's packing list (tag_kit_items): what it handed out, for good, with where each piece is now. */
export function useKitItems(kitId: string | undefined) {
  return useQuery<TagKitPiece[]>({
    queryKey: [ADMIN_TAGS_KEY, "kit-items", kitId],
    queryFn: () => getJson(`/api/xpot/admin/tag-kits/${encodeURIComponent(kitId!)}/items`),
    enabled: !!kitId,
    staleTime: STALE_MS,
  });
}

/**
 * The kit's packing list: the exact codes that went into the box, with product and batch. Opens right after a kit is
 * handed out and from each kit row; it lists what was handed out, also after pieces come back.
 */
export function PackingListDialog({ kit, onOpenChange }: { kit: TagKitItem | null; onOpenChange: (open: boolean) => void }) {
  const t = useT(manageTagsBatchesMessages);
  const tf = useT(adminTagsFlowMessages);
  const tm = useT(manageTagsMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const { data: pieces = [], isLoading, error, refetch } = useKitItems(kit?.id);
  const codes = pieces.map((p) => p.code);
  const rep = kit ? kit.repName ?? t("resellerNumber", { id: kit.repId }) : "";
  return (
    <Dialog open={!!kit} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="kit-packing-list">
        <DialogHeader>
          <DialogTitle>{kit ? tf("packingListTitleCode", { code: kit.kitCode }) : t("packingListTitle")}</DialogTitle>
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
          <EmptyState compact dense tone="tags" icon={ClipboardList} title={tf("packingEmpty")} />
        ) : (
          <CompactDataTable
            columns={[
              { key: "code", label: tm("colCode"), cellClassName: "font-mono text-white/85", render: (p: TagKitPiece) => p.code },
              {
                key: "product",
                label: t("fieldProduct"),
                cellClassName: "text-white/70",
                render: (p: TagKitPiece) => [labels.product(p.productType), p.face ? labels.face(p.face) : null].filter(Boolean).join(" · "),
              },
              {
                key: "batch",
                label: tm("colBatch"),
                cellClassName: "whitespace-nowrap font-mono text-xs text-white/50",
                render: (p: TagKitPiece) => (p.batchCode ? `${p.batchCode}${p.serialNumber ? ` #${p.serialNumber}` : ""}` : "—"),
              },
              { key: "state", label: tm("colStatus"), render: (p: TagKitPiece) => <Pill tone={PIECE_STATE_TONE[p.state]}>{tf(PIECE_STATE_KEY[p.state])}</Pill> },
            ]}
            rows={pieces}
            getRowKey={(p) => p.code}
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
        accent="tags"
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

/** "Handed out 6 · returned 1 · sold 2 · still with Ana 3" (moved shows only when some were). */
function KitCounts({ kit }: { kit: TagKitItem }) {
  const t = useT(adminTagsFlowMessages);
  const part = (label: string, value: number, className = "text-white") => (
    <span className="whitespace-nowrap">
      <span className={`font-bold tabular-nums ${className}`}>{value}</span> <span className="text-white/45">{label}</span>
    </span>
  );
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid="kit-counts">
      {part(t("kitHandedOut"), kit.handedOutCount)}
      {part(t("kitReturned"), kit.returnedCount, "text-white/70")}
      {kit.movedCount ? part(t("kitMoved"), kit.movedCount, "text-white/70") : null}
      {/* Blue: a sale, never read as "Live" (components/xpot/StatusPill.tsx SOLD_TONE). */}
      {part(t("kitSold"), kit.soldCount, "text-blue-300")}
      {part(t("kitStillWith"), kit.stillWithCount, "text-violet-200")}
    </p>
  );
}

function KitRow({ kit, go }: { kit: TagKitItem; go: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [packing, setPacking] = useState(false);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);
  const tf = useT(adminTagsFlowMessages);
  const ret = useReturnToHouse(() => setConfirm(false));
  // Unsold set-up pieces (a customer or a link) cannot go back until the customer is removed.
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
          className="flex min-h-11 min-w-0 flex-1 basis-56 items-start gap-3 text-left"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-white/40" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />}
          <div className="min-w-0 space-y-1">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-white">
              <span className="font-mono text-violet-200" data-testid="kit-code">{kit.kitCode}</span>
              <span className="truncate">{kit.repName ?? t("resellerNumber", { id: kit.repId })}</span>
              {kit.ownershipType ? (
                <Pill tone="slate" className="font-medium">{kit.ownershipType === "rep" ? tf("ownershipRep") : tf("ownershipCompany")}</Pill>
              ) : null}
            </p>
            <p className="truncate text-xs text-white/40">
              {formatDateTime(kit.createdAt)}
              {kit.acquisitionSource === "stuscle" ? ` · ${tf("sourceStuscle")}` : ""}
              {kit.unitCostCents !== null ? ` · ${tf("costEach", { cost: formatMoney(kit.unitCostCents, KIT_COST_CURRENCY) })}` : ""}
              {kit.note ? ` · ${kit.note}` : ""}
            </p>
            <KitCounts kit={kit} />
          </div>
        </button>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
        accent="tags"
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
