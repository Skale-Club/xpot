import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ImageOff, ShoppingBag, ShoppingCart } from "lucide-react";
import {
  TAG_SHOWCASE_MAX_QUANTITY,
  isShopOptionShown,
  shopDefaultVariant,
  shopLinkWithQuantity,
  shopPickOption,
  shopPictureFor,
  shopRelated,
  shopSectionOf,
  shopStartQuantity,
  shopTotals,
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
// ready-made kits the Xpot admin keeps (Manage › Shop). Xpot sells nothing itself: Add to cart opens the Stuscle store
// with the reader's own wholesale code and the piece already in the cart, on the product's wholesale page. The price that
// counts is Stuscle's. A reseller whose partner handles its own distribution does not buy here at all: the screen says
// whose pieces they are and to ask them (no catalogue, no price, no code).
//
// The product views copy Stuscle's wholesale pages (apps/storefront/src/app/(main)/wholesale): the same arrangement, the
// same sizes and spacing, at the same breakpoints (768 and 1024, which are Tailwind's md and lg), inside Xpot's dark
// look. Product photos sit on Stuscle's image field (its dark theme, the one visitors see).

/** Stuscle's image field (--image-field, dark theme) and the 29:34 shape every product photo is shown in. */
const FIELD = "bg-[#27272a]";
const PHOTO = `relative aspect-[29/34] overflow-hidden ${FIELD}`;
/** The main photo is never taller than the screen: width from the height left under the header, as on Stuscle. */
const MAIN_MAX_WIDTH = "calc((100svh - 9rem) * 29 / 34)";
/** On a phone the photo is shorter, so the price is never more than a swipe away. */
const PHONE_MAX_WIDTH = "calc((100svh - 17rem) * 29 / 34)";
/** How far the photo is magnified while the cursor is over it. */
const ZOOM = 2.2;

const GREEN_PILL = "rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300";

/** The lowest unit price a variant reaches: its largest pack, or its only price when it is sold by the piece. */
function lowestPriceOf(variant: TagShopVariant): { cents: number; retailCents: number | null } {
  const pack = variant.packs[variant.packs.length - 1];
  return pack ? { cents: pack.unitPriceCents, retailCents: pack.retailUnitPriceCents ?? variant.retailPriceCents } : { cents: variant.wholesalePriceCents, retailCents: variant.retailPriceCents };
}

function percentOff(cents: number, retailCents: number | null): number | null {
  return retailCents !== null && retailCents > cents ? Math.round(((retailCents - cents) / retailCents) * 100) : null;
}

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

/**
 * Stuscle's gallery. Tablet and up: a rail of thumbnails beside one large photo that fits the screen; hovering a thumbnail
 * shows it, hovering the photo zooms in under the cursor, the arrow keys step through. A phone gets a swipeable row with a
 * counter. It starts again when the variant changes.
 */
function Gallery({ images, title }: { images: string[]; title: string }) {
  const t = useT(tagsMessages);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const active = index < images.length ? index : 0;
  const alt = (i: number) => t("shopPictureAlt", { title: images.length > 1 ? `${title} (${i + 1})` : title });
  const go = (i: number) => {
    const next = (i + images.length) % images.length;
    setIndex(next);
    const row = track.current;
    if (row) row.scrollTo({ left: next * row.clientWidth, behavior: "smooth" });
  };

  if (images.length === 0) {
    return (
      <div className={`${PHOTO} flex items-center justify-center rounded-md md:mx-0`} style={{ maxWidth: MAIN_MAX_WIDTH }} data-testid="shop-gallery">
        <ImageOff className="h-10 w-10 text-zinc-500" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="flex gap-x-4" data-testid="shop-gallery">
      {images.length > 1 && (
        <ul className="hidden max-h-[calc(100svh-9rem)] w-[4.5rem] shrink-0 flex-col gap-y-2 overflow-y-auto p-1 md:flex">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onMouseEnter={() => go(i)}
                onFocus={() => go(i)}
                onClick={() => go(i)}
                aria-label={t("shopPictureN", { number: i + 1 })}
                aria-current={i === active}
                className={`${PHOTO} block w-16 rounded-md ring-offset-2 ring-offset-[#0a0e1a] transition ${i === active ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`}
              >
                <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative min-w-0 flex-1">
        <div
          className={`${PHOTO} hidden cursor-zoom-in rounded-md md:block`}
          style={{ maxWidth: MAIN_MAX_WIDTH }}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(active + 1);
            if (e.key === "ArrowLeft") go(active - 1);
          }}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - box.left) / box.width) * 100, y: ((e.clientY - box.top) / box.height) * 100 });
          }}
          onMouseLeave={() => setZoom(null)}
        >
          <div className="absolute inset-0 transition-transform duration-200 ease-out" style={{ transform: zoom ? `scale(${ZOOM})` : undefined, transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : undefined }}>
            <img key={images[active]} src={images[active]} alt={alt(active)} className="h-full w-full object-contain" />
          </div>
        </div>
        <div
          ref={track}
          className="mx-auto flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
          style={{ maxWidth: PHONE_MAX_WIDTH }}
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {images.map((src, i) => (
            <div key={src} className={`${PHOTO} w-full shrink-0 snap-center`}>
              <img src={src} alt={alt(i)} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-contain" />
            </div>
          ))}
        </div>
        {images.length > 1 && <p className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white md:hidden" style={{ right: `max(0.75rem, calc((100% - ${PHONE_MAX_WIDTH}) / 2 + 0.75rem))` }}>{active + 1} / {images.length}</p>}
      </div>
    </div>
  );
}

/**
 * The product in view, laid out like Stuscle's wholesale product page: the gallery on the left and the buying column on
 * the right (a single column on a phone). Pick the version and the bulk pack, see the pack's price against retail, Add to
 * cart.
 */
function ProductDetail({ product, currency }: { product: TagShopProduct; currency: string }) {
  const t = useT(tagsMessages);
  const first = shopDefaultVariant(product);
  const [variantId, setVariantId] = useState(first.id);
  const [quantity, setQuantity] = useState(shopStartQuantity(first));
  const [quantityText, setQuantityText] = useState(String(shopStartQuantity(first)));
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const sold = variant.packs.length > 0;
  const totals = shopTotals(variant, quantity);
  const retailUnit = totals.retailCents !== null ? totals.retailCents / totals.quantity : null;
  const shown = shopPictureFor(product, variant);
  const pictures = variant.images.length > 0 ? variant.images : product.images.length > 0 ? product.images : shown ? [shown] : [];
  const money = (cents: number) => formatMoney(cents, currency);
  // Only the choices a reader makes: the NFC chip is left out, and a value no priced variant has is never offered.
  const shownOptions = product.options.filter((o) => isShopOptionShown(o.title) && o.values.length > 1);
  const link = shopLinkWithQuantity(variant, totals.quantity, t.lang);
  const setQty = (value: number) => {
    const next = Math.min(TAG_SHOWCASE_MAX_QUANTITY, Math.max(1, Math.floor(value) || 1));
    setQuantity(next);
    setQuantityText(String(next));
  };

  // A variant sold in packs only takes a pack's size: changing variant keeps the pack when it has one like it, else its smallest.
  const pick = (id: string) => {
    const next = product.variants.find((v) => v.id === id) ?? product.variants[0];
    setVariantId(next.id);
    if (next.packs.length > 0 && !next.packs.some((p) => p.quantity === quantity)) setQty(shopStartQuantity(next));
  };

  const addButton = (extra: string) => (
    <Button asChild variant="brand" accent="tags" size="lg" className={`w-full ${extra}`}>
      <a href={link} target="_blank" rel="noopener noreferrer" data-testid="shop-add">
        <ShoppingCart />
        {t("shopAddToCart")}
      </a>
    </Button>
  );

  return (
    <section className="grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] md:items-start lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-x-12" data-testid="shop-product">
      <div className="min-w-0">
        <Gallery key={variant.id} images={pictures} title={product.title} />
      </div>
      <div className="flex min-w-0 flex-col gap-y-6">
        <h2 className="text-2xl font-medium leading-8 text-white lg:text-3xl lg:leading-10">{product.title}</h2>
        <div className="flex flex-col gap-y-4">
          {product.variants.length > 1 && (shownOptions.length > 0 ? (
            shownOptions.map((option) => (
              <div key={option.title} className="flex flex-col gap-y-2" data-testid="shop-option">
                <span className="text-sm text-white">{option.title}</span>
                <div className="grid grid-cols-2 gap-2 min-[512px]:grid-cols-3" role="radiogroup" aria-label={option.title}>
                  {option.values.map((value) => {
                    const on = variant.options[option.title] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => { const next = shopPickOption(product, variant, option.title, value); if (next) pick(next.id); }}
                        className={`min-h-12 rounded-md border px-3 py-2 text-base text-white transition-colors ${on ? "border-white ring-1 ring-white" : "border-white/15 hover:border-white"}`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-2 gap-2 min-[512px]:grid-cols-3" role="radiogroup" aria-label={t("shopVariant")} data-testid="shop-variant">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={v.id === variant.id}
                  onClick={() => pick(v.id)}
                  className={`min-h-12 rounded-md border px-3 py-2 text-base text-white transition-colors ${v.id === variant.id ? "border-white ring-1 ring-white" : "border-white/15 hover:border-white"}`}
                >
                  {v.title ?? v.sku}
                </button>
              ))}
            </div>
          ))}

          <div className="flex flex-col gap-y-4">
            {sold ? (
              <>
                <div className="flex flex-col gap-y-3">
                  <span className="text-sm text-white">{t("shopPacksTitle")}</span>
                  <div className={`grid gap-2 ${variant.packs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`} role="radiogroup" aria-label={t("shopPacksTitle")}>
                    {variant.packs.map((pack) => {
                      const percent = percentOff(pack.unitPriceCents, pack.retailUnitPriceCents ?? variant.retailPriceCents);
                      const picked = quantity === pack.quantity;
                      return (
                        <button
                          key={pack.quantity}
                          type="button"
                          role="radio"
                          aria-checked={picked}
                          onClick={() => setQty(pack.quantity)}
                          className={`flex flex-col items-center gap-y-0.5 rounded-md border px-2 py-3 text-center text-white transition-colors ${picked ? "border-white ring-1 ring-white" : "border-white/15 hover:border-white"}`}
                          data-testid="shop-pack"
                        >
                          <span className="text-base font-medium">{t("shopPieces", { count: pack.quantity })}</span>
                          <span className="text-sm text-white/55">{t("shopEach", { price: money(pack.unitPriceCents) })}</span>
                          {percent !== null && <span className="text-sm font-medium text-emerald-300">{t("shopSave", { percent })}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-y-1 text-white" data-testid="shop-total">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xl font-semibold" data-testid="shop-wholesale-price">{money(totals.wholesaleCents)}</span>
                    {totals.retailCents !== null && <span className="text-white/55 line-through">{money(totals.retailCents)}</span>}
                    {totals.percentOff !== null && <span className={GREEN_PILL}>{t("shopSave", { percent: totals.percentOff })}</span>}
                  </div>
                  <p className="text-sm text-white/55">
                    {t("shopSummary", { count: totals.quantity, price: money(totals.unitCents) })}
                    {totals.saveCents !== null && ` · ${t("shopSaved", { amount: money(totals.saveCents) })}`}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/55">{t("shopWholesale")}</span>
                  <span className="text-2xl font-semibold text-white" data-testid="shop-wholesale-price">{money(totals.unitCents)}</span>
                  <span className="text-sm text-white/55">{t("shopPerUnit")}</span>
                </div>
                {retailUnit !== null && (
                  <div className="flex flex-wrap items-center gap-x-3 text-sm text-white/55">
                    <span>{t("shopRetail")} <span className="line-through">{money(retailUnit)}</span></span>
                    {totals.percentOff !== null && <span className={GREEN_PILL}>{t("shopSave", { percent: totals.percentOff })}</span>}
                  </div>
                )}
                <label className="flex flex-col gap-1 text-sm text-white/55">
                  {t("shopQuantity")}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={TAG_SHOWCASE_MAX_QUANTITY}
                    step={1}
                    value={quantityText}
                    onChange={(e) => {
                      setQuantityText(e.target.value);
                      const n = Number(e.target.value);
                      if (Number.isInteger(n) && n >= 1 && n <= TAG_SHOWCASE_MAX_QUANTITY) setQuantity(n);
                    }}
                    onBlur={() => setQty(Number(quantityText))}
                    className="h-10 w-24 rounded-md border border-white/15 bg-white/[0.05] px-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-300/60"
                    data-testid="shop-quantity"
                  />
                </label>
              </div>
            )}
            {addButton("h-14 rounded-full text-base")}
          </div>
        </div>
        {product.description && <p className="whitespace-pre-line text-base leading-7 text-white/85" data-testid="shop-description">{product.description}</p>}
      </div>
    </section>
  );
}

/** A Stuscle product in a grid, shaped like Stuscle's wholesale card: the photo, the name, "From" the lowest price with the retail one struck through, and the saving. */
function ProductTile({ product, currency, onOpen }: { product: TagShopProduct; currency: string; onOpen: () => void }) {
  const t = useT(tagsMessages);
  const cheapest = product.variants.reduce((a, b) => (lowestPriceOf(b).cents < lowestPriceOf(a).cents ? b : a));
  const { cents, retailCents } = lowestPriceOf(cheapest);
  const off = percentOff(cents, retailCents);
  const picture = shopPictureFor(product, cheapest);
  const hasRange = product.variants.length > 1 || cheapest.packs.length > 0;
  return (
    <li>
      <button type="button" onClick={onOpen} className="group flex w-full flex-col gap-3 text-left" data-testid="shop-tile">
        <div className={`${PHOTO} w-full`}>
          {picture ? <img src={picture} alt="" loading="lazy" className="h-full w-full object-contain" /> : <ImageOff className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium leading-snug text-white group-hover:underline group-hover:underline-offset-2">{product.title}</p>
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-white">{hasRange ? t("shopFrom", { price: formatMoney(cents, currency) }) : formatMoney(cents, currency)}</span>
            {retailCents !== null && off !== null && <span className="text-white/55 line-through">{formatMoney(retailCents, currency)}</span>}
          </p>
          {off !== null && <span className="text-sm font-medium text-emerald-300">{t("shopSave", { percent: off })}</span>}
        </div>
      </button>
    </li>
  );
}

/** Stuscle's catalogue page size, so a page holds the same number of cards. */
const PAGE_SIZE = 12;
type Sort = "default" | "low" | "high";

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
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [section, setSection] = useState<ShopSectionKey | "all">("all");
  const [sort, setSort] = useState<Sort>("default");
  const [page, setPage] = useState(1);
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
  // All products first; one opens in full, with the others to pick from below. A lone product with nothing beside it opens straight away.
  const featured = products.find((p) => p.id === featuredId) ?? (products.length === 1 && kits.length === 0 ? products[0] : null);
  const others = featured ? shopRelated(products, featured, 4) : [];
  // The catalogue in Stuscle's sections (stands, then plates), the side menu offering only the ones that hold a product.
  const sectionKeys = ((["stands", "plates", "other"] as const).filter((key) => products.some((p) => shopSectionOf(p) === key)));
  const sectionLabel = (key: ShopSectionKey) => (key === "stands" ? t("shopSectionStands") : key === "plates" ? t("shopSectionPlates") : t("shopCatalogTitle"));
  const reach = (p: TagShopProduct) => Math.min(...p.variants.map((v) => lowestPriceOf(v).cents));
  const shown = products.filter((p) => section === "all" || shopSectionOf(p) === section);
  const sorted = sort === "low" ? [...shown].sort((a, b) => reach(a) - reach(b)) : sort === "high" ? [...shown].sort((a, b) => reach(b) - reach(a)) : shown;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const open = (id: string | null) => {
    setFeaturedId(id);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
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
        featured ? (
          <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-y-4">
            {products.length > 1 && (
              <button type="button" onClick={() => open(null)} className="w-fit text-sm text-white/55 underline-offset-4 transition-colors hover:text-white hover:underline" data-testid="shop-back">
                ← {t("shopAllProducts")}
              </button>
            )}
            <ProductDetail key={featured.id} product={featured} currency={currency} />
            {others.length > 0 && (
              <div className="mt-16 lg:mt-32" data-testid="shop-also-like">
                <div className="mb-10 flex flex-col items-center text-center lg:mb-16">
                  <h2 className="max-w-lg text-2xl text-white">{t("shopMoreProducts")}</h2>
                </div>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
                  {others.map((product) => (
                    <ProductTile key={product.id} product={product} currency={currency} onOpen={() => open(product.id)} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-y-6" data-testid="shop-all">
            {products.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <h2 className="text-2xl text-white" data-testid="shop-catalog-title">{section === "all" ? t("shopCatalogTitle") : sectionLabel(section)}</h2>
                  <label className="flex items-center gap-2 text-sm text-white/55">
                    {t("shopSort")}
                    <select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }} className="h-10 rounded-md border border-white/15 bg-[#141416] px-3 text-white" data-testid="shop-sort">
                      <option value="default">{t("shopSortDefault")}</option>
                      <option value="low">{t("shopSortLow")}</option>
                      <option value="high">{t("shopSortHigh")}</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-col gap-y-6 lg:flex-row lg:gap-x-12">
                  {sectionKeys.length > 0 && (
                    <nav aria-label={t("shopCatalogTitle")} className="lg:w-44 lg:shrink-0" data-testid="shop-sidebar">
                      <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col">
                        {([["all", t("shopAllProducts")], ...sectionKeys.map((key) => [key, sectionLabel(key)] as const)] as Array<readonly [ShopSectionKey | "all", string]>).map(([key, label]) => (
                          <li key={key}>
                            <button type="button" onClick={() => { setSection(key); setPage(1); }} aria-current={section === key ? "page" : undefined} className={`text-base transition-colors ${section === key ? "font-medium text-white" : "text-white/55 hover:text-white"}`}>{label}</button>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  )}
                  <div className="min-w-0 flex-1">
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-3 lg:gap-x-6" data-testid="shop-grid">
                      {pageItems.map((product) => (
                        <ProductTile key={product.id} product={product} currency={currency} onOpen={() => open(product.id)} />
                      ))}
                    </ul>
                    {totalPages > 1 && (
                      <div className="mt-10 flex items-center justify-center gap-x-6 text-sm text-white" data-testid="shop-pagination">
                        <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} className="disabled:opacity-40">{t("shopPrev")}</button>
                        <span className="text-white/55">{t("shopPageOf", { page: current, total: totalPages })}</span>
                        <button type="button" disabled={current === totalPages} onClick={() => setPage(current + 1)} className="disabled:opacity-40">{t("shopNext")}</button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {kits.length > 0 && (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {kits.map((item) => (
                  <ShopCard key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
        )
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
