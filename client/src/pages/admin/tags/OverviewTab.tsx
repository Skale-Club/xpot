import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, History, Power, Trophy } from "lucide-react";
import type { TagAnalytics, TagOverview } from "@shared/tagsApi";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { ADMIN_TAGS_KEY, formatDateTime, getJson, percent, STALE_MS } from "./api";
import { CARD, SectionTitle, Stat } from "./ui";
import { destinationLabel, EVENT_LABELS, Loading, LoadError, Panel } from "./pieces-shared";

const LINK = "inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300";

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
  const { data, isLoading, error } = useQuery<TagAnalytics>({
    queryKey: [ADMIN_TAGS_KEY, "analytics", "overview-top-30d"],
    queryFn: () => getJson("/api/xpot/admin/tags/analytics?range=30d"),
    staleTime: STALE_MS,
  });
  return (
    <Panel
      title={<><Trophy className="h-4 w-4 text-white/50" />Top pieces · 30 days</>}
      right={<button type="button" className={LINK} onClick={() => go("/team")}>Resellers report <ArrowRight className="h-3 w-3" /></button>}
    >
      {isLoading ? (
        <Loading className="py-6" />
      ) : error || !data ? (
        <p className="text-sm text-red-400">Could not load top pieces.</p>
      ) : data.topTags.length === 0 ? (
        <p className="text-sm text-white/40">No scans in the last 30 days.</p>
      ) : (
        <ol className="divide-y divide-white/5">
          {data.topTags.slice(0, 8).map((t, i) => (
            <li key={t.id}>
              <button type="button" onClick={() => go(`/pieces/${t.id}`)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-white/[0.03]">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/30">{i + 1}</span>
                <TagFaceIcon face={t.face} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-mono font-semibold text-white">{t.publicCode}</span>
                  <span className="ml-2 text-white/50">{t.leadName ?? "No customer"}</span>
                  {t.repName ? <span className="ml-1 text-xs text-white/30">· {t.repName}</span> : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-white/50">
                  <span className="font-semibold text-white">{t.qr + t.nfc}</span> ({t.qr} QR · {t.nfc} NFC)
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
  const { data, isLoading, error } = useQuery<TagOverview>({
    queryKey: [ADMIN_TAGS_KEY, "overview"],
    queryFn: () => getJson("/api/xpot/admin/tags/overview"),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <LoadError what="the overview" error={error} />;

  const { counts, stock, interactions, split30 } = data;
  const split = split30.qr + split30.nfc;
  const unsold = stock.house + stock.withResellers;

  return (
    <div className="space-y-6" data-testid="admin-tags-overview">
      <section>
        <SectionTitle right={<button type="button" className={LINK} onClick={() => go("/kits")}>Kits <ArrowRight className="h-3 w-3" /></button>}>
          Stock
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatButton label="In house" value={stock.house} hint={`Unsold, not handed out · ${percent(stock.house, unsold)}`} onClick={() => go("/pieces?rep=house&status=inventory")} testId="overview-stock-house" />
          <StatButton label="With resellers" value={stock.withResellers} hint={`Unsold, in resellers' kits · ${percent(stock.withResellers, unsold)}`} onClick={() => go("/kits")} testId="overview-stock-resellers" />
          <StatButton label="Total pieces" value={counts.total} hint={`${counts.retired} retired · see batches`} onClick={() => go("/batches")} />
        </div>
      </section>

      <section>
        <SectionTitle right={<button type="button" className={LINK} onClick={() => go("/pieces")}>All pieces <ArrowRight className="h-3 w-3" /></button>}>
          Status
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatButton label="Inventory" value={counts.inventory} hint="No customer yet" onClick={() => go("/pieces?status=inventory")} />
          <StatButton label="Assigned" value={counts.assigned} hint="Customer set, not live" onClick={() => go("/pieces?status=assigned")} />
          <StatButton label="Active" value={counts.active} hint="Live, redirecting" onClick={() => go("/pieces?status=active")} />
          <StatButton label="Disabled" value={counts.disabled} onClick={() => go("/pieces?status=disabled")} />
          <StatButton label="Retired" value={counts.retired} onClick={() => go("/pieces?status=retired")} />
        </div>
      </section>

      <section>
        <SectionTitle>Scans & taps</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Today" value={interactions.today} hint="UTC day" />
          <Stat label="Last 7 days" value={interactions.last7} />
          <Stat label="Last 30 days" value={interactions.last30} hint={`QR ${percent(split30.qr, split)} · NFC ${percent(split30.nfc, split)}`} />
          <Stat label="Approx. unique (30d)" value={data.approxUnique30} hint="Estimate, not people" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={<><Activity className="h-4 w-4 text-white/50" />Latest scans & taps</>}>
          {data.recentEvents.length === 0 ? (
            <p className="text-sm text-white/40">No scans yet.</p>
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
                        {e.leadName ?? "No customer"} · {EVENT_LABELS[e.eventType] ?? e.eventType}
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

          <Panel title={<><Power className="h-4 w-4 text-white/50" />Recently activated</>}>
            {data.recentActivations.length === 0 ? (
              <p className="text-sm text-white/40">No live pieces yet.</p>
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

          <Panel title={<><History className="h-4 w-4 text-white/50" />Recent destination changes</>}>
            {data.recentChanges.length === 0 ? (
              <p className="text-sm text-white/40">No changes yet.</p>
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
                      {c.newUrl ? `${destinationLabel(c.newDestinationType)} · ${c.newUrl}` : `Destination cleared${c.reason ? ` (${c.reason})` : ""}`}
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
