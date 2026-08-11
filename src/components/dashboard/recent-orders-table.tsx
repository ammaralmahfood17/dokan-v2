// D1: Recent orders table — extracted from dashboard/page.tsx.
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusChip } from '@/components/ui/status-chip';
import { tableLabel, type RecentOrder } from '@/lib/dashboard-data';

export function RecentOrdersTable({
  recentOrders,
  currency,
}: {
  recentOrders: RecentOrder[];
  currency: string;
}) {
  return (
    <div className="chart-container border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <h2 className="font-display text-[15px] font-semibold">آخر الطلبات</h2>
        <Link
          href="/dashboard/orders"
          className="inline-flex min-h-9 items-center text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          عرض الكل
        </Link>
      </div>
      {!recentOrders?.length ? (
        <div className="p-5">
          <EmptyState
            icon={<ShoppingBag className="h-8 w-8" />}
            title="ما فيه طلبات حالياً"
            description="أول طلب بيظهر هنا مباشرة."
            action={
              <Link href="/dashboard/pos" className="btn btn-primary">
                افتح POS
              </Link>
            }
          />
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الطاولة</th>
              <th>المبلغ</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((o) => (
              <tr key={o.id} className="h-12">
                <td className="font-mono text-[12px] tabular-nums text-[var(--color-text-secondary)]" dir="ltr">
                  #{String(o.order_number).padStart(3, '0')}
                </td>
                <td className="font-medium">{tableLabel(o)}</td>
                <td className="font-mono text-[12.5px] font-bold tabular-nums">
                  {formatMoney(Number(o.total_amount), currency)}
                </td>
                <td>
                  <StatusChip status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
