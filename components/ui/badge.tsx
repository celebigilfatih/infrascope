import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold leading-5 align-middle [&_svg]:shrink-0 [&_svg]:m-0 [&_svg]:h-3.5 [&_svg]:w-3.5",
  {
    variants: {
      variant: {
        default:
          "border-border bg-muted text-foreground",
        secondary:
          "border-border bg-muted text-muted-foreground",
        destructive:
          "border-[var(--ui-danger-border)] bg-[var(--ui-danger-bg)] text-[var(--ui-danger-fg)]",
        outline: "border-border text-muted-foreground",
        success:
          "border-[var(--ui-success-border)] bg-[var(--ui-success-bg)] text-[var(--ui-success-fg)]",
        warning:
          "border-[var(--ui-warning-border)] bg-[var(--ui-warning-bg)] text-[var(--ui-warning-fg)]",
        info:
          "border-[var(--ui-info-border)] bg-[var(--ui-info-bg)] text-[var(--ui-info-fg)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  icon?: LucideIcon | null
}

function Badge({ className, variant, children, icon, ...props }: BadgeProps) {
  const hasLeadingElement = React.Children.toArray(children).some(child => React.isValidElement(child));
  const Icon = icon === undefined && !hasLeadingElement
    ? variant === 'success' ? CircleCheck : variant === 'warning' ? TriangleAlert : variant === 'destructive' ? CircleAlert : variant === 'info' ? Info : null
    : icon;
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>{Icon && <Icon size={14} aria-hidden="true" />}{children}</div>
  )
}

export { Badge, badgeVariants }
