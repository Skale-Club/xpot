import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PRINT_PREVIEW_CATALOG_PATH, printModelPreviewPath, type PrintPreviewCatalog } from "@shared/printProduction";
import { openPieceViewer } from "@/components/xpot/PieceViewer3D";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { apiRequest } from "@/lib/queryClient";

// A piece's picture in 3D, for every list and header that shows a piece (TagPieceVisual is the one place that uses
// this). The catalog says which models have a preview and which model each batch came from; a piece alone carries
// only its product type and face, never its colour, so the batch (or the model's own theme) is what picks white or
// black. The picture stands still, front on, until someone drags it: a finger or the mouse turns the piece (a strip of
// turntable frames drawn once), and a tap or click opens the rotatable view. While it is on the way a loader holds its
// place, never another picture of the piece. When nothing matches, or anything fails, `fallback` (the flat drawing)
// shows: a picture never breaks a page.

export type CatalogModel = PrintPreviewCatalog["models"][number];

export interface PieceModelKey {
  productType: string;
  face: string | null | undefined;
  theme?: string | null;
  batchCode?: string | null;
  /** A model's own slug, when the screen already knows it (the catalog, an order). */
  modelSlug?: string | null;
}

function usePrintPreviewCatalog(): { catalog: PrintPreviewCatalog | null; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["print-preview-catalog"],
    queryFn: async () => (await apiRequest("GET", PRINT_PREVIEW_CATALOG_PATH)).json() as Promise<PrintPreviewCatalog>,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { catalog: data ?? null, loading: isLoading };
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

/** `loading`: the catalog has not answered yet, so whether this piece has a 3D picture is still unknown. */
export function usePieceModel(key: PieceModelKey): { model: CatalogModel | null; loading: boolean } {
  const { catalog, loading } = usePrintPreviewCatalog();
  return { model: catalog ? resolvePieceModel(catalog, key) : null, loading };
}

/** Holds the picture's square while its 3D is on the way, so nothing else shows before it and the row does not jump. */
export function PieceThumbLoader({ px }: { px: number }) {
  return (
    <span className="flex items-center justify-center" style={{ width: px, height: px }} aria-hidden="true" data-testid="piece-thumb-loading">
      <Loader2 className="animate-spin text-white/35" style={{ width: Math.max(14, px * 0.3), height: Math.max(14, px * 0.3) }} />
    </span>
  );
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

function useStrip(model: CatalogModel, px: number): { strip: string | null; failed: boolean } {
  const key = cacheKey(model, px);
  const [strip, setStrip] = useState<string | null>(() => cachedStrip(key));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setStrip(cachedStrip(key));
    setFailed(false);
    loadStrip(model, px).then((drawn) => { if (live) setStrip(drawn); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [model, px, key]);
  return { strip, failed };
}

/**
 * The piece's 3D picture. It stands still on its front; dragging it with a finger or the mouse turns it (a tap or a
 * click, with no drag, opens the rotatable view instead), and the arrow keys turn it for the keyboard. It never
 * reaches the row or link it sits in. A loader shows until the picture is drawn; `fallback` only if it cannot be.
 * `still`: only the picture, on its front, for a piece inside a button whose tap does something else.
 */
export function PieceThumb3D({ model, px, fallback, still = false }: { model: CatalogModel; px: number; fallback: ReactNode; still?: boolean }) {
  const t = useT(productionMessages);
  const { strip, failed } = useStrip(model, px);
  const [frame, setFrame] = useState(0);
  // Where this press started and whether it has turned the piece yet: a click that ends a drag must not open the view.
  const press = useRef<{ x: number; frame: number; turned: boolean } | null>(null);
  const dragged = useRef(false);
  if (!strip) return failed ? <>{fallback}</> : <PieceThumbLoader px={px} />;
  if (still) {
    return <span aria-hidden="true" data-testid="piece-thumb-3d" style={{ display: "block", width: px, height: px, backgroundImage: `url(${strip})`, backgroundSize: `${FRAMES * px}px ${px}px`, backgroundPosition: "0 0", backgroundRepeat: "no-repeat" }} />;
  }

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
