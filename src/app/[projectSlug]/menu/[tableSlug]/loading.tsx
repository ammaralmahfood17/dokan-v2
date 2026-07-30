import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the public customer menu page.
 * Shows immediately while the server resolves project + table + products.
 */
export default function MenuLoading() {
  return (
    <div className="min-h-dvh bg-[var(--color-bg)] pb-24">
      {/* Header skeleton */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 rounded-[8px]" />
            <div className="min-w-0">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-1 h-3 w-16" />
            </div>
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-[44px] w-16 rounded-lg" />
            <Skeleton className="h-[44px] w-16 rounded-lg" />
          </div>
        </div>
      </header>

      {/* Categories skeleton */}
      <div className="sticky top-[57px] z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-lg gap-1 overflow-x-auto px-3 py-2">
          <Skeleton className="h-[36px] w-12 shrink-0 rounded-full" />
          <Skeleton className="h-[36px] w-20 shrink-0 rounded-full" />
          <Skeleton className="h-[36px] w-24 shrink-0 rounded-full" />
          <Skeleton className="h-[36px] w-16 shrink-0 rounded-full" />
          <Skeleton className="h-[36px] w-28 shrink-0 rounded-full" />
        </div>
      </div>

      {/* Products skeleton */}
      <main className="mx-auto max-w-lg space-y-3 px-3 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <Skeleton className="h-16 w-16 shrink-0 rounded-[8px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1.5 h-3 w-full" />
              <Skeleton className="mt-1 h-3 w-3/4" />
              <Skeleton className="mt-2 h-4 w-16" />
            </div>
            <Skeleton className="h-9 w-9 shrink-0 rounded-[8px]" />
          </div>
        ))}
      </main>
    </div>
  );
}
