import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TagBatchItem, TagListItem } from "@shared/tagsApi";
import { Loader2 } from "@/components/ui/loader";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagProductThumbnail } from "@/components/xpot/TagProductThumbnail";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ADMIN_TAGS_KEY, STALE_MS, formatDate, getJson, withQuery } from "./api";
import { BTN_GHOST, CARD, INPUT, StatusPill, TD, TH } from "./ui";
import { useTagLabels } from "./labels";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsMessages } from "@/i18n/messages/manageTags";

// Shared bits for the Batches and Kits screens (and their helpers).

// ─── Labels ───────────────────────────────────────────────────────────────────
// Product, face and status names: useTagLabels() in labels.ts.

const BATCH_STATUS_TONES: Record<string, string> = {
  draft: "bg-white/10 text-white/60",
  generated: "bg-blue-400/10 text-blue-300",
  ordered: "bg-amber-400/10 text-amber-300",
  received: "bg-violet-400/10 text-violet-300",
  completed: "bg-emerald-400/10 text-emerald-300",
  cancelled: "bg-red-400/10 text-red-300",
};

export function BatchStatusPill({ status }: { status: string }) {
  const labels = useTagLabels();
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${BATCH_STATUS_TONES[status] ?? "bg-white/10 text-white/60"}`}>
      {labels.batchStatus(status)}
    </span>
  );
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useBatches() {
  return useQuery<TagBatchItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "batches"],
    queryFn: () => getJson("/api/xpot/admin/tag-batches"),
    staleTime: STALE_MS,
  });
}

export interface Reseller {
  id: number;
  displayName: string;
  email: string | null;
  team: string | null;
  role: string;
  isActive: boolean;
  modules: string[] | null;
  costPolicy: "zero" | "acquisition";
}

export interface TagCatalogProduct {
  id: number;
  name: string;
  sku: string | null;
  basePriceCents: number;
  currency: string;
}

export function useTagCatalog() {
  return useQuery<TagCatalogProduct[]>({
    queryKey: [ADMIN_TAGS_KEY, "catalog"],
    queryFn: () => getJson("/api/xpot/tags/catalog"),
    staleTime: STALE_MS,
  });
}

/** Can this person see Tags in the field app? Managers/admins always can. */
export function hasTagsModule(rep: Reseller): boolean {
  return rep.role === "manager" || rep.role === "admin" || !rep.modules || rep.modules.includes("tags");
}

export function useResellers() {
  return useQuery<Reseller[]>({
    queryKey: [ADMIN_TAGS_KEY, "resellers"],
    queryFn: () => getJson("/api/xpot/admin/reps"),
    staleTime: STALE_MS,
  });
}

/** Pieces list (`GET /api/xpot/tags`) for a kit, a batch or house stock. */
export function usePieces(params: { kitId?: string; batchId?: string; house?: "1"; limit?: number }, enabled = true) {
  const url = withQuery("/api/xpot/tags", { ...params, limit: params.limit ?? 2000 });
  return useQuery<TagListItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "pieces", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
    enabled,
  });
}

/** Unsold and still with the reseller that holds it. */
export function isUnsoldWithReseller(t: TagListItem): boolean {
  return t.status === "inventory" && t.repId !== null;
}

export function isHouseStock(t: TagListItem): boolean {
  return t.status === "inventory" && t.repId === null;
}

// ─── Small UI ─────────────────────────────────────────────────────────────────

export function Loading() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
    </div>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-red-400">{children}</p>;
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-xs font-medium text-white/60">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-white/35">{hint}</span>}
    </label>
  );
}

export const SELECT = `${INPUT} appearance-auto`;

/** Native select of active resellers, flagging those without the Tags module. */
export function ResellerSelect({
  value,
  onChange,
  includeAll = false,
  includeInactive = false,
  id,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  includeAll?: boolean;
  includeInactive?: boolean;
  id?: string;
}) {
  const t = useT(manageTagsMessages);
  const { data: reps = [], isLoading } = useResellers();
  const list = reps.filter((r) => includeInactive || r.isActive || r.id === value);
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={SELECT}
      disabled={isLoading}
      data-testid="admin-tags-reseller-select"
    >
      <option value="">{isLoading ? t("loadingOption") : includeAll ? t("allResellers") : t("chooseReseller")}</option>
      {list.map((r) => (
        <option key={r.id} value={r.id}>
          {r.displayName}
          {r.team ? ` · ${r.team}` : ""}
          {!r.isActive ? t("resellerInactive") : !hasTagsModule(r) ? t("resellerNoTags") : ""}
        </option>
      ))}
    </select>
  );
}

/** Dark confirm dialog in the Xpot admin look. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const t = useT(manageTagsMessages);
  const tc = useT(commonMessages);
  return (
    <AlertDialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <AlertDialogContent
        className="max-w-md rounded-2xl border border-white/10 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold text-white">{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-white/55">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 gap-2">
          <AlertDialogCancel disabled={busy} className="border-0 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
            {tc("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy ? t("working") : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Pieces table ─────────────────────────────────────────────────────────────

const PAGE = 200;

/**
 * Pieces of a batch or a kit. Rows open the piece; with `selectable`, the
 * pieces it accepts get a checkbox (e.g. unsold ones, to return them).
 */
export function PieceTable({
  pieces,
  go,
  showBatch = true,
  showReseller = true,
  selectable,
  selected,
  onToggle,
  onToggleAll,
  empty,
}: {
  pieces: TagListItem[];
  go: (path: string) => void;
  showBatch?: boolean;
  showReseller?: boolean;
  selectable?: (t: TagListItem) => boolean;
  selected?: Set<string>;
  onToggle?: (code: string) => void;
  onToggleAll?: (codes: string[], on: boolean) => void;
  empty?: ReactNode;
}) {
  const tm = useT(manageTagsMessages);
  const [limit, setLimit] = useState(PAGE);
  if (pieces.length === 0) return <p className="px-3 py-6 text-center text-sm text-white/40">{empty ?? tm("noPieces")}</p>;
  const shown = pieces.slice(0, limit);
  const selectableCodes = selectable ? pieces.filter(selectable).map((t) => t.publicCode) : [];
  const allOn = selectableCodes.length > 0 && selectableCodes.every((c) => selected?.has(c));

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-white/10">
            <tr>
              {selectable && (
                <th className={`${TH} w-8`}>
                  <input
                    type="checkbox"
                    aria-label={tm("selectAll")}
                    checked={allOn}
                    disabled={selectableCodes.length === 0}
                    onChange={(e) => onToggleAll?.(selectableCodes, e.target.checked)}
                    className="accent-blue-500"
                  />
                </th>
              )}
              <th className={`${TH} w-20 pr-0`}><span className="sr-only">{tm("printedOnPiece")}</span></th>
              <th className={TH}>{tm("colCode")}</th>
              <th className={TH}>{tm("colSerial")}</th>
              {showBatch && <th className={TH}>{tm("colBatch")}</th>}
              <th className={TH}>{tm("colStatus")}</th>
              {showReseller && <th className={TH}>{tm("colReseller")}</th>}
              <th className={TH}>{tm("colCustomer")}</th>
              <th className={`${TH} text-right`}>{tm("colQrNfc")}</th>
              <th className={TH}>{tm("colSold")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {shown.map((t) => {
              const canSelect = selectable?.(t) ?? false;
              return (
                <tr
                  key={t.id}
                  onClick={() => go(`/pieces/${t.id}`)}
                  className="cursor-pointer hover:bg-white/[0.03]"
                  data-testid={`admin-tags-piece-${t.publicCode}`}
                >
                  {selectable && (
                    <td className={TD} onClick={(e) => e.stopPropagation()}>
                      {canSelect && (
                        <input
                          type="checkbox"
                          aria-label={tm("selectCode", { code: t.publicCode })}
                          checked={selected?.has(t.publicCode) ?? false}
                          onChange={() => onToggle?.(t.publicCode)}
                          className="accent-blue-500"
                        />
                      )}
                    </td>
                  )}
                  <td className={`${TD} pr-0`}>
                    <div className="flex items-center gap-2">
                      <TagFaceIcon face={t.face} size="sm" />
                      <TagProductThumbnail productType={t.productType} face={t.face} batchCode={t.batchCode} size="sm" />
                    </div>
                  </td>
                  <td className={`${TD} font-mono text-white`}>{t.publicCode}</td>
                  <td className={`${TD} tabular-nums text-white/50`}>{t.serialNumber ?? "—"}</td>
                  {showBatch && <td className={`${TD} font-mono text-xs`}>{t.batchCode ?? "—"}</td>}
                  <td className={TD}>
                    <StatusPill status={t.status} />
                  </td>
                  {showReseller && <td className={TD}>{t.repName ?? <span className="text-white/35">{tm("house")}</span>}</td>}
                  <td className={TD}>{t.leadName ?? <span className="text-white/35">—</span>}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {t.qrInteractions} / {t.nfcInteractions}
                  </td>
                  <td className={`${TD} text-white/50`}>{formatDate(t.soldAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pieces.length > limit && (
        <div className="flex justify-center border-t border-white/5 p-3">
          <button type="button" className={BTN_GHOST} onClick={() => setLimit((l) => l + PAGE * 5)}>
            {tm("showMore", { count: pieces.length - limit })}
          </button>
        </div>
      )}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${CARD} p-4 ${className}`}>{children}</div>;
}
