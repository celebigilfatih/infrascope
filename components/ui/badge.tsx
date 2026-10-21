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
          "border-(--ui-danger-border) bg-(--ui-danger-bg) text-(--ui-danger-fg)",
        outline: "border-border text-muted-foreground",
        success:
          "border-(--ui-success-border) bg-(--ui-success-bg) text-(--ui-success-fg)",
        warning:
          "border-(--ui-warning-border) bg-(--ui-warning-bg) text-(--ui-warning-fg)",
        info:
          "border-(--ui-info-border) bg-(--ui-info-bg) text-(--ui-info-fg)",
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
