import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronRight, Minus, Plus } from "lucide-react";
import { PRINT_DEFAULT_MENU_FONT, materialsForNfc, preferredNfcMount, type PrintGenerateFace, type PrintMenuFont, type PrintGenerateOption, type PrintModelItem, type PrintNfcMount, type PrintRequestItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/xpot/Field";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { batchWorkspaceMessages } from "@/i18n/messages/batchWorkspace";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { printNfcMessages } from "@/i18n/messages/printNfc";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { useTagLabels } from "./labels";
import { ProductionIdentity, ProductionPlatePreview } from "./production-identity";
import { MaterialsNeeded } from "./production-materials";
import { MenuFontChoice, NfcMountChoice, useNfcMountName } from "./production-nfc";
import { assemblyParts, filamentColours, printQuantity } from "./production-workflow";
import { useProductionAccess } from "./production-shared";

// "Generate pieces" on the Production page: the predefined questions of one product (colour → face → NFC → how many), only
// with the colours and faces the catalog can generate. The server checks the choice again and makes the request:
// each plate its own batch of new serials, pending in inventory until the plate is marked printed.

const STEPS = ["stepColour", "stepFace", "stepFont", "stepNfc", "stepQuantity", "stepReview"] as const;
const FONT_STEP = 2;
const NFC_STEP = 3;
const QUANTITY_STEP = 4;
const REVIEW_STEP = 5;

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
  const n = useT(printNfcMessages);
  const nfcName = useNfcMountName();
  const labels = useTagLabels();
  const { toast } = useToast();
  // One colour (or one face) is not a question: it is chosen already, and the step still shows what it is.
  const [theme, setTheme] = useState(option.colours.length === 1 ? option.colours[0].theme : "");
  const colour = option.colours.find((c) => c.theme === theme);
  const [faceKey, setFaceKey] = useState(colour?.faces.length === 1 ? colour.faces[0].face : "");
  const face: PrintGenerateFace | undefined = colour?.faces.find((f) => f.face === faceKey);
  const model = face ? models.get(face.slug) : undefined;
  const [quantity, setQuantity] = useState("");
  // The default is already marked; if this design does not have the type picked, it falls back to the default.
  const [pickedMount, setPickedMount] = useState<PrintNfcMount | null>(null);
  const mounts = face?.nfcMounts ?? [];
  const nfcMount = pickedMount && mounts.includes(pickedMount) ? pickedMount : preferredNfcMount(mounts);
  // Only a Menu piece asks its style; the standard one is already marked.
  const [menuFont, setMenuFont] = useState<PrintMenuFont>(PRINT_DEFAULT_MENU_FONT);
  const fonts = face?.menuFonts ?? [];
  const materials = materialsForNfc(face?.materials, nfcMount ? face?.nfcVariants[nfcMount] : null);
  // Whose pieces: the company first for the owners, the branch itself for its Rep Admin (asked only when there is a choice).
  const { organizations } = useProductionAccess();
  const [organizationId, setOrganizationId] = useState("");
  const organization = organizations.find((o) => String(o.id) === organizationId) ?? organizations[0];
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useEffect(() => { heading.current?.focus(); }, [step]);

  const copies = face?.copies ?? 1;
  const plan = printQuantity(quantity || String(copies), copies, true);
  const product = labels.product(option.productType);
  const themeName = (value: string) => (["white", "black", "mixed"].includes(value) ? b(`theme_${value}` as "theme_white") : value);
  const stepOk = [!!colour, !!face, !!face, !!face, plan.valid, plan.valid && !!face][step];
  const shownSteps = STEPS.map((name, index) => ({ name, index })).filter(({ name }) => name !== "stepFont" || fonts.length > 0);
  const shownStep = shownSteps.findIndex(({ index }) => index === step) + 1;

  const generate = useMutation({
    mutationFn: () => sendJson<PrintRequestItem>("POST", "/api/xpot/admin/print-generate", {
      productType: option.productType, theme: colour!.theme, face: face!.face, quantity: plan.count,
      ...(nfcMount ? { nfcMount } : {}),
      ...(fonts.length ? { menuFont } : {}),
      ...(organization ? { organization: organization.id } : {}),
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
    if (step < REVIEW_STEP) setStep(step + 1);
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
    // A version with one fixed NFC has nothing to ask.
    const next = colour?.faces.find((f) => f.face === value);
    setStep(next?.menuFonts.length ? FONT_STEP : next?.nfcMounts.length ? NFC_STEP : QUANTITY_STEP);
  };
  const back = () => {
    if (step === QUANTITY_STEP && !mounts.length) setStep(fonts.length ? FONT_STEP : 1);
    else if (step === NFC_STEP && !fonts.length) setStep(1);
    else setStep(step - 1);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent phoneSheet className="flex max-h-[min(90dvh,850px)] max-w-2xl flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
        <div className="shrink-0 border-b border-white/[0.08] px-5 py-5 pr-14 sm:px-6 sm:pr-14">
          <DialogTitle className="text-white">{b("generateDialog", { product })}</DialogTitle>
          <DialogDescription className="sr-only">{b("generateDialogIntro")}</DialogDescription>
          <ol className="mt-5 flex items-center gap-1.5" aria-label={tw("stepCount", { current: shownStep, total: shownSteps.length })}>
            {shownSteps.map(({ name, index }, position) => (
              <li key={name} className={`flex min-w-0 items-center gap-1.5 ${step === index ? "flex-[2]" : "flex-1"}`}>
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  disabled={index > step || busy}
                  aria-current={step === index ? "step" : undefined}
                  className={`flex min-h-10 min-w-0 items-center gap-1.5 text-xs font-medium ${step === index ? "text-white" : index < step ? "text-violet-300" : "text-white/35"}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${index <= step ? "border-violet-400/50 bg-violet-500/20" : "border-white/15"}`}>
                    {index < step ? <Check className="h-3 w-3" aria-hidden="true" /> : position + 1}
                  </span>
                  <span className={`truncate ${step === index ? "" : "hidden sm:inline"}`}>{name === "stepNfc" ? n("step") : name === "stepFont" ? n("fontStep") : b(name)}</span>
                </button>
                {position < shownSteps.length - 1 ? <span className={`h-px min-w-2 flex-1 ${index < step ? "bg-violet-400/40" : "bg-white/10"}`} aria-hidden="true" /> : null}
              </li>
            ))}
          </ol>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" data-testid="production-generate-form">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <fieldset disabled={busy} aria-labelledby={headingId} className="min-w-0 space-y-4">
              <h2 id={headingId} ref={heading} tabIndex={-1} className="text-sm font-semibold text-white/85 outline-none">
                {step === 0 ? b("colourQuestion") : step === 1 ? b("faceQuestion") : step === FONT_STEP ? n("fontQuestion") : step === NFC_STEP ? n("question") : step === QUANTITY_STEP ? b("quantityQuestion") : b("stepReview")}
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
              {step === FONT_STEP && face ? (
                <MenuFontChoice fonts={fonts} value={menuFont} theme={colour!.theme} onChange={setMenuFont} />
              ) : null}
              {step === NFC_STEP && face ? (
                <NfcMountChoice mounts={mounts} value={nfcMount} onChange={setPickedMount} />
              ) : null}
              {step === QUANTITY_STEP && face ? (
                <div className="space-y-4">
                  <Field label={t("fieldQuantity")} hint={b("quantityHint", { copies: face.copies, max: plan.max })}>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" size="icon" aria-label={b("lessPieces")} disabled={!plan.valid || plan.count <= 1} onClick={() => setQuantity(String(plan.count - 1))}><Minus className="h-4 w-4" /></Button>
                      <Input
                        type="number"
                        inputMode="numeric"
                        required
                        min={1}
                        max={plan.max}
                        step={1}
                        value={quantity || String(copies)}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-24 text-center tabular-nums"
                        data-testid="production-generate-quantity"
                      />
                      <Button type="button" variant="secondary" size="icon" aria-label={b("morePieces")} disabled={!plan.valid || plan.count >= plan.max} onClick={() => setQuantity(String(plan.count + 1))}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </Field>
                  {plan.valid ? (
                    <p className="rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-3 text-sm text-white/75">
                      {t.plural("plateSplit", plan.plates.length, { split: plan.plates.join(" + ") })}
                    </p>
                  ) : null}
                  {organizations.length > 1 ? (
                    <Field label={t("organization")} hint={t("organizationHint")}>
                      <Select
                        value={organization ? String(organization.id) : ""}
                        onChange={(e) => setOrganizationId(e.target.value)}
                        options={organizations.map((o) => ({ value: String(o.id), label: o.name }))}
                        data-testid="production-generate-organization"
                      />
                    </Field>
                  ) : null}
                  {model ? <ProductionPlatePreview model={model} plates={plan.plates} /> : null}
                </div>
              ) : null}
              {step === REVIEW_STEP && face ? (
                <div className="space-y-4">
                  {model ? <ProductionIdentity model={model} hero /> : null}
                  <MaterialsNeeded materials={materials} filaments={filamentColours(model)} assembly={assemblyParts(model, models)} />
                  <dl className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm sm:grid-cols-2">
                    {[
                      [b("what"), `${product} · ${labels.face(face.face)} · ${themeName(colour!.theme)}`],
                      ...(fonts.length ? [[n("fontField"), menuFont]] : []),
                      ...(nfcMount ? [[n("field"), nfcName(nfcMount)]] : []),
                      [b("pieces"), [t.plural("pieceCount", plan.pieces), t.plural("printJobCount", plan.plates.length)].join(" · ")],
                      ...(organizations.length > 1 && organization ? [[t("organization"), organization.name]] : []),
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-white/45">{label}</dt>
                        <dd className="mt-1 break-words font-medium text-white/90">{value}</dd>
                      </div>
                    ))}
                  </dl>

                </div>
              ) : null}
            </fieldset>
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#111727] px-5 py-4 sm:px-6">
            <span className="max-w-[26rem] text-xs text-white/45">{step === REVIEW_STEP ? b("reviewNext") : tw("stepCount", { current: shownStep, total: shownSteps.length })}</span>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={step === 0 ? onClose : back} disabled={busy}>
                {step === 0 ? tc("cancel") : tw("back")}
              </Button>
              {step === FONT_STEP || step === NFC_STEP || step === QUANTITY_STEP ? (
                <Button key="next" type="submit" variant="brand" accent="tags" disabled={!stepOk} data-testid="production-generate-next">
                  {tw("next")}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : step === REVIEW_STEP ? (
                <Button key="go" type="submit" variant="brand" accent="tags" disabled={!stepOk} loading={busy} data-testid="production-generate-confirm">
                  {b.plural("generateCount", plan.pieces)}
                </Button>
              ) : null}
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
