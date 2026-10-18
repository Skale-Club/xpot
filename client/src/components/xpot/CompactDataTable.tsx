import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { GLASS_SUBTLE_CLASS, TABLE_HEAD } from "./surface";

// The one data table of the app: GLASS_SUBTLE container, TABLE_HEAD header
// cells, optional clickable rows (Enter / Space open them).

export type CompactDataColumn<T> = {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  width?: CSSProperties["width"];
  headerClassName?: string;
  cellClassName?: string;
};

export function CompactDataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  getRowAriaLabel,
  className = "",
  testId,
}: {
  columns: readonly CompactDataColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  getRowAriaLabel?: (row: T) => string;
  className?: string;
  testId?: string;
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
                className={`whitespace-nowrap px-4 py-2.5 ${column.headerClassName ?? ""}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((row) => {
            const interactive = Boolean(onRowClick);
            return (
              <tr
                key={getRowKey(row)}
                tabIndex={interactive ? 0 : undefined}
                aria-label={getRowAriaLabel?.(row)}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
                onKeyDown={interactive ? (event) => handleKeyDown(event, row) : undefined}
                className={`${interactive ? "cursor-pointer hover:bg-white/[0.03] focus-visible:bg-white/[0.05] focus-visible:!-outline-offset-2" : ""} transition-colors`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={column.width ? { width: column.width } : undefined}
                    className={`px-4 py-3 ${column.cellClassName ?? ""}`}
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
