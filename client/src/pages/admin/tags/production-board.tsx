import { Suspense, lazy, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Clock, Download, Loader2, Shapes } from "lucide-react";
import {
  isAlwaysReadyPart,
  printGenerateOptions,
  printProblemRate,
  printPreviewPath,
  printPartFamilies,
  printPartVariant,
  printedPartBeds,
  type PrintGenerateOption,
  type PrintModelItem,
  type PrintPartFamily,
  type PrintQualitySummary,
} from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { PieceCard, PIECE_STAGE } from "@/components/xpot/PieceCard";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { ADMIN_TAGS_KEY, getJson } from "./api";
import { useTagLabels } from "./labels";
import { Loading, LoadError } from "./pieces-shared";
import { DesignPreview, GenerateDialog } from "./production-generate";
import { printStyle } from "@shared/printDesigns";
import { Piece3D } from "./production-piece-3d";
import { ToPrintList } from "./production-orders";
import type { PreviewState } from "./production-preview-3d";
import { PRODUCTION_BASE, minutesText, usePrintComputers, usePrintModels, usePrintRequests, useProductionAccess } from "./production-shared";
import { needsPrintComputer, orderedPath, piecesAwaitingPrinted, serializedRequests } from "./production-workflow";
import { relativeTime } from "@/pages/my/format";

// Tags › Production's one screen. On one side, what can be made; on the other, the queue of what was sent to print, to
// mark printed (or say which pieces had a problem), with the problem rate under it. Below `xl` the queue goes under.
//   To generate     serialized pieces (Stands, Plates): a short step-by-step (colour → face → quantity) asks for new
//                   pieces; each print job gets its own batch of fresh serials, pending in stock until it is printed.
//   Bases, tokens   parts with no serial (Stand bases, G tokens), one card per piece: the next step asks which version,
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
  const { data: requests } = usePrintRequests("all");
  const awaiting = piecesAwaitingPrinted(requests ?? []);

  if (error && !data) return <LoadError what={t("catalogWhat")} error={error} onRetry={() => void refetch()} />;
  if (isLoading) return <Loading rows={4} />;

  return (
    <div className="space-y-4" data-testid="production-board">
      {/* Beside the queue it says so in the queue; when the queue sits far below, a way down to it. */}
      {awaiting > 0 ? <AwaitingBar count={awaiting} className="xl:hidden" /> : null}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] xl:items-start">
      <div className="min-w-0 space-y-8">
      <section className="space-y-3" aria-labelledby="production-generate-title" data-testid="production-generate-area">
        <SectionHeading id="production-generate-title" title={b("generateTitle")} intro={b("generateIntro")} />
        {options.length ? (
          <ul className="grid grid-cols-2 gap-3">
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
          <ul className="grid grid-cols-2 gap-3">
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
      </div>
      <PrintQueue go={go} awaiting={awaiting} />
      </div>

      {generating ? <GenerateDialog option={generating} models={bySlug} onClose={() => setGenerating(null)} onGenerated={(request) => go(orderedPath(request))} /> : null}
      {picking ? <PartFamilyDialog family={picking} onOpenModel={openModel} onClose={() => setPicking(null)} /> : null}
    </div>
  );
}

/** Something was sent to print and still waits for an answer: said once, at the top, whichever side the person is on. */
function AwaitingBar({ count, className = "" }: { count: number; className?: string }) {
  const b = useT(productionBoardMessages);
  return (
    <button
      type="button"
      onClick={() => document.getElementById(QUEUE_ID)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className={`flex w-full items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-left text-sm font-medium text-amber-100 transition-colors hover:bg-amber-400/[0.14] ${className}`}
      data-testid="production-awaiting-bar"
    >
      <Clock className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
      <span className="min-w-0 flex-1">{b.plural("awaitingBar", count)}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-amber-200/70" aria-hidden="true" />
    </button>
  );
}

const QUEUE_ID = "production-queue";

/** The queue: what was sent to print with a serial and still waits for "did it print?". Everything else is in All orders. */
function PrintQueue({ go, awaiting }: { go: Go; awaiting: number }) {
  const b = useT(productionBoardMessages);
  const { data: requests } = usePrintRequests("all");
  const waiting = needsPrintComputer(serializedRequests(requests ?? []));
  return (
    <aside id={QUEUE_ID} className="min-w-0 scroll-mt-20 space-y-3" aria-labelledby="production-pending-title" data-testid="production-pending-area">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading id="production-pending-title" title={b("pendingTitle")} />
        <button type="button" onClick={() => go(`${PRODUCTION_BASE}/queue`)} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-white/55 transition-colors hover:text-white" data-testid="production-all-orders">
          {b("allOrders")}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {awaiting > 0 ? (
        <p className="hidden items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-xs font-medium text-amber-100 xl:flex" data-testid="production-awaiting-line">
          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          {b.plural("awaitingBar", awaiting)}
        </p>
      ) : null}
      {waiting ? <PrintComputerLine go={go} waiting={waiting} /> : null}
      <ToPrintList go={go} emptyHint={b("pendingEmptyHint")} />
      <PrintQuality />
    </aside>
  );
}

/** How the pieces marked printed came out lately: what the problems reported on the queue add up to. */
function PrintQuality() {
  const b = useT(productionBoardMessages);
  const t = useT(productionMessages);
  const { data } = useQuery({
    queryKey: [ADMIN_TAGS_KEY, "production", "quality"],
    queryFn: () => getJson<PrintQualitySummary>("/api/xpot/admin/print-quality"),
  });
  if (!data) return null;
  const rate = printProblemRate(data);
  return (
    <section className="rounded-xl border border-white/[0.06] px-3 py-2 text-xs" aria-labelledby="production-quality-title" title={b("qualityWindow", { days: data.days })} data-testid="production-quality">
      <div className="flex items-baseline gap-2">
        <h3 id="production-quality-title" className="shrink-0 font-medium text-white/60">{b("qualityTitle")}</h3>
        {rate === null ? <span className="min-w-0 truncate text-white/45">{b("qualityEmpty")}</span> : <>
          <span className="shrink-0 text-sm font-semibold text-white" data-testid="production-quality-rate">{rate}%</span>
          <span className="min-w-0 truncate text-white/45">{b("qualityLine", { problems: data.withProblem, pieces: data.pieces })}</span>
        </>}
      </div>
      {data.byProblem.length || data.failedPrints > 0 ? (
        <ul className="mt-1.5 space-y-0.5 border-t border-white/[0.06] pt-1.5 text-white/60">
          {data.byProblem.map(({ problem, count }) => (
            <li key={problem} className="flex justify-between gap-2"><span className="min-w-0 truncate">{t(`pieceProblem_${problem}` as never)}</span><span className="font-medium text-white/80">{count}</span></li>
          ))}
          {data.failedPrints > 0 ? <li>{b.plural("qualityFailed", data.failedPrints)}</li> : null}
        </ul>
      ) : null}
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
  return (
    <PieceCard
      art={(
        <Piece3D
          model={model}
          frameMetres={PRODUCT_FRAME_METRES}
          fallback={<DesignPreview productType={option.productType} face={sample.face} theme={model?.theme ?? option.colours[0].theme} style={printStyle(model?.currentVersion?.params)} modelSlug={sample.slug} />}
        />
      )}
      title={labels.product(option.productType)}
      meta={`${b.plural("colourCount", option.colours.length)} · ${b.plural("faceCount", faces.size)}`}
      onOpen={onOpen}
      testId="production-generate-product"
    />
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

/** One part that comes in several versions: the card only names it, the next step asks which one. */
function PartFamilyCard({ family, onOpen }: { family: PrintPartFamily<PrintModelItem>; onOpen: () => void }) {
  const b = useT(productionBoardMessages);
  const preview = family.models.map(partPreviewUrl).find(Boolean) ?? null;
  return (
    <PieceCard
      art={<PartPreview url={preview} />}
      title={family.name}
      meta={b.plural("partOptionCount", family.models.length)}
      onOpen={onOpen}
      testId="production-ready-family"
    />
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

/** A part: its 3D view (when the version has one) beside one download per bed that has its file. */
function PartCard({ model, title, onOpen: open }: { model: PrintModelItem; title?: string; onOpen: (model: PrintModelItem) => void }) {
  const t = useT(productionMessages);
  const b = useT(productionBoardMessages);
  const onOpen = () => open(model);
  const ready = printedPartBeds(model).filter((bed) => bed.fileRef);
  const preview = partPreviewUrl(model);
  return (
    <li className="flex gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5" data-testid="production-ready-part">
      <div className={`${PIECE_STAGE} h-24 w-24 shrink-0 rounded-xl sm:h-28 sm:w-28`}>
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
