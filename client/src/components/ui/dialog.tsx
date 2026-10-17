"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowLeft, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useDialogAutoFocus } from "@/hooks/use-dialog-focus"

// Dialogs render as pages by default, so they stay non-modal: the sidebar and
// header remain clickable, and clicking them dismisses the page.
const Dialog = ({ modal = false, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) => (
  <DialogPrimitive.Root modal={modal} {...props} />
)

type DialogVariant = "page" | "modal"
const VariantContext = React.createContext<DialogVariant>("modal")

// Popup sizing/scroll classes callers pass for the old modal; meaningless on a page.
const MODAL_ONLY = /^(sm:)?(max-h-|h-|overflow-)|vh\]$/
// Viewport-relative widths ("w-[96vw]") overflow the content area; a page uses its full width instead.
const pageClass = (className = "") =>
  className.split(/\s+/).map((c) => (/vw\]$/.test(c) ? "max-w-none" : c)).filter((c) => !MODAL_ONLY.test(c)).join(" ")

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { variant?: DialogVariant }
>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, variant = "page", ...props }, ref) => {
  const focusHandlers = useDialogAutoFocus({ onOpenAutoFocus, onCloseAutoFocus })
  if (variant === "page") {
    // Falls back to a fixed full-screen page when there's no app shell (e.g. login).
    const layer = typeof document !== "undefined" ? document.getElementById("page-layer") : null
    const cardClass = pageClass(className)
    return (
      <VariantContext.Provider value="page">
        <DialogPortal container={layer}>
          <DialogPrimitive.Content
            ref={ref}
            className={cn(
              "inset-0 z-40 overflow-y-auto bg-muted bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_60%)] focus:outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
              layer ? "absolute" : "fixed"
            )}
            onOpenAutoFocus={focusHandlers.onOpenAutoFocus}
            onCloseAutoFocus={focusHandlers.onCloseAutoFocus}
            {...props}
          >
            <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 sm:px-6">
                <DialogPrimitive.Close className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                  Back
                </DialogPrimitive.Close>
                <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">Esc</kbd>
              </div>
            </div>
            <div className="px-3 py-6 sm:px-6 sm:py-10">
              <div
                className={cn(
                  "relative mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm ring-1 ring-black/[0.02] sm:p-8",
                  cardClass
                )}
              >
                {children}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </VariantContext.Provider>
    )
  }
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 flex w-[calc(100%-1.5rem)] max-w-lg max-h-[90vh] translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overflow-y-auto rounded-lg border bg-background p-4 shadow-lg sm:p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          className
        )}
        onOpenAutoFocus={focusHandlers.onOpenAutoFocus}
        onCloseAutoFocus={focusHandlers.onCloseAutoFocus}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 opacity-70 ring-offset-background transition hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const page = React.useContext(VariantContext) === "page"
  return (
    <div
      className={cn(
        page
          ? "flex flex-col space-y-1.5 border-b pb-5 text-start"
          : "flex flex-col space-y-2 pr-10 text-center sm:text-left",
        className
      )}
      {...props}
    />
  )
}
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const page = React.useContext(VariantContext) === "page"
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2",
        // Sticky action bar so Save stays reachable on long forms.
        page && "sticky bottom-0 z-10 -mx-5 -mb-5 mt-2 rounded-b-2xl border-t bg-card/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:-mb-8 sm:px-8",
        className
      )}
      {...props}
    />
  )
}
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const page = React.useContext(VariantContext) === "page"
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        page ? "text-2xl font-semibold tracking-tight" : "text-lg font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  )
})
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
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
