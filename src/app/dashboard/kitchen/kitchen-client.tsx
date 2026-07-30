'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';

type OrderRow = Order & {
  tables?: { number: number } | null;
  order_items?: OrderItem[];
};

const OVERDUE_MIN_PENDING = 15;  // red if pending > 15 min
const OVERDUE_MIN_PREPARING = 30; // amber if preparing > 30 min

function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;

    // Singleton AudioContext — reused, never created fresh
    if (!playChime._ctx || playChime._ctx.state === 'closed') {
      playChime._ctx = new Ctx();
    }
    const ctx = playChime._ctx;

    // If suspended (autoplay policy), try to resume
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    // Try loading the audio file first (nicer sound)
    try {
      if (!playChime._buf) {
        playChime._loading = true;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/sounds/notification.wav', true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => {
          ctx.decodeAudioData(xhr.response).then((buf) => {
            playChime._buf = buf;
            playChime._loading = false;
            playFromBuffer(ctx, buf);
          }).catch(() => { playChime._loading = false; });
        };
        xhr.onerror = () => { playChime._loading = false; };
        xhr.send();
      } else if (!playChime._loading) {
        playFromBuffer(ctx, playChime._buf);
      }
    } catch {
      // Fallback: oscillator beep
      fallbackBeep(ctx);
    }
  } catch {
    // ignore audio failures
  }
}

/** Cache for singleton AudioContext and decoded audio buffer */
playChime._ctx = null as AudioContext | null;
playChime._buf = null as AudioBuffer | null;
playChime._loading = false as boolean;

function playFromBuffer(ctx: AudioContext, buf: AudioBuffer) {
  const source = ctx.createBufferSource();
  source.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

function fallbackBeep(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.value = 0.08;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.stop(ctx.currentTime + 0.4);
}

/** Resume AudioContext on first user interaction (solves autoplay block) */
function resumeAudioCtxOnInteraction() {
  const handler = () => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    if (playChime._ctx?.state === 'suspended') {
      void playChime._ctx.resume();
    } else if (!playChime._ctx) {
      playChime._ctx = new Ctx();
    }
    document.removeEventListener('click', handler);
    document.removeEventListener('touchstart', handler);
    document.removeEventListener('keydown', handler);
  };
  document.addEventListener('click', handler, { once: true });
  document.addEventListener('touchstart', handler, { once: true });
  document.addEventListener('keydown', handler, { once: true });
}

export function KitchenClient({
  projectId,
  projectName,
  initialOrders,
}: {
  projectId: string;
  projectName: string;
  initialOrders: OrderRow[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const knownIds = useRef(new Set(initialOrders.map((o) => o.id)));
  const [soundOn, setSoundOn] = useState(true);
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }));
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Full refresh fallback (kept in case realtime misses something)
  const fullRefresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('orders')
      .select('*, tables(number), order_items(*)')
      .eq('project_id', projectId)
      .in('status', ['pending', 'preparing', 'ready'])
      .is('service_type', null)
      .order('created_at', { ascending: true })
      .limit(50);

    if (!data) return;
    const rows = data as unknown as OrderRow[];

    for (const o of rows) {
      if (!knownIds.current.has(o.id) && o.status === 'pending') {
        if (soundOn) {
          playChime();
          try { navigator.vibrate?.(200); } catch {}
        }
        toast.message('طلب جديد', { description: `order-${o.order_number}` });
      }
      knownIds.current.add(o.id);
    }
    setOrders(rows);
  }, [projectId, soundOn]);

  // Fetch a single new order with its relations (faster than full re-fetch)
  const fetchSingleOrder = useCallback(
    async (orderId: string) => {
      const supabase = createClient();
      const { data } = await supabase
        .from('orders')
        .select('*, tables(number), order_items(*)')
        .eq('id', orderId)
        .single();
      return data as OrderRow | null;
    },
    []
  );

  // Realtime: listen for INSERT, UPDATE, DELETE on orders
  useEffect(() => {
    resumeAudioCtxOnInteraction();

    const supabase = createClient();

    const channel = supabase
      .channel(`kds-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          const newOrder = payload.new as Partial<OrderRow>;
          const newId = newOrder.id as string;
          if (!newId || knownIds.current.has(newId)) return;

          // Skip service requests (waiter/bill calls)
          if ((newOrder as any).service_type) return;

          // Fetch the full order with relations (fast single query)
          const fullOrder = await fetchSingleOrder(newId);
          if (!fullOrder) return;

          knownIds.current.add(newId);
          if (soundOn) {
            playChime();
            // Subtle vibration if supported
            try { navigator.vibrate?.(200); } catch {}
          }
          toast.message('طلب جديد', {
            description: `order-${fullOrder.order_number}`,
          });
          // Prepend new order so it appears immediately in "جديد" column
          setOrders((prev) => [fullOrder, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const updated = payload.new as Partial<OrderRow>;
          setOrders((prev) => {
            // If status changed to delivered/cancelled, remove card
            if (
              updated.status === 'delivered' ||
              updated.status === 'cancelled'
            ) {
              return prev.filter((o) => o.id !== updated.id);
            }
            // Otherwise update in-place
            return prev.map((o) =>
              o.id === updated.id ? { ...o, ...updated } : o
            );
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'orders',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const deletedId = payload.old?.id as string;
          setOrders((prev) => prev.filter((o) => o.id !== deletedId));
        }
      )
      .subscribe();

    // Fallback polling every 30s (in case realtime drops events)
    const interval = setInterval(() => void fullRefresh(), 30000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [projectId, fullRefresh, fetchSingleOrder, soundOn]);

  async function setStatus(orderId: string, status: OrderStatus) {
    // Cancellation goes through the server API for validation + audit
    if (status === 'cancelled') {
      try {
        const res = await fetch('/api/pos/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error || 'فشل إلغاء الطلب');
          return;
        }
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        return;
      } catch {
        toast.error('تعذّر الاتصال');
        return;
      }
    }

    // Normal status transitions via direct DB (RLS-protected)
    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);
    if (error) {
      toast.error('فشل التحديث');
      return;
    }
    if (status === 'delivered') {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } else {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      );
    }
  }

  const pending = orders.filter((o) => o.status === 'pending');
  const preparing = orders.filter((o) => o.status === 'preparing');
  const ready = orders.filter((o) => o.status === 'ready');

  return (
    <div className="kds-root">
      {/* Topbar — مطابقة للتصميم */}
      <div className="flex items-center justify-between border-b border-[#1E2330] px-6 py-4">
        <span className="text-sm font-bold text-white">
          شاشة المطبخ — {projectName}
        </span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#9CA3AF]">{time}</span>
          <button
            type="button"
            onClick={() => setSoundOn((s) => !s)}
            className="rounded-[8px] border border-[var(--color-kds-border)] bg-[var(--color-kds-surface)] px-3 py-1.5 text-xs font-semibold text-[#9CA3AF]"
          >
            الصوت: {soundOn ? 'تشغيل' : 'إيقاف'}
          </button>
        </div>
      </div>

      {/* Kanban columns — مطابقة للتصميم */}
      <div className="flex gap-4 overflow-x-auto p-5 lg:grid lg:grid-cols-3">
        <KdsColumn title="جديد" count={pending.length}>
          {pending.map((o) => (
            <KdsCard
              key={o.id}
              order={o}
              now={now}
              onAdvance={() => setStatus(o.id, 'preparing')}
              advanceLabel="بدء التجهيز"
              onCancel={() => setStatus(o.id, 'cancelled')}
            />
          ))}
        </KdsColumn>
        <KdsColumn title="قيد التجهيز" count={preparing.length}>
          {preparing.map((o) => (
            <KdsCard
              key={o.id}
              order={o}
              now={now}
              onAdvance={() => setStatus(o.id, 'ready')}
              advanceLabel="تم التجهيز"
              onCancel={() => setStatus(o.id, 'cancelled')}
            />
          ))}
        </KdsColumn>
        <KdsColumn title="جاهز" count={ready.length}>
          {ready.map((o) => (
            <KdsCard
              key={o.id}
              order={o}
              now={now}
              onAdvance={() => setStatus(o.id, 'delivered')}
              advanceLabel="تسليم"
              onCancel={() => setStatus(o.id, 'cancelled')}
            />
          ))}
        </KdsColumn>
      </div>
    </div>
  );
}

function KdsColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-[260px] flex-1">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[11.5px] font-bold uppercase tracking-[0.5px] text-[#9CA3AF]">
          {title}
        </h2>
        <span className="rounded-full bg-[#1E2330] px-2 py-0.5 text-xs font-bold text-white">
          {count}
        </span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function KdsCard({
  order,
  now,
  onAdvance,
  advanceLabel,
  onCancel,
}: {
  order: OrderRow;
  now: number;
  onAdvance: () => void;
  advanceLabel: string;
  onCancel: () => void;
}) {
  const mins = Math.floor(
    (now - new Date(order.created_at).getTime()) / 60000
  );

  // Overdue logic
  let overdueClass = '';
  if (order.status === 'pending' && mins >= OVERDUE_MIN_PENDING) {
    overdueClass = 'kds-overdue';
  } else if (order.status === 'preparing' && mins >= OVERDUE_MIN_PREPARING) {
    overdueClass = 'kds-taking-long';
  }

  return (
    <article className={`kds-card p-3 ${order.status} ${overdueClass}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-extrabold text-white" dir="ltr">
            #{order.order_number}
          </p>
          <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
            {order.tables
              ? `طاولة ${order.tables.number}`
              : ORDER_TYPE_LABELS[order.type]}{' '}
            · <span className={overdueClass ? 'font-bold text-[#EF4444]' : 'text-[#9CA3AF]'}>{mins} د</span>
            {overdueClass && (
              <span className="mr-1 font-bold text-[#EF4444]">متأخر!</span>
            )}
          </p>
        </div>
        <span className="rounded bg-[#1E2330] px-2 py-0.5 text-[10px] font-bold text-[#9CA3AF]">
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>
      <ul className="mb-3 space-y-1">
        {(order.order_items ?? []).map((item) => (
          <li key={item.id} className="text-[12px] leading-[1.9] text-[#C6CAD3]">
            <strong className="text-white">{item.quantity}×</strong>{' '}
            {item.product_name}
            {Array.isArray(item.addons) && item.addons.length > 0 && (
              <span className="block text-[11px] text-[#6B7280]">
                {(item.addons as { name: string }[])
                  .map((a) => a.name)
                  .join(' · ')}
              </span>
            )}
            {item.notes && (
              <span className="block text-[11px] text-[#F59E0B]/80">
                {item.notes}
              </span>
            )}
          </li>
        ))}
      </ul>
      {order.notes && (
        <p className="mb-3 rounded bg-[#1E2330]/50 px-2 py-1 text-[11px] text-[#F59E0B]/80">
          {order.notes}
        </p>
      )}
      {/* Touch targets ≥ 48px */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAdvance}
          className="min-h-[44px] flex-1 rounded-[7px] border border-[#323A4D] bg-[#232838] px-4 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2a3040]"
        >
          {advanceLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] min-w-[80px] rounded-[7px] border border-[#323A4D] bg-[#232838] px-4 text-[11.5px] font-semibold text-[#9CA3AF] transition-colors hover:bg-[#2a3040]"
        >
          إلغاء
        </button>
      </div>
    </article>
  );
}
