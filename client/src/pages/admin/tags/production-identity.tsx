import { Shapes } from "lucide-react";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagModelChips, TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { useTagLabels } from "./labels";
import { PRINT_THEMES } from "./production-shared";
import { plainTitle } from "./production-workflow";

export interface ProductionIdentityData {
  /** The catalog model's slug, when this is one (it picks the 3D picture; a new-batch form has none). */
  slug?: string;
  /** The batch the picture stands for, when it is one: its model is where the colour comes from. */
  batchCode?: string | null;
  title: string;
  productType?: string | null;
  face?: string | null;
  theme?: string | null;
}

/**
 * One name for a piece everywhere: "Large Stand · Google Review · White", put together from what it is (product, face,
 * colour) in the language in use. A model with no product (a part) keeps the title it was given, minus its parenthesis.
 */
export function useModelName() {
  const labels = useTagLabels();
  const b = useT(productionBoardMessages);
  return (model: Pick<ProductionIdentityData, "title" | "productType" | "face" | "theme">): string => {
    if (!model.productType) return plainTitle(model.title);
    const theme = model.theme?.trim().toLowerCase();
    const themeLabel = theme ? (theme === "mixed" ? b("themeName_mixed") : (PRINT_THEMES as readonly string[]).includes(theme) ? b(`theme_${theme}` as "theme_white") : model.theme!) : null;
    const face = model.face && model.face !== "custom" ? labels.face(model.face) : null;
    return [labels.product(model.productType), face, themeLabel].filter(Boolean).join(" · ") || plainTitle(model.title);
  };
}

/** The physical piece and its printed brand stay together throughout production. */
export function ProductionIdentity({ model, hero = false }: { model: ProductionIdentityData; hero?: boolean }) {
  const u = useT(unifiedProductionMessages);
  const labels = useTagLabels();
  const nameOf = useModelName();
  const name = nameOf(model);
  const artwork = model.productType
    ? <TagPieceVisual productType={model.productType} face={model.face} theme={model.theme} modelSlug={model.slug} batchCode={model.batchCode} size={hero ? "lg" : "md"} />
    : <Shapes className={hero ? "h-14 w-14 text-white/40" : "h-9 w-9 text-white/40"} aria-hidden="true" />;

  if (!hero) return <span className="flex min-w-0 items-center gap-3" data-testid="production-identity">
    {artwork}
    <span className="min-w-0 space-y-1.5">
      <span className="block text-sm font-semibold leading-snug text-white">{name}</span>
    </span>
  </span>;

  return <div className="grid min-w-0 grid-cols-[100px_minmax(0,1fr)] gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] sm:grid-cols-[144px_minmax(0,1fr)]" data-testid="production-identity-hero">
    <div className="flex min-h-40 items-center justify-center border-r border-white/[0.06] bg-white/[0.035] py-3">
      <span className="scale-[0.8] sm:scale-100">{artwork}</span>
    </div>
    <div className="min-w-0 space-y-3 py-4 pr-4">
      <div className="space-y-2">
        {model.productType ? <TagModelChips productType={model.productType} face={model.face} /> : null}
        <p className="break-words text-base font-semibold leading-snug text-white">{name}</p>
      </div>
      {model.face ? <div className="flex items-center gap-2.5">
        <TagFaceIcon face={model.face} size="md" />
        <div className="min-w-0"><p className="text-[11px] text-white/45">{u("printedBrand")}</p><p className="text-sm font-medium leading-snug text-white/90">{labels.face(model.face)}</p></div>
      </div> : null}
      {model.theme ? <span className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70">{model.theme}</span> : null}
    </div>
  </div>;
}

/** A quantity illustration; the actual printer positions are supplied with the generated files. */
export function ProductionPlatePreview({ model, plates }: { model: ProductionIdentityData; plates: number[] }) {
  const t = useT(productionMessages);
  const u = useT(unifiedProductionMessages);
  if (!plates.length || !model.productType) return null;
  return <div className="space-y-2" data-testid="production-plate-preview">
    <p className="text-xs font-semibold text-white/55">{u("piecesPerPlate")}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {plates.slice(0, 3).map((count, index) => <div key={index} className="space-y-3 rounded-xl border border-white/[0.08] bg-black/10 p-3">
        <div className="grid min-h-12 grid-cols-2 place-items-center gap-2" aria-hidden="true">
          {Array.from({ length: Math.min(count, 4) }, (_, copy) => <TagPieceVisual key={copy} productType={model.productType!} face={model.face} theme={model.theme} modelSlug={model.slug} size="sm" />)}
          {count > 4 ? <span className="col-span-2 text-xs tabular-nums text-white/50">+{count - 4}</span> : null}
        </div>
        <p className="text-xs font-medium text-white/75">{t("plateOf", { number: index + 1, total: plates.length })}</p>
        <p className="text-xs tabular-nums text-white/45">{t.plural("pieceCount", count)}</p>
      </div>)}
    </div>
    {plates.length > 3 ? <p className="text-xs text-white/45">{u("morePlates", { count: plates.length - 3 })}</p> : null}
  </div>;
}
