import { cn } from '@/lib/utils';

/**
 * Skeleton — Animate-on-load placeholder component.
 * Use during Suspense fallback or while async data is loading.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
      {...props}
    />
  );
}

/**
 * CardSkeleton — Skeleton version of a UI card.
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-8 w-2/3 mb-2" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/**
 * TableRowSkeleton — Skeleton rows for list/table loading states.
 */
export function TableRowSkeleton({
  rows = 5,
  cols = 3,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2 border-b border-border/30 last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * MetricCardSkeleton — Skeleton for dashboard stat cards.
 */
export function MetricCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-8 w-12 mb-1" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}
