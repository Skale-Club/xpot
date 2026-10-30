import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { PRINT_PREVIEW_CATALOG_PATH, printModelPreviewPath, type PrintPreviewCatalog } from "@shared/printProduction";
import { openPieceViewer } from "@/components/xpot/PieceViewer3D";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { apiRequest } from "@/lib/queryClient";

// A piece's picture in 3D, for every list and header that shows a piece (TagPieceVisual is the one place that uses
// this). The catalog says which models have a preview and which model each batch came from; a piece alone carries
// only its product type and face, never its colour, so the batch (or the model's own theme) is what picks white or
// black. The picture stands still, front on, until someone drags it: a finger or the mouse turns the piece (a strip of
// turntable frames drawn once), and a tap or click opens the rotatable view. When nothing matches, or anything fails,
// `fallback` (the flat drawing) stays: a picture never breaks a page.

export type CatalogModel = PrintPreviewCatalog["models"][number];

export interface PieceModelKey {
  productType: string;
  face: string | null | undefined;
  theme?: string | null;
  batchCode?: string | null;
  /** A model's own slug, when the screen already knows it (the catalog, an order). */
  modelSlug?: string | null;
}

function usePrintPreviewCatalog(): PrintPreviewCatalog | null {
  const { data } = useQuery({
    queryKey: ["print-preview-catalog"],
    queryFn: async () => (await apiRequest("GET", PRINT_PREVIEW_CATALOG_PATH)).json() as Promise<PrintPreviewCatalog>,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data ?? null;
}

/** The model a piece is: by slug, else by its batch, else by what it is when only one model could be it. */
export function resolvePieceModel(catalog: PrintPreviewCatalog, key: PieceModelKey): CatalogModel | null {
  const bySlug = (slug: string | null | undefined) => (slug ? catalog.models.find((m) => m.slug === slug) ?? null : null);
  const direct = bySlug(key.modelSlug) ?? bySlug(key.batchCode ? catalog.batches[key.batchCode] : null);
  if (direct) return direct;
  const face = key.face ?? null;
  const theme = key.theme?.trim().toLowerCase() || null;
  const matches = catalog.models.filter((m) =>
    m.productType === key.productType && m.face === face && (!theme || m.theme?.toLowerCase() === theme));
  // White and black are different models: with no colour to tell them apart, guess nothing.
  return matches.length === 1 ? matches[0] : null;
}

export function usePieceModel(key: PieceModelKey): CatalogModel | null {
  const catalog = usePrintPreviewCatalog();
  return catalog ? resolvePieceModel(catalog, key) : null;
}

// What is drawn, by file hash: in memory for this page and in localStorage for the next visit, so a list reloads
// without fetching the models again. A new preview file is a new hash, so a replaced one is never stale.
const ROOT = "xpot:piece3d:";
const STORE = `${ROOT}v3:`;
const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

/** One lap in this many frames (10 degrees each). A frame is as wide as the picture shows at 2x, so it stays sharp. */
const FRAMES = 36;
/** Dragging this far, in px, turns the piece one frame: a lap takes about 110 px of drag. */
const PX_PER_FRAME = 3;
/** A press that moves less than this is a tap, not a turn. */
const TAP_SLOP = 4;

const frameSize = (px: number) => px * 2;
const cacheKey = (model: CatalogModel, px: number) => `${model.sha256.slice(0, 12)}:${frameSize(px)}x${FRAMES}`;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(STORE + key);
  } catch {
    return null;
  }
}

function writeStored(key: string, strip: string) {
  try {
    localStorage.setItem(STORE + key, strip);
  } catch {
    // Full or blocked: drop what this feature stored and carry on without persistence.
    try {
      for (const name of Object.keys(localStorage)) if (name.startsWith(ROOT)) localStorage.removeItem(name);
    } catch { /* storage unavailable */ }
  }
}

function cachedStrip(key: string): string | null {
  const hit = memory.get(key) ?? readStored(key);
  if (hit) memory.set(key, hit);
  return hit;
}

function loadStrip(model: CatalogModel, px: number): Promise<string> {
  const key = cacheKey(model, px);
  const known = cachedStrip(key);
  if (known) return Promise.resolve(known);
  let job = pending.get(key);
  if (!job) {
    job = import("./piece3d/thumbRender")
      .then((draw) => draw.renderPieceTurntable(printModelPreviewPath(model.slug, model.sha256), frameSize(px), FRAMES))
      .then((strip) => {
        memory.set(key, strip);
        writeStored(key, strip);
        return strip;
      })
      .finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}

function useStrip(model: CatalogModel, px: number): string | null {
  const key = cacheKey(model, px);
  const [strip, setStrip] = useState<string | null>(() => cachedStrip(key));
  useEffect(() => {
    let live = true;
    setStrip(cachedStrip(key));
    loadStrip(model, px).then((drawn) => live && setStrip(drawn), () => undefined);
    return () => { live = false; };
  }, [model, px, key]);
  return strip;
}

/**
 * The piece's 3D picture. It stands still on its front; dragging it with a finger or the mouse turns it (a tap or a
 * click, with no drag, opens the rotatable view instead), and the arrow keys turn it for the keyboard. It never
 * reaches the row or link it sits in. The `fallback` shows until the picture is drawn, and stays if it cannot be.
 */
export function PieceThumb3D({ model, px, fallback }: { model: CatalogModel; px: number; fallback: ReactNode }) {
  const t = useT(productionMessages);
  const strip = useStrip(model, px);
  const [frame, setFrame] = useState(0);
  // Where this press started and whether it has turned the piece yet: a click that ends a drag must not open the view.
  const press = useRef<{ x: number; frame: number; turned: boolean } | null>(null);
  const dragged = useRef(false);
  if (!strip) return <>{fallback}</>;

  const wrap = (n: number) => ((n % FRAMES) + FRAMES) % FRAMES;
  const open = () => openPieceViewer({ slug: model.slug, title: model.title, sha256: model.sha256 });

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    press.current = { x: event.clientX, frame, turned: false };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const start = press.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (!start.turned && Math.abs(dx) < TAP_SLOP) return;
    start.turned = true;
    dragged.current = true;
    // Dragging right brings the front round to the right, like turning a real piece by its face.
    setFrame(wrap(start.frame - Math.round(dx / PX_PER_FRAME)));
  };
  const onPointerEnd = () => {
    press.current = null;
  };
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    open();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      setFrame((current) => wrap(current + (event.key === "ArrowRight" ? -1 : 1) * 3));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      open();
    }
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${t("previewTitle")}: ${model.title}`}
      title={t("previewTitle")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={onClick}
      onKeyDown={onKeyDown}
      data-testid="piece-thumb-3d"
      data-frame={frame}
      // pan-y: a vertical swipe still scrolls the page; a sideways one turns the piece.
      style={{ display: "block", width: px, height: px, touchAction: "pan-y", backgroundImage: `url(${strip})`, backgroundSize: `${FRAMES * px}px ${px}px`, backgroundPosition: `${-frame * px}px 0`, backgroundRepeat: "no-repeat" }}
      className="cursor-grab touch-pan-y select-none rounded-md outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-violet-400"
    />
  );
}
