import * as React from "react"

type AutoFocusHandler = (event: Event) => void

type DialogFocusOptions = {
  onOpenAutoFocus?: AutoFocusHandler
  onCloseAutoFocus?: AutoFocusHandler
}

/*
A11y checklist for dialog-like components:
- Provide a DialogTitle (and DialogDescription when helpful).
- Use `data-autofocus` on the primary action/input when default focus isn't ideal.
- Keep hidden/offscreen UI inert or aria-hidden while the dialog is closed.
*/
export function useDialogAutoFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: DialogFocusOptions) {
  const lastFocusedRef = React.useRef<HTMLElement | null>(null)

  const handleOpenAutoFocus = React.useCallback(
    (event: Event) => {
      if (typeof document !== "undefined") {
        const active = document.activeElement
        lastFocusedRef.current = active instanceof HTMLElement ? active : null
      }
      onOpenAutoFocus?.(event)
      if (event.defaultPrevented) return
      const container = event.currentTarget as HTMLElement | null
      const target = container?.querySelector<HTMLElement>("[data-autofocus]")
      if (target) {
        event.preventDefault()
        target.focus()
      }
    },
    [onOpenAutoFocus],
  )

  const handleCloseAutoFocus = React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      const previous = lastFocusedRef.current
      if (previous && typeof document !== "undefined" && document.contains(previous)) {
        event.preventDefault()
        previous.focus()
      }
    },
    [onCloseAutoFocus],
  )

  return {
    onOpenAutoFocus: handleOpenAutoFocus,
    onCloseAutoFocus: handleCloseAutoFocus,
  }
}
