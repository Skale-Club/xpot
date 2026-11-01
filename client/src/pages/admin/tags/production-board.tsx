import { Suspense, lazy, useMemo, useState } from "react";
import { ChevronRight, Download, Info, Shapes } from "lucide-react";
import {
  isAlwaysReadyPart,
  printGenerateOptions,
  printPreviewPath,
  printedPartBeds,
  type PrintGenerateOption,
  type PrintModelItem,
} from "@shared/printProduction";
import { Button } from "@/components/ui/button";
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
import { PRODUCTION_BASE, bedSummary, minutesText, usePrintModels, useProductionAccess } from "./production-shared";

// Tags › Production's first screen: how print production actually runs.
//   Always ready    parts with no serial (Stand bases, G tokens): a 3D view and the fixed file to download, any time,
//                   as often as needed; nothing is generated or recorded.
//   To generate     serialized pieces (Stands, Plates): a short step-by-step (colour → face → quantity) asks for new
//                   pieces; each plate gets its own batch of fresh serials, pending in inventory until it is printed.
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
  const parts = models.filter(isAlwaysReadyPart).sort((x, y) => x.sortOrder - y.sortOrder || x.title.localeCompare(y.title));
  const options = useMemo(() => printGenerateOptions(data ?? []), [data]);
  const bySlug = new Map(models.map((model) => [model.slug, model]));

  if (error && !data) return <LoadError what={t("catalogWhat")} error={error} onRetry={() => void refetch()} />;
  if (isLoading) return <Loading rows={4} />;

  return (
    <div className="space-y-8" data-testid="production-board">
      {isAdmin ? <section className="space-y-3" aria-labelledby="production-ready-title" data-testid="production-ready-area">
        <SectionHeading id="production-ready-title" title={b("readyTitle")} intro={b("readyIntro")} />
        {parts.length ? (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {parts.map((model) => (
              <PartCard key={model.id} model={model} onOpen={() => go(`${PRODUCTION_BASE}/models/${model.slug}`)} />
            ))}
          </ul>
        ) : (
          <EmptyState tone="tags" icon={Shapes} title={b("readyEmpty")} />
        )}
      </section> : null}

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
        <span className="flex h-28 w-full items-center justify-center rounded-xl bg-white/[0.035]">
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

/** An always-ready piece: its 3D view (when the version has one) beside one download per bed that has its file. */
function PartCard({ model, onOpen }: { model: PrintModelItem; onOpen: () => void }) {
  const t = useT(productionMessages);
  const b = useT(productionBoardMessages);
  const version = model.currentVersion!;
  const ready = printedPartBeds(model).filter((bed) => bed.fileRef);
  const preview = version.preview ? `${printPreviewPath(model.slug, version.id)}?v=${version.preview.sha256.slice(0, 12)}` : null;
  const placeholder = <Shapes className="h-9 w-9 text-white/25" aria-hidden="true" />;
  return (
    <li className="flex gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5" data-testid="production-ready-part">
      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.1),transparent_70%)] sm:h-28 sm:w-28">
        {preview ? <Suspense fallback={placeholder}><Preview3D url={preview} onState={() => {}} /></Suspense> : placeholder}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 text-left hover:underline">
          <span className="block text-sm font-semibold leading-snug text-white">{model.title}</span>
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
