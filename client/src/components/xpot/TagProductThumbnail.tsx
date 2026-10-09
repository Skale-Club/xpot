import type { ReactNode } from "react";
import { Wifi } from "lucide-react";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";

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

const SIZES = {
  sm: {
    frame: "h-8 w-6 rounded-[4px]",
    wifi: "top-1 h-1.5 w-1.5",
    face: "top-2.5",
    qr: "hidden",
  },
  md: {
    frame: "h-12 w-9 rounded-[5px]",
    wifi: "top-1 h-2.5 w-2.5",
    face: "top-3.5",
    qr: "bottom-1 h-2.5 w-2.5",
  },
} as const;

export type PlaqueSize = "Small" | "Large";
export type PlaqueModel = "Plate" | "Stand" | "Sign";

// These four runs predate physical product models. New batches derive size
// from their large_* / small_* product type and never need an entry here.
const LEGACY_BATCH_SIZES: Record<string, PlaqueSize> = {
  "REV-2026-001": "Small",
  "REV-2026-002": "Large",
  "REV-2026-003": "Large",
  "IG-2026-001": "Large",
};

function plaqueSize(productType: string, batchCode: string | null | undefined): PlaqueSize | null {
  if (productType.startsWith("large_")) return "Large";
  if (productType.startsWith("small_")) return "Small";
  return batchCode ? LEGACY_BATCH_SIZES[batchCode] ?? null : null;
}

function plaqueModel(productType: string, face: string | null | undefined): PlaqueModel | null {
  if (productType.endsWith("_plate")) return "Plate";
  if (productType.endsWith("_stand")) return "Stand";
  if (productType.endsWith("_sign") || productType === "google_review_sign") return "Sign";
  // This batch predates the physical model field but uses the same sign body.
  if (productType === "custom" && face === "instagram") return "Sign";
  return null;
}

/** Physical size and model of a plaque; both null for products that are not plaques. */
export function tagPlaqueSpec(
  productType: string,
  face: string | null | undefined,
  batchCode?: string | null,
): { size: PlaqueSize | null; model: PlaqueModel | null } {
  return { size: plaqueSize(productType, batchCode), model: plaqueModel(productType, face) };
}

/**
 * Size and model as readable text ("LARGE" "STAND"), kept beside the plaque
 * drawing rather than on it. Products that are not plaques show `fallback`.
 */
export function TagModelChips({
  productType,
  face,
  batchCode,
  fallback,
  className = "",
}: {
  productType: string;
  face: string | null | undefined;
  batchCode?: string | null;
  fallback?: ReactNode;
  className?: string;
}) {
  const { size, model } = tagPlaqueSpec(productType, face, batchCode);
  if (!size && !model) return fallback ? <>{fallback}</> : null;
  const chip = "inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-bold uppercase leading-none tracking-wider";
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`} data-testid="tag-model-chips">
      {size ? (
        <span className={`${chip} ${size === "Large" ? "bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30" : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30"}`}>
          {size}
        </span>
      ) : null}
      {model ? <span className={`${chip} bg-white/10 text-white/85 ring-1 ring-white/15`}>{model}</span> : null}
    </span>
  );
}

function MiniQr({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M0 0h4v4H0V0Zm1 1v2h2V1H1Zm7-1h4v4H8V0Zm1 1v2h2V1H9ZM0 8h4v4H0V8Zm1 1v2h2V9H1Zm5-9h1v2H6V0ZM5 3h2v2H5V3Zm3 2h2v1H8V5ZM5 6h1v2H5V6Zm2 1h2v2H7V7Zm3 0h2v2h-2V7ZM5 9h2v1H5V9Zm3 1h1v2H8v-2Zm2 0h2v2h-2v-2Z" />
    </svg>
  );
}

/**
 * Straight-on vector preview of a manufactured plaque. The shape comes from
 * the product model and the artwork comes from the resolved face, so new
 * batches inherit the preview without needing per-batch image assets.
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
  // IG-2026-001 was originally recorded as custom; retain its plaque preview
  // until the product-model migration has been applied in every environment.
  const isLegacyInstagramPlaque = productType === "custom" && face === "instagram";
  if (!PLAQUE_PRODUCT_TYPES.has(productType) && !isLegacyInstagramPlaque) return null;

  const s = SIZES[size];
  return (
    <span
      className={`inline-flex shrink-0 flex-col items-center gap-0.5 ${className}`}
      aria-hidden="true"
    >
      <span className={`relative inline-flex justify-center overflow-hidden border border-black/15 bg-gradient-to-b from-white to-[#e9e9e6] text-neutral-800 shadow-[0_2px_5px_rgba(0,0,0,0.3)] ring-1 ring-white/10 ${s.frame}`}>
        <Wifi className={`absolute left-1/2 -translate-x-1/2 ${s.wifi}`} strokeWidth={2.4} />
        <TagFaceIcon face={face} size="xs" className={`absolute shadow-none ${s.face}`} />
        <MiniQr className={`absolute ${s.qr}`} />
      </span>
    </span>
  );
}
