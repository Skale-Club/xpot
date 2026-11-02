import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight, Package, Radio, ScanLine } from "lucide-react";
import type { CustomerPiece } from "@shared/customerPanel";
import { KpiTile } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { Pill, PIECE_STATUS_TONE } from "@/components/xpot/StatusPill";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { useT } from "@/i18n";
import { myPlatesMessages } from "@/i18n/messages/myPlates";
import { tagsMessages } from "@/i18n/messages/tags";
import { formatCount } from "@/pages/tags/charts";
import { CARD, EYEBROW_MUTED } from "@/pages/tags/ui";
import { MY_KEYS, myApi } from "./api";
import { TalkToSeller } from "./TalkToSeller";

type TagsKey = keyof typeof tagsMessages.en;

/** The words a plate is known by in a list: its own label, else what it is and what is printed on it. */
export function usePlateWords() {
  const tt = useT(tagsMessages);
  const word = (prefix: "status" | "product" | "face", value: string | null) => (value ? tt(`${prefix}_${value}` as TagsKey) : "");
  return {
    status: (p: CustomerPiece) => word("status", p.status),
    name: (p: CustomerPiece) => p.label || [word("face", p.face), word("product", p.productType)].filter(Boolean).join(" · "),
    product: (p: CustomerPiece) => word("product", p.productType),
  };
}

function PlateRow({ piece }: { piece: CustomerPiece }) {
  const t = useT(myPlatesMessages);
  const words = usePlateWords();
  return (
    <li>
      <Link
        href={`/my/plate/${encodeURIComponent(piece.code)}`}
        className="flex min-h-[72px] items-center gap-3 px-4 py-3 active:bg-white/10"
        data-testid={`my-plate-${piece.code}`}
      >
        <TagFaceIcon face={piece.face} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-white">{words.name(piece)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/50">
            <Pill tone={PIECE_STATUS_TONE[piece.status] ?? "slate"}>{words.status(piece)}</Pill>
            <span>{t.plural("scansWeek", piece.scans7)}</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** My plates: how many, how many are live, the scans this week, and each plate. */
export function Plates() {
  const t = useT(myPlatesMessages);
  const pieces = useQuery({ queryKey: MY_KEYS.pieces, queryFn: myApi.pieces, staleTime: 30_000 });

  if (pieces.isLoading) return <ListSkeleton rows={3} />;
  if (!pieces.data) return <ErrorState message={t("loadFailed")} onRetry={() => void pieces.refetch()} retryLabel={t("retry")} />;

  const { totals } = pieces.data;
  // A customer with several businesses sees each one's plates under its name.
  const groups = pieces.data.pieces.reduce<Map<string, CustomerPiece[]>>((map, p) => map.set(p.businessName, [...(map.get(p.businessName) ?? []), p]), new Map());
  // One plate says everything in its own row: the totals above it would only repeat its numbers.
  const showTotals = totals.pieces > 1;

  return (
    <div className="space-y-4" data-testid="my-plates">
      {/* Whose plates these are, always: it is how the owner knows this is their business. */}
      {groups.size === 1 && <p className="-mt-2 px-1 text-sm text-white/55" data-testid="my-business">{Array.from(groups.keys())[0]}</p>}
      {showTotals && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <KpiTile accent="violet" icon={Package} value={formatCount(totals.pieces, t.locale)} label={t("kpiPlates")} />
            <KpiTile accent="violet" icon={Radio} value={formatCount(totals.live, t.locale)} label={t("kpiLive")} />
            <KpiTile accent="violet" icon={ScanLine} value={formatCount(totals.scans7, t.locale)} label={t("kpiWeek")} />
          </div>
          <p className="px-1 text-sm text-white/50">{t.plural("scansMonth", totals.scans30)}</p>
        </>
      )}

      {totals.pieces === 0 ? (
        <EmptyState tone="tags" icon={Package} title={t("noPlates")} hint={t("noPlatesHint")} />
      ) : (
        Array.from(groups).map(([name, list]) => (
          <section key={name}>
            {groups.size > 1 && <h2 className={`mb-2 px-1 ${EYEBROW_MUTED}`}>{t("platesFor", { name })}</h2>}
            <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`}>
              {list.map((p) => <PlateRow key={p.code} piece={p} />)}
            </ul>
          </section>
        ))
      )}

      <TalkToSeller />
    </div>
  );
}
