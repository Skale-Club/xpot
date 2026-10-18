import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { DotsLoader } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

// The one button of the app (docs/UI_KIT.md). Pick the variant by meaning:
//   brand     primary action (BRAND_GRADIENT); `accent="tags"` turns it violet
//   money     a sale or a payment (SUCCESS_GRADIENT); green means money only
//   danger    delete / cancel something for good (pair it with ConfirmDialog)
//   secondary the other choice next to a primary ("Edit", "Export")
//   outline   a quiet action on a busy card
//   ghost     icon buttons and "Cancel" in dialogs
// `default` (solid brand blue) and `destructive` (= danger) are kept for older callers.
// Focus is drawn by the global outline in index.css, so no ring here.
// The gradients are spelled out (not imported) so Tailwind sees the classes;
// keep them in step with components/xpot/surface.ts.

const BRAND_FILL = "bg-[linear-gradient(135deg,#3b82f6,#6366f1)] shadow-[0_8px_24px_rgba(59,130,246,0.22)]"
const TAGS_FILL = "bg-[linear-gradient(135deg,#8b5cf6,#c026d3)] shadow-[0_8px_24px_rgba(139,92,246,0.22)]"
const DANGER_FILL = "bg-[linear-gradient(135deg,#ef4444,#e11d48)] text-white shadow-[0_8px_24px_rgba(239,68,68,0.2)] hover:brightness-110"

const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold touch-manipulation transition-[background-color,border-color,color,filter,transform,box-shadow] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        brand: `${BRAND_FILL} text-white hover:brightness-110`,
        money: "bg-[linear-gradient(135deg,#10b981,#06b6d4)] text-white shadow-[0_8px_24px_rgba(16,185,129,0.2)] hover:brightness-110",
        danger: DANGER_FILL,
        destructive: DANGER_FILL,
        secondary: "border border-white/10 bg-white/[0.06] text-white/85 hover:border-white/[0.16] hover:bg-white/10 hover:text-white",
        outline: "border border-white/[0.12] bg-transparent text-white/80 hover:border-white/20 hover:bg-white/[0.05] hover:text-white",
        // A transparent border so toggling one on later doesn't shift the layout.
        ghost: "border border-transparent text-white/70 hover:bg-white/[0.06] hover:text-white",
      },
      // Heights are minimums so a long label can wrap the button taller.
      // The default is 44px: the smallest comfortable touch target.
      size: {
        default: "min-h-11 px-4 py-2",
        sm: "min-h-9 px-3 text-[13px]",
        lg: "min-h-12 px-6 text-base",
        icon: "h-11 w-11 shrink-0",
      },
      /** Module tint for the primary variants (brand, default); see MODULE_ACCENT. */
      accent: {
        visits: "",
        tags: "",
        account: "",
      },
    },
    compoundVariants: [
      { variant: ["brand", "default"], accent: "tags", className: `${TAGS_FILL} text-white hover:brightness-110` },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      accent: "visits",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows the dots loader in place of the label, keeps the button's width and disables it. */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, accent, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, accent, className }), loading && "disabled:opacity-100")
    if (asChild) {
      return (
        <Slot className={classes} ref={ref} aria-busy={loading || undefined} {...props}>
          {children}
        </Slot>
      )
    }
    return (
      <button className={classes} ref={ref} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
        {loading ? (
          <>
            <span className="invisible inline-flex items-center justify-center gap-2">{children}</span>
            <span className="absolute inset-0 flex items-center justify-center">
              <DotsLoader size={size === "sm" ? "xs" : "sm"} tone="current" />
            </span>
          </>
        ) : (
          children
        )}
      </button>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
