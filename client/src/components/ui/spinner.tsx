import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { PAGE_GRADIENT } from "@/components/xpot/surface";
import { cn } from "@/lib/utils";

interface DotsLoaderProps {
  size?: "xs" | "sm" | "md" | "lg";
  tone?: "brand" | "muted" | "light" | "current";
  className?: string;
  /** What is loading, for screen readers; defaults to the translated "Loading". */
  label?: string;
}

export function DotsLoader({ size = "md", tone = "brand", className, label }: DotsLoaderProps) {
  const t = useT(commonMessages);
  const sizeClasses = {
    xs: { dot: "w-1.5 h-1.5", gap: "gap-1" },
    sm: { dot: "w-2 h-2", gap: "gap-1" },
    md: { dot: "w-3 h-3", gap: "gap-2" },
    lg: { dot: "w-4 h-4", gap: "gap-3" },
  };
  const toneClasses = {
    brand: "bg-primary",
    muted: "bg-muted-foreground/70",
    light: "bg-white",
    current: "bg-current",
  };

  const { dot, gap } = sizeClasses[size];
  const dotTone = toneClasses[tone];

  return (
    <div
      className={cn("flex items-center", gap, className)}
      role="status"
      aria-label={label ?? t("loading")}
    >
      <div className={cn(dot, dotTone, "rounded-full animate-dot-pulse [animation-delay:0ms]")} />
      <div className={cn(dot, dotTone, "rounded-full animate-dot-pulse [animation-delay:150ms]")} />
      <div className={cn(dot, dotTone, "rounded-full animate-dot-pulse [animation-delay:300ms]")} />
    </div>
  );
}

interface SectionLoaderProps extends DotsLoaderProps {
  centerClassName?: string;
}

export function SectionLoader({
  size = "md",
  tone = "brand",
  className,
  centerClassName,
  label,
}: SectionLoaderProps) {
  return (
    <div className={cn("flex w-full items-center justify-center py-12", centerClassName)}>
      <DotsLoader size={size} tone={tone} className={className} label={label} />
    </div>
  );
}

export function InlineLoader({
  size = "xs",
  tone = "brand",
  className,
  label,
}: DotsLoaderProps) {
  return <DotsLoader size={size} tone={tone} label={label} className={cn("inline-flex shrink-0", className)} />;
}

/**
 * PageLoader — hardcoded dark splash for pre-React boot states.
 * Use this only as the Suspense fallback during initial route transitions,
 * where the theme class has not been applied yet and we want a consistent
 * dark splash regardless of the user's preference. For any in-app
 * "waiting" state (auth check, route guard, initial data fetch) use
 * <AppLoader /> instead — it respects the active theme.
 */
export function PageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060912]">
      <DotsLoader size="lg" tone="brand" />
    </div>
  );
}

/**
 * AppLoader — full-screen, theme-aware loader.
 *
 * Use this for any top-level waiting state inside a themed area (admin
 * dashboard, admin auth screens, any future page that gates rendering on
 * an async check). Two non-obvious properties:
 *
 *   1. `fixed inset-0` — covers the entire viewport regardless of the
 *      parent layout. Crucial inside <SidebarProvider> (and any other flex
 *      container) where a relative-positioned loader would otherwise be
 *      squeezed into a narrow strip of the content column.
 *   2. PAGE_GRADIENT — the page background of every shell, starting from
 *      the navy page base (#060912, PAGE_BASE in components/xpot/surface.ts)
 *      the boot screen in client/index.html uses, so nothing flashes between
 *      boot, the loader and the page.
 *
 * NEVER write `<div className="min-h-screen flex items-center justify-center bg-slate-…"><Loader2 …/></div>`
 * by hand again — use <AppLoader /> so the theme + layout behavior stays
 * consistent across pages.
 */
export function AppLoader() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background" style={{ background: PAGE_GRADIENT }}>
      <DotsLoader size="lg" tone="brand" />
    </div>
  );
}

// Keep Spinner for other use cases
interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  const t = useT(commonMessages);
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-[3px]",
    lg: "h-12 w-12 border-4",
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-solid border-primary border-t-transparent",
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label={t("loading")}
    />
  );
}
