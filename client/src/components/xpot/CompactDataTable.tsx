import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

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
    <div className={`overflow-x-auto rounded-2xl border border-white/[0.08] bg-white/[0.025] ${className}`}>
      <table className="w-full text-left text-sm" data-testid={testId}>
        <thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.14em] text-white/30">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={`whitespace-nowrap px-4 py-2.5 font-semibold ${column.headerClassName ?? ""}`}
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
                className={`${interactive ? "cursor-pointer outline-none hover:bg-white/[0.03] focus-visible:bg-white/[0.05]" : ""} transition-colors`}
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
