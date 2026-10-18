import type { ReactNode } from "react";
import { Package } from "lucide-react";
import type { TagListItem } from "@shared/tagsApi";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { EmptyState } from "@/components/xpot/EmptyState";
import { CHIP_STATUS_TONE, Pill, toneOf } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { formatDate, formatDateTime } from "./api";
import { useTagLabels } from "./labels";
import { PieceStatusPill } from "./ui";

// The one pieces table of the Tags admin: Inventory, a batch's pieces and a kit's pieces. On
// CompactDataTable from md up, tappable cards on phones. Every row shows the digital status and the
// physical stock (or "Sold") side by side; the caller picks the optional columns. Text and pills
// align left, counts right.

/** Optional columns, always drawn in this order after Code and Status; "destination" is a line under the customer. */
export type PieceColumn = "customer" | "destination" | "reseller" | "chip" | "scans" | "lastInteraction" | "sold" | "batch";

const ORDER: readonly Exclude<PieceColumn, "destination">[] = ["customer", "reseller", "chip", "scans", "lastInteraction", "sold", "batch"];

export interface PieceSelection {
  /** Which pieces can be ticked (e.g. the ones a return accepts). */
  canSelect: (piece: TagListItem) => boolean;
  selected: ReadonlySet<string>;
  /** Codes are the piece's public code. */
  onToggle: (code: string) => void;
  onToggleAll: (codes: string[], on: boolean) => void;
}

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

export function PieceTable({
  pieces,
  onOpen,
  columns,
  selection,
  pageSize,
  empty,
  testId,
}: {
  pieces: readonly TagListItem[];
  onOpen: (id: string) => void;
  columns: readonly PieceColumn[];
  selection?: PieceSelection;
  /** Show this many rows, then "Show more" (lists loaded whole). Leave out when the caller pages on the server. */
  pageSize?: number;
  /** Shown instead of the table when there are no pieces. */
  empty?: ReactNode;
  testId?: string;
}) {
  const tm = useT(manageTagsMessages);
  const tp = useT(manageTagsPiecesMessages);
  const labels = useTagLabels();
  // A new list (another filter) starts from the first page again.
  const paged = usePagedList(pieces, { pageSize: pageSize ?? Math.max(pieces.length, 1), resetKey: `${pieces.length}:${pieces[0]?.id ?? ""}` });
  const shown = pageSize ? paged.visible : pieces;
  const has = (column: PieceColumn) => columns.includes(column);

  if (pieces.length === 0) {
    return <EmptyState compact tone="tags" icon={Package} title={empty ?? tm("noPieces")} />;
  }

  const selectableCodes = selection ? pieces.filter(selection.canSelect).map((p) => p.publicCode) : [];
  const allOn = selectableCodes.length > 0 && selectableCodes.every((c) => selection?.selected.has(c));
  const house = <span className="text-white/40">{tm("house")}</span>;
  const none = <span className="text-white/30">—</span>;

  const cells: Record<(typeof ORDER)[number], CompactDataColumn<TagListItem>> = {
    customer: {
      key: "customer",
      label: tm("colCustomer"),
      cellClassName: "max-w-[200px]",
      render: (p) => (
        <span className="block min-w-0">
          <span className="block truncate text-white/80">{p.leadName ?? none}</span>
          {has("destination") && p.destinationType ? <span className="block truncate text-xs text-white/40">{labels.destination(p.destinationType)}</span> : null}
        </span>
      ),
    },
    reseller: {
      key: "reseller",
      label: tm("colReseller"),
      cellClassName: "max-w-[160px] truncate text-white/80",
      render: (p) => p.repName ?? house,
    },
    chip: {
      key: "chip",
      label: tp("colChip"),
      render: (p) => <Pill tone={toneOf(CHIP_STATUS_TONE, p.nfcStatus)}>{labels.chip(p.nfcStatus)}</Pill>,
    },
    scans: {
      key: "scans",
      label: tm("colQrNfc"),
      align: "right",
      cellClassName: "whitespace-nowrap text-white/80",
      render: (p) => `${p.qrInteractions} / ${p.nfcInteractions}`,
    },
    lastInteraction: {
      key: "lastInteraction",
      label: tp("colLastInteraction"),
      cellClassName: "whitespace-nowrap text-xs text-white/50",
      render: (p) => formatDateTime(p.lastInteractionAt),
    },
    sold: {
      key: "sold",
      label: tm("colSold"),
      cellClassName: "whitespace-nowrap text-xs text-white/50",
      render: (p) => formatDate(p.soldAt),
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
      cellClassName: "max-w-[280px]",
      render: (p) => (
        <TagPieceMention
          publicCode={p.publicCode}
          productType={p.productType}
          face={p.face}
          batchCode={p.batchCode}
          details={[p.serialNumber ? `#${p.serialNumber}` : null, p.label].filter(Boolean).join(" · ") || undefined}
          className="max-w-full"
        />
      ),
    },
    { key: "status", label: tm("colStatus"), render: (p) => <PieceStatusPill status={p.status} stockStatus={p.stockStatus} saleId={p.saleId} /> },
    ...ORDER.filter(has).map((column) => cells[column]),
  ];

  return (
    <div className="space-y-2" data-testid={testId}>
      {/* Phones: tappable cards */}
      <ul className="space-y-2 md:hidden">
        {shown.map((p) => {
          const meta = [has("reseller") ? p.repName ?? tp("houseStock") : null, has("batch") ? p.batchCode : null].filter(Boolean).join(" · ");
          return (
            <li key={p.id} className={`flex items-start gap-2 rounded-2xl ${GLASS_CLASS} p-3`}>
              {selection?.canSelect(p) ? (
                <span className="pl-2 pt-2">
                  <Checkbox label={tm("selectCode", { code: p.publicCode })} checked={selection.selected.has(p.publicCode)} onChange={() => selection.onToggle(p.publicCode)} />
                </span>
              ) : null}
              <button type="button" onClick={() => onOpen(p.id)} className="min-w-0 flex-1 text-left" data-testid={`admin-piece-card-${p.publicCode}`}>
                <TagPieceMention
                  publicCode={p.publicCode}
                  productType={p.productType}
                  face={p.face}
                  batchCode={p.batchCode}
                  customer={has("customer") ? p.leadName : null}
                  className="max-w-full"
                />
                <div className="mt-2"><PieceStatusPill status={p.status} stockStatus={p.stockStatus} saleId={p.saleId} /></div>
                {meta ? <p className="mt-1.5 truncate text-xs text-white/50">{meta}</p> : null}
                {has("scans") ? (
                  <p className="mt-0.5 text-xs tabular-nums text-white/40">
                    {tp("cardStats", { qr: p.qrInteractions, nfc: p.nfcInteractions, chip: labels.chip(p.nfcStatus), last: formatDateTime(p.lastInteractionAt) })}
                  </p>
                ) : null}
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
        isRowSelected={selection ? (p) => selection.selected.has(p.publicCode) : undefined}
      />

      {pageSize ? <ListPager shown={paged.shown} total={paged.total} hasMore={paged.hasMore} onMore={paged.showMore} pageSize={pageSize} auto={false} /> : null}
    </div>
  );
}
