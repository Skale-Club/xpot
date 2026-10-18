import type { ReactNode } from "react";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { EYEBROW, MODULE_ACCENT, type ModuleAccent } from "./surface";

// The one page header (Settings, Admin, Tags screens, detail pages): an
// optional round 44px back button, an eyebrow, the title and actions on the
// right, all on one row. With `safeArea` (the default) it pads itself below
// the notch: the installed app draws under a black-translucent status bar.
//
//   <PageHeader backHref="/settings" eyebrow={t("account")} title={t("profile")}
//     actions={<Button size="sm">…</Button>} />
//
// BackLink is the small inline "‹ Back" for the top of a detail pane.

function BackTarget({
  href,
  onBack,
  label,
  className,
  children,
}: {
  href?: string;
  onBack?: () => void;
  label: string;
  className: string;
  children: ReactNode;
}) {
  if (href) {
    return (
      <Link href={href} aria-label={label} className={className} onClick={onBack}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} className={className} onClick={onBack}>
      {children}
    </button>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  backHref,
  onBack,
  backLabel,
  accent,
  safeArea = true,
  className = "",
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** Buttons at the end of the row. */
  actions?: ReactNode;
  /** Where Back goes; or use onBack (history.back, close a pane). Neither: no back button. */
  backHref?: string;
  onBack?: () => void;
  /** Screen-reader name of the back button; defaults to the translated "Back". */
  backLabel?: string;
  /** Tints the eyebrow with the module accent. */
  accent?: ModuleAccent;
  /** Pad below the notch (env(safe-area-inset-top)). Turn off inside a shell that already does. */
  safeArea?: boolean;
  className?: string;
}) {
  const t = useT(commonMessages);
  const hasBack = Boolean(backHref || onBack);
  return (
    <header
      className={`mb-5 flex items-start gap-2 ${className}`}
      style={safeArea ? { paddingTop: "env(safe-area-inset-top)" } : undefined}
    >
      {hasBack ? (
        <BackTarget
          href={backHref}
          onBack={onBack}
          label={backLabel ?? t("back")}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white active:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </BackTarget>
      ) : null}
      <div className={`min-w-0 flex-1 ${hasBack ? "pt-1" : ""}`}>
        {eyebrow ? <p className={accent ? EYEBROW.replace("text-white/40", MODULE_ACCENT[accent].text) : EYEBROW}>{eyebrow}</p> : null}
        <h1 className="mt-0.5 break-words text-2xl font-bold leading-tight tracking-tight text-white">{title}</h1>
        {description ? <p className="mt-1 text-sm text-white/50">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div> : null}
    </header>
  );
}

/** Small inline back link ("‹ Back to pieces") for the top of a detail page or pane. */
export function BackLink({
  href,
  onBack,
  children,
  className = "",
}: {
  href?: string;
  onBack?: () => void;
  /** The label; defaults to the translated "Back". */
  children?: ReactNode;
  className?: string;
}) {
  const t = useT(commonMessages);
  const label = typeof children === "string" ? children : t("back");
  return (
    <BackTarget
      href={href}
      onBack={onBack}
      label={label}
      className={`-ml-1.5 inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 text-sm font-semibold text-white/55 transition-colors hover:text-white ${className}`}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      <span>{children ?? t("back")}</span>
    </BackTarget>
  );
}
