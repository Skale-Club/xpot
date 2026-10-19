import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ImageOff, ShoppingBag } from "lucide-react";
import type { TagShowcaseView } from "@shared/tagShowcase";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { Pill } from "@/components/xpot/StatusPill";
import { formatMoney } from "@/lib/format";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, tagsGet } from "./lib";
import { CARD, EYEBROW_MUTED } from "./ui";
import { WholesaleCard } from "./WholesaleCard";

// Tags › Shop: what Skale Club sells, kept by the Xpot admin (Manage › Shop). Xpot sells nothing itself: every
// button opens the Stuscle store with the reader's own wholesale code, a kit straight into the cart. The price that
// counts is Stuscle's; the reference price, when there is one, is typed in by hand.

function ShopCard({ item }: { item: TagShowcaseView }) {
  const t = useT(tagsMessages);
  const kit = item.kind === "kit";
  return (
    <li className={`${CARD} flex flex-col overflow-hidden`} data-testid="shop-item" data-kind={item.kind}>
      <div className="flex aspect-[4/3] items-center justify-center bg-black/20">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={t("shopPictureAlt", { title: item.title })} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-8 w-8 text-white/20" aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-base font-bold leading-snug text-white">{item.title}</h2>
          <Pill tone={kit ? "violet" : "slate"} className="shrink-0">{kit ? t("shopKit") : t("shopModel")}</Pill>
        </div>
        {item.description && <p className="text-sm text-white/60">{item.description}</p>}
        {item.includes.length > 0 && (
          <div>
            <p className={EYEBROW_MUTED}>{t("shopIncludes")}</p>
            <ul className="mt-1.5 space-y-1 text-sm text-white/75">
              {item.includes.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-violet-300/70" aria-hidden="true" />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto space-y-2 pt-1">
          {item.referencePriceCents !== null && (
            <p className="text-sm text-white/70">
              <span className="font-semibold text-white">{t("shopReferencePrice", { price: formatMoney(item.referencePriceCents, item.currency) })}</span>
              <span className="block text-xs text-white/40">{t("shopPriceNote")}</span>
            </p>
          )}
          <Button asChild variant="brand" accent="tags" size="lg" className="w-full">
            <a href={item.url} target="_blank" rel="noopener noreferrer" data-testid="shop-open">
              {kit ? t("shopOrderKit") : t("shopSeeInStore")}
              <ExternalLink />
            </a>
          </Button>
        </div>
      </div>
    </li>
  );
}

export default function ShopScreen() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/xpot/tags/showcase"],
    queryFn: () => tagsGet<TagShowcaseView[]>("/api/xpot/tags/showcase"),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-5" data-testid="tags-shop">
      <p className="text-sm text-white/60">
        {t("shopIntro")}
        <span className="block text-xs text-white/35">{t("shopOpensStore")}</span>
      </p>

      {error && !data ? (
        <ErrorState message={errorText(error, tc("requestFailed"))} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <ListSkeleton rows={3} />
      ) : data && data.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((item) => (
            <ShopCard key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <EmptyState tone="tags" icon={ShoppingBag} title={t("shopEmpty")} hint={t("shopEmptyHint")} />
      )}

      <WholesaleCard />
    </div>
  );
}
