'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  type Order,
  type OrderItem,
  type OrderItemAddon,
  type OrderStatus,
} from '@/lib/types';
import { EmptyState } from '@/components/ui/empty-state';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';

const FILTERS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'pending', label: 'جديد' },
  { value: 'preparing', label: 'تحضير' },
  { value: 'ready', label: 'جاهز' },
  { value: 'delivered', label: 'مسلّم' },
  { value: 'cancelled', label: 'ملغى' },
];

/** ترتيب مراحل الحالة — تسلسل حقيقي (عملية الطهي/التسليم) */
const STATUS_STEPS: OrderStatus[] = ['pending', 'preparing', 'ready', 'delivered'];

type OrderRow = Order & {
  tables?: { number: number; slug: string } | null;
  order_items?: OrderItem[];
};

/** YYYY-MM-DD بالتوقيت المحلي للمتصفح */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** نطاق [بداية اليوم المختار, بداية اليوم التالي) */
function dayRange(dateKey: string): { start: Date; end: Date } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

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
  // التاريخ المعروض — اليوم افتراضيًا (التقويم مقيد بـ max=اليوم)
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));

  const isToday = dateKey === toDateKey(new Date());
  const mountedRef = useRef(false);

  const refresh = useCallback(
    async (key?: string) => {
      const target = key ?? dateKey;
      const { start, end } = dayRange(target);
      const supabase = createClient();
      const { data } = await supabase
        .from('orders')
        .select('*, tables(number, slug), order_items(*)')
        .eq('project_id', projectId)
        .is('service_type', null) // null = real order (not waiter/bill)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setOrders(data as unknown as OrderRow[]);
    },
    [projectId, dateKey]
  );

  // SSR (Vercel = UTC) يجلب نطاقًا مختلفًا عن نطاق المتصفح المحلي (Asia/Bahrain) —
  // إعادة جلب واحدة عند أول mount توحّد العرض على توقيت المستخدم.
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تاريخ محدد (تقويم) — يجلب مباشرة
  const selectDate = useCallback(
    (key: string) => {
      setDateKey(key);
      void refresh(key);
    },
    [refresh]
  );

  // اليوم / أمس — إزاحة من اليوم الحالي
  const selectDayOffset = useCallback(
    (offsetDays: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      const key = toDateKey(d);
      setDateKey(key);
      void refresh(key);
    },
    [refresh]
  );

  // Realtime — تحديث تلقائي لطلبات اليوم فقط (الأيام السابقة ثابتة:
  // ما يجي أحد يغيّر طلبات أمس أثناء عرضها)
  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

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
          if (!isToday) return;
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => void refresh(), 500);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [projectId, refresh, isToday]);

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  // عدادات حية لكل حالة — معلومة حقيقية من البيانات المعروضة
  const counts = useMemo(() => {
    const c: Record<OrderStatus | 'all', number> = {
      all: orders.length,
      pending: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const o of orders) c[o.status] += 1;
    return c;
  }, [orders]);

  return (
    <div className="page">
      <PullToRefresh onRefresh={() => void refresh()}>
      <div className="page-header">
        <div>
          <h1>الطلبات</h1>
          <p>متابعة فقط · الحالة تتحدث من شاشة المطبخ</p>
        </div>
      </div>

      {/* Date picker — اليوم/أمس + تقويم (لا مستقبل) */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => selectDayOffset(0)}
          aria-pressed={isToday}
          className={`flex min-h-[44px] items-center rounded-full px-4 text-xs font-bold transition-colors ${
            isToday
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]'
          }`}
        >
          اليوم
        </button>
        <button
          type="button"
          onClick={() => selectDayOffset(-1)}
          className="flex min-h-[44px] items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)]"
        >
          أمس
        </button>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-text-secondary)]">
          📅
          <input
            type="date"
            value={dateKey}
            max={toDateKey(new Date())}
            onChange={(e) => {
              if (e.target.value) selectDate(e.target.value);
            }}
            className="bg-transparent text-xs font-semibold outline-none"
            aria-label="اختيار تاريخ"
          />
        </label>
      </div>

      {/* Filters — مع عدادات حية */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              filter === f.value
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
            }`}
          >
            {f.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                filter === f.value
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
              }`}
            >
              {counts[f.value]}
            </span>
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <EmptyState
          title="ما فيه طلبات في هذا اليوم"
          description={isToday ? 'أول طلب بيظهر هنا مباشرة.' : 'جرب اختيار يوم آخر.'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <article key={order.id} className="dashboard-card card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold tabular-nums" dir="ltr">order-{order.order_number}</span>
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
                    · {new Date(order.created_at).toLocaleString('ar-BH')}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums">
                  {formatMoney(Number(order.total_amount), currency)}
                </p>
              </div>

              {/* Status stepper — ثابت (عرض فقط): يعكس تسلسل العملية الحقيقية */}
              {order.status !== 'cancelled' ? (
                <div className="px-4 py-2.5" dir="ltr">
                  <div className="flex items-center gap-1">
                    {STATUS_STEPS.map((step, i) => {
                      const idx = STATUS_STEPS.indexOf(order.status);
                      const done = i < idx;
                      const active = i === idx;
                      return (
                        <div key={step} className="flex flex-1 items-center gap-1 last:flex-none">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              done
                                ? 'bg-[var(--color-success)]'
                                : active
                                  ? 'bg-[var(--color-primary)] ring-2 ring-[var(--color-primary-tint)]'
                                  : 'bg-[var(--color-border)]'
                            }`}
                          />
                          {i < STATUS_STEPS.length - 1 && (
                            <span
                              className={`h-0.5 flex-1 rounded ${
                                i < idx ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'
                              }`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--color-text-muted)]" dir="rtl">
                    {ORDER_STATUS_LABELS[order.status]}
                  </p>
                </div>
              ) : (
                <p className="border-b border-[var(--color-border)] px-4 py-2 text-[10px] font-bold text-[var(--color-danger)]">
                  {ORDER_STATUS_LABELS.cancelled}
                </p>
              )}

              {order.order_items && order.order_items.length > 0 && (
                <ul className="space-y-1 px-4 py-3 text-sm">
                  {order.order_items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span>
                        <strong>{item.quantity}×</strong> {item.product_name}
                        {Array.isArray(item.addons) && item.addons.length > 0 && (
                          <span className="block text-xs text-[var(--color-text-muted)]">
                            {(item.addons as OrderItemAddon[])
                              .map((a) => a.name)
                              .join(' · ')}
                          </span>
                        )}
                        {item.notes && (
                          <span className="block text-xs text-[var(--color-text-muted)]">
                            {item.notes}
                          </span>
                        )}
                      </span>
                      <span className="text-[var(--color-text-secondary)] shrink-0 tabular-nums">
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
            </article>
          ))}
        </div>
      )}
      </PullToRefresh>
    </div>
  );
}
