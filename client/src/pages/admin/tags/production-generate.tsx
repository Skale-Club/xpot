import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronRight, Minus, Plus, Search } from "lucide-react";
import { materialsForNfc, preferredNfcMount, type PrintGenerateOption, type PrintModelItem, type PrintNfcMount, type PrintRequestItem } from "@shared/printProduction";
import { PRINT_DESIGNS, PRINT_DESIGN_GROUPS, PRINT_PALETTE, printDesignGroup, type PrintDesignGroup } from "@shared/printDesigns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/xpot/Field";
import { MenuGlyph, TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { PIECE_STAGE } from "@/components/xpot/PieceCard";
import { StepBar, StepRail } from "@/components/xpot/StepRail";
import { TagModelChips, TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { batchWorkspaceMessages } from "@/i18n/messages/batchWorkspace";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { printNfcMessages } from "@/i18n/messages/printNfc";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { productionDesignMessages } from "@/i18n/messages/productionDesign";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { useTagLabels } from "./labels";
import { ProductionPlatePreview } from "./production-identity";
import { Piece3D } from "./production-piece-3d";
import { MaterialsNeeded } from "./production-materials";
import { NfcMountChoice, useNfcMountName } from "./production-nfc";
import { assemblyParts, filamentColours, printQuantity } from "./production-workflow";
import { useProductionAccess } from "./production-shared";

const STEP_KEYS = ["design", "appearance", "nfc", "quantity", "review"] as const;

export function GenerateDialog({ option, models, onClose, onGenerated }: {
  option: PrintGenerateOption; models: Map<string, PrintModelItem>; onClose: () => void;
  onGenerated?: (request: PrintRequestItem) => void;
}) {
  const b = useT(productionBoardMessages), d = useT(productionDesignMessages), t = useT(productionMessages);
  const tw = useT(batchWorkspaceMessages), tc = useT(commonMessages), n = useT(printNfcMessages);
  const nfcName = useNfcMountName(), labels = useTagLabels(), { toast } = useToast();
  const [faceKey, setFaceKey] = useState("");
  const [theme, setTheme] = useState(option.colours[0]?.theme ?? "");
  const [styleKey, setStyleKey] = useState("classic");
  const [quantity, setQuantity] = useState<string | null>(null);
  const [pickedMount, setPickedMount] = useState<PrintNfcMount | null>(null);
  const [group, setGroup] = useState<PrintDesignGroup>("all");
  const [search, setSearch] = useState("");
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null), headingId = useId(), radioId = useId();
  const quantityId = `${headingId}-quantity`;
  useEffect(() => { heading.current?.focus(); }, [step]);
  const colours = option.colours.filter((c) => c.faces.some((f) => f.face === faceKey));
  const colour = colours.find((c) => c.theme === theme) ?? colours[0];
  const selectedFace = colour?.faces.find((f) => f.face === faceKey);
  const styles = selectedFace?.styles ?? (selectedFace ? [selectedFace] : []);
  const face = styles.find((f) => f.style === styleKey) ?? styles[0];
  const model = face ? models.get(face.slug) : undefined;
  const mounts = face?.nfcMounts ?? [];
  const nfcMount = pickedMount && mounts.includes(pickedMount) ? pickedMount : preferredNfcMount(mounts);
  const copies = face?.copies ?? 1;
  const plan = printQuantity(quantity ?? String(copies), copies, true);
  const { organizations } = useProductionAccess();
  const [organizationId, setOrganizationId] = useState("");
  const organization = organizations.find((o) => String(o.id) === organizationId) ?? organizations[0];
  const product = labels.product(option.productType);
  const themeName = (value: string) => ["white", "black", "navy", "forest", "burgundy", "sand"].includes(value) ? d(value as "white") : value === "mixed" ? b("themeName_mixed") : value;
  const groupLabels = { all: d("all"), reviews: d("reviews"), social: d("social"), business: d("business"), payments: d("payments") };
  const styleName = (value: string) => ["classic", "italic", "modern", "spaced", "bold", "rounded"].includes(value) ? d(value as "classic") : value;
  const available = new Map(option.colours.flatMap((c) => c.faces).filter((f) => f.face !== "custom").map((f) => [f.face, f]));
  const order = PRINT_DESIGNS.map((f) => f.face as string);
  const designs = Array.from(available.values()).sort((a, b) => {
    const rank = (face: string) => order.includes(face) ? order.indexOf(face) : order.length;
    return rank(a.face) - rank(b.face);
  });
  const filtered = designs.filter((f) => (group === "all" || printDesignGroup(f.face) === group) && labels.face(f.face).toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  const valid = [!!selectedFace, !!face && !!colour, !!face && (!mounts.length || !!nfcMount), !!face && plan.valid];
  const canVisit = (index: number) => index <= step && valid.slice(0, index).every(Boolean);
  const stepOk = step < 4 ? valid[step] : valid.every(Boolean);
  const generate = useMutation({
    mutationFn: () => sendJson<PrintRequestItem>("POST", "/api/xpot/admin/print-generate", {
      productType: option.productType, theme: colour!.theme, face: face!.face, modelSlug: face!.slug, quantity: plan.count,
      ...(nfcMount ? { nfcMount } : {}), ...(organization ? { organization: organization.id } : {}),
    }),
    onSuccess: (request) => {
      void invalidateAdminTags(); toast({ title: b.plural("generated", request.quantity) }); onClose(); onGenerated?.(request);
    },
    onError: (err) => toast({ title: b("couldNotGenerate"), description: errorMessage(err), variant: "destructive" }),
  });
  const busy = generate.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !stepOk) return;
    if (step < 4) setStep(step + 1); else generate.mutate();
  };
  const chooseFace = (value: string) => { setFaceKey(value); setQuantity(null); };
  const chooseColour = (value: string) => { setTheme(value); setQuantity(null); };
  const stepNames = STEP_KEYS.map((key) => d(key));
  const progress = d("progress", { current: step + 1, total: 5 });
  // What each step settled, kept on the rail once the person has moved on.
  const stepValues = [
    faceKey ? labels.face(faceKey) : null,
    face && colour ? `${themeName(colour.theme)} · ${styleName(face.style)}` : null,
    face ? (nfcMount ? nfcName(nfcMount) : n("fixed")) : null,
    plan.valid ? t.plural("pieceCount", plan.count) : null,
  ];
  const preview = face && colour ? <DesignPreview productType={option.productType} face={face.face} theme={colour.theme} style={face.style} modelSlug={face.slug} /> : null;
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent phoneSheet className="flex h-[min(90dvh,850px)] max-w-5xl flex-col gap-0 overflow-hidden p-0" onOpenAutoFocus={(event) => { event.preventDefault(); heading.current?.focus(); }} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
      <header className="shrink-0 border-b border-white/[0.08] px-5 py-3 sm:px-7">
        <div className="pr-9"><DialogTitle className="text-base text-white">{b("generateDialog", { product })}</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">{d("onePlate")}</DialogDescription></div>
        <StepBar names={stepNames} current={step} progress={progress} />
      </header>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" data-testid="production-generate-form">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [color-scheme:dark] md:flex-row md:overflow-hidden [&_*]:[scrollbar-width:thin]">
          <div className="order-1 min-w-0 flex-1 md:order-2 md:overflow-y-auto">
          <fieldset disabled={busy} aria-labelledby={headingId} className="min-w-0 space-y-3 px-5 py-4 sm:px-7">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><h2 ref={heading} id={headingId} tabIndex={-1} className="text-base font-semibold tracking-tight text-white !shadow-none !outline-none !ring-0">{d(`${STEP_KEYS[step]}Title`)}</h2>
              <p className="text-xs text-white/50">{d(`${STEP_KEYS[step]}Hint`)}</p></div>
            {step === 0 ? <>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label={d("design")}>
                {PRINT_DESIGN_GROUPS.filter((g) => g === "all" || designs.some((f) => printDesignGroup(f.face) === g)).map((g) => <button type="button" key={g} aria-pressed={group === g} onClick={() => setGroup(g)} className={`min-h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${group === g ? "bg-white/10 text-white ring-1 ring-white/20" : "text-white/50 hover:bg-white/5 hover:text-white"}`}>{groupLabels[g]}</button>)}
                <div className="relative w-full sm:ml-auto sm:w-44"><Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-white/40" aria-hidden="true" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={d("search")} aria-label={d("search")} className="h-7 min-h-0 py-0 pl-8 text-xs" /></div>
              </div>
              <fieldset className="grid grid-cols-3 gap-2.5 md:grid-cols-5" data-testid="production-generate-faces"><legend className="sr-only">{d("design")}</legend>
                {filtered.map((f) => {
                  const logo = PRINT_DESIGNS.find((entry) => entry.face === f.face)?.logo;
                  return <RadioCard key={f.face} name={`${radioId}-face`} value={f.face} checked={faceKey === f.face} onChange={() => chooseFace(f.face)} onPick={() => setStep(1)} testId={`production-generate-face-${f.face}`}>
                    <span aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-3 shadow-sm">
                      {f.face === "menu" ? <MenuGlyph className="h-full w-full text-black" /> : logo ? <img src={`/production/logos/${logo}.png`} alt="" className="h-full w-full object-contain" width={64} height={64} /> : <TagFaceIcon face={f.face} size="lg" />}
                    </span><span className="text-xs font-medium text-white sm:text-sm">{labels.face(f.face)}</span>
                  </RadioCard>;
                })}
              </fieldset>
              {!filtered.length ? <p role="status" className="py-5 text-sm text-white/55">{d("noResults")}</p> : null}
              {faceKey === "wifi" ? <p className="text-xs leading-relaxed text-white/60">{d("wifiHint")}</p> : null}
            </> : null}
            {step === 1 ? <>
              <fieldset className="space-y-3" data-testid="production-generate-colours"><legend className="mb-2 text-sm font-medium text-white/80">{d("colour")}</legend>
                <div className="flex flex-wrap gap-2">{colours.map((c) => <label key={c.theme} className="relative cursor-pointer">
                  <input type="radio" name={`${radioId}-colour`} value={c.theme} checked={colour?.theme === c.theme} onChange={() => chooseColour(c.theme)} className="peer sr-only" data-testid={`production-generate-colour-${c.theme}`} />
                  <span className="flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs text-white/70 peer-checked:border-violet-400 peer-checked:bg-violet-400/10 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400">
                    <span className="h-5 w-5 rounded-full border border-white/30" style={{ background: PRINT_PALETTE.find((p) => p.theme === c.theme)?.hex ?? "#888" }} />{themeName(c.theme)}
                  </span></label>)}</div><p className="text-xs text-white/45">{d("colourHint")}</p>
              </fieldset>
              <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="production-generate-styles"><legend className="mb-3 text-sm font-medium text-white/80">{d("style")}</legend>
                {styles.map((choice) => <RadioCard key={choice.slug} name={`${radioId}-style`} value={choice.slug} checked={face?.slug === choice.slug} onChange={() => { setStyleKey(choice.style); setQuantity(null); }} testId={`production-generate-style-${choice.style}`}>
                  <DesignPreview productType={option.productType} face={choice.face} theme={colour!.theme} style={choice.style} modelSlug={choice.slug} />
                  <span className="text-xs font-medium text-white">{styleName(choice.style)}</span>
                </RadioCard>)}
              </fieldset>
            </> : null}
            {step === 2 && face ? <NfcMountChoice mounts={mounts} value={nfcMount} onChange={setPickedMount} /> : null}
            {step === 3 && face ? <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor={quantityId} className="block text-xs font-semibold text-white/60">{t("fieldQuantity")}</label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="icon" aria-label={b("lessPieces")} disabled={!plan.valid || plan.count <= 1} onClick={() => setQuantity(String(plan.count - 1))}><Minus className="h-4 w-4" /></Button>
                  <Input id={quantityId} type="number" inputMode="numeric" required min={1} max={copies} step={1} aria-describedby={`${quantityId}-hint`} value={quantity ?? String(copies)} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!plan.valid} className="w-24 text-center text-lg tabular-nums" data-testid="production-generate-quantity" />
                  <Button type="button" variant="secondary" size="icon" aria-label={b("morePieces")} disabled={!plan.valid || plan.count >= copies} onClick={() => setQuantity(String(plan.count + 1))}><Plus className="h-4 w-4" /></Button>
                </div>
                <p id={`${quantityId}-hint`} className="text-xs text-white/45">{b("quantityHint", { copies, max: copies })}</p>
              </div>
              <div className="flex flex-wrap gap-2">{Array.from(new Set([1, Math.ceil(copies / 2), copies])).map((count) => <Button key={count} type="button" size="sm" variant={plan.count === count ? "secondary" : "ghost"} onClick={() => setQuantity(String(count))}>{t.plural("pieceCount", count)}</Button>)}</div>
              {organizations.length > 1 ? <Field label={t("organization")} hint={t("organizationHint")}><Select value={organization ? String(organization.id) : ""} onChange={(e) => setOrganizationId(e.target.value)} options={organizations.map((o) => ({ value: String(o.id), label: o.name }))} data-testid="production-generate-organization" /></Field> : null}
              {model && plan.valid ? <ProductionPlatePreview model={model} plates={plan.plates} /> : null}
            </div> : null}
            {step === 4 && face ? <div className="space-y-4">
              <dl className="divide-y divide-white/10 rounded-xl border border-white/10 px-4">
                {[[d("design"), labels.face(face.face), 0], [d("appearance"), `${themeName(colour!.theme)} · ${styleName(face.style)}`, 1], [n("field"), nfcMount ? nfcName(nfcMount) : n("fixed"), 2], [d("pieces"), t.plural("pieceCount", plan.count), 3], ...(organizations.length > 1 && organization ? [[t("organization"), organization.name, 3]] : [])].map(([label, value, target]) => <div key={label} className="flex items-center justify-between gap-3 py-3"><div><dt className="text-xs text-white/45">{label}</dt><dd className="mt-1 text-sm font-medium text-white">{value}</dd></div><button type="button" aria-label={d("edit", { step: label })} disabled={busy} onClick={() => setStep(Number(target))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/50 hover:bg-white/5 hover:text-white"><ChevronRight className="h-4 w-4" /></button></div>)}
              </dl>
              <MaterialsNeeded materials={materialsForNfc(face.materials, nfcMount ? face.nfcVariants[nfcMount] : null)} filaments={filamentColours(model)} assembly={assemblyParts(model, models, nfcMount)} />
              <p className="text-xs leading-relaxed text-white/55">{b("generateDialogIntro")}</p>
              <p className="text-xs leading-relaxed text-white/55">{b("reviewNext")}</p>
            </div> : null}
          </fieldset>
          </div>
          <aside className="order-2 flex shrink-0 flex-col gap-4 border-t border-white/[0.08] bg-white/[0.025] px-5 py-5 md:order-1 md:w-72 md:overflow-y-auto md:border-r md:border-t-0" aria-label={d("summary")} data-testid="production-design-summary">
            <StepRail names={stepNames} values={stepValues} current={step} canVisit={canVisit} busy={busy} onChange={setStep} progress={progress} />
            {/* The piece takes whatever the steps leave. Before a design is chosen it is the product's first one. */}
            <div className={`${PIECE_STAGE} h-44 rounded-xl md:h-auto md:min-h-[120px] md:flex-1`} data-testid="production-design-stage">
              <div className="absolute inset-x-4 bottom-8 top-3 flex items-center justify-center">
                <Piece3D model={model ?? models.get(option.colours[0]?.faces[0]?.slug ?? "")} fallback={preview ?? <TagPieceVisual productType={option.productType} face="google_review" theme={theme} size="lg" still />} />
              </div>
              <TagModelChips productType={option.productType} face={faceKey || null} theme={colour?.theme} sizeText="long" className="pointer-events-none absolute bottom-2 left-2" />
            </div>
          </aside>
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.08] bg-[#111727] px-5 py-4 sm:px-7">
          <Button type="button" variant="ghost" onClick={step === 0 ? onClose : () => setStep(step - 1)} disabled={busy}>{step === 0 ? tc("cancel") : tw("back")}</Button>
          {step < 4 ? <Button key="next" type="submit" variant="brand" accent="tags" disabled={!stepOk || busy} data-testid="production-generate-next">{tw("next")}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button> : <Button key="go" type="submit" variant="brand" accent="tags" disabled={!stepOk} loading={busy} data-testid="production-generate-confirm">{b.plural("generateCount", plan.pieces)}</Button>}
        </footer>
      </form>
    </DialogContent>
  </Dialog>;
}

/** `onPick`: a click or a tap on it, never the arrow keys, which pass over the choices on the way to one. */
function RadioCard({ name, value, checked, onChange, onPick, children, testId }: { name: string; value: string; checked: boolean; onChange: () => void; onPick?: () => void; children: ReactNode; testId: string }) {
  return <label className="relative flex min-w-0 cursor-pointer" data-testid={testId}>
    <input type="radio" name={name} value={value} checked={checked} onChange={onChange} onClick={(event) => { if (event.detail > 0) onPick?.(); }} className="peer sr-only" />
    {checked ? <Check aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-4 w-4 rounded-full bg-violet-400 p-0.5 text-[#0d1322]" /> : null}
    <span className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center transition-colors hover:border-white/30 peer-checked:border-violet-400 peer-checked:bg-violet-400/10 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400">{children}</span>
  </label>;
}

export function DesignPreview({ productType, face, theme, style, modelSlug }: { productType: string; face: string; theme: string; style: string; modelSlug: string }) {
  const [failedSource, setFailedSource] = useState("");
  const source = `/production/previews/${encodeURIComponent(productType)}/${encodeURIComponent(face)}/${encodeURIComponent(style)}-${encodeURIComponent(theme)}.svg`;
  // A generated service preview shows the actual face polygons, complete body and stand base.
  return failedSource === source ? <TagPieceVisual productType={productType} face={face} theme={theme} modelSlug={modelSlug} size="lg" still /> : <img key={source} src={source} alt="" onError={() => setFailedSource(source)} className="h-32 w-full max-w-40 object-contain" width={160} height={128} />;
}
