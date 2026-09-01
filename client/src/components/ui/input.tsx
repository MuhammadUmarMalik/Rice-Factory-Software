import * as React from "react"

import { cn } from "@/lib/utils"
import { moveFocusByArrowKey } from "@/lib/keyboard-nav"

const MIN_DATE_INPUT = "1980-01-01"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onKeyDown, min, ...props }, ref) => {
    const resolvedMin = type === "date" && !min ? MIN_DATE_INPUT : min
    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        min={resolvedMin}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented) return
          if (event.key === "ArrowDown") {
            moveFocusByArrowKey(event, "next")
            return
          }
          if (event.key === "ArrowUp") {
            moveFocusByArrowKey(event, "prev")
          }
        }}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
