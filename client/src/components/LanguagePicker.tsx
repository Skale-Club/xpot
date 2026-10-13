import { Check, Languages } from "lucide-react";
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
  return (
    <div className="flex items-center gap-2" data-testid="language-picker">
      {!compact && <Languages className="h-4 w-4 text-white/40" aria-hidden />}
      <div
        role="radiogroup"
        aria-label={t("language")}
        className={compact
          ? "flex items-center gap-0.5 rounded-xl border border-white/[0.07] bg-black/20 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
          : "flex rounded-xl bg-white/[0.04] p-0.5"
        }
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
            className={`flex items-center justify-center gap-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6F8FFF]/70 ${
              compact
                ? `h-9 w-10 rounded-lg border ${lang === l
                  ? "border-[#5272F2]/45 bg-[#5272F2]/20 shadow-[0_4px_14px_rgba(82,114,242,0.16)]"
                  : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.045]"
                }`
                : `min-h-[32px] rounded-lg px-2 ${lang === l ? "bg-blue-500/30 text-white" : "text-white/45 hover:text-white/75"}`
            }`}
          >
            <CountryFlag iso={LANG_FLAG[l]} className={`${compact ? "h-4 w-5 rounded-[3px]" : "h-3.5 w-[17.5px]"} transition-all ${lang === l ? "opacity-100" : "opacity-55 saturate-75"}`} />
            {/* Compact (app and landing headers) shows only the flag; the name stays in aria-label/title. */}
            {!compact && <span>{LANG_SHORT[l]}</span>}
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
