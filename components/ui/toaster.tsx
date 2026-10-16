"use client"

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/components/ui/use-toast"
import { uiError } from '@/lib/i18n/tr'

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider label="Bildirim">
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{typeof title === 'string' ? uiError(title) : title}</ToastTitle>}
              {description && (
                <ToastDescription>{typeof description === 'string' ? uiError(description) : description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport label="Bildirimler ({hotkey})" />
    </ToastProvider>
  )
}
