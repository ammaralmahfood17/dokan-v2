'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/shadcn/badge';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/types';

/**
 * StatusChip — single source of truth for order-status labels & pill styling.
 *
 * Arabic labels come from `ORDER_STATUS_LABELS` (lib/types.ts), the SAME map
 * orders-client uses, so every screen spells a status identically.
 *
 * Color mapping (Enterprise §6.3 pill tones):
 *   pending   → warn (جديد)
 *   preparing → info (قيد التحضير)
 *   ready     → success (جاهز)
 *   delivered → muted/sunken (تم التسليم)
 *   cancelled → danger (ملغي)
 *
 * Built on shadcn/ui Badge (Phase 1b migration) with the Dokan tone map —
 * the domain layer (status → label/color) stays in one place.
 *
 * KDS tickets intentionally do NOT use this chip — they render their own
 * status-driven border + urgent timer (تذاكر المطبخ). They only import the
 * LABELS, keeping the two surfaces' color semantics distinct.
 */
export function StatusChip({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tones: Record<string, string> = {
    pending: 'bg-[var(--color-warn-tint)] text-[var(--color-warn)]',
    preparing: 'bg-[var(--color-info-tint)] text-[var(--color-info)]',
    ready: 'bg-[var(--color-success-tint)] text-[var(--color-success)]',
    delivered: 'bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]',
    cancelled: 'bg-[var(--color-danger-tint)] text-[var(--color-danger)]',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full border-0 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        tones[status] ?? tones.cancelled,
        className
      )}
    >
      {ORDER_STATUS_LABELS[status as OrderStatus] ?? 'ملغي'}
    </Badge>
  );
}