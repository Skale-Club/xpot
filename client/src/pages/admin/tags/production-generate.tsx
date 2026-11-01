import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronRight, Info } from "lucide-react";
import type { PrintGenerateFace, PrintGenerateOption, PrintModelItem, PrintRequestItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/xpot/Field";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { batchWorkspaceMessages } from "@/i18n/messages/batchWorkspace";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { useTagLabels } from "./labels";
import { ProductionIdentity, ProductionPlatePreview } from "./production-identity";
import { printQuantity } from "./production-workflow";

// "Generate pieces" on the Production page: the predefined questions of one product (colour → face → how many), only
// with the colours and faces the catalog can generate. The server checks the choice again and makes the request:
// each plate its own batch of new serials, pending in inventory until the plate is marked printed.

const STEPS = ["stepColour", "stepFace", "stepQuantity", "stepReview"] as const;

export function GenerateDialog({ option, models, onClose, onGenerated }: {
  option: PrintGenerateOption;
  models: Map<string, PrintModelItem>;
  onClose: () => void;
  onGenerated?: (request: PrintRequestItem) => void;
}) {
  const b = useT(productionBoardMessages);
  const t = useT(productionMessages);
  const tw = useT(batchWorkspaceMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const { toast } = useToast();
  // One colour (or one face) is not a question: it is chosen already, and the step still shows what it is.
  const [theme, setTheme] = useState(option.colours.length === 1 ? option.colours[0].theme : "");
  const colour = option.colours.find((c) => c.theme === theme);
  const [faceKey, setFaceKey] = useState(colour?.faces.length === 1 ? colour.faces[0].face : "");
  const face: PrintGenerateFace | undefined = colour?.faces.find((f) => f.face === faceKey);
  const model = face ? models.get(face.slug) : undefined;
  const [quantity, setQuantity] = useState("");
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useEffect(() => { heading.current?.focus(); }, [step]);

  const copies = face?.copies ?? 1;
  const plan = printQuantity(quantity || String(copies), copies, true);
  const product = labels.product(option.productType);
  const themeName = (value: string) => (["white", "black", "mixed"].includes(value) ? b(`theme_${value}` as "theme_white") : value);
  const stepOk = [!!colour, !!face, plan.valid, plan.valid && !!face][step];

  const generate = useMutation({
    mutationFn: () => sendJson<PrintRequestItem>("POST", "/api/xpot/admin/print-generate", {
      productType: option.productType, theme: colour!.theme, face: face!.face, quantity: plan.count,
    }),
    onSuccess: (request) => {
      void invalidateAdminTags();
      toast({ title: b.plural("generated", request.quantity) });
      onClose();
      onGenerated?.(request);
    },
    onError: (err) => toast({ title: b("couldNotGenerate"), description: errorMessage(err), variant: "destructive" }),
  });
  const busy = generate.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !stepOk) return;
    if (step < 3) setStep(step + 1);
    else generate.mutate();
  };
  const pickColour = (value: string) => {
    setTheme(value);
    const next = option.colours.find((c) => c.theme === value);
    setFaceKey(next?.faces.length === 1 ? next.faces[0].face : next?.faces.some((f) => f.face === faceKey) ? faceKey : "");
    setStep(1);
  };
  const pickFace = (value: string) => {
    setFaceKey(value);
    setStep(2);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent phoneSheet className="flex max-h-[min(90dvh,850px)] max-w-2xl flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
        <div className="shrink-0 border-b border-white/[0.08] px-5 py-5 pr-14 sm:px-6 sm:pr-14">
          <DialogTitle className="text-white">{b("generateDialog", { product })}</DialogTitle>
          <DialogDescription className="mt-2">{b("generateDialogIntro")}</DialogDescription>
          <ol className="mt-5 flex items-center gap-1.5" aria-label={tw("stepCount", { current: step + 1, total: STEPS.length })}>
            {STEPS.map((name, index) => (
              <li key={name} className={`flex min-w-0 items-center gap-1.5 ${step === index ? "flex-[2]" : "flex-1"}`}>
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  disabled={index > step || busy}
                  aria-current={step === index ? "step" : undefined}
                  className={`flex min-h-10 min-w-0 items-center gap-1.5 text-xs font-medium ${step === index ? "text-white" : index < step ? "text-violet-300" : "text-white/35"}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${index <= step ? "border-violet-400/50 bg-violet-500/20" : "border-white/15"}`}>
                    {index < step ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className={`truncate ${step === index ? "" : "hidden sm:inline"}`}>{b(name)}</span>
                </button>
                {index < STEPS.length - 1 ? <span className={`h-px min-w-2 flex-1 ${index < step ? "bg-violet-400/40" : "bg-white/10"}`} aria-hidden="true" /> : null}
              </li>
            ))}
          </ol>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" data-testid="production-generate-form">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <fieldset disabled={busy} aria-labelledby={headingId} className="min-w-0 space-y-4">
              <h2 id={headingId} ref={heading} tabIndex={-1} className="text-sm font-semibold text-white/85 outline-none">
                {step === 0 ? b("colourQuestion") : step === 1 ? b("faceQuestion") : step === 2 ? b("quantityQuestion") : b("stepReview")}
              </h2>
              {step === 0 ? (
                <ChoiceGrid testId="production-generate-colours">
                  {option.colours.map((c) => (
                    <Choice key={c.theme} selected={theme === c.theme} onPick={() => pickColour(c.theme)} testId={`production-generate-colour-${c.theme}`}>
                      <TagPieceVisual productType={option.productType} face={c.faces[0].face} theme={c.theme} modelSlug={c.faces[0].slug} size="lg" still />
                      <span className="text-sm font-medium text-white">{themeName(c.theme)}</span>
                      <span className="text-xs text-white/45">{b.plural("faceCount", c.faces.length)}</span>
                    </Choice>
                  ))}
                </ChoiceGrid>
              ) : null}
              {step === 1 && colour ? (
                <ChoiceGrid testId="production-generate-faces">
                  {colour.faces.map((f) => (
                    <Choice key={f.face} selected={faceKey === f.face} onPick={() => pickFace(f.face)} testId={`production-generate-face-${f.face}`}>
                      <TagPieceVisual productType={option.productType} face={f.face} theme={colour.theme} modelSlug={f.slug} size="lg" still />
                      <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                        <TagFaceIcon face={f.face} size="xs" />
                        {labels.face(f.face)}
                      </span>
                    </Choice>
                  ))}
                </ChoiceGrid>
              ) : null}
              {step === 2 && face ? (
                <div className="space-y-4">
                  {model ? <ProductionIdentity model={model} hero /> : null}
                  <Field label={t("fieldQuantity")} hint={b("quantityHint", { copies: face.copies, max: plan.max })}>
                    <Input
                      type="number"
                      inputMode="numeric"
                      required
                      min={1}
                      max={plan.max}
                      step={1}
                      value={quantity || String(copies)}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="tabular-nums sm:max-w-[180px]"
                      data-testid="production-generate-quantity"
                    />
                  </Field>
                  {plan.valid ? (
                    <p className="rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-3 text-sm text-white/75">
                      {t.plural("plateSplit", plan.plates.length, { split: plan.plates.join(" + ") })}
                    </p>
                  ) : null}
                  {model ? <ProductionPlatePreview model={model} plates={plan.plates} /> : null}
                </div>
              ) : null}
              {step === 3 && face ? (
                <div className="space-y-4">
                  {model ? <ProductionIdentity model={model} hero /> : null}
                  <dl className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm sm:grid-cols-2">
                    {[
                      [b("what"), `${product} · ${labels.face(face.face)} · ${themeName(colour!.theme)}`],
                      [b("pieces"), t.plural("plateSplit", plan.plates.length, { split: plan.plates.join(" + ") })],
                      [b("serials"), b.plural("newSerials", plan.pieces)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-white/45">{label}</dt>
                        <dd className="mt-1 break-words font-medium text-white/90">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-white/50">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {b("reviewHint")}
                  </p>
                </div>
              ) : null}
            </fieldset>
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#111727] px-5 py-4 sm:px-6">
            <span className="text-xs text-white/40">{tw("stepCount", { current: step + 1, total: STEPS.length })}</span>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={step === 0 ? onClose : () => setStep(step - 1)} disabled={busy}>
                {step === 0 ? tc("cancel") : tw("back")}
              </Button>
              {step < 3 ? (
                <Button key="next" type="submit" variant="brand" accent="tags" disabled={!stepOk} data-testid="production-generate-next">
                  {tw("next")}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button key="go" type="submit" variant="brand" accent="tags" disabled={!stepOk} loading={busy} data-testid="production-generate-confirm">
                  {b.plural("generateCount", plan.pieces)}
                </Button>
              )}
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceGrid({ children, testId }: { children: ReactNode; testId: string }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" data-testid={testId}>{children}</div>;
}

/** A tap answers the question and moves on; the selected one stays marked when coming back. */
function Choice({ selected, onPick, children, testId }: { selected: boolean; onPick: () => void; children: ReactNode; testId: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${selected ? "border-violet-400/60 bg-violet-500/[0.1]" : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]"}`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
