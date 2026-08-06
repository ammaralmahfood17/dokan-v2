'use client';

// D2: Public menu product row — extracted from menu-client.tsx renderProduct().
// D4: The whole card is a real <button> (native keyboard access + 44px touch).
import Image from 'next/image';
import { Check, Plus } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import type { Product, ProductAddon } from '@/lib/types';

/** Generic blur placeholder for product images — tiny 16×16 grey base64 */
const BLUR_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkYPj/n4EBBJgYKAQMFFiAKcBAUwsDUx0DxS5gYKA8DCh2AQNlYUBZCgDxpwgRg9RXOAAAAABJRU5ErkJggg==';

export type MenuProduct = Product & { product_addons: ProductAddon[] };

export function MenuProductRow({
  product,
  currency,
  isFirst,
  lastAdded,
  displayName,
  onQuickAdd,
}: {
  product: MenuProduct;
  currency: string;
  isFirst: boolean;
  lastAdded: boolean;
  /** Name in the active language (ar default, en when available + toggled). */
  displayName: string;
  onQuickAdd: (p: MenuProduct) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3 pt-1">
      <button
        type="button"
        onClick={() => onQuickAdd(product)}
        aria-label={`إضافة ${displayName}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-start"
      >
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={displayName}
            width={72}
            height={72}
            priority={isFirst}
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            sizes="72px"
            className="h-[72px] w-[72px] shrink-0 object-cover"
          />
        ) : (
          <div
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center text-[22px] font-bold bg-[var(--color-surface-sunken)]"
            style={{ color: 'var(--color-primary)' }}
          >
            {displayName.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{displayName}</h3>
          {product.description && (
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-[1.5] text-[var(--color-text-secondary)]">
              {product.description}
            </p>
          )}
          <span className="mt-1 inline-block font-mono text-[14px] font-semibold tabular-nums text-[var(--color-success)]" dir="ltr">
            {formatMoney(Number(product.price), currency)}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onQuickAdd(product)}
        aria-label={`إضافة ${displayName} إلى السلة`}
        className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center bg-[var(--color-text)] text-[20px] font-semibold leading-none text-[var(--color-primary)] transition-transform duration-200 active:scale-95 ${
          lastAdded ? 'scale-110' : ''
        }`}
      >
        {lastAdded ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>
    </div>
  );
}
