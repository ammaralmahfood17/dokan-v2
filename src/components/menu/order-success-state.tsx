'use client';

// FIX-C-003: Order-success screen — extracted from menu-client.tsx.
// Full-screen calm confirmation + waiter/bill service actions.
import { Bell, Check, FileText } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';

export function OrderSuccessState({
  orderNumber,
  totalAmount,
  currency,
  busyAction,
  onCallService,
  onOrderMore,
}: {
  orderNumber: number;
  totalAmount: number;
  currency: string;
  busyAction: 'waiter' | 'bill' | null;
  onCallService: (kind: 'waiter' | 'bill') => void;
  onOrderMore: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center page-enter">
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full text-white"
        style={{ background: 'var(--color-primary)' }}
      >
        <Check className="h-8 w-8" />
      </div>
      <h1 className="text-xl font-bold">تم استلام طلبك</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        رقم الطلب{' '}
        <span dir="ltr" className="font-bold">
          order-{orderNumber}
        </span>
      </p>
      <p className="mt-2 text-lg font-bold">{formatMoney(totalAmount, currency)}</p>
      <p className="mt-4 text-xs text-[var(--color-text-muted)]">
        يمكنك طلب الموظف أو الفاتورة من الأزرار أدناه
      </p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() => onCallService('waiter')}
          className="min-h-[48px] flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
        >
          <Bell className="h-4 w-4" />
          {busyAction === 'waiter' ? 'جاري…' : 'طلب موظف'}
        </button>
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() => onCallService('bill')}
          className="min-h-[48px] flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
        >
          <FileText className="h-4 w-4" />
          {busyAction === 'bill' ? 'جاري…' : 'طلب الفاتورة'}
        </button>
      </div>

      <Button className="mt-6" variant="secondary" onClick={onOrderMore}>
        طلب المزيد
      </Button>
    </div>
  );
}
