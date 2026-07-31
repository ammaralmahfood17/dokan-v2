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
import { toast } from 'sonner';

type OrderRow = Order & {
  tables?: { number: number } | null;
  order_items?: OrderItem[];
};

const OVERDUE_MIN_PENDING = 15;
const OVERDUE_MIN_PREPARING = 30;

/* ========== Audio System Hook ========== */

function useAudioSystem() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chimeBufRef = useRef<AudioBuffer | null>(null);
  const loadingChimeRef = useRef(false);
  const chimeQueueRef = useRef<(() => void)[]>([]);
  // Holds the latest playChime — lets the chime queue call it without the
  // callback self-referencing its own const (TDZ lint).
  const playChimeRef = useRef<() => void>(() => {});

  const getAudioCtx = useCallback((): AudioContext | null => {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new Ctor();
    }
    return audioCtxRef.current;
  }, []);

  const ensureAudioReady = useCallback((): boolean => {
    const ctx = getAudioCtx();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      return false;
    }
    return ctx.state === 'running';
  }, [getAudioCtx]);

  const playFallbackChime = useCallback((ctx: AudioContext) => {
    const master = ctx.createGain();
    master.gain.value = 0.15;
    master.connect(ctx.destination);

    const notes = [660, 880, 1100];
    const startTime = ctx.currentTime + 0.05;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      noteGain.gain.setValueAtTime(0, startTime + i * 0.12);
      noteGain.gain.linearRampToValueAtTime(1, startTime + i * 0.12 + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + i * 0.12 + 0.15);
      osc.connect(noteGain);
      noteGain.connect(master);
      osc.start(startTime + i * 0.12);
      osc.stop(startTime + i * 0.12 + 0.15);
    });
  }, []);

  const preloadChime = useCallback(() => {
    if (chimeBufRef.current || loadingChimeRef.current) return;
    loadingChimeRef.current = true;
    const ctx = getAudioCtx();
    if (!ctx) { loadingChimeRef.current = false; return; }

    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/sounds/notification.wav', true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      ctx.decodeAudioData(xhr.response)
        .then((buf) => {
          chimeBufRef.current = buf;
          loadingChimeRef.current = false;
          // Flush queue
          const q = chimeQueueRef.current.slice();
          chimeQueueRef.current = [];
          q.forEach((fn) => fn());
        })
        .catch(() => { loadingChimeRef.current = false; chimeQueueRef.current = []; });
    };
    xhr.onerror = () => { loadingChimeRef.current = false; chimeQueueRef.current = []; };
    xhr.send();
  }, [getAudioCtx]);

  const playChime = useCallback(() => {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // If we have the decoded buffer, play it
      if (chimeBufRef.current) {
        const source = ctx.createBufferSource();
        source.buffer = chimeBufRef.current;
        const gain = ctx.createGain();
        gain.gain.value = 0.6;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        return;
      }

      // If still loading, queue for retry — via playChimeRef to avoid
      // self-referencing the const inside its own initializer (TDZ lint).
      if (loadingChimeRef.current) {
        chimeQueueRef.current.push(() => playChimeRef.current());
        return;
      }

      // Start preloading for next time
      preloadChime();

      // Fallback: 3-tone restaurant chime
      playFallbackChime(ctx);
    } catch {
      // ignore
    }
  }, [getAudioCtx, preloadChime, playFallbackChime]);

  // Keep the ref pointing at the latest playChime so queued retries (pushed
  // while the .wav was still loading) always invoke the current closure.
  useEffect(() => {
    playChimeRef.current = playChime;
  });

  const attachAudioResumeOnInteraction = useCallback(() => {
    const handler = () => {
      const ctx = getAudioCtx();
      if (ctx?.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };
    document.addEventListener('click', handler);
    document.addEventListener('touchstart', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [getAudioCtx]);

  return { playChime, ensureAudioReady, preloadChime, attachAudioResumeOnInteraction };
}

/* ========== Page title flashing (ref-based, tied to component) ========== */

function useTitleFlash() {
  const originalTitleRef = useRef('');
  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flashTitle = useCallback((count: number) => {
    if (!originalTitleRef.current) originalTitleRef.current = document.title;
    if (flashIntervalRef.current) clearInterval(flashIntervalRef.current);

    let showAlert = true;
    flashIntervalRef.current = setInterval(() => {
      document.title = showAlert
        ? `🔔 ${count} طلب جديد | ${originalTitleRef.current}`
        : originalTitleRef.current;
      showAlert = !showAlert;
    }, 1000);

    // Stop flashing after 10 seconds
    setTimeout(() => {
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = null;
      }
      document.title = originalTitleRef.current;
    }, 10000);
  }, []);

  const clearFlash = useCallback(() => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }
    if (originalTitleRef.current) document.title = originalTitleRef.current;
  }, []);

  const syncTitle = useCallback(() => {
    originalTitleRef.current = document.title;
  }, []);

  const resetTitle = useCallback(() => {
    clearFlash();
    originalTitleRef.current = '';
  }, [clearFlash]);

  return { flashTitle, clearFlash, syncTitle, resetTitle };
}

/* ========== Component ========== */

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
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
  );
  const [now, setNow] = useState(() => Date.now());
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const { playChime, ensureAudioReady, preloadChime, attachAudioResumeOnInteraction } = useAudioSystem();
  const { flashTitle, clearFlash, syncTitle, resetTitle } = useTitleFlash();

  // Clock + tick — كل دقيقة (60s) لأن العرض بالدقائق
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }));
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Preload chime on mount
  useEffect(() => {
    preloadChime();
    return attachAudioResumeOnInteraction();
  }, [preloadChime, attachAudioResumeOnInteraction]);

  // Flash title when new orders come in
  useEffect(() => {
    if (newOrderCount > 0) {
      flashTitle(newOrderCount);
    } else {
      clearFlash();
    }
    return () => clearFlash();
  }, [newOrderCount, flashTitle, clearFlash]);

  // Sync originalTitle on mount
  useEffect(() => {
    syncTitle();
    return () => resetTitle();
  }, [syncTitle, resetTitle]);

  // Notification helper
  const notifyNewOrder = useCallback((orderNum: number) => {
    if (soundOn) {
      playChime();
      try { navigator.vibrate?.(200); } catch {}
    }
    toast.message('🔔 طلب جديد', {
      description: `#${orderNum}`,
    });
    setNewOrderCount((c) => c + 1);
  }, [soundOn, playChime]);

  // Full refresh fallback
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
        notifyNewOrder(o.order_number);
      }
      knownIds.current.add(o.id);
    }
    setOrders(rows);
  }, [projectId, notifyNewOrder]);

  // Fetch single order
  const fetchSingleOrder = useCallback(async (orderId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('orders')
      .select('*, tables(number), order_items(*)')
      .eq('id', orderId)
      .single();
    return data as OrderRow | null;
  }, []);

  // Realtime
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`kds-${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `project_id=eq.${projectId}` },
        async (payload) => {
          const newOrder = payload.new as Partial<OrderRow>;
          const newId = newOrder.id as string;
          if (!newId || knownIds.current.has(newId)) return;
          if ((newOrder as any).service_type) return;

          const fullOrder = await fetchSingleOrder(newId);
          if (!fullOrder) return;

          knownIds.current.add(newId);
          notifyNewOrder(fullOrder.order_number);
          setOrders((prev) => [fullOrder, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const updated = payload.new as Partial<OrderRow>;
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
        { event: 'DELETE', schema: 'public', table: 'orders', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const deletedId = payload.old?.id as string;
          setOrders((prev) => prev.filter((o) => o.id !== deletedId));
        }
      )
      .subscribe();

    // Fallback polling every 30s
    const interval = setInterval(() => void fullRefresh(), 30000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [projectId, fullRefresh, fetchSingleOrder, notifyNewOrder]);

  // Clear new order badge when user interacts with the page
  const clearBadge = useCallback(() => {
    setNewOrderCount(0);
  }, []);

  async function setStatus(orderId: string, status: OrderStatus) {
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
    <div className="kds-root" onClick={clearBadge}>
      {/* Topbar */}
      <div className="flex items-center justify-between border-b border-[#1E2330] px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">
            شاشة المطبخ — {projectName}
          </span>
          {newOrderCount > 0 && (
            <span className="animate-pulse rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
              +{newOrderCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#9CA3AF]">{time}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSoundOn((s) => !s);
            }}
            className="rounded-[8px] border border-[var(--color-kds-border)] bg-[var(--color-kds-surface)] px-3 py-1.5 text-xs font-semibold text-[#9CA3AF] transition-colors hover:border-[#4F46E5] hover:text-white"
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!soundOn) setSoundOn(true);
              playChime();
              toast.success('🔔 صوت التنبيه', { description: 'صوت الإشعار يعمل ✅' });
            }}
            title="اختبار الصوت"
            className="rounded-[8px] border border-[var(--color-kds-border)] bg-[var(--color-kds-surface)] px-3 py-1.5 text-xs font-semibold text-[#9CA3AF] transition-colors hover:border-[#34D399] hover:text-white"
          >
            🔊 اختبار
          </button>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto p-5 lg:grid lg:grid-cols-3">
        <KdsColumn title="جديد" count={pending.length}>
          {pending.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#232838] py-10 text-[#6B7280]">
              <span className="text-2xl">✅</span>
              <span className="mt-2 text-xs">لا توجد طلبات جديدة</span>
            </div>
          )}
          {pending.map((o) => (
            <KdsCard
              key={o.id}
              order={o}
              now={now}
              onAdvance={() => setStatus(o.id, 'preparing')}
              advanceLabel="بدء التجهيز"
              onCancel={() => setConfirmCancel(o.id)}
            />
          ))}
        </KdsColumn>
        <KdsColumn title="قيد التجهيز" count={preparing.length}>
          {preparing.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#232838] py-10 text-[#6B7280]">
              <span className="text-xs">لا توجد طلبات قيد التجهيز</span>
            </div>
          )}
          {preparing.map((o) => (
            <KdsCard
              key={o.id}
              order={o}
              now={now}
              onAdvance={() => setStatus(o.id, 'ready')}
              advanceLabel="تم التجهيز"
              onCancel={() => setConfirmCancel(o.id)}
            />
          ))}
        </KdsColumn>
        <KdsColumn title="جاهز" count={ready.length}>
          {ready.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#232838] py-10 text-[#6B7280]">
              <span className="text-xs">لا توجد طلبات جاهزة</span>
            </div>
          )}
          {ready.map((o) => (
            <KdsCard
              key={o.id}
              order={o}
              now={now}
              onAdvance={() => setStatus(o.id, 'delivered')}
              advanceLabel="تسليم"
              onCancel={() => setConfirmCancel(o.id)}
            />
          ))}
        </KdsColumn>
      </div>

      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmCancel(null)}>
          <div className="w-full max-w-xs rounded-xl bg-[#161B26] p-5 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#EF4444]/20">
              <span className="text-lg font-bold text-[#EF4444]">!</span>
            </div>
            <p className="mb-1 text-sm font-bold text-white">تأكيد الإلغاء</p>
            <p className="mb-5 text-xs text-[#9CA3AF]">هل أنت متأكد من إلغاء هذا الطلب؟</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setStatus(confirmCancel, 'cancelled'); setConfirmCancel(null); }}
                className="min-h-[44px] flex-1 rounded-lg bg-[#EF4444] px-4 text-sm font-bold text-white transition-colors hover:bg-[#DC2626]"
              >
                نعم، إلغاء
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(null)}
                className="min-h-[44px] flex-1 rounded-lg border border-[#323A4D] bg-[#232838] px-4 text-sm font-bold text-[#9CA3AF] transition-colors hover:bg-[#2a3040]"
              >
                رجوع
              </button>
            </div>
          </div>
        </div>
      )}
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
      {/* Touch targets ≥ 44px */}
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
