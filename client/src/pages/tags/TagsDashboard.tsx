import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, Building2, ChevronRight, Link2, Smartphone, Tag } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { TagDashboard } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { APP_BASE, directPath, tagPath, tagsGet } from "./lib";
import { CARD, EYEBROW_MUTED } from "./ui";

// The Tags dashboard, under the scan actions on the module's home: stock and
// sales, scans over the last 30 days (QR vs NFC), the pieces and customers
// scanned most, the phones used, and a loud count of pieces whose NFC chip was
// never written. The person's own pieces; every rep's for a manager in admin mode.

const QR_COLOR = "#60a5fa";
const NFC_COLOR = "#a78bfa";

function Stat({ label, value, accent }: { label: string; value: number | string | undefined; accent?: string }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <p className={`text-2xl font-extrabold tabular-nums ${accent ?? "text-white"}`}>{value ?? "—"}</p>
      <p className="mt-0.5 text-xs text-white/45">{label}</p>
    </div>
  );
}

function Ranked({ title, icon: Icon, items }: {
  title: string;
  icon: typeof Tag;
  items: Array<{ key: string; label: string; sub?: string | null; value: number; onClick?: () => void }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <section>
      <h2 className={`mb-2 px-1 ${EYEBROW_MUTED}`}>{title}</h2>
      <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`}>
        {items.map((item) => (
          <li key={item.key}>
            <button type="button" onClick={item.onClick} disabled={!item.onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/10 disabled:active:bg-transparent">
              <Icon className="h-4 w-4 shrink-0 text-white/40" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{item.label}</span>
                {item.sub && <span className="block truncate text-xs text-white/40">{item.sub}</span>}
                <span className="mt-1.5 block h-1 rounded-full bg-white/[0.06]">
                  <span className="block h-1 rounded-full bg-blue-400/70" style={{ width: `${(item.value / max) * 100}%` }} />
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-white">{item.value}</span>
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
  const [, navigate] = useLocation();
  const { data } = useQuery({
    queryKey: ["/api/xpot/tags/dashboard"],
    queryFn: () => tagsGet<TagDashboard>("/api/xpot/tags/dashboard?days=30"),
    staleTime: 30_000,
  });

  const total = data ? data.scans.qr + data.scans.nfc : undefined;
  const chart = (data?.daily ?? []).map((d) => ({
    day: new Date(`${d.day}T12:00:00Z`).toLocaleDateString(t.locale, { day: "numeric", month: "short" }),
    qr: d.qr,
    nfc: d.nfc,
  }));

  return (
    <div className="space-y-5" data-testid="tags-dashboard">
      {data && data.chipsMissing > 0 && (
        <button
          type="button"
          onClick={() => navigate(`${APP_BASE}/pieces`)}
          className="flex w-full items-center gap-3 rounded-[20px] border border-red-400/40 bg-red-500/[0.12] p-4 text-left"
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

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-4" data-testid="tags-summary">
        <Stat label={t("statInStock")} value={data?.inStock} />
        <Stat label={t("statActive")} value={data?.active} />
        <Stat label={t("statSold30")} value={data?.soldInPeriod} />
        <Stat label={t("statScans30")} value={total} accent="text-blue-200" />
      </div>

      <section className={`${CARD} p-4`}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={EYEBROW_MUTED}>{t("dashScansTitle")}</h2>
          {data && (
            <p className="text-xs text-white/45">
              <span style={{ color: QR_COLOR }}>■</span> QR {data.scans.qr} · <span style={{ color: NFC_COLOR }}>■</span> NFC {data.scans.nfc} · {t("dashVisitors", { n: data.visitors })}
            </p>
          )}
        </div>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-white/40">{t("dashEmpty")}</p>
        ) : (
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }}
                />
                <Bar dataKey="qr" name="QR" stackId="s" fill={QR_COLOR} radius={[0, 0, 0, 0]} />
                <Bar dataKey="nfc" name="NFC" stackId="s" fill={NFC_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {data && data.topPieces.length > 0 && (
        <Ranked
          title={t("dashTopPieces")}
          icon={Tag}
          items={data.topPieces.map((p) => ({
            key: p.id,
            label: p.publicCode,
            sub: [p.leadName, p.label].filter(Boolean).join(" · ") || null,
            value: p.scans,
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
            onClick: () => navigate(`${APP_BASE}/pieces?lead=${c.leadId}&name=${encodeURIComponent(c.name)}`),
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

      {/* The rare case: the customer's own link straight on a chip, without Xpot. */}
      <button
        type="button"
        onClick={() => navigate(directPath())}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] px-4 py-3 text-left text-white/55 active:bg-white/[0.04]"
        data-testid="dashboard-direct"
      >
        <Link2 className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t("dashDirectWrite")}</span>
          <span className="block text-xs text-white/35">{t("dashDirectHint")}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
      </button>
    </div>
  );
}
