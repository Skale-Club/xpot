import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, ShoppingBag, ShoppingCart } from "lucide-react";
import {
  shopDefaultVariant,
  shopLinkWithQuantity,
  shopPickOption,
  shopShownOptions,
  shopStartQuantity,
  shopTotals,
  TAG_SHOWCASE_MAX_QUANTITY,
  shopSectionOf,
  showcaseAddsToCart,
  type ShopSectionKey,
  type TagShopCatalog,
  type TagShopProduct,
  type TagShopVariant,
  type TagShowcaseView,
} from "@shared/tagShowcase";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
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
import { firstStepsOf } from "./whoToAsk";
import { partnerLine, useWholesale, WholesaleCard } from "./WholesaleCard";

// Tags › Shop: a showcase of what Skale Club sells. The pieces a reseller already has live in My pieces, not here. First
// the Stuscle wholesale catalogue, read from Stuscle (the same products and prices as its /wholesale page), then the
// ready-made kits the Xpot admin keeps (Manage › Shop). Xpot sells nothing itself: every product is shown, in one
// carousel for the stands and one for the plates, each card with its choices (Size, Color…), its bulk packs and the total
// for the pack. Add to cart opens that product on Stuscle's wholesale page through Xpot's open route, with the chosen variant
// and pack already in the cart and selected there. The price that counts, the cart and checkout are Stuscle's. A reseller whose partner handles its own distribution does not buy here at all: the screen says whose
// pieces they are and to ask them (no catalogue, no price, no code).
//
// The cards copy Stuscle's wholesale card and buying column (apps/storefront/.../wholesale/components): the photo on
// Stuscle's image field (its dark theme, the one visitors see), the name ending in "Bulk", the same pickers, the packs
// with their saving, and the total against the same pieces at retail.

/** Stuscle's image field (--image-field, dark theme) and the 29:34 shape every product photo is shown in. */
const PHOTO = "relative aspect-[29/34] w-full overflow-hidden bg-[#27272a]";
const GREEN_PILL = "rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300";

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

/** Stuscle's colour dots: white and black are the bodies it sells; any other colour gets a neutral dot. */
const COLOR_DOTS: Record<string, string> = { white: "#ffffff", black: "#000000" };

/**
 * A Stuscle product in a carousel, shaped like Stuscle's wholesale card and buying column: the photo, the name ending in
 * "Bulk", the choices (Size, Colorâ€¦), the bulk packs, the total for the pack against the same pieces at retail, and Add to
 * cart. Add to cart opens the product's wholesale page on Stuscle with that variant and pack already in the cart, so the
 * same choices are selected there. Every product is its own line and its own bulk.
 */
function ProductCard({ product, currency }: { product: TagShopProduct; currency: string }) {
  const t = useT(tagsMessages);
  const first = shopDefaultVariant(product);
  const [variantId, setVariantId] = useState(first.id);
  const [quantity, setQuantity] = useState(shopStartQuantity(first));
  const variant: TagShopVariant = product.variants.find((v) => v.id === variantId) ?? first;
  const options = shopShownOptions(product);
  const sold = variant.packs.length > 0;
  const totals = shopTotals(variant, quantity);
  const money = (cents: number) => formatMoney(cents, currency);
  const link = shopLinkWithQuantity(variant, totals.quantity, t.lang);
  // A variant sold in packs only takes a pack's size: changing variant keeps the pack when it has one like it, else its smallest.
  const pick = (next: TagShopVariant) => {
    setVariantId(next.id);
    if (next.packs.length > 0 && !next.packs.some((p) => p.quantity === quantity)) setQuantity(shopStartQuantity(next));
  };
  const choice = (on: boolean) => `rounded-md border px-3 text-white transition-colors ${on ? "border-white ring-1 ring-white" : "border-white/15 hover:border-white"}`;
  return (
    <li className="flex w-[82%] shrink-0 snap-start flex-col gap-4 md:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]" data-testid="shop-tile">
      <div className={PHOTO}>
        {product.thumbnail ?? product.images[0] ? <img src={(product.thumbnail ?? product.images[0]) as string} alt="" loading="lazy" draggable={false} className="h-full w-full object-contain" /> : <ImageOff className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />}
      </div>
      <p className="text-base font-medium leading-snug text-white" data-testid="shop-tile-title">{t("shopBulkTitle", { title: product.title })}</p>

      {options.map((option) => (
        <div key={option.title} className="flex flex-col gap-y-2" data-testid="shop-option">
          <span className="text-sm text-white/80">{option.title}</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={option.title}>
            {option.values.map((value) => {
              const on = variant.options[option.title] === value;
              const dot = option.title.trim().toLowerCase() === "color" ? COLOR_DOTS[value.trim().toLowerCase()] ?? "#71717a" : null;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { const next = shopPickOption(product, variant, option.title, value); if (next) pick(next); }}
                  className={`flex min-h-10 items-center justify-center gap-2 py-2 text-sm ${choice(on)}`}
                >
                  {dot && <span className="h-4 w-4 shrink-0 rounded-full border border-white/30" style={{ backgroundColor: dot }} aria-hidden="true" />}
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {sold ? (
        <div className="flex flex-col gap-y-2">
          <span className="text-sm text-white/80">{t("shopPacksTitle")}</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("shopPacksTitle")}>
            {variant.packs.map((pack) => {
              const retail = pack.retailUnitPriceCents ?? variant.retailPriceCents;
              const percent = retail !== null && retail > pack.unitPriceCents ? Math.round(((retail - pack.unitPriceCents) / retail) * 100) : null;
              const on = totals.quantity === pack.quantity;
              return (
                <button
                  key={pack.quantity}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setQuantity(pack.quantity)}
                  className={`flex flex-col items-center gap-y-0.5 py-3 text-center ${choice(on)}`}
                  data-testid="shop-pack"
                >
                  <span className="text-sm font-medium">{t("shopPieces", { count: pack.quantity })}</span>
                  <span className="text-xs text-white/55">{t("shopEach", { price: money(pack.unitPriceCents) })}</span>
                  {percent !== null && <span className="text-xs font-medium text-emerald-300">{t("shopSave", { percent })}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-sm text-white/80">
          {t("shopQuantity")}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={TAG_SHOWCASE_MAX_QUANTITY}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.min(TAG_SHOWCASE_MAX_QUANTITY, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
            className="h-10 w-24 rounded-md border border-white/15 bg-white/[0.05] px-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-300/60"
            data-testid="shop-quantity"
          />
        </label>
      )}

      <div className="flex flex-col gap-y-1 text-white" data-testid="shop-total">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-semibold" data-testid="shop-wholesale-price">{money(totals.wholesaleCents)}</span>
          {totals.retailCents !== null && <span className="text-lg text-white/55 line-through">{money(totals.retailCents)}</span>}
          {totals.percentOff !== null && <span className={GREEN_PILL}>{t("shopSave", { percent: totals.percentOff })}</span>}
        </div>
        <p className="text-sm text-white/55">
          {t("shopSummary", { count: totals.quantity, price: money(totals.unitCents) })}
          {totals.saveCents !== null && ` · ${t("shopSaved", { amount: money(totals.saveCents) })}`}
        </p>
      </div>

      <Button asChild variant="brand" accent="tags" size="lg" className="mt-auto h-14 w-full rounded-full text-base">
        <a href={link} target="_blank" rel="noopener noreferrer" data-testid="shop-add">
          <ShoppingCart />
          {t("shopAddToCart")}
        </a>
      </Button>
    </li>
  );
}

/** A row of products that scrolls sideways: swipe on a phone, or the arrows beside the title shift it a screen to the left or right. */
function Carousel({ title, testId, products, currency }: { title: string; testId: string; products: TagShopProduct[]; currency: string }) {
  const t = useT(tagsMessages);
  const row = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const measure = useCallback(() => {
    const el = row.current;
    if (el) setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, products.length]);
  const go = (direction: 1 | -1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const arrow = "flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:border-white disabled:opacity-30 disabled:hover:border-white/15";
  return (
    <section className="flex flex-col gap-y-4" data-testid={testId} aria-label={title}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl text-white">{title}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => go(-1)} disabled={edge.start} aria-label={t("shopScrollLeft")} className={arrow} data-testid="shop-carousel-prev"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => go(1)} disabled={edge.end} aria-label={t("shopScrollRight")} className={arrow} data-testid="shop-carousel-next"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>
      <ul ref={row} onScroll={measure} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="shop-carousel-row">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} currency={currency} />
        ))}
      </ul>
    </section>
  );
}

function ShopCard({ item }: { item: TagShowcaseView }) {
  const t = useT(tagsMessages);
  const kit = item.kind === "kit";
  const addsToCart = showcaseAddsToCart(item);
  return (
    <li className={`${CARD} flex flex-col overflow-hidden`} data-testid="shop-item" data-kind={item.kind}>
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
    // A member of a team gets pieces from the team (it hands them out); the partner is who the team orders from.
    const company = profile === "member" ? firstStepsOf(me).company : null;
    return (
      <div className="space-y-5" data-testid="tags-shop">
        <div className="lg:hidden"><TopBar title={t("navShop")} /></div>
        <EmptyState tone="tags" icon={ShoppingBag} title={<span data-testid="wholesale-partner">{partnerLine(company ? t("shopFromCompany", { name: company }) : t("wholesalePartner", { name: partner }))}</span>} />
      </div>
    );
  }
  if (!storeKnown) return <div className="space-y-5" data-testid="tags-shop"><div className="lg:hidden"><TopBar title={t("navShop")} /></div><ListSkeleton rows={3} /></div>;
  const products = catalog.data?.products ?? [];
  const kits = entries.data ?? [];
  const currency = catalog.data?.currency ?? "USD";
  const sections: Array<{ key: ShopSectionKey; title: string }> = [
    { key: "stands", title: t("shopSectionStands") },
    { key: "plates", title: t("shopSectionPlates") },
    { key: "other", title: t("shopSectionOther") },
  ];
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
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-y-10" data-testid="shop-all">
          {sections.map(({ key, title }) => {
            const inSection = products.filter((p) => shopSectionOf(p) === key);
            return inSection.length > 0 ? <Carousel key={key} title={title} testId={`shop-section-${key}`} products={inSection} currency={currency} /> : null;
          })}
          {kits.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kits.map((item) => (
                <ShopCard key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
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
