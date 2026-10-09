import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, History, Power, Trophy } from "lucide-react";
import type { TagAnalytics, TagOverview } from "@shared/tagsApi";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { shellMessages } from "@/i18n/messages/shell";
import { ADMIN_TAGS_KEY, formatDateTime, getJson, STALE_MS } from "./api";
import { CARD, SectionTitle, Stat } from "./ui";
import { Loading, LoadError, Panel } from "./pieces-shared";
import { useTagLabels } from "./labels";

const LINK = "inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300";

/** Share of a total as a whole percent, in the language in use. */
function percentIn(locale: string, part: number, total: number): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(total ? part / total : 0);
}

function StatButton({ label, value, hint, onClick, testId }: { label: string; value: number; hint?: string; onClick: () => void; testId?: string }) {
  return (
    <button type="button" onClick={onClick} className={`${CARD} p-4 text-left transition-colors hover:bg-white/[0.06]`} data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-white/40">{hint}</p>}
    </button>
  );
}

/** Most scanned pieces in the last 30 days (from the fleet analytics). */
function TopPieces({ go }: { go: (path: string) => void }) {
  const t = useT(manageTagsMessages);
  const { data, isLoading, error } = useQuery<TagAnalytics>({
    queryKey: [ADMIN_TAGS_KEY, "analytics", "overview-top-30d"],
    queryFn: () => getJson("/api/xpot/admin/tags/analytics?range=30d"),
    staleTime: STALE_MS,
  });
  return (
    <Panel
      title={<><Trophy className="h-4 w-4 text-white/50" />{t("ovTopPieces")}</>}
      right={<button type="button" className={LINK} onClick={() => go("/team")}>{t("ovResellersReport")} <ArrowRight className="h-3 w-3" /></button>}
    >
      {isLoading ? (
        <Loading className="py-6" />
      ) : error || !data ? (
        <p className="text-sm text-red-400">{t("ovTopPiecesError")}</p>
      ) : data.topTags.length === 0 ? (
        <p className="text-sm text-white/40">{t("ovNoScans30")}</p>
      ) : (
        <ol className="divide-y divide-white/5">
          {data.topTags.slice(0, 8).map((p, i) => (
            <li key={p.id}>
              <button type="button" onClick={() => go(`/pieces/${p.id}`)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-white/[0.03]">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/30">{i + 1}</span>
                <TagFaceIcon face={p.face} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-mono font-semibold text-white">{p.publicCode}</span>
                  <span className="ml-2 text-white/50">{p.leadName ?? t("noCustomer")}</span>
                  {p.repName ? <span className="ml-1 text-xs text-white/30">· {p.repName}</span> : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-white/50">
                  <span className="font-semibold text-white">{p.qr + p.nfc}</span> ({p.qr} QR · {p.nfc} NFC)
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function OverviewTab({ go }: { go: (path: string) => void }) {
  const t = useT(manageTagsMessages);
  const ts = useT(shellMessages);
  const labels = useTagLabels();
  const { data, isLoading, error } = useQuery<TagOverview>({
    queryKey: [ADMIN_TAGS_KEY, "overview"],
    queryFn: () => getJson(`/api/xpot/admin/tags/overview?timezoneOffset=${new Date().getTimezoneOffset()}`),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <LoadError what={t("whatOverview")} error={error} />;

  const { counts, stock, interactions, split30 } = data;
  const split = split30.qr + split30.nfc;
  const unsold = stock.house + stock.withResellers;
  const percent = (part: number, total: number) => percentIn(t.locale, part, total);

  return (
    <div className="space-y-6" data-testid="admin-tags-overview">
      <section>
        <SectionTitle right={<button type="button" className={LINK} onClick={() => go("/kits")}>{ts("manageKits")} <ArrowRight className="h-3 w-3" /></button>}>
          {t("ovStock")}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatButton label={t("ovInHouse")} value={stock.house} hint={t("ovInHouseHint", { percent: percent(stock.house, unsold) })} onClick={() => go("/pieces?rep=house&status=inventory")} testId="overview-stock-house" />
          <StatButton label={t("ovWithResellers")} value={stock.withResellers} hint={t("ovWithResellersHint", { percent: percent(stock.withResellers, unsold) })} onClick={() => go("/kits")} testId="overview-stock-resellers" />
          <StatButton label={t("ovTotalPieces")} value={counts.total} hint={t.plural("ovTotalHint", counts.retired)} onClick={() => go("/batches")} />
        </div>
      </section>

      <section>
        <SectionTitle right={<button type="button" className={LINK} onClick={() => go("/pieces")}>{ts("managePieces")} <ArrowRight className="h-3 w-3" /></button>}>
          {t("ovLifecycle")}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatButton label={labels.status("inventory")} value={counts.inventory} hint={t("ovInventoryHint")} onClick={() => go("/pieces?status=inventory")} />
          <StatButton label={labels.status("assigned")} value={counts.assigned} hint={t("ovAssignedHint")} onClick={() => go("/pieces?status=assigned")} />
          <StatButton label={labels.status("active")} value={counts.active} hint={t("ovActiveHint")} onClick={() => go("/pieces?status=active")} />
          <StatButton label={labels.status("disabled")} value={counts.disabled} onClick={() => go("/pieces?status=disabled")} />
          <StatButton label={labels.status("retired")} value={counts.retired} onClick={() => go("/pieces?status=retired")} />
        </div>
      </section>

      <section>
        <SectionTitle>{t("scansTaps")}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("ovToday")} value={interactions.today} hint={t("ovUtcDay")} />
          <Stat label={t("ovLast7")} value={interactions.last7} />
          <Stat label={t("ovLast30")} value={interactions.last30} hint={`QR ${percent(split30.qr, split)} · NFC ${percent(split30.nfc, split)}`} />
          <Stat label={t("ovApproxUnique")} value={data.approxUnique30} hint={t("ovApproxHint")} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={<><Activity className="h-4 w-4 text-white/50" />{t("ovLatestScans")}</>}>
          {data.recentEvents.length === 0 ? (
            <p className="text-sm text-white/40">{t("ovNoScansYet")}</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {data.recentEvents.map((e) => (
                <li key={e.id}>
                  <button type="button" className="flex w-full items-center gap-3 py-2 text-left hover:bg-white/[0.03]" onClick={() => go(`/pieces/${e.tagId}`)}>
                    <TagFaceIcon face={e.face} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono font-semibold text-white">{e.publicCode}</span>
                      <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/60">{e.accessMethod}</span>
                      <span className="block truncate text-xs text-white/40">
                        {e.leadName ?? t("noCustomer")} · {labels.event(e.eventType)}
                        {e.deviceType ? ` · ${e.deviceType}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-white/40">{formatDateTime(e.occurredAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <TopPieces go={go} />

          <Panel title={<><Power className="h-4 w-4 text-white/50" />{t("ovRecentlyActivated")}</>}>
            {data.recentActivations.length === 0 ? (
              <p className="text-sm text-white/40">{t("ovNoLivePieces")}</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {data.recentActivations.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="flex w-full items-center gap-3 py-2 text-left hover:bg-white/[0.03]" onClick={() => go(`/pieces/${a.id}`)}>
                      <TagFaceIcon face={a.face} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-mono font-semibold text-white">{a.publicCode}</span>
                        <span className="ml-2 text-white/50">{a.leadName ?? "—"}</span>
                        {a.repName ? <span className="ml-1 text-xs text-white/30">· {a.repName}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-white/40">{formatDateTime(a.activatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={<><History className="h-4 w-4 text-white/50" />{t("ovRecentChanges")}</>}>
            {data.recentChanges.length === 0 ? (
              <p className="text-sm text-white/40">{t("ovNoChanges")}</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {data.recentChanges.map((c) => (
                  <li key={c.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="font-mono font-semibold text-white hover:underline" onClick={() => go(`/pieces/${c.tagId}`)}>
                        {c.publicCode}
                      </button>
                      <span className="text-xs text-white/40">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="truncate text-xs text-white/40">
                      {c.newUrl ? `${labels.destination(c.newDestinationType)} · ${c.newUrl}` : c.reason ? t("ovDestClearedReason", { reason: c.reason }) : t("ovDestCleared")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
