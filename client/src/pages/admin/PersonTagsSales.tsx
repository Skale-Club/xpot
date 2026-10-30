import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { TagTeamReport } from "@shared/tagsApi";
import { sellBlockers } from "@shared/tagDistribution";
import { Stat } from "@/components/xpot/Stat";
import { Pill } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { ADMIN_TAGS_KEY, formatDate, getJson, STALE_MS, withQuery } from "./tags/api";
import { SELL_BLOCKER_KEYS } from "./tags/distribution-model";
import { Loading, LoadError } from "./tags/pieces-shared";
import { RangePicker, rangeParams, type AnalyticsRange } from "./tags/pieces-analytics";
import type { Rep } from "./PersonDetail";

/** Why this person cannot sell Tags pieces yet (a manager or admin only lacks a block or the module). Empty for a sign-up still waiting. */
export function personSellBlockers(rep: Rep) {
  return rep.access === "pending" ? [] : sellBlockers(rep);
}

/** The small amber / red pills for what stops a reseller from selling (shared by the People list and the person). */
export function SellBlockerPills({ rep, testId }: { rep: Rep; testId?: string }) {
  const tf = useT(adminTagsFlowMessages);
  const blockers = personSellBlockers(rep);
  if (!blockers.length) return null;
  return (
    <span className="flex flex-wrap gap-1" data-testid={testId}>
      {blockers.map((b) => (
        <Pill key={b} tone={b === "blocked" ? "red" : "amber"} className="px-2 py-0.5 text-[11px]">{tf(SELL_BLOCKER_KEYS[b])}</Pill>
      ))}
    </span>
  );
}

/**
 * What the Resellers table used to show for one person: sales, activations, stock in hand and scans in a
 * window. Same endpoint and query key as the report (GET /admin/tags/report, a manager's), filtered to the
 * person; a reseller with no pieces yet is not in the report, so their numbers are zeros.
 */
export function PersonTagsSales({ rep }: { rep: Rep }) {
  const t = useT(manageTagsMessages);
  const [range, setRange] = useState<AnalyticsRange>({ preset: "30d" });
  const url = withQuery("/api/xpot/admin/tags/report", rangeParams(range));
  const { data, isLoading, error, refetch } = useQuery<TagTeamReport>({
    queryKey: [ADMIN_TAGS_KEY, "team-report", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });
  const row = data?.reps.find((r) => r.repId === rep.id);
  // Inventory filtered to this person, with the number's own filter.
  const pieces = (filter: string) => `/admin/tags/pieces?rep=${rep.id}&${filter}`;

  return (
    <div className="space-y-3" data-testid={`person-tags-sales-${rep.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SellBlockerPills rep={rep} testId={`person-cannot-sell-${rep.id}`} />
        <RangePicker value={range} onChange={setRange} />
      </div>
      {isLoading ? (
        <Loading rows={2} />
      ) : error || !data ? (
        <LoadError what={t("whatTeamReport")} error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat card label={t("teamColSold")} value={row?.soldInRange ?? 0} detail={t("teamPiecesSoldHint")} />
            <Stat card label={t("teamColActivated")} value={row?.activationsInRange ?? 0} detail={t("teamActivationsHint")} />
            <Stat card label={t("teamColInStock")} value={row?.inStock ?? 0} />
            <Stat card label={t("teamScansTaps")} value={(row?.qr ?? 0) + (row?.nfc ?? 0)} detail={`${row?.qr ?? 0} QR · ${row?.nfc ?? 0} NFC`} />
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
            <Link href={pieces("status=active")} className="underline-offset-2 hover:text-violet-200 hover:underline">
              {t("teamColLive")}: {row?.activeTags ?? 0}
            </Link>
            <Link href={pieces("stock=sold")} className="underline-offset-2 hover:text-violet-200 hover:underline">
              {t("teamColSoldAll")}: {row?.totalSold ?? 0}
            </Link>
            <span>{t("teamColCustomers")}: {row?.customers ?? 0}</span>
            <span>{t("teamColLastSale")}: {formatDate(row?.lastSaleAt ?? null)}</span>
          </p>
        </>
      )}
    </div>
  );
}
