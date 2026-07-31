'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { toast } from 'sonner';

const FILTERS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'pending', label: 'جديد' },
  { value: 'preparing', label: 'تحضير' },
  { value: 'ready', label: 'جاهز' },
  { value: 'delivered', label: 'مسلّم' },
  { value: 'cancelled', label: 'ملغى' },
];

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
};

type OrderRow = Order & {
  tables?: { number: number; slug: string } | null;
  order_items?: OrderItem[];
};

export function OrdersClient({
  projectId,
  currency,
  initialOrders,
}: {
  projectId: string;
  currency: string;
  initialOrders: OrderRow[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [updating, setUpdating] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    // Only fetch today's real orders (service_type = null means real order)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('orders')
      .select('*, tables(number, slug), order_items(*)')
      .eq('project_id', projectId)
      .is('service_type', null) // null = real order (not waiter/bill)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setOrders(data as unknown as OrderRow[]);
  }, [projectId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`orders-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, refresh]);

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  async function setStatus(orderId: string, status: OrderStatus) {
    setUpdating(orderId);
    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .eq('project_id', projectId);
    setUpdating(null);
    if (error) {
      toast.error('فشل تحديث الحالة');
      return;
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    );
  }

  return (
    <div className="page">
      <PullToRefresh onRefresh={refresh}>
      <div className="page-header">
        <div>
          <h1>الطلبات</h1>
          <p>تحديث مباشر · فلترة حسب الحالة</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`min-h-[44px] rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              filter === f.value
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <EmptyState
          title="ما فيه طلبات حالياً"
          description="أول طلب بيظهر هنا مباشرة."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const next = NEXT[order.status];
            return (
          <article key={order.id} className="dashboard-card card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold" dir="ltr">order-{order.order_number}</span>
                      <span className={`badge badge-${order.status}`}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {ORDER_TYPE_LABELS[order.type]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                      {order.tables
                        ? `طاولة ${order.tables.number}`
                        : 'بدون طاولة'}{' '}
                      · {new Date(order.created_at).toLocaleString('ar-BH')} {/* Bahrain locale */}
                    </p>
                  </div>
                  <p className="text-sm font-bold">
                    {formatMoney(Number(order.total_amount), currency)}
                  </p>
                </div>
                {order.order_items && order.order_items.length > 0 && (
                  <ul className="space-y-1 px-4 py-3 text-sm">
                    {order.order_items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-2">
                        <span>
                          <strong>{item.quantity}×</strong> {item.product_name}
                          {item.notes && (
                            <span className="block text-xs text-[var(--color-text-muted)]">
                              {item.notes}
                            </span>
                          )}
                        </span>
                        <span className="text-[var(--color-text-secondary)] shrink-0">
                          {formatMoney(
                            Number(item.unit_price) * item.quantity,
                            currency
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {order.notes && (
                  <p className="border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-secondary)]">
                    {order.notes}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] px-4 py-3">
                  {next && (
                    <Button
                      size="sm"
                      disabled={updating === order.id}
                      onClick={() => setStatus(order.id, next)}
                    >
                      → {ORDER_STATUS_LABELS[next]}
                    </Button>
                  )}
                  {order.status !== 'cancelled' &&
                    order.status !== 'delivered' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={updating === order.id}
                        onClick={() => setConfirmCancel(order.id)}
                      >
                        إلغاء
                      </Button>
                    )}
                  {order.status === 'ready' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={updating === order.id}
                      onClick={() => setStatus(order.id, 'delivered')}
                    >
                      تم التسليم
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      </PullToRefresh>

      {confirmCancel && (
        <Modal title="تأكيد الإلغاء" onClose={() => setConfirmCancel(null)}>
          <div className="text-center">
            <div className="mb-3 mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-danger-tint)]">
              <AlertTriangle className="h-5 w-5 text-[var(--color-danger)]" />
            </div>
            <p className="mb-5 text-xs text-[var(--color-text-secondary)]">هل أنت متأكد من إلغاء هذا الطلب؟</p>
            <div className="flex gap-2">
              <Button variant="danger" block disabled={updating === confirmCancel} onClick={() => { setStatus(confirmCancel, 'cancelled'); setConfirmCancel(null); }}>
                {updating === confirmCancel ? 'جاري…' : 'نعم، إلغاء'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmCancel(null)}>
                رجوع
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
