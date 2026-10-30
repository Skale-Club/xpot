import { Suspense, lazy, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Box, FileUp, Loader2 } from "lucide-react";
import { printPreviewPath, type PrintModelVersionItem, type PrintPreviewInfo } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { errorMessage, invalidateAdminTags } from "./api";
import { uploadFile } from "./production-shared";
import type { PreviewState } from "./production-preview-3d";

// A version's 3D view on the model and plate pages: one sample piece (print-pipeline/preview.py) to turn and zoom.
// three.js comes in its own chunk, only when there is a preview to show.

const Preview3D = lazy(() => import("./production-preview-3d"));

export function PrintPreviewCard({ modelSlug, versionId, preview, canUpload = true }: {
  modelSlug: string;
  versionId: string;
  preview: PrintPreviewInfo | null;
  canUpload?: boolean;
}) {
  const t = useT(productionMessages);
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PreviewState>("loading");
  const upload = useMutation({
    mutationFn: (file: File) => uploadFile<PrintModelVersionItem>(printPreviewPath(modelSlug, versionId), file),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: t("previewUploaded") });
    },
    onError: (err) => toast({ title: t("previewFailed"), description: errorMessage(err), variant: "destructive" }),
  });
  // The file's hash in the url: a replaced preview is a new url, so neither the cache nor the viewer keeps the old one.
  const url = preview ? `${printPreviewPath(modelSlug, versionId)}?v=${preview.sha256.slice(0, 12)}` : null;

  const actions = canUpload ? (
    <>
      <Button type="button" variant="ghost" size="sm" loading={upload.isPending} onClick={() => input.current?.click()} data-testid="production-preview-upload">
        <FileUp />
        {preview ? t("previewReplace") : t("previewUpload")}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".glb,model/gltf-binary"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) upload.mutate(file);
        }}
      />
    </>
  ) : null;

  return (
    <SectionCard title={t("previewTitle")} icon={Box} accent="tags" actions={actions} bodyClassName="p-0" testId="production-preview">
      {url ? (
        <div>
          <div className="relative h-72 w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_70%)] sm:h-96">
            <Suspense fallback={null}>
              <Preview3D url={url} resetLabel={t("previewReset")} onState={setState} />
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
          <p className="border-t border-white/[0.06] px-4 py-2 text-xs text-white/45">{t("previewHint")}</p>
        </div>
      ) : (
        <div className="px-4 py-5 text-sm">
          <p className="text-white/60">{t("previewEmpty")}</p>
          <p className="mt-1 text-xs text-white/40">{t("previewEmptyHint")}</p>
        </div>
      )}
    </SectionCard>
  );
}
