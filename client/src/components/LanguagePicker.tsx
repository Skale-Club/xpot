import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { LANGS, LANG_LABELS, LANG_SHORT, useI18n, useT, type Lang } from "@/i18n";
import { CountryFlag } from "@/components/CountryFlag";
import { commonMessages } from "@/i18n/messages/common";

// The flag stands for the locale each language is written for (LOCALES in
// @/i18n): American English, Brazilian Portuguese, Spanish.
const LANG_FLAG: Record<Lang, string> = { en: "US", pt: "BR", es: "ES" };

/** EN · PT · ES segmented picker with flags (flags only when compact); the choice is saved on this device. */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  const t = useT(commonMessages);
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (compact) {
    return (
      <div ref={pickerRef} className="relative" data-testid="language-picker">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${t("language")}: ${LANG_LABELS[lang]}`}
          onClick={() => setOpen((value) => !value)}
          className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-sm font-semibold text-white/80 transition-all hover:border-white/[0.16] hover:bg-white/[0.065] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6F8FFF]/70"
        >
          <CountryFlag iso={LANG_FLAG[lang]} className="h-4 w-5 rounded-[3px]" />
          <span>{LANG_SHORT[lang]}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={t("language")}
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-44 rounded-xl border border-white/[0.1] bg-[#0a0e19]/95 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            {LANGS.map((l) => {
              const active = lang === l;
              return (
                <button
                  key={l}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setLang(l);
                    setOpen(false);
                  }}
                  data-testid={`language-${l}`}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${active
                    ? "bg-[#5272F2]/15 text-white"
                    : "text-white/60 hover:bg-white/[0.055] hover:text-white"
                  }`}
                >
                  <CountryFlag iso={LANG_FLAG[l]} className="h-4 w-5 shrink-0 rounded-[3px]" />
                  <span className="flex-1">{LANG_LABELS[l]}</span>
                  {active && <Check className="h-4 w-4 text-[#8FA8FF]" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" data-testid="language-picker">
      <Languages className="h-4 w-4 text-white/40" aria-hidden />
      <div
        role="radiogroup"
        aria-label={t("language")}
        className="flex rounded-xl bg-white/[0.04] p-0.5"
      >
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            aria-label={LANG_LABELS[l]}
            title={LANG_LABELS[l]}
            onClick={() => setLang(l)}
            data-testid={`language-${l}`}
            className={`flex min-h-[32px] items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6F8FFF]/70 ${
              lang === l ? "bg-blue-500/30 text-white" : "text-white/45 hover:text-white/75"
            }`}
          >
            <CountryFlag iso={LANG_FLAG[l]} className={`h-3.5 w-[17.5px] transition-opacity ${lang === l ? "" : "opacity-60"}`} />
            <span>{LANG_SHORT[l]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Settings' chooser: one large row per language, written out in full. */
export function LanguageList() {
  const { lang, setLang } = useI18n();
  const t = useT(commonMessages);
  return (
    <div role="radiogroup" aria-label={t("language")} className="grid gap-2 sm:grid-cols-3" data-testid="language-list">
      {LANGS.map((l) => {
        const active = lang === l;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLang(l)}
            data-testid={`language-${l}`}
            className={`flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 text-left text-base font-semibold transition-colors touch-manipulation ${
              active ? "border-blue-400/50 bg-blue-500/15 text-white" : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
            }`}
          >
            <CountryFlag iso={LANG_FLAG[l]} className="h-5 w-[25px] shrink-0 rounded-sm" />
            <span className="flex-1">{LANG_LABELS[l]}</span>
            {active && <Check className="h-5 w-5 shrink-0 text-blue-300" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
