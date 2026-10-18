import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { GLASS_SUBTLE_CLASS, TABLE_HEAD } from "./surface";

// The one data table of the app: GLASS_SUBTLE container, TABLE_HEAD header
// cells, optional clickable rows (Enter / Space open them). Numbers align
// right with `align: "right"` (tabular figures); `isRowSelected` tints the
// rows ticked in a selection; `selectedKey` marks the row open in a detail
// pane with the neutral highlight (never a module colour) and aria-current.

export type CompactDataColumn<T> = {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  width?: CSSProperties["width"];
  headerClassName?: string;
  cellClassName?: string;
  /** Text alignment of the header and the cells; "right" also turns on tabular figures (counts, money). */
  align?: "left" | "center" | "right";
  /** aria-sort of the header cell, for a sortable column. */
  ariaSort?: "ascending" | "descending" | "none";
};

const ALIGN = { left: "", center: "text-center", right: "text-right tabular-nums" } as const;

export function CompactDataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  getRowAriaLabel,
  selectedKey,
  getRowClassName,
  className = "",
  testId,
  getRowTestId,
  isRowSelected,
}: {
  columns: readonly CompactDataColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  getRowAriaLabel?: (row: T) => string;
  /** The row shown in a detail pane: highlighted and aria-current. */
  selectedKey?: string | number | null;
  /** Extra classes for a row (dimmed when cancelled, tinted when late). */
  getRowClassName?: (row: T) => string;
  className?: string;
  testId?: string;
  /** data-testid of each row. */
  getRowTestId?: (row: T) => string;
  /** Rows ticked in a selection get a faint tint. */
  isRowSelected?: (row: T) => boolean;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <div className={`overflow-x-auto rounded-2xl ${GLASS_SUBTLE_CLASS} ${className}`}>
      <table className="w-full text-left text-sm" data-testid={testId}>
        <thead className={`border-b border-white/[0.07] ${TABLE_HEAD}`}>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                aria-sort={column.ariaSort}
                className={`whitespace-nowrap px-4 py-2.5 ${ALIGN[column.align ?? "left"]} ${column.headerClassName ?? ""}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((row) => {
            const interactive = Boolean(onRowClick);
            const key = getRowKey(row);
            const current = selectedKey != null && key === selectedKey;
            const selected = current || (isRowSelected?.(row) ?? false);
            return (
              <tr
                key={key}
                data-testid={getRowTestId?.(row)}
                tabIndex={interactive ? 0 : undefined}
                aria-label={getRowAriaLabel?.(row)}
                aria-current={current ? "true" : undefined}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
                onKeyDown={interactive ? (event) => handleKeyDown(event, row) : undefined}
                className={`${interactive ? "cursor-pointer hover:bg-white/[0.03] focus-visible:bg-white/[0.05] focus-visible:!-outline-offset-2" : ""} ${current ? "bg-white/[0.06]" : selected ? "bg-white/[0.04]" : ""} transition-colors ${getRowClassName?.(row) ?? ""}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={column.width ? { width: column.width } : undefined}
                    className={`px-4 py-3 ${ALIGN[column.align ?? "left"]} ${column.cellClassName ?? ""}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
