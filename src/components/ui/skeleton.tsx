import { cn } from '@/lib/utils';

/**
 * Skeleton component for loading states.
 * Usage:
 *   <Skeleton className="h-4 w-40" />   // text line
 *   <Skeleton className="h-10 w-10 rounded-full" />  // avatar
 *   <Skeleton className="h-40 w-full rounded-xl" />   // card
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'skeleton-shimmer rounded-md bg-[var(--color-border)]',
        className
      )}
      {...props}
    />
  );
}

/**
 * Dashboard skeleton — shows instantly while getCurrentProject() resolves.
 * Matches the actual dashboard layout structure for smooth visual transition.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex min-h-dvh bg-[var(--color-bg)]">
      {/* Sidebar skeleton (hidden on mobile) */}
      <div className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-l border-[var(--color-border)] p-4 lg:flex">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-[8px]" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header skeleton */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-[8px]" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-3 w-10" />
        </div>

        {/* Page content skeleton */}
        <div className="flex-1 p-4 pb-20 lg:pb-0">
          {/* Title */}
          <Skeleton className="mb-1 h-7 w-32" />
          <Skeleton className="mb-6 h-4 w-56" />

          {/* Stats cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>

          {/* Checklist skeleton */}
          <Skeleton className="mb-3 h-5 w-28" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>

        {/* Mobile nav skeleton */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)] lg:hidden">
          <div className="mx-auto flex max-w-lg items-stretch justify-between px-4 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-10 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
