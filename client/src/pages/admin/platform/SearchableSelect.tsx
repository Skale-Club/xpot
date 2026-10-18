import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { ACCENT_SELECTED, SURFACE_MODAL_CLASS } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { integrationsMessages } from "@/i18n/messages/integrations";

/** A model picker: pick from the list or type a model the list does not have. */
export function SearchableSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const t = useT(integrationsMessages);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = options.filter((option) => option.toLowerCase().includes(normalizedSearch));
  const exactMatch = options.some((option) => option.toLowerCase() === normalizedSearch);
  const customValue = search.trim();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setSearch("");
        }}
        aria-expanded={open}
        className={`${FIELD_CONTROL} flex items-center justify-between gap-3 py-2 text-left ${open ? "border-blue-400/60" : ""}`}
      >
        <span className={value ? "min-w-0 truncate text-white" : "min-w-0 truncate text-white/25"}>
          {value || placeholder || t("selectModel")}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl ${SURFACE_MODAL_CLASS} shadow-2xl shadow-black/40`}>
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-white/35" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && customValue) {
                  onChange(customValue);
                  setOpen(false);
                }
              }}
              placeholder={t("searchModel")}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white placeholder-white/25 outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {customValue && !exactMatch && (
              <button
                type="button"
                onClick={() => {
                  onChange(customValue);
                  setOpen(false);
                }}
                className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/85 transition-colors hover:bg-white/[0.06]"
              >
                <Check className="h-4 w-4 shrink-0 text-white/60" />
                <span className="min-w-0 truncate">{t("useCustomValue", { value: customValue })}</span>
              </button>
            )}
            {filtered.map((option) => {
              const selected = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    selected ? `${ACCENT_SELECTED.account.row} text-white` : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Check className={`h-4 w-4 shrink-0 ${selected ? "text-slate-200 opacity-100" : "opacity-0"}`} />
                  <span className="min-w-0 truncate">{option}</span>
                </button>
              );
            })}
            {!filtered.length && !customValue && (
              <div className="px-3 py-4 text-center text-sm text-white/35">{t("noModels")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
