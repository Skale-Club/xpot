import type { ReactNode } from "react";
import { Wifi } from "lucide-react";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";

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

// Every size draws the same printed layout: the NFC mark and the QR side by
// side on top, the artwork below them, and on a stand the black foot it sits
// on. The plaque reads the same in a table row and in a page header.
const SIZES = {
  sm: {
    body: "w-7 gap-[3px] p-[3px] pb-1",
    plateBody: "h-7 w-7 justify-between p-[3px]",
    plateMark: "h-1.5 w-1.5",
    plateFace: "2xs",
    corners: "rounded-[5px]",
    standCorners: "rounded-t-[5px] rounded-b-[2px]",
    mark: "h-2 w-2",
    face: "xs",
    base: "h-[5px] w-[34px] rounded-b-[3px] rounded-t-[1px]",
  },
  md: {
    body: "w-11 gap-1.5 p-1.5 pb-2",
    plateBody: "h-11 w-11 justify-between p-1.5",
    plateMark: "h-2 w-2",
    plateFace: "xs",
    corners: "rounded-[8px]",
    standCorners: "rounded-t-[8px] rounded-b-[3px]",
    mark: "h-3 w-3",
    face: "sm",
    base: "h-2 w-12 rounded-b-[4px] rounded-t-[1px]",
  },
  lg: {
    body: "h-32 w-24 justify-between p-3 pb-4",
    plateBody: "h-24 w-24 justify-between p-3",
    plateMark: "h-4 w-4",
    plateFace: "lg",
    corners: "rounded-xl",
    standCorners: "rounded-t-xl rounded-b-[4px]",
    mark: "h-6 w-6",
    face: "lg",
    base: "h-3 w-28 rounded-b-md rounded-t-[2px]",
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
 * Model and size as compact chips ("STAND" plus a coloured "L" or "S"), kept
 * beside the plaque drawing rather than on it. Products that are not plaques
 * show `fallback`.
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
  const t = useT(tagsMessages);
  const { size, model } = tagPlaqueSpec(productType, face, batchCode);
  const chip = "inline-flex h-4 items-center rounded px-1 text-[10px] font-bold uppercase leading-none tracking-wide";
  if (!size && !model) {
    return (
      <span className={`${chip} bg-white/10 text-white/75 ring-1 ring-white/15 ${className}`} data-testid="tag-model-chips">
        {fallback ?? t(`product_${productType}` as "product_custom")}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`} data-testid="tag-model-chips">
      {model ? <span className={`${chip} bg-white/[0.08] text-white/70`}>{t(`plaqueModel_${model}`)}</span> : null}
      {/* A size, not a state: Large in the Tags accent, Small neutral (amber would read as "needs a step"). */}
      {size ? (
        <span
          className={`${chip} w-4 justify-center px-0 ${size === "Large" ? "bg-violet-500/20 text-violet-200" : "bg-white/10 text-white/70"}`}
          title={t(`plaqueSize_${size}`)}
          aria-label={t(`plaqueSize_${size}`)}
        >
          {t(`plaqueSize_${size}`).charAt(0)}
        </span>
      ) : null}
    </span>
  );
}

// The type scale every piece and batch mention shares, so a code reads the
// same size in every list and every header across the app. Screens never size
// codes themselves: they pick a template below.
/** A list row's title: the customer's name, or the code when there is none. */
const LIST_TITLE = "block truncate text-base font-semibold text-white";
/** The code in monospace, as a list row's title. */
const LIST_CODE = `${LIST_TITLE} font-mono tracking-[0.1em]`;
/** The code on a row's second line, under the customer's name. */
const LIST_SUBCODE = "shrink-0 font-mono text-[13px] font-medium tracking-[0.08em] text-white/55";
const LIST_DETAILS = "min-w-0 truncate text-xs text-white/40";
/** A piece's or batch's code as a page / pane heading. */
export const CODE_HEADING = "font-mono text-[26px] font-extrabold leading-tight tracking-[0.08em] text-white";
/** Extra classes for `TopBar`'s title (which already sets the heading size) when the title is a code. */
export const CODE_HEADING_TOPBAR = "font-mono tracking-[0.08em]";

/**
 * The complete identity used whenever a specific piece is mentioned in a list:
 * its picture, its public code, and its model/size chips. Given a `customer`,
 * the customer's name leads and the code drops to the second line beside the
 * chips, so a list reads as "whose piece" first; a piece with no customer leads
 * with its code.
 */
export function TagPieceMention({
  publicCode,
  productType,
  face,
  batchCode,
  customer,
  details,
  className = "",
}: {
  publicCode: string;
  productType: string;
  face: string | null | undefined;
  batchCode?: string | null;
  customer?: string | null;
  details?: ReactNode;
  className?: string;
}) {
  const t = useT(tagsMessages);
  return (
    <span className={`inline-flex min-w-0 items-center gap-3 ${className}`} data-testid="tag-piece-mention">
      <TagPieceVisual productType={productType} face={face} title={t(`face_${face ?? "none"}` as "face_none")} />
      <span className="min-w-0">
        {customer ? <span className={LIST_TITLE}>{customer}</span> : <span className={LIST_CODE}>{publicCode}</span>}
        <span className="mt-1 flex min-w-0 items-center gap-1.5">
          {customer ? <span className={LIST_SUBCODE}>{publicCode}</span> : null}
          <TagModelChips productType={productType} face={face} batchCode={batchCode} className="shrink-0" />
          {details ? <span className={LIST_DETAILS}>{details}</span> : null}
        </span>
      </span>
    </span>
  );
}

/**
 * A batch in a list, laid out like a piece: the plaque its pieces share, the
 * batch code as the title, and its name / vendor underneath.
 */
export function TagBatchMention({
  batchCode,
  productType,
  face,
  details,
  className = "",
}: {
  batchCode: string;
  productType: string;
  face: string | null | undefined;
  details?: ReactNode;
  className?: string;
}) {
  const t = useT(tagsMessages);
  return (
    <span className={`inline-flex min-w-0 items-center gap-3 ${className}`} data-testid="tag-batch-mention">
      <TagPieceVisual productType={productType} face={face} title={t(`face_${face ?? "none"}` as "face_none")} />
      <span className="min-w-0">
        <span className={LIST_CODE}>{batchCode}</span>
        {details ? <span className={`mt-1 block ${LIST_DETAILS}`}>{details}</span> : null}
      </span>
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

const VISUAL_SLOT = { sm: "w-9", md: "w-12", lg: "w-28" } as const;
const VISUAL_FACE_SIZE = { sm: "md", md: "lg", lg: "lg" } as const;

/**
 * The picture of a piece in lists and headers: the plaque drawing when the
 * piece is a plaque (it already carries the printed face), otherwise the face
 * tile alone. A fixed-width slot keeps rows aligned across both.
 */
export function TagPieceVisual({
  productType,
  face,
  size = "sm",
  title,
  theme,
}: {
  productType: string;
  face: string | null | undefined;
  size?: keyof typeof SIZES;
  title?: string;
  theme?: string | null;
}) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${VISUAL_SLOT[size]}`} title={title}>
      {isPlaque(productType, face) ? (
        <TagProductThumbnail productType={productType} face={face} size={size} theme={theme} />
      ) : (
        <TagFaceIcon face={face} size={VISUAL_FACE_SIZE[size]} title={title} />
      )}
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
  theme,
}: {
  productType: string;
  face: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
  theme?: string | null;
}) {
  if (!isPlaque(productType, face)) return null;

  const s = SIZES[size];
  const model = plaqueModel(productType, face);
  const stand = model === "Stand";
  const plate = model === "Plate";
  const dark = /^(black|preto|preta|negro|negra)(?:$|[\s_-])/i.test(theme?.trim() ?? "");
  return (
    <span className={`inline-flex shrink-0 flex-col items-center ${className}`} aria-hidden="true">
      <span
        className={`flex flex-col items-center ${dark ? "bg-gradient-to-b from-neutral-700 to-neutral-900 text-white ring-1 ring-white/20" : "bg-gradient-to-b from-white to-[#ecebe7] text-neutral-800"} shadow-[0_1px_3px_rgba(0,0,0,0.35)] ${plate ? s.plateBody : s.body} ${stand ? s.standCorners : s.corners}`}
      >
        <span className="flex w-full items-center justify-between">
          <Wifi className={`shrink-0 ${plate ? s.plateMark : s.mark}`} strokeWidth={2.6} />
          <MiniQr className={`shrink-0 ${plate ? s.plateMark : s.mark}`} />
        </span>
        <TagFaceIcon face={face} size={plate ? s.plateFace : s.face} className="!shadow-none !ring-0" />
      </span>
      {/* The stand's foot. */}
      {stand ? <span className={`bg-black ${s.base}`} /> : null}
    </span>
  );
}
