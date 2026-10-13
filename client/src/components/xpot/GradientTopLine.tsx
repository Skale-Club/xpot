import { cn } from "@/lib/utils";

type GradientTopLineProps = {
  className?: string;
  /** Adds the soft brand glow used by the main sign-in modal. */
  glow?: boolean;
};

/**
 * Xpot's shared "Gradient Top Line" accent.
 *
 * Use it sparingly on prominent dialogs and feature surfaces. The parent must
 * be positioned (DialogContent already is) and should clip overflow when its
 * rounded corners need to contain the line.
 */
export function GradientTopLine({ className, glow = false }: GradientTopLineProps) {
  return (
    <>
      <div
        aria-hidden="true"
        data-ui="gradient-top-line"
        className={cn(
          "pointer-events-none absolute inset-x-8 top-0 z-20 h-px bg-[linear-gradient(90deg,transparent,#5272F2_38%,#0BB8AF_68%,transparent)]",
          className,
        )}
      />
      {glow ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-24 w-48 -translate-x-1/2 rounded-full bg-[#5272F2]/10 blur-3xl"
        />
      ) : null}
    </>
  );
}
