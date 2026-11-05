import { useId } from "react";
import { Check } from "lucide-react";
import { PRINT_DEFAULT_MENU_FONT, PRINT_DEFAULT_NFC_MOUNT, type PrintMenuFont, type PrintNfcMount } from "@shared/printProduction";
import { useT } from "@/i18n";
import { printNfcMessages } from "@/i18n/messages/printNfc";

// "Which NFC goes inside?": asked whenever a print is created, because each type is a different print file. The
// server refuses a print of a model with a choice when it does not say which (print_nfc_required).

export function useNfcMountName() {
  const t = useT(printNfcMessages);
  return (mount: PrintNfcMount) => t(`name_${mount}` as "name_sticker_round_25");
}

/** `onPick`: a click or a tap on one, never the arrow keys, which pass over the choices on the way to one. */
export function NfcMountChoice({ mounts, value, onChange, onPick }: { mounts: readonly PrintNfcMount[]; value: PrintNfcMount | null; onChange: (mount: PrintNfcMount) => void; onPick?: () => void }) {
  const t = useT(printNfcMessages);
  const name = useNfcMountName();
  const radioName = useId();
  if (!mounts.length) return <p className="text-sm text-white/55">{t("fixed")}</p>;
  return (
    <fieldset className="grid gap-3 sm:grid-cols-3" data-testid="production-nfc-mounts">
      <legend className="sr-only">{t("question")}</legend>
      {mounts.map((mount) => {
        const selected = value === mount;
        return (
          <label
            key={mount}
            className="relative flex min-w-0 cursor-pointer"
            data-testid={`production-nfc-${mount}`}
          >
            <input type="radio" name={radioName} value={mount} checked={selected} onChange={() => onChange(mount)} onClick={(event) => { if (event.detail > 0) onPick?.(); }} aria-label={name(mount)} className="peer sr-only" />
            {selected ? <Check aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-4 w-4 rounded-full bg-violet-400 p-0.5 text-[#0d1322]" /> : null}
            <span className="flex w-full flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 peer-checked:border-violet-400 peer-checked:bg-violet-500/10 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400">
            <img src={`/production/nfc/${mount}.svg`} alt="" className="h-28 w-full rounded-lg object-contain" width={240} height={160} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                {name(mount)}
                {mount === PRINT_DEFAULT_NFC_MOUNT ? <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-200">{t("recommended")}</span> : null}
              </span>
              <span className="mt-0.5 block text-xs text-white/50">{t(`hint_${mount}` as "hint_sticker_round_25")}</span>
            </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** The picture of a title font: its word in that font's outlines, so the browser needs no font file. */
const fontPicture = (font: string) => `/tags/menu-fonts/${font.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}.svg`;

/** "Which font?": the word Menu in each font, on the piece's own colour. `nameOf` says a font's name to the person. */
export function MenuFontChoice({ fonts, value, theme, onChange, nameOf }: { fonts: readonly PrintMenuFont[]; value: PrintMenuFont | null; theme: string; onChange: (font: PrintMenuFont) => void; nameOf?: (font: PrintMenuFont) => string }) {
  const t = useT(printNfcMessages);
  const dark = theme === "black";
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3" role="radiogroup" aria-label={t("fontQuestion")} data-testid="production-menu-fonts">
      {fonts.map((font) => {
        const selected = value === font;
        return (
          <button
            key={font}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(font)}
            className={`relative flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-colors hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${selected ? "border-violet-400 bg-violet-400/10" : "border-white/10 bg-white/[0.02]"}`}
            data-testid="production-menu-font"
          >
            {selected ? <Check aria-hidden="true" className="absolute right-1.5 top-1.5 z-10 h-4 w-4 rounded-full bg-violet-400 p-0.5 text-[#0d1322]" /> : null}
            <span className={`flex h-20 items-center justify-center rounded-lg px-3 ${dark ? "bg-[#161616]" : "bg-[#f2f2f2]"}`}>
              <img src={fontPicture(font)} alt="" className={`max-h-12 max-w-full ${dark ? "invert" : ""}`} />
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-white">
              {nameOf ? nameOf(font) : font}
              {font === PRINT_DEFAULT_MENU_FONT ? <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-200">{t("recommended")}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
