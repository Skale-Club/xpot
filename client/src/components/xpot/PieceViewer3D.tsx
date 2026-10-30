import { Suspense, lazy, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { printModelPreviewPath } from "@shared/printProduction";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import type { PreviewState } from "@/pages/admin/tags/production-preview-3d";

// The rotatable 3D view that opens when a piece's small picture is clicked (PieceThumb3D). There is one for the whole
// app, mounted once next to the router, and the pictures only tell it which model to show: a dialog rendered inside
// a list row would hand every click in it back to the row (React events follow the component tree, not the page).
// three.js loads when the first one opens.

export interface OpenedPiece {
  slug: string;
  title: string;
  sha256: string;
}

const Preview3D = lazy(() => import("@/pages/admin/tags/production-preview-3d"));

let opened: OpenedPiece | null = null;
const listeners = new Set<() => void>();

export function openPieceViewer(piece: OpenedPiece | null) {
  opened = piece;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function PieceViewerHost() {
  const piece = useSyncExternalStore(subscribe, () => opened, () => null);
  const t = useT(productionMessages);
  const [state, setState] = useState<PreviewState>("loading");
  return (
    <Dialog open={piece !== null} onOpenChange={(open) => { if (!open) openPieceViewer(null); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{piece?.title ?? t("previewTitle")}</DialogTitle>
          <DialogDescription>{t("previewHint")}</DialogDescription>
        </DialogHeader>
        {piece ? (
          <div className="relative h-80 w-full overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_70%)] sm:h-96" data-testid="piece-viewer-3d">
            <Suspense fallback={null}>
              <Preview3D key={piece.slug} url={printModelPreviewPath(piece.slug, piece.sha256)} resetLabel={t("previewReset")} onState={setState} />
            </Suspense>
            {state === "loading" ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("previewLoading")}
              </p>
            ) : null}
            {state === "failed" || state === "no-webgl" ? (
              <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/55">
                {state === "failed" ? t("previewFailed") : t("previewNoWebgl")}
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
