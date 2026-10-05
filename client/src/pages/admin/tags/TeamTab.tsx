import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Package, Trophy, Users } from "lucide-react";
import type { TagRepReportRow, TagTeamReport } from "@shared/tagsApi";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { ADMIN_TAGS_KEY, formatDate, getJson, STALE_MS, withQuery } from "./api";
import { CARD, SectionTitle, Stat, TD, TH } from "./ui";
import { Loading, LoadError, Panel, Select, useBatchOptions, useLeads, useReps } from "./pieces-shared";
import { useTagLabels } from "./labels";
import { AnalyticsPanel, RangePicker, rangeParams, type AnalyticsRange } from "./pieces-analytics";

type Go = (path: string) => void;

function RoleBadge({ row }: { row: TagRepReportRow }) {
  const t = useT(manageTagsMessages);
  if (row.role === "admin" || row.role === "manager") {
    return <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/60">{t(row.role === "admin" ? "role_admin" : "role_manager")}</span>;
  }
  if (!row.isActive) return <span className="ml-1.5 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/40">{t("teamRepOff")}</span>;
  return null;
}

function PersonCell({ row }: { row: TagRepReportRow }) {
  const t = useT(manageTagsMessages);
  if (row.repId === null) return <span className="italic text-white/50">{t("teamNoReseller")}</span>;
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-white">
        {row.name ?? t("teamResellerN", { id: row.repId })}
        <RoleBadge row={row} />
      </p>
      {row.email && row.email !== row.name ? <p className="truncate text-xs text-white/40">{row.email}</p> : null}
    </div>
  );
}

/** Per-reseller numbers for the window: sales, activations, stock and the scans their pieces got. */
function TeamReport({ range, go }: { range: AnalyticsRange; go: Go }) {
  const t = useT(manageTagsMessages);
  const labels = useTagLabels();
  const url = withQuery("/api/xpot/admin/tags/report", rangeParams(range));
  const { data, isLoading, error } = useQuery<TagTeamReport>({
    queryKey: [ADMIN_TAGS_KEY, "team-report", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <LoadError what={t("whatTeamReport")} error={error} />;

  const u = data.unassigned;
  const showUnassigned = !!(u.activeTags || u.qr || u.nfc || u.soldInRange || u.activationsInRange || u.inStock || u.totalSold);
  const rows = [...data.reps, ...(showUnassigned ? [u] : [])];
  const total = (pick: (r: TagRepReportRow) => number) => rows.reduce((sum, r) => sum + pick(r), 0);
  const withResellers = data.reps.reduce((sum, r) => sum + r.inStock, 0);
  const openRep = (r: TagRepReportRow) => go(`/pieces?rep=${r.repId ?? "house"}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("teamPiecesSold")} value={total((r) => r.soldInRange)} hint={t("teamPiecesSoldHint")} />
        <Stat label={t("teamActivations")} value={total((r) => r.activationsInRange)} hint={t("teamActivationsHint")} />
        <Stat label={t("teamLivePieces")} value={total((r) => r.activeTags)} hint={t("teamLivePiecesHint")} />
        <Stat label={t("teamScansTaps")} value={total((r) => r.qr + r.nfc)} hint={`${total((r) => r.qr)} QR · ${total((r) => r.nfc)} NFC`} />
      </div>

      <Panel title={<><Users className="h-4 w-4 text-white/50" />{t("teamByReseller")}</>}>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/40">{t("teamEmpty")}</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[820px]" data-testid="admin-tags-team-table">
              <thead className="border-b border-white/10">
                <tr>
                  <th className={TH}>{t("colReseller")}</th>
                  <th className={`${TH} text-right`}>{t("teamColSold")}</th>
                  <th className={`${TH} text-right`}>{t("teamColActivated")}</th>
                  <th className={`${TH} text-right`}>{t("teamColInStock")}</th>
                  <th className={`${TH} text-right`}>{t("teamColLive")}</th>
                  <th className={`${TH} text-right`}>{t("teamColSoldAll")}</th>
                  <th className={`${TH} text-right`}>{t("teamColCustomers")}</th>
                  <th className={`${TH} text-right`}>QR</th>
                  <th className={`${TH} text-right`}>NFC</th>
                  <th className={`${TH} text-right`}>{t("teamColLastSale")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r.repId ?? "house"} className="cursor-pointer hover:bg-white/[0.04]" onClick={() => openRep(r)} title={t("teamOpenRep")}>
                    <td className={`${TD} max-w-[240px]`}><PersonCell row={r} /></td>
                    <td className={`${TD} text-right font-semibold tabular-nums text-white`}>{r.soldInRange}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.activationsInRange}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.inStock}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.activeTags}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.totalSold}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.customers}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.qr}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.nfc}</td>
                    <td className={`${TD} text-right text-xs text-white/50`}>{formatDate(r.lastSaleAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-white/40">
          {t("teamFootnote")}
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title={<><Trophy className="h-4 w-4 text-white/50" />{t("teamMostScanned")}</>}>
          {data.topTags.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/40">{t("teamNoScansPeriod")}</p>
          ) : (
            <ol className="divide-y divide-white/5">
              {data.topTags.map((p, i) => (
                <li key={p.id}>
                  <button type="button" onClick={() => go(`/pieces/${p.id}`)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-white/[0.03]">
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/30">{i + 1}</span>
                    <TagFaceIcon face={p.face} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-white">
                        <span className="font-mono">{p.publicCode}</span> · {p.leadName ?? t("noCustomer")}
                      </span>
                      <span className="block truncate text-xs text-white/40">
                        {labels.product(p.productType)}
                        {p.label ? ` · ${p.label}` : ""} · {p.repName ? t("teamSoldBy", { name: p.repName }) : t("teamHouse")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-white/50">
                      <span className="font-semibold text-white">{p.qr + p.nfc}</span> ({p.qr} QR · {p.nfc} NFC)
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={<><Package className="h-4 w-4 text-white/50" />{t("teamUnsoldStock")}</>}>
          <div className="space-y-3">
            <button
              type="button"
              className={`${CARD} block w-full p-3 text-left hover:bg-white/[0.06]`}
              onClick={() => go("/pieces?rep=house&status=inventory")}
              data-testid="admin-team-house-stock"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{t("teamInHouseNoReseller")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">{u.inStock}</p>
              <p className="text-xs text-white/40">{t("teamReadyForKit")}</p>
            </button>
            <button type="button" className={`${CARD} block w-full p-3 text-left hover:bg-white/[0.06]`} onClick={() => go("/kits")}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{t("ovWithResellers")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">{withResellers}</p>
              <p className="text-xs text-white/40">{t("teamUnsoldInKits")}</p>
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Fleet analytics (the old Analytics tab), scoped by product, reseller, customer or batch. */
function FleetAnalytics({ range, go }: { range: AnalyticsRange; go: Go }) {
  const t = useT(manageTagsMessages);
  const labels = useTagLabels();
  const [scope, setScope] = useState<{ productType?: string; repId?: string; leadId?: string; batchId?: string }>({});
  const { data: reps = [] } = useReps();
  const { data: leads = [] } = useLeads();
  const { data: batches = [] } = useBatchOptions();
  const set = (patch: Partial<typeof scope>) => setScope((s) => ({ ...s, ...patch }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={scope.productType} onChange={(v) => set({ productType: v })} placeholder={t("allProducts")} options={labels.productOptions} />
        <Select value={scope.repId} onChange={(v) => set({ repId: v })} placeholder={t("allResellers")} options={reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }))} />
        <Select value={scope.leadId} onChange={(v) => set({ leadId: v })} placeholder={t("allCustomers")} options={leads.map((l) => ({ value: String(l.id), label: l.name }))} />
        <Select value={scope.batchId} onChange={(v) => set({ batchId: v })} placeholder={t("allBatches")} options={batches.map((b) => ({ value: b.id, label: b.batchCode }))} />
      </div>
      <AnalyticsPanel scopeUrl="/api/xpot/admin/tags/analytics" scope={scope} range={range} showTopTags onOpenTag={(id) => go(`/pieces/${id}`)} />
    </div>
  );
}

export function TeamTab({ go }: { go: Go }) {
  const t = useT(manageTagsMessages);
  const [range, setRange] = useState<AnalyticsRange>({ preset: "30d" });
  return (
    <div className="space-y-8" data-testid="admin-tags-team">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/50">{t("teamIntro")}</p>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <section>
        <SectionTitle>{t("teamReportTitle")}</SectionTitle>
        <TeamReport range={range} go={go} />
      </section>

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-2"><BarChart3 className="h-4 w-4" />{t("scansTaps")}</span>
        </SectionTitle>
        <FleetAnalytics range={range} go={go} />
      </section>
    </div>
  );
}
