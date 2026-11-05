// Desktop tables for the Sales and Stock tabs, on the kit's CompactDataTable.
// The phone keeps the cards in cards.tsx; both open the same detail.

import { ArrowDownLeft, Handshake, Package, Undo2 } from "lucide-react";
import { formatCents, formatShortDate } from "../../utils";
import { consignmentDue } from "./consignmentDue";
import type { ConsignmentWithRefs, SaleWithItems } from "../../hooks/useSalesModule";
import { ConsignmentDuePill, SaleStatusPills } from "./cards";
import { Money } from "./ui";
import { Button } from "@/components/ui/button";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { RowMenu } from "../leads/LeadsTable";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { salesMessages } from "@/i18n/messages/sales";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

const itemsLine = (row: SaleWithItems) => row.items.map((i) => `${i.quantity}× ${i.description}`).join(" · ") || "-";

export function SalesTable({ rows, selectedId, onSelect }: {
  rows: SaleWithItems[];
  selectedId: number | null;
  onSelect: (row: SaleWithItems) => void;
}) {
  const t = useT(salesModuleMessages);
  const ts = useT(salesMessages);
  const columns: CompactDataColumn<SaleWithItems>[] = [
    {
      key: "date",
      label: t("date"),
      cellClassName: "whitespace-nowrap text-xs text-white/50",
      render: ({ sale }) => formatShortDate(sale.soldAt),
    },
    {
      key: "company",
      label: t("colCompany"),
      width: "45%",
      cellClassName: "max-w-0",
      render: (row) => (
        <>
          <div className="flex items-center gap-2">
            {row.sale.kind === "consignment_settlement"
              ? <Handshake className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden="true" />
              : <Package className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden="true" />}
            <span className="truncate font-semibold text-white">{row.lead?.name ?? ts("leadNumber", { id: row.sale.leadId })}</span>
          </div>
          <div className="truncate text-[11px] text-white/35 2xl:hidden">{itemsLine(row)}</div>
        </>
      ),
    },
    {
      key: "items",
      label: t("colItems"),
      headerClassName: "hidden 2xl:table-cell",
      cellClassName: "hidden max-w-0 truncate text-xs text-white/50 2xl:table-cell",
      render: itemsLine,
    },
    {
      key: "payment",
      label: t("payment"),
      cellClassName: "whitespace-nowrap",
      render: ({ sale }) => <SaleStatusPills sale={sale} />,
    },
    {
      key: "total",
      label: t("total"),
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: ({ sale }) => (
        <Money cents={sale.totalCents} currency={sale.currency} className={`font-bold ${sale.status === "cancelled" ? "text-white/40 line-through" : "text-emerald-300"}`} />
      ),
    },
  ];
  return (
    <CompactDataTable
      testId="sales-table"
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.sale.id}
      selectedKey={selectedId}
      onRowClick={onSelect}
      getRowTestId={(row) => `sale-row-${row.sale.id}`}
      getRowClassName={(row) => (row.sale.status === "cancelled" ? "opacity-50" : "")}
    />
  );
}

export function ConsignmentsTable({ rows, selectedId, onSelect, onSettle, onRestock, onReturn }: {
  rows: ConsignmentWithRefs[];
  selectedId: number | null;
  onSelect: (row: ConsignmentWithRefs) => void;
  onSettle?: (row: ConsignmentWithRefs) => void;
  onRestock?: (row: ConsignmentWithRefs) => void;
  onReturn?: (row: ConsignmentWithRefs) => void;
}) {
  const t = useT(salesModuleMessages);
  const ts = useT(salesMessages);
  const tl = useT(leadsMessages);
  const columns: CompactDataColumn<ConsignmentWithRefs>[] = [
    {
      key: "shop",
      label: t("colShop"),
      width: "42%",
      cellClassName: "max-w-0",
      render: (row) => (
        <>
          {/* Which company this is, is what identifies the row: two lines before any cut. */}
          <div className="line-clamp-2 font-semibold text-white">{row.lead?.name ?? ts("leadNumber", { id: row.consignment.leadId })}</div>
          <div className="line-clamp-2 text-[11px] text-white/40">
            {row.product?.name ?? t("productFallback")} · {t("pricePerUnit", { price: formatCents(row.consignment.unitPriceCents, row.consignment.currency) })}
          </div>
        </>
      ),
    },
    {
      key: "settle",
      label: t("colNextCount"),
      cellClassName: "whitespace-nowrap",
      render: ({ consignment }) => <ConsignmentDuePill consignment={consignment} emptyAsDash />,
    },
    {
      key: "onShelf",
      label: t("colOnShelf"),
      align: "right",
      cellClassName: "whitespace-nowrap text-lg font-bold text-white",
      render: ({ consignment }) => consignment.quantityOnHand,
    },
    {
      key: "billed",
      label: t("statBilled"),
      align: "right",
      headerClassName: "hidden 2xl:table-cell",
      cellClassName: "hidden whitespace-nowrap text-white/60 2xl:table-cell",
      render: ({ consignment }) => formatCents(consignment.totalSettledCents, consignment.currency),
    },
    {
      key: "actions",
      label: <span className="sr-only">{t("colActions")}</span>,
      cellClassName: "whitespace-nowrap !px-2 !py-1.5",
      render: (row) => consignmentDue(row.consignment).closed ? null : (
        <div className="flex items-center justify-end gap-1">
          {onSettle && (
            <Button type="button" variant="money" size="sm" onClick={(e) => { e.stopPropagation(); onSettle(row); }}>
              <Handshake aria-hidden="true" /> {t("actionSettle")}
            </Button>
          )}
          {/* Leaving more and taking back are less common, and one of them ends the agreement: behind a menu. */}
          {(onRestock || onReturn) && (
            <RowMenu
              label={tl("moreActions")}
              items={[
                ...(onRestock ? [{ key: "restock", label: t("actionRestock"), icon: ArrowDownLeft, run: () => onRestock(row) }] : []),
                ...(onReturn ? [{ key: "return", label: t("actionTakeBack"), icon: Undo2, run: () => onReturn(row) }] : []),
              ]}
            />
          )}
        </div>
      ),
    },
  ];
  return (
    <CompactDataTable
      testId="consignments-table"
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.consignment.id}
      selectedKey={selectedId}
      onRowClick={onSelect}
      getRowTestId={(row) => `consignment-row-${row.consignment.id}`}
      getRowClassName={(row) => {
        const { closed, overdue } = consignmentDue(row.consignment);
        return `${closed ? "opacity-60" : ""} ${overdue && selectedId !== row.consignment.id ? "bg-red-500/[0.05]" : ""}`;
      }}
    />
  );
}
