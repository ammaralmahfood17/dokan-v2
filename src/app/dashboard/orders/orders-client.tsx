'use client';

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Search, X, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';
import { Tag } from '@/components/dashboard/primitives';
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
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/dashboard/page-header';
import { toast } from 'sonner';

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
  // بحث فوري — رقم الطلب / اسم المنتج / طاولة
  const [query, setQuery] = useState('');
  // FIX-P-002: تأجيل الفلترة — لا تحجب الـ main thread أثناء الكتابة
  const deferredQuery = useDeferredValue(query);
  // تحميل المزيد — إزاحة للصفحة التالية (50/صفحة)
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // فرز: أحدث / أقدم / أعلى مبلغ
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount'>('newest');

  const isToday = dateKey === toDateKey(new Date());
  const mountedRef = useRef(false);
  // Day total is a dedicated aggregate — computing it from the fetched page
  // understated sales on busy days once the page exceeded 50 orders.
  const [dayTotal, setDayTotal] = useState(0);
  // Cancel confirmation target (audit HIGH-2: cancel UI missing client-side).
  const [cancelTarget, setCancelTarget] = useState<{ id: string; number: number } | null>(null);

  const refresh = useCallback(
    async (key?: string, append = false) => {
      const target = key ?? dateKey;
      const { start, end } = dayRange(target);
      const supabase = createClient();
      try {
        const [{ data }, { data: dayTotal }] = await Promise.all([
          supabase
            .from('orders')
            .select('*, tables(number, slug), order_items(*)')
            .eq('project_id', projectId)
            .is('service_type', null) // null = real order (not waiter/bill)
            .gte('created_at', start.toISOString())
            .lt('created_at', end.toISOString())
            .order('created_at', { ascending: false })
            .range(0, 49),
          // Bounded aggregate (audit MEDIUM): the old query fetched EVERY
          // total_amount row of the day to sum client-side — unbounded on
          // busy days, and it raced the 143KB payload cap. Server-side SUM.
          supabase.rpc('sum_order_totals', {
            p_project: projectId,
            p_start: start.toISOString(),
            p_end: end.toISOString(),
          }),
        ]);
        if (data) {
          setOrders((prev) => {
            // When appending, merge by id (realtime may have added rows).
            if (!append) return data as unknown as OrderRow[];
            const byId = new Map(prev.map((o) => [o.id, o]));
            for (const o of data as unknown as OrderRow[]) byId.set(o.id, o);
            return [...byId.values()];
          });
          // Fewer than 50 rows → no more pages for this day.
          setHasMore(data.length === 50);
        }
        setDayTotal(Number(dayTotal ?? 0));
      } catch {
        // Silently fail — user can retry via PullToRefresh.
      }
    },
    [projectId, dateKey]
  );

  // Cancel an order (audit HIGH-2) — server re-verifies ownership + status
  // inside the UPDATE; 409 = status changed meanwhile (don't claim success).
  const cancelOrder = useCallback(
    async (orderId: string) => {
      setCancelTarget(null);
      try {
        const res = await fetch('/api/pos/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, projectId }),
        });
        const body = (await res.json()) as { error?: string };
        if (res.status === 409) {
          toast.error(body.error ?? 'تعذر الإلغاء', {
            description: 'تغيرت حالة الطلب — جارٍ تحديث الشاشة…',
          });
          await refresh();
          return;
        }
        if (!res.ok) {
          toast.error(body.error ?? 'فشل إلغاء الطلب');
          return;
        }
        toast.success('تم إلغاء الطلب');
        await refresh();
      } catch {
        toast.error('فشل الاتصال — حاول مجددًا');
      }
    },
    [projectId, refresh]
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { start, end } = dayRange(dateKey);
      const supabase = createClient();
      const { data } = await supabase
        .from('orders')
        .select('*, tables(number, slug), order_items(*)')
        .eq('project_id', projectId)
        .is('service_type', null)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: false })
        .range(orders.length, orders.length + 49);
      if (data) {
        const byId = new Map(orders.map((o) => [o.id, o]));
        for (const o of data as unknown as OrderRow[]) byId.set(o.id, o);
        setOrders([...byId.values()]);
        setHasMore(data.length === 50);
      }
    } catch {
      // Silently fail — user can retry via PullToRefresh.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, dateKey, orders, projectId]);

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
  // M1: status callback + 30s poll fallback (same interval as KDS) so a
  // dropped realtime connection never leaves the page silently stale.
  const [realtimeOffline, setRealtimeOffline] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let channelActive = true;

    const stopPoll = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const channel = supabase
      .channel(`orders-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          // NOTE: no project_id filter here. RLS (orders_staff_* policies)
          // already isolates events to the caller's projects — verified
          // live. Combining filter+RLS on the same column made realtime
          // drop ALL events (kitchen orders took up to 30s to appear).
        },
        () => {
          if (!isToday) return;
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => void refresh(), 500);
        }
      )
      .subscribe((status) => {
        if (!channelActive) return;
        if (status === 'SUBSCRIBED') {
          // Reconnected — clear the banner and stop the fallback poll.
          setRealtimeOffline(false);
          stopPoll();
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setRealtimeOffline(true);
          // Poll fallback: only while realtime is down (no double-fetching).
          if (!pollInterval) {
            pollInterval = setInterval(() => void refresh(), 30000);
          }
        }
      });

    return () => {
      channelActive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      stopPoll();
      void supabase.removeChannel(channel);
    };
  }, [projectId, refresh, isToday]);

  const filtered = useMemo(() => {
    let list = orders;
    if (filter !== 'all') list = list.filter((o) => o.status === filter);
    // بحث فوري: رقم الطلب / اسم المنتج / طاولة (FIX-P-002: deferredQuery)
    const q = deferredQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        if (String(o.order_number).includes(q)) return true;
        if (o.tables && String(o.tables.number).includes(q)) return true;
        return (o.order_items ?? []).some((it) =>
          (it.product_name ?? '').toLowerCase().includes(q)
        );
      });
    }
    // فرز
    const sorted = [...list];
    if (sortBy === 'oldest') {
      sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    } else if (sortBy === 'amount') {
      sorted.sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
    }
    // newest = الترتيب الافتراضي من الـ query (created_at desc)
    return sorted;
  }, [orders, filter, deferredQuery, sortBy]);

  // عدادات حية لكل حالة — معلومة حقيقة من البيانات المعروضة
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

  const statusTag: Record<OrderStatus, { bg: string; fg: string }> = {
    pending: { bg: '#E6EEF6', fg: '#3B6FA0' },
    preparing: { bg: '#FBF0DD', fg: '#D98E2C' },
    ready: { bg: '#E5F3EA', fg: '#2F8F5B' },
    delivered: { bg: '#EEF0EC', fg: '#66716D' },
    cancelled: { bg: '#FBE9E7', fg: '#C0483D' },
  };

  // Row whose items are expanded (items list + stepper + cancel).
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggleExpanded = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  return (
      <div className="page">
      <PullToRefresh onRefresh={() => void refresh()}>
      <PageHeader
        crumb={['دكان', 'المبيعات', 'الطلبات']}
        title="الطلبات"
        sub={`${counts.all.toLocaleString('ar-BH-u-nu-latn')} طلب · مبيعات ${formatMoney(dayTotal, currency)}`}
      />

      {realtimeOffline && (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/20 bg-[var(--color-danger-tint)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]"
        >
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--color-danger)]" />
          انقطع الاتصال المباشر — يُحدَّث تلقائيًا كل 30 ثانية
        </div>
      )}

      {/* Date picker — اليوم/أمس + تقويم (لا مستقبل) */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => selectDayOffset(0)}
          aria-pressed={isToday}
          className={`filter-seg ${isToday ? 'active' : ''}`}
        >
          اليوم
        </button>
        <button
          type="button"
          onClick={() => selectDayOffset(-1)}
          className="filter-seg"
        >
          أمس
        </button>
        <label className="filter-seg cursor-pointer">
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

      {/* Filters + search + sort */}
      <div className="filter-bar">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={`filter-seg ${filter === f.value ? 'active' : ''}`}
            >
              {f.label}
              <span className="count">{counts[f.value]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="search"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث…"
              aria-label="ابحث في الطلبات"
              maxLength={60}
              className="input h-9 w-48 min-w-[140px] ps-9 pe-8 text-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="مسح البحث"
                className="absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <label className="filter-seg cursor-pointer">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'amount')}
              aria-label="ترتيب الطلبات"
              className="bg-transparent text-xs font-semibold outline-none"
            >
              <option value="newest">الأحدث</option>
              <option value="oldest">الأقدم</option>
              <option value="amount">الأعلى مبلغًا</option>
            </select>
          </label>
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState
          title="ما فيه طلبات في هذا اليوم"
          description={isToday ? 'أول طلب بيظهر هنا مباشرة.' : 'جرب اختيار يوم آخر.'}
        />
      ) : (
        <div className="table-card">
          <div className="overflow-x-auto">
            <table className="ref-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>الطاولة</th>
                  <th>القناة</th>
                  <th>الأصناف</th>
                  <th>الوقت</th>
                  <th>الإجمالي</th>
                  <th>الحالة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const st = statusTag[order.status];
                  const isExpanded = expanded === order.id;
                  return (
                    <Fragment key={order.id}>
                      <tr className="cursor-pointer" onClick={() => toggleExpanded(order.id)}>
                        <td>
                          <span className="font-bold text-[var(--color-primary)]" dir="ltr">
                            order-{order.order_number}
                          </span>
                        </td>
                        <td className="font-medium">
                          {order.tables ? `طاولة ${order.tables.number}` : 'بدون طاولة'}
                        </td>
                        <td>
                          <Tag bg={order.type === 'dinein' ? '#E6EEF6' : '#F6ECD8'} fg={order.type === 'dinein' ? '#3B6FA0' : '#C9973B'}>
                            {ORDER_TYPE_LABELS[order.type]}
                          </Tag>
                        </td>
                        <td className="text-[var(--color-text-secondary)]">
                          {(order.order_items ?? []).reduce((n, it) => n + it.quantity, 0)} أصناف
                        </td>
                        <td className="text-[var(--color-text-muted)]">
                          {new Date(order.created_at).toLocaleString('ar-BH-u-nu-latn', { timeZone: 'Asia/Bahrain', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="font-bold tabular-nums">{formatMoney(Number(order.total_amount), currency)}</td>
                        <td>
                          <Tag bg={st.bg} fg={st.fg} dot>{ORDER_STATUS_LABELS[order.status]}</Tag>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(order.id); }}
                            aria-label={isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="!border-0 !p-0">
                            <div className="bg-[var(--color-bg)] px-5 py-4">
                              {order.status !== 'cancelled' ? (
                                <div className="mb-3 flex items-center gap-1" dir="ltr">
                                  {STATUS_STEPS.map((step, i) => {
                                    const idx = STATUS_STEPS.indexOf(order.status);
                                    const done = i < idx;
                                    const active = i === idx;
                                    return (
                                      <div key={step} className="flex flex-1 items-center gap-1 last:flex-none">
                                        <span className={`h-2 w-2 shrink-0 rounded-full ${done ? 'bg-[var(--color-success)]' : active ? 'bg-[var(--color-primary)] ring-2 ring-[var(--color-primary-tint)]' : 'bg-[var(--color-border)]'}`} />
                                        {i < STATUS_STEPS.length - 1 && (
                                          <span className={`h-0.5 flex-1 rounded ${i < idx ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`} />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="mb-3 text-[11px] font-bold text-[var(--color-danger)]">{ORDER_STATUS_LABELS.cancelled}</p>
                              )}

                              {order.order_items && order.order_items.length > 0 && (
                                <ul className="mb-3 space-y-1 text-sm">
                                  {order.order_items.map((item) => (
                                    <li key={item.id} className="flex justify-between gap-2">
                                      <span>
                                        <strong>{item.quantity}×</strong> {item.product_name}
                                        {Array.isArray(item.addons) && item.addons.length > 0 && (
                                          <span className="block text-xs text-[var(--color-text-muted)]">
                                            {(item.addons as OrderItemAddon[]).map((a) => a.name).join(' · ')}
                                          </span>
                                        )}
                                        {item.notes && (
                                          <span className="block text-xs text-[var(--color-text-muted)]">{item.notes}</span>
                                        )}
                                      </span>
                                      <span className="shrink-0 tabular-nums text-[var(--color-text-secondary)]">
                                        {formatMoney(Number(item.unit_price) * item.quantity, currency)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {order.notes && (
                                <p className="mb-3 text-xs text-[var(--color-text-secondary)]">{order.notes}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] text-[var(--color-text-muted)]">
                                  {new Date(order.created_at).toLocaleString('ar-BH-u-nu-latn', { timeZone: 'Asia/Bahrain', dateStyle: 'medium', timeStyle: 'short' })}
                                </p>
                                {['pending', 'preparing', 'ready'].includes(order.status) && (
                                  <button
                                    type="button"
                                    onClick={() => setCancelTarget({ id: order.id, number: order.order_number })}
                                    className="btn btn-danger btn-sm"
                                  >
                                    إلغاء الطلب
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-pager">
            <p>عرض ١–{filtered.length.toLocaleString('ar-BH-u-nu-latn')} من {counts.all.toLocaleString('ar-BH-u-nu-latn')}</p>
            {hasMore && filtered.length >= 50 && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="flex h-8 items-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                {loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'}
              </button>
            )}
          </div>
        </div>
      )}
      </PullToRefresh>

      {/* Cancel confirmation (Modal — window.confirm silently fails on iOS PWA) */}
      {cancelTarget && (
        <Modal title="إلغاء الطلب" onClose={() => setCancelTarget(null)}>
          <p className="text-sm text-[var(--color-text-secondary)]">
            هل أنت متأكد من إلغاء الطلب{' '}
            <strong className="text-[var(--color-text)]" dir="ltr">
              order-{cancelTarget.number}
            </strong>
            ؟
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => void cancelOrder(cancelTarget.id)}
              className="min-h-[44px] flex-1 rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 text-sm font-bold text-white transition-colors hover:opacity-90"
            >
              نعم، إلغاء
            </button>
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              className="min-h-[44px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-transparent px-4 text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunken)]"
            >
              تراجع
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
