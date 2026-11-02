import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ChevronRight, Users, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { FilterBar, FilterSearch, FilterToggle } from "@/components/xpot/filters";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { Pill, toneOf } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/i18n";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { manageMessages, type ManageKey } from "@/i18n/messages/manage";
import { visibleXphereRows, xphereState, XPHERE_KEY, type XphereRow, type XphereState } from "./integrationsUi";

const STATE_TONE = { connected: "green", paused: "amber", notConnected: "slate" } as const satisfies Record<XphereState, string>;
const SYNC_KEYS: Record<string, ManageKey> = {
  pending: "syncStatus_pending",
  synced: "syncStatus_synced",
  failed: "syncStatus_failed",
  needs_review: "syncStatus_needs_review",
};
const SYNC_TONE: Record<string, "green" | "slate" | "amber" | "red"> = { synced: "green", pending: "slate", needs_review: "amber", failed: "red" };

/** Name or email contains the search (any case). */
function matches(row: XphereRow, search: string) {
  const q = search.trim().toLowerCase();
  return !q || [row.displayName, row.email].some((value) => value?.toLowerCase().includes(q));
}

/**
 * Account › Integrations › Xphere: who is connected to the Xphere CRM, one row each. The connection itself
 * (token, keys, address) is set in the person's own panel in People, where "Set up" goes.
 */
export function AdminXphere() {
  const query = useQuery<XphereRow[]>({ queryKey: XPHERE_KEY });
  const t = useT(integrationsMessages);
  const tm = useT(manageMessages);
  const [, navigate] = useLocation();
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const visible = visibleXphereRows(query.data ?? [], showAll);
  const rows = visible.filter((row) => matches(row, search));
  const page = usePagedList(rows, { resetKey: `${search}|${showAll}` });

  if (query.isLoading) return <ListSkeleton rows={4} rowClassName="h-14 rounded-xl" />;
  if (query.isError || !query.data) {
    return <ErrorState message={t("xphereLoadFailed")} onRetry={() => void query.refetch()} />;
  }

  // Someone who cannot be connected (no Visits, blocked, waiting, deleted) says why instead of a state.
  const cannot = (row: XphereRow) => row.deleted || row.access !== "active" || !row.usesVisits;
  const columns: CompactDataColumn<XphereRow>[] = [
    {
      key: "person",
      label: t("colPerson"),
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-white/90" data-testid={`xphere-person-${row.repId}`}>{row.displayName}</p>
          <p className="truncate text-xs text-white/40">{row.email ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "state",
      label: t("colState"),
      render: (row) => {
        if (row.deleted) return <Pill tone="muted">{t("statusDeleted")}</Pill>;
        if (row.access === "blocked") return <Pill tone="red">{t("statusBlocked")}</Pill>;
        if (row.access === "pending") return <Pill tone="amber">{t("statusPending")}</Pill>;
        if (!row.usesVisits) return <Pill tone="slate">{t("statusTagsOnly")}</Pill>;
        const state = xphereState(row);
        return <Pill tone={STATE_TONE[state]} dot>{t(`xphereState_${state}`)}</Pill>;
      },
    },
    {
      key: "sync",
      label: t("colLastSync"),
      headerClassName: "hidden sm:table-cell",
      cellClassName: "hidden sm:table-cell",
      render: (row) =>
        row.lastSync ? (
          <div className="flex flex-col items-start gap-1">
            <Pill tone={toneOf(SYNC_TONE, row.lastSync.status, "amber")}>{SYNC_KEYS[row.lastSync.status] ? tm(SYNC_KEYS[row.lastSync.status]) : row.lastSync.status}</Pill>
            {row.lastSync.at && <span className="text-[11px] text-white/40">{formatDateTime(row.lastSync.at)}</span>}
          </div>
        ) : (
          <span className="text-white/35">—</span>
        ),
    },
    {
      key: "open",
      label: <span className="sr-only">{t("colSetUp")}</span>,
      width: 120,
      cellClassName: "text-right",
      render: (row) =>
        row.deleted ? null : cannot(row) ? (
          <ChevronRight className="ml-auto h-4 w-4 text-white/30" aria-hidden="true" />
        ) : (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/admin/reps/${row.repId}`} onClick={(e) => e.stopPropagation()} data-testid={`xphere-setup-${row.repId}`}>
              {xphereState(row) === "notConnected" ? t("setUp") : t("manageXphere")}
            </Link>
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl ${GLASS_CLASS} p-5`}>
        <p className="flex items-start gap-2 text-sm text-white/60">
          <Webhook className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("xphereIntro")}
        </p>
      </div>

      <FilterBar
        search={<FilterSearch value={search} onChange={setSearch} placeholder={tm("searchPeople")} testId="xphere-search" />}
        controls={<FilterToggle pressed={showAll} onChange={setShowAll} label={t("showAll")} testId="xphere-show-all" />}
        summary={{ active: search.trim() !== "", shown: rows.length, total: visible.length, onClear: () => setSearch("") }}
      />

      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title={search.trim() ? tm("noPeopleMatch") : query.data.length && !showAll ? t("noRepsHidden") : t("noRepsYet")}
        />
      ) : (
        <>
          <CompactDataTable
            columns={columns}
            rows={page.visible}
            getRowKey={(row) => row.repId}
            onRowClick={(row) => !row.deleted && navigate(`/admin/reps/${row.repId}`)}
            getRowClassName={(row) => (row.deleted ? "opacity-60" : "")}
            getRowTestId={(row) => `xphere-${row.repId}`}
          />
          <ListPager shown={page.shown} total={page.total} hasMore={page.hasMore} onMore={page.showMore} />
        </>
      )}
    </div>
  );
}
