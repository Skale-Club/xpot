import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import type { TagKitItem, TagListItem } from "@shared/tagsApi";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, withQuery } from "./api";
import { BTN_GHOST, CARD } from "./ui";
import { ConfirmDialog, ErrorLine, Loading, PieceTable, isUnsoldWithReseller, usePieces } from "./batches-shared";

/** Send unsold pieces back to house stock. Sold pieces are refused by the server (409). */
export function useReturnToHouse(onDone?: (returned: number) => void) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: (codes: string[]) =>
      sendJson<{ returned: number; alreadyInHouse: string[] }>("POST", "/api/xpot/admin/tag-kits/return", { codes }),
    onSuccess: ({ returned, alreadyInHouse }) => {
      void invalidateAdminTags();
      const home = alreadyInHouse.length ? ` Already in house stock: ${alreadyInHouse.join(", ")}.` : "";
      toast({ title: "Back in house stock", description: `${returned} piece${returned === 1 ? "" : "s"} returned.${home}` });
      onDone?.(returned);
    },
    onError: (err) => toast({ title: "Could not return pieces", description: errorMessage(err), variant: "destructive" }),
  });
}

function KitPieces({ kit, go }: { kit: TagKitItem; go: (path: string) => void }) {
  const { data: pieces = [], isLoading, isError } = usePieces({ kitId: kit.id });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const ret = useReturnToHouse(() => {
    setSelected(new Set());
    setConfirm(false);
  });
  // Only pieces still with this reseller and unsold can go back.
  const returnable = (t: TagListItem) => isUnsoldWithReseller(t) && t.repId === kit.repId;

  if (isLoading) return <Loading />;
  if (isError) return <div className="p-4"><ErrorLine>Could not load the kit's pieces.</ErrorLine></div>;

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
        empty="Every piece of this kit was returned to house stock."
      />
      {pieces.some(returnable) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
          <p className="text-xs text-white/40">Tick unsold pieces to send them back to house stock.</p>
          <button type="button" className={BTN_GHOST} disabled={codes.length === 0 || ret.isPending} onClick={() => setConfirm(true)}>
            <Undo2 className="h-4 w-4" />
            Return {codes.length || ""} selected
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Return ${codes.length} piece${codes.length === 1 ? "" : "s"} to house stock?`}
        description={`They leave ${kit.repName ?? "the reseller"}'s kit and can be given to someone else.`}
        confirmLabel="Return to house"
        busy={ret.isPending}
        onConfirm={() => ret.mutate(codes)}
      />
    </div>
  );
}

function KitRow({ kit, go }: { kit: TagKitItem; go: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const { toast } = useToast();
  const ret = useReturnToHouse(() => setConfirm(false));
  const sold = kit.pieceCount - kit.unsoldCount;

  const returnAllUnsold = async () => {
    setLoadingCodes(true);
    try {
      const pieces = await getJson<TagListItem[]>(withQuery("/api/xpot/tags", { kitId: kit.id, limit: 2000 }));
      const codes = pieces.filter((t) => isUnsoldWithReseller(t) && t.repId === kit.repId).map((t) => t.publicCode);
      if (codes.length === 0) {
        setConfirm(false);
        toast({ title: "Nothing to return", description: "This kit has no unsold pieces left." });
        void invalidateAdminTags();
        return;
      }
      ret.mutate(codes);
    } catch (err) {
      toast({ title: "Could not load the kit's pieces", description: errorMessage(err), variant: "destructive" });
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
            <p className="truncate text-sm font-semibold text-white">{kit.repName ?? `Reseller #${kit.repId}`}</p>
            <p className="truncate text-xs text-white/40">
              {formatDateTime(kit.createdAt)}
              {kit.note ? ` · ${kit.note}` : ""}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-4 text-right text-xs tabular-nums">
          <div>
            <p className="text-base font-bold text-white">{kit.pieceCount}</p>
            <p className="text-white/40">pieces</p>
          </div>
          <div>
            <p className="text-base font-bold text-amber-300">{kit.unsoldCount}</p>
            <p className="text-white/40">unsold</p>
          </div>
          <div>
            <p className="text-base font-bold text-emerald-300">{sold}</p>
            <p className="text-white/40">sold</p>
          </div>
          <button
            type="button"
            className={BTN_GHOST}
            disabled={kit.unsoldCount === 0 || ret.isPending || loadingCodes}
            onClick={() => setConfirm(true)}
            title="Return every unsold piece of this kit to house stock"
          >
            <Undo2 className="h-4 w-4" />
            <span className="hidden sm:inline">Return unsold</span>
          </button>
        </div>
      </div>
      {open && <KitPieces kit={kit} go={go} />}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Return unsold pieces to house stock?"
        description={
          <>
            The {kit.unsoldCount} unsold piece{kit.unsoldCount === 1 ? "" : "s"} in {kit.repName ?? "this reseller"}'s kit go back to house
            stock. Sold pieces stay credited to them.
          </>
        }
        confirmLabel="Return unsold"
        busy={ret.isPending || loadingCodes}
        onConfirm={() => void returnAllUnsold()}
      />
    </li>
  );
}

export function KitList({ kits, go }: { kits: TagKitItem[]; go: (path: string) => void }) {
  return (
    <ul className="space-y-2">
      {kits.map((kit) => (
        <KitRow key={kit.id} kit={kit} go={go} />
      ))}
    </ul>
  );
}
