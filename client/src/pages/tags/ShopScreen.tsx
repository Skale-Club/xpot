import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ImageOff, Minus, Plus, ShoppingBag, ShoppingCart } from "lucide-react";
import {
  TAG_SHOWCASE_MAX_QUANTITY,
  shopLinkWithQuantity,
  shopPictureFor,
  shopStartQuantity,
  shopTotals,
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
import { firstStepsOf } from "./whoToAsk";
import { partnerLine, useWholesale, WholesaleCard } from "./WholesaleCard";

// Tags › Shop: a showcase of what Skale Club sells, as a carousel. The pieces a reseller already has live in My pieces,
// not here. First the Stuscle wholesale catalogue, read from Stuscle (the same products and prices as its /wholesale
// page), then the ready-made kits the Xpot admin keeps (Manage › Shop). Xpot sells nothing itself: Add to cart opens
// the Stuscle store with the reader's own wholesale code and the piece already in the cart, on the product's wholesale
// page. The price that counts is Stuscle's. A reseller whose partner handles its own distribution does not buy here
// at all: the screen says whose pieces they are and to ask them (no catalogue, no price, no code).

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

/** The big picture with a strip of thumbnails under it, like the product page on Stuscle. It starts again when the variant changes. */
function Gallery({ images, title }: { images: string[]; title: string }) {
  const t = useT(tagsMessages);
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)] ?? null;
  return (
    <div className="space-y-3 lg:sticky lg:top-4 lg:self-start" data-testid="shop-gallery">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-black/20">
        {current ? <img src={current} alt={t("shopPictureAlt", { title })} className="h-full w-full object-cover" /> : <ImageOff className="h-10 w-10 text-white/20" aria-hidden="true" />}
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={t("shopPictureN", { number: i + 1 })}
                aria-pressed={i === index}
                className={`block aspect-square w-full overflow-hidden rounded-lg border bg-black/20 transition-colors ${i === index ? "border-violet-300/70" : "border-white/10 opacity-70 hover:opacity-100"}`}
              >
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The product in view, laid out like Stuscle's product page: pictures on the left, details on the right (one column on a
 * phone). Pick the variant and the bulk pack, see the pack's price against retail, Add to cart.
 */
function ProductDetail({ product, currency }: { product: TagShopProduct; currency: string }) {
  const t = useT(tagsMessages);
  const [variantId, setVariantId] = useState(product.variants[0].id);
  const [quantity, setQuantity] = useState(shopStartQuantity(product.variants[0]));
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const sold = variant.packs.length > 0;
  const totals = shopTotals(variant, quantity);
  const retailUnit = totals.retailCents !== null ? totals.retailCents / totals.quantity : null;
  const shown = shopPictureFor(product, variant);
  const pictures = variant.images.length > 0 ? variant.images : product.images.length > 0 ? product.images : shown ? [shown] : [];
  const setQty = (value: number) => setQuantity(Math.min(TAG_SHOWCASE_MAX_QUANTITY, Math.max(1, Math.floor(value) || 1)));
  // A variant sold in packs only takes a pack's size: changing variant keeps the pack when it has one like it, else its smallest.
  const pick = (id: string) => {
    const next = product.variants.find((v) => v.id === id) ?? product.variants[0];
    setVariantId(next.id);
    setQuantity((current) => (next.packs.length > 0 && !next.packs.some((p) => p.quantity === current) ? shopStartQuantity(next) : current));
  };
  return (
    <section className={`${CARD} p-4 md:p-6`} data-testid="shop-product">
      <div className="grid gap-5 md:grid-cols-2 md:gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Gallery key={variant.id} images={pictures} title={product.title} />
        <div className="flex min-w-0 flex-col gap-4">
        <h2 className="text-xl font-bold leading-snug text-white md:text-2xl">{product.title}</h2>
        {product.variants.length > 1 && (
          <Select
            aria-label={t("shopVariant")}
            value={variant.id}
            onChange={(e) => pick(e.target.value)}
            options={product.variants.map((v) => ({ value: v.id, label: v.title ?? v.sku }))}
            data-testid="shop-variant"
          />
        )}
        <div className="space-y-4">
          <div>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-bold text-white" data-testid="shop-wholesale-price">{formatMoney(totals.unitCents, currency)}</span>
              <span className="text-xs text-white/45">{t("shopPerUnit")}</span>
            </p>
            {retailUnit !== null && totals.percentOff !== null && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-white/45">
                <span>
                  {t("shopRetail")} <span className="line-through">{formatMoney(retailUnit, currency)}</span>
                </span>
                <Pill tone="green">{t("shopSave", { percent: totals.percentOff })}</Pill>
              </p>
            )}
          </div>
          {quantity > 1 && (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2" data-testid="shop-total">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="whitespace-nowrap text-white/60">{t("shopTotalFor", { count: totals.quantity })}</span>
                <span className="flex items-baseline gap-2">
                  {totals.retailCents !== null && <span className="text-xs text-white/40 line-through">{formatMoney(totals.retailCents, currency)}</span>}
                  <span className="font-bold text-white">{formatMoney(totals.wholesaleCents, currency)}</span>
                </span>
              </p>
              {totals.saveCents !== null && <p className="mt-0.5 text-right text-xs font-semibold text-emerald-300">{t("shopYouSave", { amount: formatMoney(totals.saveCents, currency) })}</p>}
            </div>
          )}
          <div className="space-y-2">
            {sold ? (
              <div className="flex gap-1.5" role="group" aria-label={t("shopPacks")}>
                {variant.packs.map((pack) => (
                  <button
                    key={pack.quantity}
                    type="button"
                    aria-pressed={quantity === pack.quantity}
                    aria-label={t("shopPackLabel", { count: pack.quantity, price: formatMoney(pack.unitPriceCents, currency) })}
                    onClick={() => setQty(pack.quantity)}
                    className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                      quantity === pack.quantity ? "border-violet-300/60 bg-violet-400/20 text-white" : "border-white/10 bg-white/[0.04] text-white/60 hover:text-white"
                    }`}
                    data-testid="shop-pack"
                  >
                    <span className="text-sm">{pack.quantity}</span>
                    <span className="font-normal text-white/50">{formatMoney(pack.unitPriceCents, currency)}</span>
                  </button>
                ))}
              </div>
            ) : (
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
            )}
            <Button asChild variant="brand" accent="tags" size="lg" className="w-full">
              <a href={shopLinkWithQuantity(variant, totals.quantity, t.lang)} target="_blank" rel="noopener noreferrer" data-testid="shop-add">
                <ShoppingCart />
                {t("shopAddToCart")}
              </a>
            </Button>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}

/** Another Stuscle product, small: its picture, name and starting price. Tapping it brings it into view above. */
function ProductTile({ product, currency, onOpen }: { product: TagShopProduct; currency: string; onOpen: () => void }) {
  const t = useT(tagsMessages);
  const first = product.variants[0];
  const picture = shopPictureFor(product, first);
  return (
    <li>
      <button type="button" onClick={onOpen} className={`${CARD} block w-full overflow-hidden text-left transition-colors hover:border-violet-300/40`} data-testid="shop-tile">
        <div className="flex aspect-square items-center justify-center bg-black/20">
          {picture ? <img src={picture} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageOff className="h-8 w-8 text-white/20" aria-hidden="true" />}
        </div>
        <div className="space-y-0.5 p-3">
          <p className="text-sm font-semibold leading-snug text-white">{product.title}</p>
          <p className="text-xs text-white/55">{t("shopFrom", { price: formatMoney(first.wholesalePriceCents, currency) })}</p>
        </div>
      </button>
    </li>
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
  const [featuredId, setFeaturedId] = useState<string | null>(null);
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
  const featured = products.find((p) => p.id === featuredId) ?? products[0];
  const others = products.filter((p) => p !== featured);
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
        <div className="space-y-6">
          {featured && <ProductDetail key={featured.id} product={featured} currency={catalog.data?.currency ?? "USD"} />}
          {others.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">{t("shopMoreProducts")}</h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {others.map((product) => (
                  <ProductTile
                    key={product.id}
                    product={product}
                    currency={catalog.data?.currency ?? "USD"}
                    onOpen={() => {
                      setFeaturedId(product.id);
                      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                    }}
                  />
                ))}
              </ul>
            </section>
          )}
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
