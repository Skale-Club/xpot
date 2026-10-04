import { Languages } from "lucide-react";
import { LANGS, LANG_LABELS, LANG_SHORT, useI18n, useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";

/** EN · PT · ES segmented picker; the choice is saved on this device. */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  const t = useT(commonMessages);
  return (
    <div className="flex items-center gap-2" data-testid="language-picker">
      {!compact && <Languages className="h-4 w-4 text-white/40" aria-hidden />}
      <div
        role="radiogroup"
        aria-label={t("language")}
        className="flex rounded-xl border border-white/10 p-0.5"
        style={{ background: "rgba(255,255,255,0.04)" }}
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
            className={`min-h-[32px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
              lang === l ? "bg-blue-500/30 text-white" : "text-white/45 hover:text-white/75"
            }`}
          >
            {LANG_SHORT[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
