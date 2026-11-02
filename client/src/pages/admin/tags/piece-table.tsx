import type { ReactNode } from "react";
import { Package } from "lucide-react";
import type { TagListItem } from "@shared/tagsApi";
import { PieceChipPill, PieceStatusPill } from "@/components/piece/PieceStatusPill";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { EmptyState } from "@/components/xpot/EmptyState";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { TagPieceVisual, tagPlaqueSpec } from "@/components/xpot/TagProductThumbnail";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { useT } from "@/i18n";
import { formatDate } from "@/lib/format";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { tagsMessages } from "@/i18n/messages/tags";
import { pieceChipState } from "@/components/piece/pieceStatus";
import { pieceHasLocation } from "@/components/piece/pieceView";

// The one pieces table of the Tags admin: Stock, a batch's pieces, a kit's pieces and the Today lists. On
// CompactDataTable from md up, tappable cards on phones. Every row is one line: the piece, one status pill (the
// same words as its pop-up and the reseller's app, components/piece/pieceStatus.ts) and the columns the caller
// picks. The chip only speaks when it is something to do. Text and pills align left, counts right.

/** Optional columns, always drawn in this order after Code and Status. */
export type PieceColumn = "customer" | "reseller" | "chip" | "scans" | "scanned" | "sold" | "batch";

const ORDER: readonly PieceColumn[] = ["customer", "reseller", "chip", "scans", "scanned", "sold", "batch"];

export interface PieceSelection {
  /** Which pieces can be ticked (e.g. the ones a return accepts). */
  canSelect: (piece: TagListItem) => boolean;
  selected: ReadonlySet<string>;
  /** Codes are the piece's public code. */
  onToggle: (code: string) => void;
  onToggleAll: (codes: string[], on: boolean) => void;
}

/** The one status pill of a piece: the same words and colour as its pop-up, its page and the reseller's app. */
export function WherePill({ piece }: { piece: TagListItem }) {
  return <PieceStatusPill piece={piece} />;
}

/** "Large plate": size and model in one name, or the product's name for a piece that is not a plaque. */
function usePieceModelName() {
  const tp = useT(manageTagsPiecesMessages);
  const tt = useT(tagsMessages);
  return (piece: Pick<TagListItem, "productType" | "face" | "batchCode">): string => {
    const { size, model } = tagPlaqueSpec(piece.productType, piece.face, piece.batchCode);
    if (size && model) return tp(`modelName_${model}_${size}` as "modelName_Plate_Large");
    if (model) return tt(`plaqueModel_${model}` as "plaqueModel_Plate");
    return tt(`product_${piece.productType}` as "product_custom");
  };
}

const SHORT_DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

function Checkbox({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    // 40px tap target around a 16px box; the click never opens the row.
    <label className="-m-2 inline-flex h-10 w-10 cursor-pointer items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-violet-500"
      />
    </label>
  );
}

/** The piece: its picture, its code and what model it is (side by side in the table, stacked in a phone's card). */
function PieceCell({ piece, modelName, stacked = false }: { piece: TagListItem; modelName: string; stacked?: boolean }) {
  const tt = useT(tagsMessages);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2.5" title={[piece.serialNumber ? `#${piece.serialNumber}` : null, piece.label].filter(Boolean).join(" · ") || undefined}>
      <TagPieceVisual productType={piece.productType} face={piece.face} batchCode={piece.batchCode} title={tt(`face_${piece.face ?? "none"}` as "face_none")} />
      <span className={`flex min-w-0 ${stacked ? "flex-col" : "items-baseline gap-2.5"}`}>
        <span className="shrink-0 font-mono text-[15px] font-semibold tracking-[0.08em] text-white">{piece.publicCode}</span>
        <span className="truncate text-xs text-white/45">{modelName}</span>
      </span>
    </span>
  );
}

export function PieceTable({
  pieces,
  onOpen,
  columns,
  selection,
  pageSize,
  empty,
  testId,
  selectedId,
  headTop,
}: {
  pieces: readonly TagListItem[];
  onOpen: (id: string) => void;
  /** The piece open in a side pane (Stock on a computer): its row is marked. */
  selectedId?: string | null;
  columns: readonly PieceColumn[];
  selection?: PieceSelection;
  /** Show this many rows, then "Show more" (lists loaded whole). Leave out when the caller pages on the server. */
  pageSize?: number;
  /** Shown instead of the table when there are no pieces. */
  empty?: ReactNode;
  testId?: string;
  /** Keep the column headings in view while the list scrolls, this many px below the top of the scrolling area. */
  headTop?: number;
}) {
  const tm = useT(manageTagsMessages);
  const tp = useT(manageTagsPiecesMessages);
  const modelName = usePieceModelName();
  // A new list (another filter) starts from the first page again.
  const paged = usePagedList(pieces, { pageSize: pageSize ?? Math.max(pieces.length, 1), resetKey: `${pieces.length}:${pieces[0]?.id ?? ""}` });
  const shown = pageSize ? paged.visible : pieces;
  const has = (column: PieceColumn) => columns.includes(column);

  if (pieces.length === 0) {
    return <EmptyState compact tone="tags" icon={Package} title={empty ?? tm("noPieces")} />;
  }

  const selectableCodes = selection ? pieces.filter(selection.canSelect).map((p) => p.publicCode) : [];
  const allOn = selectableCodes.length > 0 && selectableCodes.every((c) => selection?.selected.has(c));
  const none = <span className="text-white/30">—</span>;
  /** The company's stock is where a piece in a box with no reseller is; one not in stock yet, sold, lost or already at its customer is not in anyone's. */
  const heldBy = (p: TagListItem): string | null => p.repName ?? (pieceHasLocation(p) && p.repId === null && !p.leadName ? tp("houseStock") : null);
  const scansOf = (p: TagListItem) => p.qrInteractions + p.nfcInteractions;
  const day = (at: string | null) => formatDate(at, SHORT_DAY);

  const cells: Record<PieceColumn, CompactDataColumn<TagListItem>> = {
    customer: {
      key: "customer",
      label: tm("colCustomer"),
      cellClassName: "max-w-[200px] truncate text-white/80",
      render: (p) => p.leadName ?? none,
    },
    reseller: {
      key: "reseller",
      label: tm("colReseller"),
      cellClassName: "max-w-[190px] truncate text-white/70",
      render: (p) => heldBy(p) ?? none,
    },
    chip: {
      key: "chip",
      label: tp("colChip"),
      render: (p) => (pieceChipState(p) === "none" ? none : <PieceChipPill piece={p} />),
    },
    scans: {
      key: "scans",
      label: tp("colScans"),
      align: "right",
      cellClassName: "whitespace-nowrap text-white/80",
      render: (p) => (
        <span title={`QR ${p.qrInteractions} · NFC ${p.nfcInteractions}`}>
          {scansOf(p) > 0 ? <>{scansOf(p)}<span className="text-white/40"> · {day(p.lastInteractionAt)}</span></> : none}
        </span>
      ),
    },
    scanned: {
      key: "scanned",
      label: tp("colScanned"),
      cellClassName: "whitespace-nowrap text-xs text-white/60",
      render: (p) => (p.lastInventoryScanAt ? day(p.lastInventoryScanAt) : none),
    },
    sold: {
      key: "sold",
      label: tm("colSold"),
      cellClassName: "whitespace-nowrap text-xs text-white/50",
      render: (p) => (p.soldAt ? day(p.soldAt) : none),
    },
    batch: {
      key: "batch",
      label: tm("colBatch"),
      cellClassName: "whitespace-nowrap font-mono text-xs text-white/60",
      render: (p) => p.batchCode ?? none,
    },
  };

  const tableColumns: CompactDataColumn<TagListItem>[] = [
    ...(selection
      ? [
          {
            key: "select",
            width: 44,
            label: (
              <Checkbox
                label={tm("selectAll")}
                checked={allOn}
                disabled={selectableCodes.length === 0}
                onChange={(on) => selection.onToggleAll(selectableCodes, on)}
              />
            ),
            render: (p: TagListItem) =>
              selection.canSelect(p) ? (
                <Checkbox label={tm("selectCode", { code: p.publicCode })} checked={selection.selected.has(p.publicCode)} onChange={() => selection.onToggle(p.publicCode)} />
              ) : null,
          },
        ]
      : []),
    {
      key: "code",
      label: tm("colCode"),
      cellClassName: "max-w-[300px] !py-2",
      render: (p) => <PieceCell piece={p} modelName={modelName(p)} />,
    },
    { key: "status", label: tm("colStatus"), render: (p) => <WherePill piece={p} /> },
    ...ORDER.filter(has).map((column) => cells[column]),
  ];

  return (
    <div className="space-y-2" data-testid={testId}>
      {/* Phones: tappable cards */}
      <ul className="space-y-2 md:hidden">
        {shown.map((p) => {
          const meta = [has("customer") ? p.leadName : null, has("reseller") ? heldBy(p) : null].filter(Boolean).join(" · ");
          const scans = has("scans") && scansOf(p) > 0 ? `${tp("colScans")} ${scansOf(p)} · ${day(p.lastInteractionAt)}` : null;
          const scanned = has("scanned") && p.lastInventoryScanAt ? tp("cardScanned", { date: day(p.lastInventoryScanAt) }) : null;
          return (
            <li key={p.id} className={`flex items-start gap-2 rounded-2xl ${GLASS_CLASS} p-3`}>
              {selection?.canSelect(p) ? (
                <span className="pl-2 pt-2">
                  <Checkbox label={tm("selectCode", { code: p.publicCode })} checked={selection.selected.has(p.publicCode)} onChange={() => selection.onToggle(p.publicCode)} />
                </span>
              ) : null}
              <button type="button" onClick={() => onOpen(p.id)} className="min-w-0 flex-1 text-left" data-testid={`admin-piece-card-${p.publicCode}`}>
                <PieceCell piece={p} modelName={modelName(p)} stacked />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <WherePill piece={p} />
                  {has("chip") ? <PieceChipPill piece={p} quiet="none" /> : null}
                </div>
                {meta ? <p className="mt-1.5 break-words text-xs text-white/60">{meta}</p> : null}
                {scans || scanned ? <p className="mt-0.5 text-xs tabular-nums text-white/40">{scanned ?? scans}</p> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {/* From md up: the table */}
      <CompactDataTable
        className="hidden md:block"
        columns={tableColumns}
        rows={shown}
        getRowKey={(p) => p.id}
        onRowClick={(p) => onOpen(p.id)}
        getRowAriaLabel={(p) => p.publicCode}
        getRowTestId={(p) => `admin-piece-row-${p.publicCode}`}
        selectedKey={selectedId}
        isRowSelected={selection ? (p) => selection.selected.has(p.publicCode) : undefined}
        stickyHeadTop={headTop}
      />

      {pageSize ? <ListPager shown={paged.shown} total={paged.total} hasMore={paged.hasMore} onMore={paged.showMore} pageSize={pageSize} auto={false} /> : null}
    </div>
  );
}
