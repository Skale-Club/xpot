import { Suspense, lazy, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, Loader2, Shapes } from "lucide-react";
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
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { useTagLabels } from "./labels";
import { Loading, LoadError } from "./pieces-shared";
import { DesignPreview, GenerateDialog } from "./production-generate";
import { printStyle } from "@shared/printDesigns";
import { Piece3D } from "./production-piece-3d";
import { ToPrintList } from "./production-orders";
import { ThisComputer } from "./production-this-computer";
import type { PreviewState } from "./production-preview-3d";
import { PRODUCTION_BASE, minutesText, usePrintComputers, usePrintModels, usePrintRequests, useProductionAccess } from "./production-shared";
import { needsPrintComputer, orderedPath, serializedRequests } from "./production-workflow";
import { relativeTime } from "@/pages/my/format";

// Tags › Production's first screen: what can be made. The print jobs that come out of it live on the Printing tab.
//   To generate     serialized pieces (Stands, Plates): a short step-by-step (colour → face → quantity) asks for new
//                   pieces; each print job gets its own batch of fresh serials, pending in stock until it is printed.
//   Always ready    parts with no serial (Stand bases, G tokens), one card per piece: the next step asks which version,
//                   with a 3D view and the fixed file to download, any time.

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
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

      {onOtherWays ? (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={onOtherWays} data-testid="production-other-ways">{u("otherWays")}</Button>
        </div>
      ) : null}

      {generating ? <GenerateDialog option={generating} models={bySlug} onClose={() => setGenerating(null)} onGenerated={(request) => go(orderedPath(request))} /> : null}
      {picking ? <PartFamilyDialog family={picking} onOpenModel={openModel} onClose={() => setPicking(null)} /> : null}
    </div>
  );
}

/** The Printing tab: what was sent to print with a serial and still waits for "did it print?". Everything else is in All orders. */
export function PrintingView({ go }: { go: Go }) {
  const b = useT(productionBoardMessages);
  const { data: requests } = usePrintRequests("all");
  const waiting = needsPrintComputer(serializedRequests(requests ?? []));
  return (
    <section className="space-y-3" aria-labelledby="production-pending-title" data-testid="production-pending-area">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionHeading id="production-pending-title" title={b("pendingTitle")} intro={b("pendingIntro")} />
        <Button type="button" variant="ghost" size="sm" onClick={() => go(`${PRODUCTION_BASE}/queue`)}>
          {b("allOrders")}
          <ChevronRight />
        </Button>
      </div>
      <ThisComputer />
      <PrintComputerLine go={go} waiting={waiting} />
      <ToPrintList go={go} emptyHint={b("pendingEmptyHint")} />
    </section>
  );
}

function SectionHeading({ id, title, intro }: { id: string; title: string; intro?: string }) {
  return (
    <div className="min-w-0 max-w-2xl">
      <h2 id={id} className="text-base font-semibold text-white">{title}</h2>
      {intro ? <p className="mt-0.5 text-sm text-white/55">{intro}</p> : null}
    </div>
  );
}

/** Whether the print computer is making the files: one line per computer, amber only when something is waiting for it. */
function PrintComputerLine({ go, waiting }: { go: Go; waiting: boolean }) {
  const b = useT(productionBoardMessages);
  const { loaded, computers } = usePrintComputers();
  if (!loaded) return null;
  if (!computers.length) {
    return (
      <p className="text-xs text-white/55" data-testid="production-computer-none">
        {b("computerNone")}{" "}
        <button type="button" onClick={() => go("/provisioners")} className="underline underline-offset-2 hover:text-white">{b("computerPair")}</button>
      </p>
    );
  }
  return (
    <ul className="space-y-1" data-testid="production-computers">
      {computers.map((computer) => (
        <li key={computer.name} className={`flex items-center gap-2 text-xs ${computer.on ? "text-white/60" : waiting ? "text-amber-200" : "text-white/50"}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${computer.on ? "bg-emerald-400" : waiting ? "bg-amber-400" : "bg-white/30"}`} aria-hidden="true" />
          {computer.on
            ? b("computerOn", { name: computer.name })
            : computer.lastSeenAt ? b(waiting ? "computerOffWaiting" : "computerOff", { name: computer.name, time: relativeTime(computer.lastSeenAt, Date.now(), b.lang) }) : b("computerNever", { name: computer.name })}
        </li>
      ))}
    </ul>
  );
}

/** The cards frame the same stretch of the world, a little over the tallest piece (Large Stand, 137 mm): Large reads large, Small small. */
const PRODUCT_FRAME_METRES = 0.145;

/** One product to generate (Large Stand, Small Plate…): its picture and how many colours and faces it comes in. */
function ProductCard({ option, model, onOpen }: { option: PrintGenerateOption; model: PrintModelItem | undefined; onOpen: () => void }) {
  const b = useT(productionBoardMessages);
  const labels = useTagLabels();
  const faces = new Set(option.colours.flatMap((colour) => colour.faces.map((face) => face.face)));
  const sample = option.colours[0].faces[0];
  // Turning the piece with a mouse or a finger must not open the card when the pointer is let go.
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const open = () => {
    if (dragged.current) { dragged.current = false; return; }
    onOpen();
  };
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}
        onPointerDown={(event) => { down.current = { x: event.clientX, y: event.clientY }; dragged.current = false; }}
        onPointerMove={(event) => {
          if (down.current && Math.hypot(event.clientX - down.current.x, event.clientY - down.current.y) > 6) dragged.current = true;
        }}
        onPointerUp={() => { down.current = null; }}
        className="flex h-full w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-left transition-colors hover:border-violet-400/40 hover:bg-violet-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        data-testid="production-generate-product"
      >
        <span className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.1),transparent_70%)] sm:h-32 sm:w-32">
          <Piece3D
            model={model}
            frameMetres={PRODUCT_FRAME_METRES}
            fallback={<DesignPreview productType={option.productType} face={sample.face} theme={model?.theme ?? option.colours[0].theme} style={printStyle(model?.currentVersion?.params)} modelSlug={sample.slug} />}
          />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block text-sm font-semibold leading-snug text-white">{labels.product(option.productType)}</span>
          <span className="block text-xs text-white/50">
            {b.plural("colourCount", option.colours.length)} · {b.plural("faceCount", faces.size)}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
      </div>
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
          <span className={`mt-0.5 block text-xs ${family.models.some((m) => m.lowStock) ? "text-amber-200" : "text-white/50"}`} data-testid="production-ready-stock">
            {b("partInStock", { count: family.models.reduce((sum, m) => sum + m.onHand, 0) })}{family.models.some((m) => m.lowStock) ? ` · ${b("partLowAny")}` : ""}
          </span>
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
        <ul className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto p-5 sm:p-6" data-testid="production-ready-family-options">
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
          <span className={`mt-0.5 block text-xs ${model.lowStock ? "text-amber-200" : "text-white/50"}`} data-testid="production-ready-stock">
            {model.lowStock ? b("partLowStock", { count: model.onHand, reorder: model.partReorderAt ?? 0 }) : b("partInStock", { count: model.onHand })}
          </span>
        </button>
        {ready.length ? (
          <ul className="mt-auto space-y-1">
            {ready.map((bed) => (
              <li key={bed.label}>
                <Button asChild variant="secondary" size="sm" className="w-full justify-start">
                  <a
                    href={`/api/xpot/admin/print-models/${encodeURIComponent(model.slug)}/print-file?bed=${encodeURIComponent(bed.label)}`}
                    download
                    data-testid="production-ready-download"
                  >
                    <Download />
                    {b("downloadBed", { pieces: t.plural("pieceCount", bed.copies), time: bed.minutes ? ` · ${minutesText(bed.minutes)}` : "" })}
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
