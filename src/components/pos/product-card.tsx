import { cn, formatMoney } from '@/lib/utils';
import type { Product } from '@/lib/types';

/**
 * Polaris-style product tile for the POS grid.
 * White surface, 1px border, 8px radius; hover lifts with shadow,
 * tap scales to 0.97 (touch-first). Image with fallback placeholder,
 * 2-line clamped name, bold tabular-nums price. Whole card is a <button>
 * (min 44px) so it works on touch and keyboard.
 */
export function ProductCard({
  product,
  currency,
  onSelect,
  className,
}: {
  product: Product;
  currency: string;
  onSelect: (p: Product) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      aria-label={`${product.name} — ${formatMoney(Number(product.price), currency)}`}
      className={cn(
        'group flex w-full flex-col overflow-hidden rounded-[8px] border border-[var(--pos-border)] bg-[var(--pos-surface)] text-start',
        'transition-[transform,box-shadow,border-color] duration-150 will-change-transform',
        'hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:border-[var(--pos-text-subdued)]',
        'active:scale-[0.97]',
        'min-h-[44px]',
        className
      )}
    >
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt=""
          loading="lazy"
          className="aspect-[4/3] w-full shrink-0 bg-[var(--pos-bg)] object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center bg-[var(--pos-bg)] text-[var(--pos-text-subdued)]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2.5">
        <span className="line-clamp-2 text-[13px] font-semibold leading-5 text-[var(--pos-text-primary)]">
          {product.name}
        </span>
        <span className="mt-auto pt-1 text-[15px] font-bold tabular-nums text-[var(--pos-text-primary)]">
          {formatMoney(Number(product.price), currency)}
        </span>
      </div>
    </button>
  );
}
