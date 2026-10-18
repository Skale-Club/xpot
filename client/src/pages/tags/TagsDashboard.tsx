import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, BarChart3, Building2, ChevronRight, DollarSign, Package, Radio, ScanLine, Smartphone, Tag, Users } from "lucide-react";
import { useViewerAccess } from "@/lib/adminMode";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { TagDashboard } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { KpiTile } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ageOf, APP_BASE, errorText, tagPath, tagsGet } from "./lib";
import { CHART_TICK, CHART_TICK_DAY, chartTooltip, formatChartDay, formatCount, NFC_COLOR, NFC_SOFT, QR_COLOR, QR_SOFT } from "./charts";
import { CARD, EYEBROW_MUTED } from "./ui";

// The Tags dashboard, under the scan actions on the module's home: stock and
// sales, scans over the last 30 days (QR vs NFC), the pieces and customers
// scanned most, the phones used, and a loud count of pieces whose NFC chip was
// never written. The person's own pieces; every rep's for a manager in admin mode.

/** How a scan arrived, as a small badge in the chart's QR / NFC colours. */
function AccessBadge({ method }: { method: string }) {
  const nfc = method === "nfc";
  return (
    <span
      className="inline-flex h-4 items-center rounded px-1 text-[10px] font-bold uppercase leading-none tracking-wide"
      style={{ color: nfc ? NFC_COLOR : QR_COLOR, backgroundColor: nfc ? NFC_SOFT : QR_SOFT }}
    >
      {method}
    </span>
  );
}

function Ranked({ title, icon: Icon, items }: {
  title: string;
  icon: typeof Tag;
  items: Array<{
    key: string;
    label?: string;
    sub?: string | null;
    content?: ReactNode;
    hideIcon?: boolean;
    value: number;
    /** QR / NFC breakdown of `value`: splits the bar in the chart's colours and shows both counts. */
    split?: { qr: number; nfc: number };
    onClick?: () => void;
  }>;
}) {
  const t = useT(tagsMessages);
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <section>
      <h2 className={`mb-2 px-1 ${EYEBROW_MUTED}`}>{title}</h2>
      <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`}>
        {items.map((item) => (
          <li key={item.key}>
            <button type="button" onClick={item.onClick} disabled={!item.onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/10 disabled:active:bg-transparent">
              {!item.hideIcon && <Icon className="h-4 w-4 shrink-0 text-white/40" />}
              <span className="min-w-0 flex-1">
                {item.content ?? (
                  <>
                    <span className="block truncate text-sm font-semibold text-white">{item.label}</span>
                    {item.sub && <span className="block truncate text-xs text-white/40">{item.sub}</span>}
                  </>
                )}
                <span className="mt-2 flex h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  {item.split ? (
                    <>
                      <span className="h-1" style={{ width: `${(item.split.qr / max) * 100}%`, backgroundColor: QR_COLOR }} />
                      <span className="h-1" style={{ width: `${(item.split.nfc / max) * 100}%`, backgroundColor: NFC_COLOR }} />
                    </>
                  ) : (
                    <span className="h-1 rounded-full bg-violet-400/70" style={{ width: `${(item.value / max) * 100}%` }} />
                  )}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block text-sm font-bold text-white">{formatCount(item.value, t.locale)}</span>
                {item.split && (
                  <span className="mt-0.5 block text-[10px] font-semibold leading-none">
                    <span style={{ color: QR_COLOR }}>{formatCount(item.split.qr, t.locale)}</span>
                    <span className="text-white/25"> · </span>
                    <span style={{ color: NFC_COLOR }}>{formatCount(item.split.nfc, t.locale)}</span>
                  </span>
                )}
              </span>
              {item.onClick && <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TagsDashboard() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  // Management mode: the server answers with every rep's pieces (routes.ts, listActor).
  const fleet = useViewerAccess().canManage;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/xpot/tags/dashboard"],
    queryFn: () => tagsGet<TagDashboard>("/api/xpot/tags/dashboard?days=30"),
    staleTime: 30_000,
  });

  const total = data ? data.scans.qr + data.scans.nfc : undefined;
  const chart = (data?.daily ?? []).map((d) => ({
    day: d.day,
    qr: d.qr,
    nfc: d.nfc,
  }));
  const recentScans = data?.recentScans ?? [];

  return (
    <div className="space-y-5" data-testid="tags-dashboard">
      {fleet && (
        <p className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200" data-testid="dashboard-fleet-scope">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {t("fleetViewing")}
        </p>
      )}
      {data && data.chipsMissing > 0 && (
        <button
          type="button"
          // Every rep's count in management mode: "My pieces" would hold only the viewer's, so it opens the
          // Overview's "Chips to write" list (set-up pieces whose chip is not written and checked).
          onClick={() => navigate(fleet ? "/admin/tags/overview/chipPending" : `${APP_BASE}/pieces?chip=missing`)}
          className="flex w-full items-center gap-3 rounded-2xl border border-red-400/40 bg-red-500/[0.12] p-4 text-left"
          data-testid="dashboard-chips-missing"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-300" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-red-100">{t.plural("dashChipsMissing", data.chipsMissing)}</span>
            <span className="block text-xs text-red-100/70">{t("nfcMissingBody")}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-red-200/60" />
        </button>
      )}

      {error && !data ? (
        <ErrorState message={errorText(error, tc("requestFailed"))} onRetry={() => void refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-4" data-testid="tags-summary">
          <KpiTile accent="violet" icon={Package} loading={isLoading} label={fleet ? t("statWithResellers") : t("statInStock")} value={data ? formatCount(data.inStock, t.locale) : "—"} />
          <KpiTile accent="violet" icon={Radio} loading={isLoading} label={t("statActive")} value={data ? formatCount(data.active, t.locale) : "—"} />
          <KpiTile accent="violet" icon={DollarSign} loading={isLoading} label={t("statSold30")} value={data ? formatCount(data.soldInPeriod, t.locale) : "—"} />
          <KpiTile accent="violet" icon={ScanLine} loading={isLoading} label={t("statScans30")} value={total != null ? formatCount(total, t.locale) : "—"} />
        </div>
      )}

      {data && (
        <section className={`${CARD} p-4`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className={EYEBROW_MUTED}>{t("dashScansTitle")}</h2>
            <p className="text-xs text-white/45">
              <span style={{ color: QR_COLOR }}>■</span> QR {formatCount(data.scans.qr, t.locale)} · <span style={{ color: NFC_COLOR }}>■</span> NFC {formatCount(data.scans.nfc, t.locale)} · {t("dashVisitors", { n: formatCount(data.visitors, t.locale) })}
            </p>
          </div>
          {total === 0 ? (
            <div className="mt-3">
              <EmptyState compact dense tone="tags" icon={BarChart3} title={t("dashEmpty")} cardStyle={{}} />
            </div>
          ) : (
            <div className="mt-3 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    tick={CHART_TICK}
                    tickFormatter={(day: string) => formatChartDay(day, t.locale, CHART_TICK_DAY)}
                  />
                  <Tooltip {...chartTooltip(t.locale)} />
                  <Bar dataKey="qr" name="QR" stackId="s" fill={QR_COLOR} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="nfc" name="NFC" stackId="s" fill={NFC_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      {recentScans.length > 0 && (
        <section data-testid="recent-scans">
          <h2 className={`mb-2 px-1 ${EYEBROW_MUTED}`}>{t("dashRecentScans")}</h2>
          <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`}>
            {recentScans.map((scan) => {
              const age = ageOf(new Date(scan.occurredAt).getTime());
              return (
                <li key={scan.id}>
                  <button
                    type="button"
                    onClick={() => navigate(tagPath(scan.publicCode))}
                    className="flex min-h-[68px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/10"
                  >
                    <TagPieceMention
                      publicCode={scan.publicCode}
                      productType={scan.productType}
                      face={scan.face}
                      batchCode={scan.batchCode}
                      customer={scan.leadName}
                      className="min-w-0 flex-1"
                    />
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs text-white/40">{t(age.key, { n: age.n })}</span>
                      <AccessBadge method={scan.accessMethod} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data && data.topPieces.length > 0 && (
        <Ranked
          title={t("dashTopPieces")}
          icon={Tag}
          items={data.topPieces.map((p) => ({
            key: p.id,
            hideIcon: true,
            content: (
              <TagPieceMention
                publicCode={p.publicCode}
                productType={p.productType}
                face={p.face}
                batchCode={p.batchCode}
                customer={p.leadName}
                details={p.label || undefined}
              />
            ),
            value: p.scans,
            split: { qr: p.qr, nfc: p.nfc },
            onClick: () => navigate(tagPath(p.publicCode)),
          }))}
        />
      )}

      {data && data.topCustomers.length > 0 && (
        <Ranked
          title={t("dashTopCustomers")}
          icon={Building2}
          items={data.topCustomers.map((c) => ({
            key: String(c.leadId),
            label: c.name,
            sub: t.plural("dashPieces", c.pieces),
            value: c.scans,
            onClick: () => navigate(`${APP_BASE}/customers/${c.leadId}`),
          }))}
        />
      )}

      {data && data.devices.length > 0 && (
        <Ranked
          title={t("dashDevices")}
          icon={Smartphone}
          items={data.devices.map((d) => ({ key: d.os, label: d.os === "other" ? t("dashOtherDevice") : d.os, value: d.scans }))}
        />
      )}

    </div>
  );
}
