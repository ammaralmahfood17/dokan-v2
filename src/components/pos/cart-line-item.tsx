import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import type { PosLine } from './types';

/**
 * Polaris-style cart line: thumbnail, name (+ addons), qty stepper (+/-),
 * line total, remove. All interactive controls are ≥44px touch targets.
 */
export function CartLineItem({
  line,
  currency,
  thumbnail,
  onDecrement,
  onIncrement,
  onRemove,
}: {
  line: PosLine;
  currency: string;
  thumbnail?: string | null;
  onDecrement: () => void;
  onIncrement: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnail}
          alt=""
          className="mt-0.5 h-11 w-11 shrink-0 rounded-[8px] border border-[var(--pos-border)] bg-[var(--pos-bg)] object-cover"
        />
      ) : (
        <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-[var(--pos-bg)] text-[var(--pos-text-subdued)]">
          🍽️
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">
              {line.productName}
            </p>
            {line.addonLabels.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-[var(--pos-text-subdued)]">
                {line.addonLabels.join(' · ')}
              </p>
            )}
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--pos-text-primary)]">
            {formatMoney(line.unitPrice * line.quantity, currency)}
          </p>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center rounded-[8px] border border-[var(--pos-border)]">
            <button
              type="button"
              onClick={onDecrement}
              aria-label={`تقليل كمية ${line.productName}`}
              className="flex h-11 w-10 items-center justify-center rounded-s-[8px] text-[var(--pos-text-subdued)] transition-colors hover:text-[var(--pos-text-primary)] active:bg-[var(--pos-bg)]"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span
              className="w-9 text-center text-sm font-bold tabular-nums text-[var(--pos-text-primary)]"
              aria-live="polite"
            >
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={onIncrement}
              aria-label={`زيادة كمية ${line.productName}`}
              className="flex h-11 w-10 items-center justify-center rounded-e-[8px] text-[var(--pos-text-subdued)] transition-colors hover:text-[var(--pos-text-primary)] active:bg-[var(--pos-bg)]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`حذف ${line.productName} من السلة`}
            className="flex h-11 w-11 items-center justify-center rounded-[8px] text-[var(--pos-text-subdued)] transition-colors hover:bg-[var(--pos-critical-tint)] hover:text-[var(--pos-red)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
