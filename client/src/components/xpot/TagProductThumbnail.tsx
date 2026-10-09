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

// Every size draws the same printed layout top to bottom (NFC mark, artwork,
// QR) so the plaque reads the same in a table row and in a page header.
const SIZES = {
  sm: {
    frame: "h-8 w-6 rounded-[4px] py-[3px]",
    wifi: "h-1.5 w-1.5",
    face: "2xs",
    qr: "h-[7px] w-[7px]",
  },
  md: {
    frame: "h-12 w-9 rounded-[6px] py-1",
    wifi: "h-2.5 w-2.5",
    face: "xs",
    qr: "h-2.5 w-2.5",
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
 * Model and size as readable text ("STAND" "LARGE"), kept beside the plaque
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
      {model ? <span className={`${chip} bg-white/10 text-white/85 ring-1 ring-white/15`}>{model}</span> : null}
      {size ? (
        <span className={`${chip} ${size === "Large" ? "bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30" : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30"}`}>
          {size}
        </span>
      ) : null}
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

function isPlaque(productType: string, face: string | null | undefined): boolean {
  // IG-2026-001 was originally recorded as custom; retain its plaque preview
  // until the product-model migration has been applied in every environment.
  return PLAQUE_PRODUCT_TYPES.has(productType) || (productType === "custom" && face === "instagram");
}

const VISUAL_SLOT = { sm: "w-7", md: "w-12" } as const;
const VISUAL_FACE_SIZE = { sm: "sm", md: "lg" } as const;

/**
 * The picture of a piece in lists and headers: the face tile (what is printed
 * on it) always, and beside it the plaque drawing when the piece is a plaque.
 * A fixed-width plaque slot keeps rows aligned when there is no plaque.
 */
export function TagPieceVisual({
  productType,
  face,
  size = "sm",
  title,
}: {
  productType: string;
  face: string | null | undefined;
  size?: keyof typeof SIZES;
  title?: string;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2" title={title}>
      <TagFaceIcon face={face} size={VISUAL_FACE_SIZE[size]} title={title} />
      <span className={`inline-flex shrink-0 items-center justify-center ${VISUAL_SLOT[size]}`}>
        {isPlaque(productType, face) ? <TagProductThumbnail productType={productType} face={face} size={size} /> : null}
      </span>
    </span>
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
  if (!isPlaque(productType, face)) return null;

  const s = SIZES[size];
  return (
    <span
      className={`inline-flex shrink-0 flex-col items-center justify-between bg-gradient-to-b from-white to-[#ecebe7] text-neutral-800 shadow-[0_1px_3px_rgba(0,0,0,0.35)] ${s.frame} ${className}`}
      aria-hidden="true"
    >
      <Wifi className={`shrink-0 ${s.wifi}`} strokeWidth={2.6} />
      <TagFaceIcon face={face} size={s.face} className="!shadow-none !ring-0" />
      <MiniQr className={`shrink-0 ${s.qr}`} />
    </span>
  );
}
