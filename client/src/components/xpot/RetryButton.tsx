import { RefreshCw } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";

/** The "Try again" action under a failed-load EmptyState (same look as Visits history). */
export function RetryButton({ onRetry, busy = false }: { onRetry: () => void; busy?: boolean }) {
  const tc = useT(commonMessages);
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {tc("retry")}
    </button>
  );
}
