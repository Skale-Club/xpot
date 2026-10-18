import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { kitMessages } from "@/i18n/messages/kit";

// The one copy button: copies `value`, then shows a green check and "Copied!"
// in place for 1.5 s (no toast). `iconOnly` keeps it a 36px square; the label
// is still announced. If the clipboard is blocked it says so under the button.

export function CopyButton({
  value,
  label,
  iconOnly = false,
  className = "",
  onCopied,
}: {
  value: string;
  /** Defaults to the translated "Copy". */
  label?: string;
  iconOnly?: boolean;
  className?: string;
  onCopied?: () => void;
}) {
  const tc = useT(commonMessages);
  const t = useT(kitMessages);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    let ok = true;
    try {
      await navigator.clipboard.writeText(value);
      onCopied?.();
    } catch {
      ok = false;
    }
    setState(ok ? "copied" : "failed");
    // A failure stays up longer: it asks the person to do something.
    timer.current = setTimeout(() => setState("idle"), ok ? 1500 : 4000);
  };

  const text = state === "copied" ? tc("copied") : label ?? tc("copy");
  const Icon = state === "copied" ? Check : Copy;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={copy}
        aria-label={iconOnly ? text : undefined}
        title={iconOnly ? text : undefined}
        className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] text-[13px] font-semibold transition-colors hover:bg-white/10 ${
          iconOnly ? "w-9" : "px-3"
        } ${state === "copied" ? "text-emerald-300" : "text-white/75 hover:text-white"} ${className}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {iconOnly ? null : <span>{text}</span>}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? tc("copied") : state === "failed" ? t("copyFailed") : ""}
      </span>
      {state === "failed" ? (
        <span className="absolute left-0 top-full z-10 mt-1 w-56 text-[11px] text-red-300" aria-hidden="true">
          {t("copyFailed")}
        </span>
      ) : null}
    </span>
  );
}
