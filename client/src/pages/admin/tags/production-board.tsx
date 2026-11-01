import { Suspense, lazy, useMemo, useState } from "react";
import { ChevronRight, Download, Info, Loader2, Shapes } from "lucide-react";
import {
  isAlwaysReadyPart,
  printGenerateOptions,
  printPreviewPath,
  printPartFamilies,
  printPartVariant,
  printedPartBeds,
  type PrintGenerateOption,
  type PrintModelItem,
  type PrintPartFamily,
} from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { useTagLabels } from "./labels";
import { Loading, LoadError } from "./pieces-shared";
import { GenerateDialog } from "./production-generate";
import { RequestList } from "./production-orders";
import type { PreviewState } from "./production-preview-3d";
import { PRODUCTION_BASE, bedSummary, minutesText, usePrintModels, useProductionAccess } from "./production-shared";

// Tags › Production's first screen: how print production actually runs.
//   To generate     serialized pieces (Stands, Plates): a short step-by-step (colour → face → quantity) asks for new
//                   pieces; each plate gets its own batch of fresh serials, pending in inventory until it is printed.
//   Always ready    parts with no serial (Stand bases, G tokens), one card per piece: the next step asks which version,
//                   with a 3D view and the fixed file to download, any time; nothing is generated or recorded.
//   Waiting         the generated plates not printed yet, with their files and "mark printed".

type Go = (path: string) => void;

const Preview3D = lazy(() => import("./production-preview-3d"));

/** `onOtherWays`: supplier codes and pieces already coded (the admin's); a printing branch has neither, nor parts. */
export function ProductionBoard({ go, onOtherWays }: { go: Go; onOtherWays?: () => void }) {
  const t = useT(productionMessages);
  const b = useT(productionBoardMessages);
  const u = useT(unifiedProductionMessages);
  const { data, isLoading, error, refetch } = usePrintModels();
  const { isAdmin } = useProductionAccess();
  const [generating, setGenerating] = useState<PrintGenerateOption | null>(null);
  const models = data ?? [];
  const [picking, setPicking] = useState<PrintPartFamily<PrintModelItem> | null>(null);
  const parts = models.filter(isAlwaysReadyPart).sort((x, y) => x.sortOrder - y.sortOrder || x.title.localeCompare(y.title));
  const families = printPartFamilies(parts);
  const options = useMemo(() => printGenerateOptions(data ?? []), [data]);
  const bySlug = new Map(models.map((model) => [model.slug, model]));
  const openModel = (model: PrintModelItem) => go(`${PRODUCTION_BASE}/models/${model.slug}`);

  if (error && !data) return <LoadError what={t("catalogWhat")} error={error} onRetry={() => void refetch()} />;
  if (isLoading) return <Loading rows={4} />;

  return (
    <div className="space-y-8" data-testid="production-board">
      <section className="space-y-3" aria-labelledby="production-generate-title" data-testid="production-generate-area">
        <SectionHeading id="production-generate-title" title={b("generateTitle")} intro={b("generateIntro")} />
        {options.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {options.map((option) => (
              <ProductCard key={option.productType} option={option} model={bySlug.get(option.colours[0].faces[0].slug)} onOpen={() => setGenerating(option)} />
            ))}
          </ul>
        ) : (
          <EmptyState tone="tags" icon={Shapes} title={b("generateEmpty")} hint={t("catalogEmptyHint")} />
        )}
      </section>

      {isAdmin ? <section className="space-y-3" aria-labelledby="production-ready-title" data-testid="production-ready-area">
        <SectionHeading id="production-ready-title" title={b("readyTitle")} intro={b("readyIntro")} />
        {families.length ? (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {families.map((family) => (
              family.models.length === 1
                ? <PartCard key={family.name} model={family.models[0]} onOpen={openModel} />
                : <PartFamilyCard key={family.name} family={family} onOpen={() => setPicking(family)} />
            ))}
          </ul>
        ) : (
          <EmptyState tone="tags" icon={Shapes} title={b("readyEmpty")} />
        )}
      </section> : null}

      <section className="space-y-3" aria-labelledby="production-pending-title" data-testid="production-pending-area">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionHeading id="production-pending-title" title={b("pendingTitle")} intro={b("pendingIntro")} />
          <Button type="button" variant="ghost" size="sm" onClick={() => go(`${PRODUCTION_BASE}/queue`)}>
            {b("allOrders")}
            <ChevronRight />
          </Button>
        </div>
        <RequestList filter="open" go={go} emptyHint={b("pendingEmptyHint")} />
        <p className="flex items-start gap-2 text-xs leading-relaxed text-white/45">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {b("benchHint")}
        </p>
      </section>

      {onOtherWays ? (
        <button type="button" onClick={onOtherWays} className="text-xs text-white/50 underline underline-offset-2 hover:text-white" data-testid="production-other-ways">
          {u("otherWays")}
        </button>
      ) : null}

      {generating ? <GenerateDialog option={generating} models={bySlug} onClose={() => setGenerating(null)} /> : null}
      {picking ? <PartFamilyDialog family={picking} onOpenModel={openModel} onClose={() => setPicking(null)} /> : null}
    </div>
  );
}

function SectionHeading({ id, title, intro }: { id: string; title: string; intro: string }) {
  return (
    <div className="min-w-0 max-w-2xl">
      <h2 id={id} className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-0.5 text-sm text-white/55">{intro}</p>
    </div>
  );
}

/** One product to generate (Large Stand, Small Plate…): its picture and how many colours and faces it comes in. */
function ProductCard({ option, model, onOpen }: { option: PrintGenerateOption; model: PrintModelItem | undefined; onOpen: () => void }) {
  const b = useT(productionBoardMessages);
  const labels = useTagLabels();
  const faces = new Set(option.colours.flatMap((colour) => colour.faces.map((face) => face.face)));
  const sample = option.colours[0].faces[0];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-center transition-colors hover:border-violet-400/40 hover:bg-violet-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        data-testid="production-generate-product"
      >
        <span className="flex h-28 w-full items-center justify-center rounded-xl bg-white/[0.16]">
          <TagPieceVisual productType={option.productType} face={sample.face} theme={model?.theme} modelSlug={sample.slug} size="lg" still />
        </span>
        <span className="space-y-0.5">
          <span className="block text-sm font-semibold text-white">{labels.product(option.productType)}</span>
          <span className="block text-xs text-white/50">
            {b.plural("colourCount", option.colours.length)} · {b.plural("faceCount", faces.size)}
          </span>
        </span>
      </button>
    </li>
  );
}

function partPreviewUrl(model: PrintModelItem): string | null {
  const version = model.currentVersion;
  return version?.preview ? `${printPreviewPath(model.slug, version.id)}?v=${version.preview.sha256.slice(0, 12)}` : null;
}

/** A part's 3D view in a card: a loader until it is ready, the placeholder only when there is none or it failed. */
function PartPreview({ url }: { url: string | null }) {
  const [state, setState] = useState<PreviewState>("loading");
  const missing = !url || state === "failed" || state === "no-webgl";
  const loader = <Loader2 className="h-5 w-5 animate-spin text-white/35" aria-hidden="true" />;
  return (
    <>
      {url ? <Suspense fallback={null}><Preview3D url={url} onState={setState} /></Suspense> : null}
      {missing || state === "loading" ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid="production-part-preview-status">
          {missing ? <Shapes className="h-9 w-9 text-white/25" aria-hidden="true" /> : loader}
        </span>
      ) : null}
    </>
  );
}

/** One always-ready piece that comes in several versions: the card only names it, the next step asks which one. */
function PartFamilyCard({ family, onOpen }: { family: PrintPartFamily<PrintModelItem>; onOpen: () => void }) {
  const b = useT(productionBoardMessages);
  const preview = family.models.map(partPreviewUrl).find(Boolean) ?? null;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-left transition-colors hover:border-violet-400/40 hover:bg-violet-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        data-testid="production-ready-family"
      >
        <span className="pointer-events-none relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.1),transparent_70%)] sm:h-28 sm:w-28">
          <PartPreview url={preview} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug text-white">{family.name}</span>
          <span className="mt-0.5 block text-xs text-white/50">{b.plural("partOptionCount", family.models.length)}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
      </button>
    </li>
  );
}

/** The next step of a family's card: which version to print, each with its 3D view and its downloads. */
function PartFamilyDialog({ family, onOpenModel, onClose }: { family: PrintPartFamily<PrintModelItem>; onOpenModel: (model: PrintModelItem) => void; onClose: () => void }) {
  const b = useT(productionBoardMessages);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent phoneSheet className="flex max-h-[min(90dvh,850px)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="shrink-0 border-b border-white/[0.08] px-5 py-5 pr-14 sm:px-6 sm:pr-14">
          <DialogTitle className="text-white">{family.name}</DialogTitle>
          <DialogDescription className="mt-2">{b("partPickIntro")}</DialogDescription>
        </div>
        <ul className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-5 sm:p-6" data-testid="production-ready-family-options">
          {family.models.map((model) => (
            <PartCard key={model.id} model={model} title={printPartVariant(model.title)} onOpen={onOpenModel} />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** An always-ready piece: its 3D view (when the version has one) beside one download per bed that has its file. */
function PartCard({ model, title, onOpen: open }: { model: PrintModelItem; title?: string; onOpen: (model: PrintModelItem) => void }) {
  const t = useT(productionMessages);
  const b = useT(productionBoardMessages);
  const onOpen = () => open(model);
  const ready = printedPartBeds(model).filter((bed) => bed.fileRef);
  const preview = partPreviewUrl(model);
  return (
    <li className="flex gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5" data-testid="production-ready-part">
      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.1),transparent_70%)] sm:h-28 sm:w-28">
        <PartPreview url={preview} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 text-left hover:underline">
          <span className="block text-sm font-semibold leading-snug text-white">{title ?? model.title}</span>
          {model.description ? <span className="mt-0.5 line-clamp-2 block text-xs text-white/45">{model.description}</span> : null}
        </button>
        {ready.length ? (
          <ul className="mt-auto space-y-1">
            {ready.map((bed) => (
              <li key={bed.label} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-white/60" title={bedSummary(bed, t)}>
                  {t.plural("pieceCount", bed.copies)}{bed.minutes ? ` · ${minutesText(bed.minutes)}` : ""}
                </span>
                <Button asChild variant="secondary" size="sm" className="shrink-0">
                  <a
                    href={`/api/xpot/admin/print-models/${encodeURIComponent(model.slug)}/print-file?bed=${encodeURIComponent(bed.label)}`}
                    download
                    aria-label={`${b("download")} ${model.title} · ${bed.label}`}
                    data-testid="production-ready-download"
                  >
                    <Download />
                    {b("download")}
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-auto text-xs text-amber-200/80">
            {b("noFile")} ·{" "}
            <button type="button" onClick={onOpen} className="underline underline-offset-2 hover:text-amber-100">{b("addFile")}</button>
          </p>
        )}
      </div>
    </li>
  );
}
