"use client"

import * as React from "react"
import { inputValidationMessage } from '@/lib/i18n/tr'

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onInvalid, onInput, ...props }, ref) => {
    const localizedValidity = React.useRef(false)
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        onInvalid={event => {
          onInvalid?.(event)
          if (!event.defaultPrevented && !event.currentTarget.validity.customError) {
            event.currentTarget.setCustomValidity(inputValidationMessage(event.currentTarget.validity, type))
            localizedValidity.current = true
          }
        }}
        onInput={event => {
          if (localizedValidity.current) {
            event.currentTarget.setCustomValidity('')
            localizedValidity.current = false
          }
          onInput?.(event)
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
