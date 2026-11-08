import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ArrowLeft, CalendarDays, ExternalLink, Package, ScanLine } from "lucide-react";
import { CUSTOMER_PANEL_PATH } from "@shared/customerPanel";
import { guessDestinationType } from "@shared/tagApp";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { KpiTile } from "@/components/xpot/DashboardKit";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { Pill, PIECE_STATUS_TONE } from "@/components/xpot/StatusPill";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { useT } from "@/i18n";
import { externalLinkProps } from "@/lib/externalLinks";
import { myPlatesMessages } from "@/i18n/messages/myPlates";
import { tagsMessages } from "@/i18n/messages/tags";
import { EdgeTick } from "@/pages/tags/ChartTick";
import {
  CHART_TICK_DAY, chartTickInterval, chartTooltip, formatChartDay, formatCount, NFC_COLOR, QR_COLOR,
} from "@/pages/tags/charts";
import { CARD, EYEBROW_MUTED } from "@/pages/tags/ui";
import { MY_KEYS, MyApiError, myApi } from "./api";
import { relativeTime } from "./format";
import { usePlateWords } from "./Plates";
import { TalkToSeller } from "./TalkToSeller";

/** One plate: its scans per day, how people reached it (QR or tap), and where it opens. Read only. */
export function PlateDetail({ code }: { code: string }) {
  const t = useT(myPlatesMessages);
  const tt = useT(tagsMessages);
  const words = usePlateWords();
  const plate = useQuery({ queryKey: MY_KEYS.piece(code), queryFn: () => myApi.piece(code), staleTime: 30_000 });

  if (plate.isLoading) return <ListSkeleton rows={3} />;
  if (plate.error instanceof MyApiError && plate.error.status === 404) {
    return (
      <EmptyState
        tone="tags"
        icon={Package}
        title={t("plateNotFound")}
        action={
          <Button asChild variant="secondary">
            <Link href={CUSTOMER_PANEL_PATH}><ArrowLeft />{t("backToPlates")}</Link>
          </Button>
        }
      />
    );
  }
  if (!plate.data) return <ErrorState message={t("loadFailed")} onRetry={() => void plate.refetch()} retryLabel={t("retry")} />;

  const p = plate.data;
  const total = p.qr30 + p.nfc30;
  const link = p.destinationUrl && /^https?:\/\//i.test(p.destinationUrl) ? p.destinationUrl : null;
  // The owner reads where a plate opens, not an address: its kind and its site; the whole link sits behind "Open this link".
  const kind = link ? guessDestinationType(link) : null;
  const host = link ? new URL(link).hostname.replace(/^www\./, "") : null;

  return (
    <div className="space-y-4" data-testid="my-plate">
      <header className="flex items-center gap-3">
        <TagFaceIcon face={p.face} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-[22px] font-extrabold leading-tight tracking-tight text-white">{words.name(p)}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/50">
            <Pill tone={PIECE_STATUS_TONE[p.status] ?? "slate"}>{words.status(p)}</Pill>
            <span className="font-mono tracking-wider">{p.code}</span>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <KpiTile accent="violet" icon={ScanLine} value={formatCount(p.scans7, t.locale)} label={t("kpiWeek")} />
        <KpiTile accent="violet" icon={CalendarDays} value={formatCount(p.scans30, t.locale)} label={t("kpiMonth")} />
      </div>
      {p.lastScanAt && <p className="px-1 text-sm text-white/50">{t("lastScan", { when: relativeTime(p.lastScanAt, Date.now(), t.locale) })}</p>}

      <section className={`${CARD} p-4`}>
        <h2 className={EYEBROW_MUTED}>{t("chartTitle")}</h2>
        {total === 0 ? (
          <p className="mt-3 text-sm text-white/45">{t("neverScanned")}</p>
        ) : (
          <>
            <div className="mt-3 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={p.daily} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    interval={chartTickInterval(p.daily.length)}
                    tick={<EdgeTick format={(day: string) => formatChartDay(day, t.locale, CHART_TICK_DAY)} />}
                  />
                  <Tooltip {...chartTooltip(t.locale)} />
                  <Bar dataKey="qr" name={t("howQr")} stackId="s" fill={QR_COLOR} />
                  <Bar dataKey="nfc" name={t("howNfc")} stackId="s" fill={NFC_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <h3 className={`mt-4 ${EYEBROW_MUTED}`}>{t("howTitle")}</h3>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                <dt className="flex items-center gap-1.5 text-white/60"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: QR_COLOR }} />{t("howQr")}</dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-white">{formatCount(p.qr30, t.locale)}</dd>
              </div>
              <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                <dt className="flex items-center gap-1.5 text-white/60"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: NFC_COLOR }} />{t("howNfc")}</dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-white">{formatCount(p.nfc30, t.locale)}</dd>
              </div>
            </dl>
          </>
        )}
      </section>

      <section className={`${CARD} p-4`}>
        <h2 className={EYEBROW_MUTED}>{t("opensTitle")}</h2>
        {p.destinationUrl ? (
          <p className="mt-2 text-sm text-white/80" data-testid="my-plate-opens">
            {kind && <span className="block font-semibold text-white">{tt(`dest_${kind}` as "dest_website")}</span>}
            <span className="block break-all text-white/55">{host ?? p.destinationUrl}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-white/45">{t("opensNothing")}</p>
        )}
        {link && (
          <a {...externalLinkProps(link)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300 hover:text-violet-200">
            {t("openLink")} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </section>

      <TalkToSeller businessName={p.businessName} />
    </div>
  );
}
