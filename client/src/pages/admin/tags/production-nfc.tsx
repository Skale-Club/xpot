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

export function NfcMountChoice({ mounts, value, onChange }: { mounts: readonly PrintNfcMount[]; value: PrintNfcMount | null; onChange: (mount: PrintNfcMount) => void }) {
  const t = useT(printNfcMessages);
  const name = useNfcMountName();
  return (
    <div className="space-y-2" role="radiogroup" aria-label={t("question")} data-testid="production-nfc-mounts">
      {mounts.map((mount) => {
        const selected = value === mount;
        return (
          <button
            key={mount}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mount)}
            className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${selected ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}
            data-testid={`production-nfc-${mount}`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-violet-400 bg-violet-500/30" : "border-white/25"}`}>
              {selected ? <Check className="h-3 w-3 text-white" aria-hidden="true" /> : null}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                {name(mount)}
                {mount === PRINT_DEFAULT_NFC_MOUNT ? <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-200">{t("recommended")}</span> : null}
              </span>
              <span className="mt-0.5 block text-xs text-white/50">{t(`hint_${mount}` as "hint_sticker_round_25")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The picture of a title font: its word in that font's outlines, so the browser needs no font file. */
const fontPicture = (font: string) => `/tags/menu-fonts/${font.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}.svg`;

/** "Which style?": the title of a Menu piece, shown on the piece's own colour. */
export function MenuFontChoice({ fonts, value, theme, onChange }: { fonts: readonly PrintMenuFont[]; value: PrintMenuFont | null; theme: string; onChange: (font: PrintMenuFont) => void }) {
  const t = useT(printNfcMessages);
  const dark = theme === "black";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t("fontQuestion")} data-testid="production-menu-fonts">
      {fonts.map((font) => {
        const selected = value === font;
        return (
          <button
            key={font}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(font)}
            className={`flex min-h-24 flex-col gap-2 rounded-xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${selected ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}
            data-testid="production-menu-font"
          >
            <span className={`flex h-16 items-center justify-center rounded-lg px-3 ${dark ? "bg-[#161616]" : "bg-[#f2f2f2]"}`}>
              <img src={fontPicture(font)} alt="" className={`max-h-10 max-w-full ${dark ? "invert" : ""}`} />
            </span>
            <span className="flex flex-wrap items-center gap-1.5 px-1 text-xs font-medium text-white/85">
              {font}
              {font === PRINT_DEFAULT_MENU_FONT ? <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-200">{t("recommended")}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
