import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Package, Trophy, Users } from "lucide-react";
import type { TagRepReportRow, TagTeamReport } from "@shared/tagsApi";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { ADMIN_TAGS_KEY, formatDate, getJson, STALE_MS, withQuery } from "./api";
import { CARD, SectionTitle, Stat, TD, TH } from "./ui";
import { Loading, LoadError, Panel, PRODUCT_OPTIONS, productLabel, repOptionLabel, Select, useBatchOptions, useLeads, useReps } from "./pieces-shared";
import { AnalyticsPanel, RangePicker, rangeParams, type AnalyticsRange } from "./pieces-analytics";

type Go = (path: string) => void;

function RoleBadge({ row }: { row: TagRepReportRow }) {
  if (row.role === "admin" || row.role === "manager") {
    return <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/60">{row.role}</span>;
  }
  if (!row.isActive) return <span className="ml-1.5 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/40">Off</span>;
  return null;
}

function PersonCell({ row }: { row: TagRepReportRow }) {
  if (row.repId === null) return <span className="italic text-white/50">No reseller (house)</span>;
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-white">
        {row.name ?? `Reseller #${row.repId}`}
        <RoleBadge row={row} />
      </p>
      {row.email && row.email !== row.name ? <p className="truncate text-xs text-white/40">{row.email}</p> : null}
    </div>
  );
}

/** Per-reseller numbers for the window: sales, activations, stock and the scans their pieces got. */
function TeamReport({ range, go }: { range: AnalyticsRange; go: Go }) {
  const url = withQuery("/api/xpot/admin/tags/report", rangeParams(range));
  const { data, isLoading, error } = useQuery<TagTeamReport>({
    queryKey: [ADMIN_TAGS_KEY, "team-report", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <LoadError what="the team report" error={error} />;

  const u = data.unassigned;
  const showUnassigned = !!(u.activeTags || u.qr || u.nfc || u.soldInRange || u.activationsInRange || u.inStock || u.totalSold);
  const rows = [...data.reps, ...(showUnassigned ? [u] : [])];
  const total = (pick: (r: TagRepReportRow) => number) => rows.reduce((sum, r) => sum + pick(r), 0);
  const withResellers = data.reps.reduce((sum, r) => sum + r.inStock, 0);
  const openRep = (r: TagRepReportRow) => go(`/pieces?rep=${r.repId ?? "house"}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pieces sold" value={total((r) => r.soldInRange)} hint="Sale counted in this period" />
        <Stat label="Activations" value={total((r) => r.activationsInRange)} hint="Pieces put live in this period" />
        <Stat label="Live pieces" value={total((r) => r.activeTags)} hint="Active right now" />
        <Stat label="Scans + taps" value={total((r) => r.qr + r.nfc)} hint={`${total((r) => r.qr)} QR · ${total((r) => r.nfc)} NFC`} />
      </div>

      <Panel title={<><Users className="h-4 w-4 text-white/50" />By reseller</>}>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/40">No resellers with pieces yet. Hand out a kit and they show up here.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[820px]" data-testid="admin-tags-team-table">
              <thead className="border-b border-white/10">
                <tr>
                  <th className={TH}>Reseller</th>
                  <th className={`${TH} text-right`}>Sold</th>
                  <th className={`${TH} text-right`}>Activated</th>
                  <th className={`${TH} text-right`}>In stock</th>
                  <th className={`${TH} text-right`}>Live</th>
                  <th className={`${TH} text-right`}>Sold (all time)</th>
                  <th className={`${TH} text-right`}>Customers</th>
                  <th className={`${TH} text-right`}>QR</th>
                  <th className={`${TH} text-right`}>NFC</th>
                  <th className={`${TH} text-right`}>Last sale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r.repId ?? "house"} className="cursor-pointer hover:bg-white/[0.04]" onClick={() => openRep(r)} title="Open this reseller's pieces">
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
          Sold: pieces whose first activation for a customer fell in this period, credited to the reseller holding them.
          Activated: pieces this person put live in the period. In stock: unsold pieces in their kit now.
          QR/NFC: scans and taps in the period on pieces the reseller held.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title={<><Trophy className="h-4 w-4 text-white/50" />Most scanned pieces</>}>
          {data.topTags.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/40">No scans in this period.</p>
          ) : (
            <ol className="divide-y divide-white/5">
              {data.topTags.map((t, i) => (
                <li key={t.id}>
                  <button type="button" onClick={() => go(`/pieces/${t.id}`)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-white/[0.03]">
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/30">{i + 1}</span>
                    <TagFaceIcon face={t.face} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-white">
                        <span className="font-mono">{t.publicCode}</span> · {t.leadName ?? "No customer"}
                      </span>
                      <span className="block truncate text-xs text-white/40">
                        {productLabel(t.productType)}
                        {t.label ? ` · ${t.label}` : ""} · {t.repName ? `sold by ${t.repName}` : "house"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-white/50">
                      <span className="font-semibold text-white">{t.qr + t.nfc}</span> ({t.qr} QR · {t.nfc} NFC)
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={<><Package className="h-4 w-4 text-white/50" />Unsold stock</>}>
          <div className="space-y-3">
            <button
              type="button"
              className={`${CARD} block w-full p-3 text-left hover:bg-white/[0.06]`}
              onClick={() => go("/pieces?rep=house&status=inventory")}
              data-testid="admin-team-house-stock"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">In house, no reseller</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">{u.inStock}</p>
              <p className="text-xs text-white/40">Ready to hand out in a kit</p>
            </button>
            <button type="button" className={`${CARD} block w-full p-3 text-left hover:bg-white/[0.06]`} onClick={() => go("/kits")}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">With resellers</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">{withResellers}</p>
              <p className="text-xs text-white/40">Unsold, in resellers' kits</p>
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Fleet analytics (the old Analytics tab), scoped by product, reseller, customer or batch. */
function FleetAnalytics({ range, go }: { range: AnalyticsRange; go: Go }) {
  const [scope, setScope] = useState<{ productType?: string; repId?: string; leadId?: string; batchId?: string }>({});
  const { data: reps = [] } = useReps();
  const { data: leads = [] } = useLeads();
  const { data: batches = [] } = useBatchOptions();
  const set = (patch: Partial<typeof scope>) => setScope((s) => ({ ...s, ...patch }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={scope.productType} onChange={(v) => set({ productType: v })} placeholder="All products" options={PRODUCT_OPTIONS} />
        <Select value={scope.repId} onChange={(v) => set({ repId: v })} placeholder="All resellers" options={reps.map((r) => ({ value: String(r.id), label: repOptionLabel(r) }))} />
        <Select value={scope.leadId} onChange={(v) => set({ leadId: v })} placeholder="All customers" options={leads.map((l) => ({ value: String(l.id), label: l.name }))} />
        <Select value={scope.batchId} onChange={(v) => set({ batchId: v })} placeholder="All batches" options={batches.map((b) => ({ value: b.id, label: b.batchCode }))} />
      </div>
      <AnalyticsPanel scopeUrl="/api/xpot/admin/tags/analytics" scope={scope} range={range} showTopTags onOpenTag={(id) => go(`/pieces/${id}`)} />
    </div>
  );
}

export function TeamTab({ go }: { go: Go }) {
  const [range, setRange] = useState<AnalyticsRange>({ preset: "30d" });
  return (
    <div className="space-y-8" data-testid="admin-tags-team">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/50">Who sells, who activates, and how the pieces are used.</p>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <section>
        <SectionTitle>Team report</SectionTitle>
        <TeamReport range={range} go={go} />
      </section>

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-2"><BarChart3 className="h-4 w-4" />Scans & taps</span>
        </SectionTitle>
        <FleetAnalytics range={range} go={go} />
      </section>
    </div>
  );
}
