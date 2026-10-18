import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Package, Users, Warehouse } from "lucide-react";
import type { TagRepReportRow, TagTeamReport } from "@shared/tagsApi";
import { sellBlockers } from "@shared/tagDistribution";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { KpiTile, SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Stat } from "@/components/xpot/Stat";
import { Pill, ROLE_TONE, toneOf } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { ADMIN_TAGS_KEY, formatDate, getJson, STALE_MS, withQuery } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { useResellers, type Reseller } from "./batches-shared";
import { RangePicker, rangeParams, type AnalyticsRange } from "./pieces-analytics";
import { SELL_BLOCKER_KEYS } from "./distribution-model";

type Go = (path: string) => void;

function RoleBadge({ row }: { row: TagRepReportRow }) {
  const t = useT(manageTagsMessages);
  if (row.role === "admin" || row.role === "manager") {
    return <Pill tone={toneOf(ROLE_TONE, row.role)} className="ml-1.5">{t(row.role === "admin" ? "role_admin" : "role_manager")}</Pill>;
  }
  if (!row.isActive) return <Pill tone="muted" className="ml-1.5">{t("teamRepOff")}</Pill>;
  return null;
}

/** People › this person (/admin/reps/:repId); a search by name when there is no person id. */
export function peopleHref(row: { repId: number | null; name: string | null }): string {
  return row.repId != null ? `/admin/reps/${row.repId}` : withQuery("/admin/reps", { q: row.name });
}

function PersonCell({ row, rep, onOpenPerson }: { row: TagRepReportRow; rep: Reseller | undefined; onOpenPerson: (href: string) => void }) {
  const t = useT(manageTagsMessages);
  const tf = useT(adminTagsFlowMessages);
  if (row.repId === null) return <span className="italic text-white/50">{t("teamNoReseller")}</span>;
  const blockers = rep ? sellBlockers(rep) : [];
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center font-medium text-white">
        <button
          type="button"
          className="truncate text-left underline-offset-2 hover:underline"
          onClick={() => onOpenPerson(peopleHref(row))}
          title={tf("openInPeople")}
          data-testid={`team-person-${row.repId}`}
        >
          {row.name ?? t("teamResellerN", { id: row.repId })}
        </button>
        <RoleBadge row={row} />
      </p>
      {row.email && row.email !== row.name ? <p className="truncate text-xs text-white/40">{row.email}</p> : null}
      {blockers.length ? (
        <span className="mt-1 flex flex-wrap gap-1" data-testid={`team-cannot-sell-${row.repId}`}>
          {blockers.map((b) => (
            <Pill key={b} tone={b === "blocked" ? "red" : "amber"} className="px-2 py-0.5 text-[11px]">{tf(SELL_BLOCKER_KEYS[b])}</Pill>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** A number in the table that opens the pieces it counts. */
function NumberLink({ value, onOpen, label }: { value: number; onOpen?: () => void; label: string }): ReactNode {
  if (!onOpen || value === 0) return <span>{value}</span>;
  return (
    <button type="button" onClick={onOpen} aria-label={label} className="tabular-nums underline-offset-2 hover:text-violet-200 hover:underline">
      {value}
    </button>
  );
}

/** Per-reseller numbers for the window: sales, activations, stock and the scans their pieces got. */
function TeamReport({ range, go }: { range: AnalyticsRange; go: Go }) {
  const t = useT(manageTagsMessages);
  const tf = useT(adminTagsFlowMessages);
  const [, setLocation] = useLocation();
  const { data: reps = [] } = useResellers();
  const url = withQuery("/api/xpot/admin/tags/report", rangeParams(range));
  const { data, isLoading, error, refetch } = useQuery<TagTeamReport>({
    queryKey: [ADMIN_TAGS_KEY, "team-report", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading rows={4} />;
  if (error || !data) return <LoadError what={t("whatTeamReport")} error={error} onRetry={() => void refetch()} />;

  const u = data.unassigned;
  const showUnassigned = !!(u.activeTags || u.qr || u.nfc || u.soldInRange || u.activationsInRange || u.inStock || u.totalSold);
  const rows = [...data.reps, ...(showUnassigned ? [u] : [])];
  const total = (pick: (r: TagRepReportRow) => number) => rows.reduce((sum, r) => sum + pick(r), 0);
  const withResellers = data.reps.reduce((sum, r) => sum + r.inStock, 0);
  const repById = new Map(reps.map((r) => [r.id, r]));
  // Inventory filtered to this person (or to house stock) and the number's own filter.
  const pieces = (r: TagRepReportRow, filter: string) => () => go(`/pieces?rep=${r.repId ?? "house"}${filter ? `&${filter}` : ""}`);
  type Filter = string | ((r: TagRepReportRow) => string) | null;
  const num = (key: string, label: string, pick: (r: TagRepReportRow) => number, filter: Filter, strong = false): CompactDataColumn<TagRepReportRow> => ({
    key,
    label,
    align: "right",
    cellClassName: strong ? "font-semibold text-white" : "text-white/80",
    render: (r) => (
      <NumberLink
        value={pick(r)}
        label={`${label}: ${r.name ?? t("teamNoReseller")}`}
        onOpen={filter === null ? undefined : pieces(r, typeof filter === "function" ? filter(r) : filter)}
      />
    ),
  });
  const columns: CompactDataColumn<TagRepReportRow>[] = [
    { key: "rep", label: t("colReseller"), cellClassName: "max-w-[260px]", render: (r) => <PersonCell row={r} rep={r.repId === null ? undefined : repById.get(r.repId)} onOpenPerson={setLocation} /> },
    num("sold", t("teamColSold"), (r) => r.soldInRange, "stock=sold", true),
    num("activated", t("teamColActivated"), (r) => r.activationsInRange, null),
    // Unsold stock: the reseller's (withResellers), or company stock on the no-reseller row (shared/tagMetrics.ts).
    num("stock", t("teamColInStock"), (r) => r.inStock, (r) => (r.repId === null ? "stock=house" : "stock=reps")),
    num("live", t("teamColLive"), (r) => r.activeTags, "status=active"),
    num("soldAll", t("teamColSoldAll"), (r) => r.totalSold, "stock=sold"),
    num("customers", t("teamColCustomers"), (r) => r.customers, null),
    num("qr", "QR", (r) => r.qr, "method=qr"),
    num("nfc", "NFC", (r) => r.nfc, "method=nfc"),
    { key: "lastSale", label: t("teamColLastSale"), align: "right", cellClassName: "whitespace-nowrap text-xs text-white/50", render: (r) => formatDate(r.lastSaleAt) },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat card label={t("teamPiecesSold")} value={total((r) => r.soldInRange)} detail={t("teamPiecesSoldHint")} />
        <Stat card label={t("teamActivations")} value={total((r) => r.activationsInRange)} detail={t("teamActivationsHint")} />
        <Stat card label={t("teamLivePieces")} value={total((r) => r.activeTags)} detail={t("teamLivePiecesHint")} />
        <Stat card label={t("teamScansTaps")} value={total((r) => r.qr + r.nfc)} detail={`${total((r) => r.qr)} QR · ${total((r) => r.nfc)} NFC`} />
      </div>

      <SectionCard accent="tags" icon={Users} title={t("teamByReseller")}>
        {rows.length === 0 ? (
          <EmptyState compact dense tone="tags" icon={Users} title={t("teamEmpty")} cardStyle={{}} />
        ) : (
          <CompactDataTable testId="admin-tags-team-table" columns={columns} rows={rows} getRowKey={(r) => r.repId ?? "house"} />
        )}
        <p className="mt-3 text-xs text-white/40">{t("teamFootnote")} {tf("teamLinksFootnote")}</p>
      </SectionCard>

      <SectionCard accent="tags" icon={Package} title={t("teamUnsoldStock")} className="min-w-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid" data-testid="admin-team-house-stock">
            <KpiTile accent="violet" icon={Warehouse} label={t("teamInHouseNoReseller")} value={u.inStock} detail={t("teamReadyForKit")} onClick={() => go("/pieces?stock=house")} />
          </div>
          <KpiTile accent="violet" icon={Users} label={t("ovWithResellers")} value={withResellers} detail={t("teamUnsoldInKits")} onClick={() => go("/pieces?stock=reps")} />
        </div>
      </SectionCard>
    </div>
  );
}

/** Resellers: the per-person report (the fleet analytics live on the Overview). */
export function TeamTab({ go }: { go: Go }) {
  const t = useT(manageTagsMessages);
  const [range, setRange] = useState<AnalyticsRange>({ preset: "30d" });
  return (
    <div className="min-w-0 space-y-4" data-testid="admin-tags-team">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-white/50">{t("teamIntro")}</p>
        <RangePicker value={range} onChange={setRange} />
      </div>
      <TeamReport range={range} go={go} />
    </div>
  );
}
