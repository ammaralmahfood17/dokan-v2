import { cn } from '@/lib/utils';

/**
 * Polaris-style checkout CTA: full-width green (--pos-green), 16px / 600,
 * 8px radius, ≥44px touch target. Shows a spinner while submitting.
 */
export function CheckoutButton({
  loading,
  disabled,
  onClick,
  children,
  className,
}: {
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--pos-green)] px-4 text-base font-semibold text-white',
        'transition-colors duration-150 hover:bg-[var(--pos-green-hover)] active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:hidden" />
      )}
      {children}
    </button>
  );
}
