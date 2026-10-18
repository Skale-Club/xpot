import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

// The one inline message box (inside a form, a card or a sheet), in place of
// ad-hoc red/amber paragraphs and page-level banners that end up hidden behind
// an open sheet. Tones follow the colour rules: info blue, success green,
// warning amber (needs a step), error red. Errors are announced (role="alert"),
// the rest politely (role="status").

const TONES = {
  info: { icon: Info, box: "border-blue-400/20 bg-blue-500/[0.08]", iconClass: "text-blue-300", title: "text-blue-100" },
  success: { icon: CheckCircle2, box: "border-emerald-400/20 bg-emerald-500/[0.08]", iconClass: "text-emerald-300", title: "text-emerald-100" },
  warning: { icon: AlertTriangle, box: "border-amber-400/25 bg-amber-500/[0.08]", iconClass: "text-amber-300", title: "text-amber-100" },
  error: { icon: XCircle, box: "border-red-400/25 bg-red-500/[0.08]", iconClass: "text-red-300", title: "text-red-100" },
} as const;

export type InlineAlertTone = keyof typeof TONES;

export function InlineAlert({
  tone = "info",
  title,
  children,
  action,
  icon,
  className = "",
}: {
  tone?: InlineAlertTone;
  title?: ReactNode;
  /** The message. */
  children?: ReactNode;
  /** A button at the end ("Retry", "Open settings"). */
  action?: ReactNode;
  /** Overrides the tone's icon. */
  icon?: LucideIcon;
  className?: string;
}) {
  const t = TONES[tone];
  const Icon = icon ?? t.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-sm ${t.box} ${className}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.iconClass}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className={`font-semibold ${t.title}`}>{title}</p> : null}
        {children ? <div className={`text-white/70 ${title ? "mt-0.5" : ""}`}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
