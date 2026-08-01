import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type POSBadgeVariant = 'success' | 'critical' | 'neutral';

/**
 * Polaris-style pill badge (20px radius).
 * success = green-light bg, critical = #fff4f4 bg (--pos-critical-tint),
 * neutral = subdued on pos-bg.
 */
export function POSBadge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: POSBadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[20px] px-2 py-0.5 text-xs font-semibold leading-5',
        variant === 'success' &&
          'bg-[var(--pos-green-light)] text-[var(--pos-green)]',
        variant === 'critical' &&
          'bg-[var(--pos-critical-tint)] text-[var(--pos-red)]',
        variant === 'neutral' &&
          'bg-[var(--pos-bg)] text-[var(--pos-text-subdued)]',
        className
      )}
    >
      {children}
    </span>
  );
}
