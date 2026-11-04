import { Suspense, lazy, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { printPreviewPath, type PrintModelItem } from "@shared/printProduction";
import type { PreviewState } from "./production-preview-3d";

const Preview3D = lazy(() => import("./production-preview-3d"));

/** The URL of a model's current 3D preview (the file hash keeps a replaced one from being served stale), or null. */
export function modelPreviewUrl(model: PrintModelItem | undefined): string | null {
  const version = model?.currentVersion;
  return model && version?.preview ? `${printPreviewPath(model.slug, version.id)}?v=${version.preview.sha256.slice(0, 12)}` : null;
}

/**
 * A piece you can turn with the mouse or a finger: a loader until the 3D is ready, `fallback` (the flat picture)
 * when the model has no preview or it cannot be drawn. Fills its parent, which must have a size.
 */
export function Piece3D({ model, fallback }: { model: PrintModelItem | undefined; fallback: ReactNode }) {
  const url = modelPreviewUrl(model);
  // The state belongs to one file: a different piece starts loading again.
  const [seen, setSeen] = useState<{ url: string | null; state: PreviewState }>({ url, state: "loading" });
  const state = seen.url === url ? seen.state : "loading";
  const flat = !url || state === "failed" || state === "no-webgl";
  return (
    <>
      {flat ? fallback : null}
      {url && !flat ? <Suspense fallback={null}><Preview3D key={url} url={url} onState={(next) => setSeen({ url, state: next })} /></Suspense> : null}
      {url && state === "loading" ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white/35" aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
}
