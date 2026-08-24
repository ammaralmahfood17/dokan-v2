'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  type Order,
  type OrderItem,
  type OrderItemStatus,
  type OrderStatus,
} from '@/lib/types';
import { toast } from 'sonner';
import { Btn, Card, Tag, FilterBar, Checkbox, type FilterSegment } from '@/components/dashboard/primitives';
import { Modal } from '@/components/ui/modal';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { KitchenTicket } from '@/components/dashboard/kitchen/kitchen-ticket';
import { PageHeader } from '@/components/dashboard/page-header';
import { useKitchenAudio } from '@/components/dashboard/kitchen/use-kitchen-audio';

type OrderRow = Order & {
  tables?: { number: number } | null;
  order_items?: OrderItem[];
  service_type?: string | null;
  updated_at?: string;
};

type Ticket = {
  order: OrderRow;
  lines: TicketLine[];
  totalQty: number;
};

type TicketLine = {
  key: string;
  items: OrderItem[];
  quantity: number;
  productName: string;
  addons: { name: string }[];
  notes: string | null;
};

const TAB_LABELS: Record<string, string> = {
  all: 'الكل',
  dinein: 'الطاولات',
  drivethru: 'الدرايف ثرو',
  walkin: 'كاونتر',
};

function useTitleFlash() {
  const originalTitleRef = useRef('');
  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopFlash = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }
    if (originalTitleRef.current) document.title = originalTitleRef.current;
  }, []);

  const flashTitle = useCallback(
    (count: number) => {
      if (!originalTitleRef.current) originalTitleRef.current = document.title;
      stopFlash();

      let showAlert = true;
      flashIntervalRef.current = setInterval(() => {
        document.title = showAlert
          ? `🔔 ${count} طلب جديد | ${originalTitleRef.current}`
          : originalTitleRef.current;
        showAlert = !showAlert;
      }, 1000);

      stopTimeoutRef.current = setTimeout(stopFlash, 10000);
    },
    [stopFlash]
  );

  const clearFlash = useCallback(() => {
    stopFlash();
  }, [stopFlash]);

  const syncTitle = useCallback(() => {
    originalTitleRef.current = document.title;
  }, []);

  const resetTitle = useCallback(() => {
    stopFlash();
    originalTitleRef.current = '';
  }, [stopFlash]);

  useEffect(() => {
    return () => {
      stopFlash();
      originalTitleRef.current = '';
    };
  }, [stopFlash]);

  return { flashTitle, clearFlash, syncTitle, resetTitle };
}

export function KitchenClient({
  projectId,
  projectName,
  currency,
  initialOrders,
}: {
  projectId: string;
  projectName: string;
  currency: string;
  initialOrders: OrderRow[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const knownIds = useRef(new Set(initialOrders.map((o) => o.id)));
  const realtimeAddedRef = useRef<Set<string>>(new Set());
  const realtimeTouchedRef = useRef<Set<string>>(new Set());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const recoverTickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; number: number } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('ar-BH-u-nu-latn', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bahrain' })
  );
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<'all' | 'dinein' | 'drivethru' | 'walkin'>('all');

  const { playChime, ensureAudioReady, preloadChime, attachAudioResumeOnInteraction } = useKitchenAudio();
  const { flashTitle, clearFlash, syncTitle, resetTitle } = useTitleFlash();

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('ar-BH-u-nu-latn', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bahrain' }));
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    preloadChime();
    return attachAudioResumeOnInteraction();
  }, [preloadChime, attachAudioResumeOnInteraction]);

  useEffect(() => {
    if (newOrderCount > 0) {
      flashTitle(newOrderCount);
    } else {
      clearFlash();
    }
    return () => clearFlash();
  }, [newOrderCount, flashTitle, clearFlash]);

  useEffect(() => {
    syncTitle();
    return () => resetTitle();
  }, [syncTitle, resetTitle]);

  const notifyNewOrder = useCallback((orderNum: number) => {
    if (soundOnRef.current) {
      void playChime();
      try { navigator.vibrate?.(200); } catch {}
    }
    toast.message('🔔 طلب جديد', {
      description: `#${orderNum}`,
    });
    setNewOrderCount((c) => c + 1);
  }, [playChime]);

  const fullRefresh = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('orders')
        .select('*, tables(number), order_items(*)')
        .eq('project_id', projectId)
        .in('status', ['pending', 'preparing', 'ready'])
        .is('service_type', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!data) return;
      const rows = (data as unknown as OrderRow[]).reverse();

      for (const o of rows) {
        if (!knownIds.current.has(o.id) && o.status === 'pending') {
          notifyNewOrder(o.order_number);
        }
        knownIds.current.add(o.id);
      }
      if (knownIds.current.size > 300) {
        knownIds.current = new Set(rows.map((o) => o.id));
      }
      setOrders((prev) => {
        const byId = new Map(rows.map((o) => [o.id, o]));
        for (const o of prev) {
          if (realtimeAddedRef.current.has(o.id) && !byId.has(o.id)) {
            byId.set(o.id, o);
          }
          const snap = byId.get(o.id);
          if (
            snap &&
            realtimeTouchedRef.current.has(o.id) &&
            (o.updated_at ?? '') >= (snap.updated_at ?? '')
          ) {
            byId.set(o.id, o);
          }
        }
        realtimeAddedRef.current.clear();
        realtimeTouchedRef.current.clear();
        return [...byId.values()];
      });
    } catch (err) {
      console.error('fullRefresh failed', err);
    }
  }, [projectId, notifyNewOrder]);

  const fetchSingleOrder = useCallback(
    async (orderId: string) => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('orders')
          .select('*, tables(number), order_items(*)')
          .eq('id', orderId)
          .eq('project_id', projectId)
          .single();
        return data as OrderRow | null;
      } catch {
        return null;
      }
    },
    [projectId]
  );

  const refetchPendingRef = useRef<Set<string>>(new Set());
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchOrder = useCallback(
    (orderId: string) => {
      refetchPendingRef.current.add(orderId);
      if (refetchTimerRef.current) return;
      refetchTimerRef.current = setTimeout(async () => {
        refetchTimerRef.current = null;
        const ids = [...refetchPendingRef.current];
        refetchPendingRef.current.clear();
        try {
          const fresh = await Promise.all(ids.map((id) => fetchSingleOrder(id)));
          setOrders((prev) => {
            const byId = new Map(fresh.filter(Boolean).map((o) => [o?.id, o]));
            if (byId.size === 0) return prev;
            return prev.map((o) => byId.get(o.id) ?? o);
          });
        } catch {
          // Silently fail
        }
      }, 250);
    },
    [fetchSingleOrder]
  );

  useEffect(() => {
    knownOrderIdsRef.current = new Set(orders.map((o) => o.id));
  }, [orders]);

  useEffect(() => {
    const pending = refetchPendingRef.current;
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      // FIXED: Corrected the syntax error here
      refetchTimerRef.current = null;
      pending.clear();
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`kds-${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          const newOrder = payload.new as Partial<OrderRow>;
          const newId = newOrder.id as string;
          if (!newId || knownIds.current.has(newId)) return;
          if (newOrder.service_type) return;

          try {
            const fullOrder = await fetchSingleOrder(newId);
            if (!fullOrder) return;

            knownIds.current.add(newId);
            // FIXED: Reference to a ref not defined in this scope or misused
            realtimeAddedRef.current.add(newId);
            notifyNewOrder(fullOrder.order_number);
            setOrders((prev) => [fullOrder, ...prev]);
          } catch (err) {
            console.error('fetchSingleOrder failed', err);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = payload.new as Partial<OrderRow>;
          if (updated.id) realtimeTouchedRef.current.add(updated.id);
          setOrders((prev) => {
            if (updated.status === 'delivered' || updated.status === 'cancelled') {
              return prev.filter((o) => o.id !== updated.id);
            }
            return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders' },
        (payload) => {
          const deletedId = payload.old?.id as string;
          setOrders((prev) => prev.filter((o) => o.id !== deletedId));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'order_items' },
        (payload) => {
          const itemOrderId = (payload.new as { order_id: string }).order_id;
          if (!knownOrderIdsRef.current.has(itemOrderId)) return;
          void refetchOrder(itemOrderId);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          recoverTickRef.current = setTimeout(() => void fullRefresh(), 0);
          if (!pollIntervalRef.current) {
            pollIntervalRef.current = setInterval(() => void fullRefresh(), 30000);
          }
        }
      });

    return () => {
      if (recoverTickRef.current) clearTimeout(recoverTickRef.current);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [projectId, fullRefresh, fetchSingleOrder, notifyNewOrder, refetchOrder]);

  const clearBadge = useCallback(() => {
    setNewOrderCount(0);
  }, []);

  const advanceOrder = useCallback(
    async (orderId: string, toItem: OrderItemStatus, toOrder: OrderStatus) => {
      const supabase = createClient();
      const current = orders.find((o) => o.id === orderId)?.status;
      if (!current) return;
      const { data, error } = await supabase.rpc('advance_order_status', {
        p_order_id: orderId,
        p_expected_status: current,
        p_new_status: toOrder,
      });
      if (error) {
        if (error.message.includes('STALE_STATUS')) {
          toast.error('تم تحديث حالة هذا الطلب من جهاز آخر', {
            description: 'جارٍ تحديث الشاشة…',
          });
          await fullRefresh();
        } else {
          toast.error('فشل تحديث حالة الطلب');
        }
        return;
      }
      if (!data) return;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: toOrder,
                order_items: (o.order_items ?? []).map((it) => ({ ...it, status: toItem })),
              }
            : o
        )
      );
    },
    [orders, fullRefresh]
  );

  const deliverOrder = useCallback(
    async (orderId: string) => {
      const supabase = createClient();
      const current = orders.find((o) => o.id === orderId)?.status;
      if (!current) return;
      const { error } = await supabase.rpc('advance_order_status', {
        p_order_id: orderId,
        p_expected_status: current,
        p_new_status: 'delivered',
      });
      if (error) {
        if (error.message.includes('STALE_STATUS')) {
          toast.error('تم تحديث حالة هذا الطلب من جهاز آخر', {
            description: 'جارٍ تحديث الشاشة…',
          });
          await fullRefresh();
        } else {
          toast.error('فشل التحديث');
        }
        return;
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    },
    [orders, fullRefresh]
  );

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
          await fullRefresh();
          return;
        }
        if (!res.ok) {
          toast.error(body.error ?? 'فشل إلغاء الطلب');
          return;
        }
        toast.success('تم إلغاء الطلب');
        await fullRefresh();
      } catch {
        toast.error('فشل الاتصال — حاول مجددًا');
      }
    },
    [projectId, fullRefresh]
  );

  const buildTicket = useCallback((o: OrderRow): Ticket => {
    const lines = new Map<string, TicketLine>();
    let totalQty = 0;
    for (const it of o.order_items ?? []) {
      totalQty += it.quantity;
      const addons = Array.isArray(it.addons) ? (it.addons as { name: string }[]) : [];
      const key = `${it.product_id ?? ''}|${JSON.stringify(addons)}|${it.notes ?? ''}`;
      const existing = lines.get(key);
      if (existing) {
        existing.items.push(it);
        existing.quantity += it.quantity;
      } else {
        lines.set(key, {
          key,
          items: [it],
          quantity: it.quantity,
          productName: it.product_name,
          addons,
          notes: it.notes,
        });
      }
    }
    return { order: o, lines: [...lines.values()], totalQty };
  }, []);

  const startAll = useCallback(async () => {
    const pendingOrders = orders.filter((o) => o.status === 'pending');
    if (!pendingOrders.length) return;
    const supabase = createClient();
    try {
      const results = await Promise.all(
        pendingOrders.map(async (o) => {
          const { data, error } = await supabase.rpc('advance_order_status', {
            p_order_id: o.id,
            p_expected_status: 'pending',
            p_new_status: 'preparing',
          });
          return { orderId: o.id, orderNumber: o.order_number, data, error };
        })
      );
      const failed = results.filter((r) => r.error);
      const staleCount = failed.filter((r) => r.error?.message.includes('STALE_STATUS')).length;
      const otherCount = failed.length - staleCount;
      if (staleCount > 0) {
        toast.error(`تغيّرت حالة ${staleCount} من الطلبات على جهاز آخر`, {
          description: 'لم يتم تشغيلها — جارٍ تحديث الشاشة…',
        });
      }
      if (otherCount > 0) {
        toast.error(`فشل تشغيل ${otherCount} من الطلبات`);
      }
      if (failed.length > 0) {
        await fullRefresh();
      } else {
        setOrders((prev) =>
          prev.map((o) =>
            o.status === 'pending'
              ? {
                  ...o,
                  status: 'preparing',
                  order_items: (o.order_items ?? []).map((it) => ({ ...it, status: 'preparing' })),
                }
              : o
          )
        );
      }
    } catch {
      toast.error('فشل الاتصال — جارٍ تحديث الشاشة…');
      await fullRefresh();
    }
  }, [orders, fullRefresh]);

  const tickets = orders.map(buildTicket);

  const countByTab = {
    all: tickets.length,
    dinein: tickets.filter((t) => t.order.type === 'dinein').length,
    drivethru: tickets.filter((t) => t.order.type === 'drivethru').length,
    walkin: tickets.filter((t) => t.order.type === 'walkin').length,
  };

  const visibleTickets =
    tab === 'all'
      ? tickets
      : tickets.filter((t) => (t.order.type ?? null) === tab);

  const stageRank: Record<OrderStatus, number> = {
    pending: 0,
    preparing: 1,
    ready: 2,
    delivered: 3,
    cancelled: 4,
  };
  const sorted = [...visibleTickets].sort((a, b) => {
    const ra = stageRank[a.order.status] ?? 0;
    const rb = stageRank[b.order.status] ?? 0;
    if (ra !== rb) return ra - rb;
    return a.order.created_at.localeCompare(b.order.created_at);
  });

  const pendingCount = tickets.filter((t) => t.order.status === 'pending').length;

  const categorySegments: FilterSegment[] = [
    { key: 'all', label: TAB_LABELS.all, count: String(countByTab.all).padStart(2, '0') },
    { key: 'dinein', label: TAB_LABELS.dinein, count: String(countByTab.dinein).padStart(2, '0') },
    { key: 'drivethru', label: TAB_LABELS.drivethru, count: String(countByTab.drivethru).padStart(2, '0') },
    { key: 'walkin', label: TAB_LABELS.walkin, count: String(countByTab.walkin).padStart(2, '0') },
  ];

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]" onClick={clearBadge}>
      <PullToRefresh onRefresh={fullRefresh}>
      <div className="page">
        <PageHeader
          crumb={['دكان', 'المبيعات', 'شاشة المطبخ']}
          title="شاشة المطبخ"
          sub={`${projectName} · ${time}`}
          primary={
            <>
              {pendingCount > 0 && (
                <Btn variant="gold" size="md" onClick={startAll} className="min-h-[44px]">
                  ⚡ بدء الكل ({pendingCount})
                </Btn>
              )}
              <Btn variant="secondary" size="md" onClick={(e) => {
                e.stopPropagation();
                setSoundOn((s) => !s);
              }}
                aria-label={soundOn ? 'كتم الصوت' : 'تفعيل الصوت'}
                aria-pressed={soundOn}
                className="min-h-[44px]"
              >
                <span aria-hidden="true">{soundOn ? '🔊' : '🔇'}</span>
              </Btn>
              <Btn variant="secondary" size="md" onClick={(e) => {
                e.stopPropagation();
                if (!soundOn) setSoundOn(true);
                void playChime();
                toast.success('🔔 صوت التنبيه', { description: 'صوت الإشعار يعمل ✅' });
              }}
                title="اختبار الصوت"
                className="min-h-[44px]"
              >
                <span aria-hidden="true">🔊</span> اختبار
              </Btn>
            </>
          }
        />
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {pendingCount > 0 ? `وصل ${pendingCount} طلبات جديدة` : ''}
        </div>

        <FilterBar
          segments={categorySegments}
          active={tab}
          onChange={(k) => setTab(k as typeof tab)}
        />

        <main
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          role="region"
          aria-label="تذاكر المطبخ"
          tabIndex={0}
        >
          {sorted.length === 0 && (
            <div className="col-span-full flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]">
              <span className="text-2xl">📡</span>
              <span className="mt-2 text-[13px]">بانتظار الطلبات…</span>
            </div>
          )}
          {sorted.map((t) => (
            <KitchenTicket
              key={t.order.id}
              ticket={t}
              now={now}
              currency={currency}
              onStart={() => advanceOrder(t.order.id, 'preparing', 'preparing')}
              onReady={() => advanceOrder(t.order.id, 'ready', 'ready')}
              onDeliver={() => deliverOrder(t.order.id)}
              onCancel={() => setCancelTarget({ id: t.order.id, number: t.order.order_number })}
            />
          ))}
        </main>
      </div>

      </PullToRefresh>

      {cancelTarget && (
        <Modal title="إلغاء الطلب" onClose={() => setCancelTarget(null)}>
          <div className="text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">
              هل أنت متأكد من إلغاء الطلب{' '}
              <strong className="text-[var(--color-text)]">#{String(cancelTarget.number).padStart(3, '0')}</strong>؟
            </p>
            <div className="mt-5 flex gap-2">
              <Btn variant="danger" className="w-full" onClick={() => void cancelOrder(cancelTarget.id)}>
                نعم، إلغاء
              </Btn>
              <Btn variant="secondary" onClick={() => setCancelTarget(null)}>
                تراجع
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
