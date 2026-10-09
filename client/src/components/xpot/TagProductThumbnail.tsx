const PLAQUE_PRODUCT_TYPES = new Set([
  "large_stand",
  "small_stand",
  "large_sign",
  "small_sign",
  "large_plate",
  "small_plate",
  // Legacy rows created before the physical model catalog was introduced.
  "google_review_sign",
]);

const THUMB_BY_FACE: Record<string, string> = {
  google_review: "/tags/product-thumbnails/plaque-google.webp",
  instagram: "/tags/product-thumbnails/plaque-instagram.webp",
};

const SIZES = {
  sm: "h-8 w-7",
  md: "h-12 w-11",
} as const;

/**
 * A compact preview of the physical piece. It is deliberately separate from
 * TagFaceIcon: the icon identifies what is printed, while this image identifies
 * the product that was manufactured.
 */
export function TagProductThumbnail({
  productType,
  face,
  size = "md",
  className = "",
}: {
  productType: string;
  face: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const src = face ? THUMB_BY_FACE[face] : undefined;
  // IG-2026-001 was originally recorded as custom; retain its preview until
  // the product-model migration has been applied in every environment.
  const isLegacyInstagramPlaque = productType === "custom" && face === "instagram";
  if (!src || (!PLAQUE_PRODUCT_TYPES.has(productType) && !isLegacyInstagramPlaque)) return null;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={`shrink-0 object-contain drop-shadow-[0_5px_5px_rgba(0,0,0,0.38)] ${SIZES[size]} ${className}`}
    />
  );
}
