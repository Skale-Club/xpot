import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Minus, Plus, ShoppingBag, ShoppingCart } from "lucide-react";
import {
  TAG_SHOWCASE_MAX_QUANTITY,
  shopLinkWithQuantity,
  showcaseAddsToCart,
  type TagShopCatalog,
  type TagShopProduct,
  type TagShowcaseView,
} from "@shared/tagShowcase";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Select } from "@/components/xpot/Field";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { Pill } from "@/components/xpot/StatusPill";
import { formatMoney } from "@/lib/format";
import { profileOfMe } from "@/lib/adminMode";
import { can } from "@shared/profiles";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, tagsGet } from "./lib";
import { CARD, EYEBROW_MUTED, TopBar } from "./ui";
import { partnerLine, useWholesale, WholesaleCard } from "./WholesaleCard";

// Tags › Shop: a showcase of what Skale Club sells, as a carousel. The pieces a reseller already has live in My pieces,
// not here. First the Stuscle wholesale catalogue, read from Stuscle (the same products and prices as its /wholesale
// page), then the ready-made kits the Xpot admin keeps (Manage › Shop). Xpot sells nothing itself: Add to cart opens
// the Stuscle store with the reader's own wholesale code and the piece already in the cart, on the product's wholesale
// page. The price that counts is Stuscle's. A reseller whose partner handles its own distribution does not buy here
// at all: the screen says whose pieces they are and to ask them (no catalogue, no price, no code).

const CARD_WIDTH = "w-[82%] shrink-0 snap-start sm:w-[300px]";

function Picture({ src, title }: { src: string | null; title: string }) {
  const t = useT(tagsMessages);
  return (
    <div className="flex aspect-[4/3] items-center justify-center bg-black/20">
      {src ? (
        <img src={src} alt={t("shopPictureAlt", { title })} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-8 w-8 text-white/20" aria-hidden="true" />
      )}
    </div>
  );
}

function percentOff(wholesale: number, retail: number | null): number | null {
  return retail && retail > wholesale ? Math.round(((retail - wholesale) / retail) * 100) : null;
}

/** A Stuscle product: pick the variant and how many, see the wholesale price against retail, Add to cart. */
function ProductCard({ product, currency }: { product: TagShopProduct; currency: string }) {
  const t = useT(tagsMessages);
  const [variantId, setVariantId] = useState(product.variants[0].id);
  const [quantity, setQuantity] = useState(1);
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const off = percentOff(variant.wholesalePriceCents, variant.retailPriceCents);
  const setQty = (value: number) => setQuantity(Math.min(TAG_SHOWCASE_MAX_QUANTITY, Math.max(1, Math.floor(value) || 1)));
  return (
    <li className={`${CARD} ${CARD_WIDTH} flex flex-col overflow-hidden`} data-testid="shop-product">
      <Picture src={product.thumbnail} title={product.title} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h2 className="text-base font-bold leading-snug text-white">{product.title}</h2>
        {product.variants.length > 1 && (
          <Select
            aria-label={t("shopVariant")}
            value={variant.id}
            onChange={(e) => setVariantId(e.target.value)}
            options={product.variants.map((v) => ({ value: v.id, label: v.title ?? v.sku }))}
            data-testid="shop-variant"
          />
        )}
        <div className="mt-auto space-y-3 pt-1">
          <div>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-bold text-white" data-testid="shop-wholesale-price">{formatMoney(variant.wholesalePriceCents, currency)}</span>
              <span className="text-xs text-white/45">{t("shopPerUnit")}</span>
            </p>
            {variant.retailPriceCents !== null && off !== null && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-white/45">
                <span>
                  {t("shopRetail")} <span className="line-through">{formatMoney(variant.retailPriceCents, currency)}</span>
                </span>
                <Pill tone="green">{t("shopSave", { percent: off })}</Pill>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex h-11 items-center justify-between rounded-xl border border-white/10 bg-white/[0.05]">
              <button
                type="button"
                className="flex h-full w-10 items-center justify-center text-white/60 hover:text-white disabled:opacity-30"
                aria-label={t("shopLess")}
                disabled={quantity <= 1}
                onClick={() => setQty(quantity - 1)}
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={TAG_SHOWCASE_MAX_QUANTITY}
                value={quantity}
                onChange={(e) => setQty(Number(e.target.value))}
                aria-label={t("shopQuantity")}
                className="h-full min-w-0 flex-1 bg-transparent text-center text-sm font-semibold text-white [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid="shop-quantity"
              />
              <button
                type="button"
                className="flex h-full w-10 items-center justify-center text-white/60 hover:text-white"
                aria-label={t("shopMore")}
                onClick={() => setQty(quantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button asChild variant="brand" accent="tags" size="lg" className="w-full">
              <a href={shopLinkWithQuantity(variant, quantity)} target="_blank" rel="noopener noreferrer" data-testid="shop-add">
                <ShoppingCart />
                {t("shopAddToCart")}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

function ShopCard({ item }: { item: TagShowcaseView }) {
  const t = useT(tagsMessages);
  const kit = item.kind === "kit";
  const addsToCart = showcaseAddsToCart(item);
  return (
    <li className={`${CARD} ${CARD_WIDTH} flex flex-col overflow-hidden`} data-testid="shop-item" data-kind={item.kind}>
      <Picture src={item.imageUrl} title={item.title} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-base font-bold leading-snug text-white">{item.title}</h2>
          {kit && <Pill tone="violet" className="shrink-0">{t("shopKit")}</Pill>}
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
            </p>
          )}
          <Button asChild variant="brand" accent="tags" size="lg" className="w-full">
            <a href={item.url} target="_blank" rel="noopener noreferrer" data-testid="shop-open" data-adds-to-cart={addsToCart}>
              {addsToCart ? <ShoppingCart /> : null}
              {addsToCart ? t("shopAddToCart") : t("shopSeeInStore")}
              {addsToCart ? null : <ExternalLink />}
            </a>
          </Button>
        </div>
      </div>
    </li>
  );
}

/** A row of cards that scrolls sideways (swipe on a phone, arrows on a computer), each card snapping into place. */
function ShopCarousel({ count, children }: { count: number; children: ReactNode }) {
  const t = useT(tagsMessages);
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, count]);
  const step = (direction: 1 | -1) => {
    const el = track.current;
    const card = el?.querySelector("li");
    if (!el || !card) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * (card.getBoundingClientRect().width + 16), behavior: smooth ? "smooth" : "auto" });
  };
  const scrolls = !(edges.start && edges.end);
  return (
    <div className="relative" data-testid="shop-carousel">
      <ul
        ref={track}
        onScroll={measure}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      {scrolls && (
        <div className="mt-3 hidden justify-end gap-2 sm:flex">
          <Button type="button" variant="secondary" size="icon" aria-label={t("shopPrev")} disabled={edges.start} onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <Button type="button" variant="secondary" size="icon" aria-label={t("shopNext")} disabled={edges.end} onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ShopScreen() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  // A partner makes its own pieces: no buying for it (shared/profiles.ts, "buyPieces"). Until /me loads, the shop stays.
  const profile = profileOfMe(me);
  const buying = !profile || can(profile, "buyPieces");
  // Whose partner distributes its own pieces has no store to buy from: ask first, so the catalogue is never fetched or shown for them.
  const wholesale = useWholesale(buying);
  const partner = wholesale.data && wholesale.data.code === null && wholesale.data.url === null ? wholesale.data.partner ?? null : null;
  const storeKnown = !buying || wholesale.isFetched;
  const catalog = useQuery({
    queryKey: ["/api/xpot/tags/shop-catalog"],
    queryFn: () => tagsGet<TagShopCatalog>("/api/xpot/tags/shop-catalog"),
    staleTime: 60_000,
    enabled: buying && storeKnown && !partner,
  });
  const entries = useQuery({
    // The entries' words come in the reader's language where the admin wrote them (shared/tagShowcase.ts showcaseInLanguage).
    queryKey: ["/api/xpot/tags/showcase", t.lang],
    queryFn: () => tagsGet<TagShowcaseView[]>(`/api/xpot/tags/showcase?lang=${t.lang}`),
    staleTime: 60_000,
    enabled: buying && storeKnown && !partner,
  });
  if (!buying) return <div className="space-y-5" data-testid="tags-shop"><EmptyState tone="tags" icon={ShoppingBag} title={t("shopProducerTitle")} hint={t("shopProducerHint")} /></div>;
  if (partner) {
    return (
      <div className="space-y-5" data-testid="tags-shop">
        <div className="lg:hidden"><TopBar title={t("navShop")} /></div>
        <EmptyState tone="tags" icon={ShoppingBag} title={<span data-testid="wholesale-partner">{partnerLine(t("wholesalePartner", { name: partner }))}</span>} />
      </div>
    );
  }
  if (!storeKnown) return <div className="space-y-5" data-testid="tags-shop"><div className="lg:hidden"><TopBar title={t("navShop")} /></div><ListSkeleton rows={3} /></div>;
  const products = catalog.data?.products ?? [];
  const kits = entries.data ?? [];
  const count = products.length + kits.length;
  const failed = catalog.error && entries.error;

  return (
    <div className="space-y-5" data-testid="tags-shop">
      <div className="lg:hidden"><TopBar title={t("navShop")} /></div>
      <p className="text-sm text-white/60">{t("shopIntro")}</p>

      {failed && !count ? (
        <ErrorState
          message={errorText(catalog.error ?? entries.error, tc("requestFailed"))}
          onRetry={() => void Promise.all([catalog.refetch(), entries.refetch()])}
        />
      ) : (catalog.isLoading || entries.isLoading) && !count ? (
        <ListSkeleton rows={3} />
      ) : count > 0 ? (
        <ShopCarousel count={count}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} currency={catalog.data?.currency ?? "USD"} />
          ))}
          {kits.map((item) => (
            <ShopCard key={item.id} item={item} />
          ))}
        </ShopCarousel>
      ) : (
        <EmptyState
          tone="tags"
          icon={ShoppingBag}
          title={t("shopEmpty")}
          hint={catalog.data?.status === "unavailable" ? t("shopStoreDown") : t("shopEmptyHint")}
        />
      )}

      <WholesaleCard />
    </div>
  );
}
