"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { useT } from "@/i18n"
import { commonMessages } from "@/i18n/messages/common"
import { cn } from "@/lib/utils"

// The modal shell: one surface (SURFACE_MODAL #0d1322 with a hairline border),
// one backdrop (OVERLAY_CLASS) and one radius (rounded-3xl = rounded-sheet) on
// every screen size; see components/xpot/surface.ts. Don't override them per
// call: a dialog that needs to look different is a different component.
// Position and height come from .xpot-modal-shell (index.css): centred in what
// the phone keyboard leaves visible, so callers don't set top or max-height.

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

// Radix links the content to its Description through aria-describedby and
// warns when the Description is missing. Many dialogs have no description (the
// title and the form say it all), so the Description tells its Content it is
// there; without one the content drops aria-describedby, as Radix asks,
// instead of pointing at nothing.
const DescriptionCount = React.createContext<React.Dispatch<React.SetStateAction<number>> | null>(null)

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Screen-reader name of the × button; defaults to the translated "Close". */
    closeLabel?: string
    /** On a phone, fill the visible screen (.xpot-phone-sheet) instead of floating centred: for a dialog built around a text field. */
    phoneSheet?: boolean
  }
>(({ className, children, closeLabel, phoneSheet = false, ...props }, ref) => {
  const t = useT(commonMessages)
  const [descriptions, setDescriptions] = React.useState(0)
  // A caller's own aria-describedby wins; otherwise Radix's link stays only while a Description is rendered.
  const describedBy = "aria-describedby" in props || descriptions > 0 ? {} : { "aria-describedby": undefined }
  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      {...describedBy}
      className={cn(
        phoneSheet && "xpot-phone-sheet",
        "xpot-modal-shell fixed left-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-3xl gap-4 border border-white/10 bg-[#0d1322] p-6 text-white shadow-[0_24px_64px_rgba(0,0,0,0.5)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className
      )}
      {...props}
    >
      <DescriptionCount.Provider value={setDescriptions}>{children}</DescriptionCount.Provider>
      <DialogPrimitive.Close data-dialog-close="" className="absolute right-2 top-2 rounded-full p-3 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none touch-manipulation" style={{ WebkitTapHighlightColor: "transparent" }}>
        <X className="h-5 w-5" />
        <span className="sr-only">{closeLabel ?? t("close")}</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const setDescriptions = React.useContext(DescriptionCount)
  React.useLayoutEffect(() => {
    if (!setDescriptions) return
    setDescriptions((count) => count + 1)
    return () => setDescriptions((count) => count - 1)
  }, [setDescriptions])
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-white/55", className)}
      {...props}
    />
  )
})
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
