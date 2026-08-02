'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';
import {
  type Order,
  type OrderItem,
  type OrderItemStatus,
  type OrderStatus,
} from '@/lib/types';
import { toast } from 'sonner';

type OrderRow = Order & {
  tables?: { number: number } | null;
  order_items?: OrderItem[];
  service_type?: string | null;
};

/**
 * Grouped KDS item: identical lines of the same product (same addons + note)
 * within one order are merged into a single card with summed quantity, so the
 * kitchen sees "كركديه ×3" instead of three separate cards.
 */
type KdsGroup = {
  key: string;
  items: OrderItem[];
  quantity: number;
  productName: string;
  addons: { name: string }[];
  notes: string | null;
  order: OrderRow;
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
    // Bound the dedupe set — drop ids of delivered/cancelled/old orders once
    // it grows too large (realtime ids are re-added on INSERT).
    if (knownIds.current.size > 300) {
      knownIds.current = new Set(rows.map((o) => o.id));
    }
    setOrders(rows);
  }, [projectId, notifyNewOrder]);

  // Fetch single order
  const fetchSingleOrder = useCallback(
    async (orderId: string) => {
      const supabase = createClient();
      const { data } = await supabase
        .from('orders')
        .select('*, tables(number), order_items(*)')
        .eq('id', orderId)
        .eq('project_id', projectId)
        .single();
      return data as OrderRow | null;
    },
    [projectId]
  );

  // Realtime item updates from another screen — refetch that order so the
  // kanban stays in sync even when the change came from elsewhere.
  const refetchOrder = useCallback(
    async (orderId: string) => {
      const fresh = await fetchSingleOrder(orderId);
      if (!fresh) return;
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === orderId);
        if (!exists) return prev;
        return prev.map((o) => (o.id === orderId ? fresh : o));
      });
    },
    [fetchSingleOrder]
  );

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
          if (newOrder.service_type) return;

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
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'order_items' },
        (payload) => {
          // Item moved by another screen — refetch that order to keep the
          // kanban correct. fetchSingleOrder guards project_id, and
          // refetchOrder ignores orders not on our board, so updates from
          // other projects are a cheap no-op.
          const itemOrderId = (payload.new as { order_id: string }).order_id;
          void refetchOrder(itemOrderId);
        }
      )
      .subscribe();

    // Fallback polling every 30s
    const interval = setInterval(() => void fullRefresh(), 30000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [projectId, fullRefresh, fetchSingleOrder, notifyNewOrder, refetchOrder]);

  // Clear new order badge when user interacts with the page
  const clearBadge = useCallback(() => {
    setNewOrderCount(0);
  }, []);

  // Close the cancel-confirm dialog with ESC
  useEffect(() => {
    if (!confirmCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmCancel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmCancel]);

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

  // ---------- Item-level KDS ----------

  // Advance one or more items (grouped card); then re-derive the order status.
  const advanceItem = useCallback(
    async (itemIds: string[], orderId: string, toStatus: OrderItemStatus) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('order_items')
        .update({ status: toStatus })
        .in('id', itemIds);
      if (error) {
        toast.error('فشل التحديث');
        return;
      }
      // Fetch the fresh order (with its items) and derive its status:
      // all ready → ready · any preparing → preparing · else pending.
      const fresh = await fetchSingleOrder(orderId);
      if (!fresh) return;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? fresh : o))
      );
      const items = fresh.order_items ?? [];
      if (!items.length) return;
      const allReady = items.every((it) => it.status === 'ready');
      const anyPreparing = items.some((it) => it.status === 'preparing');
      const derived: OrderStatus = allReady
        ? 'ready'
        : anyPreparing
          ? 'preparing'
          : 'pending';
      if (fresh.status !== derived) {
        const { error: statusErr } = await supabase
          .from('orders')
          .update({ status: derived })
          .eq('id', orderId);
        if (statusErr) {
          toast.error('فشل تحديث حالة الطلب');
          return;
        }
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: derived } : o))
        );
      }
    },
    [fetchSingleOrder]
  );

  // Deliver from the ready column — order leaves the kitchen board.
  const deliverOrder = useCallback(async (orderId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update({ status: 'delivered' })
      .eq('id', orderId);
    if (error) {
      toast.error('فشل التحديث');
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }, []);

  // Kanban by ITEM status — identical lines within an order are merged.
  const groupBy = (status: OrderItemStatus): KdsGroup[] => {
    const groups = new Map<string, KdsGroup>();
    for (const o of orders) {
      for (const it of o.order_items ?? []) {
        if ((it.status ?? 'pending') !== status) continue;
        const addons = Array.isArray(it.addons) ? (it.addons as { name: string }[]) : [];
        const key = `${o.id}|${it.product_id ?? ''}|${JSON.stringify(addons)}|${it.notes ?? ''}`;
        const existing = groups.get(key);
        if (existing) {
          existing.items.push(it);
          existing.quantity += it.quantity;
        } else {
          groups.set(key, {
            key,
            items: [it],
            quantity: it.quantity,
            productName: it.product_name,
            addons,
            notes: it.notes,
            order: o,
          });
        }
      }
    }
    return [...groups.values()].sort((a, b) =>
      a.order.created_at.localeCompare(b.order.created_at)
    );
  };

  const pendingGroups = groupBy('pending');
  const preparingGroups = groupBy('preparing');
  const readyGroups = groupBy('ready');

  // Start EVERY pending item on the board in one tap (fast-service flow).
  const startAll = useCallback(async () => {
    const ids = pendingGroups.flatMap((g) => g.items.map((it) => it.id));
    if (!ids.length) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('order_items')
      .update({ status: 'preparing' })
      .in('id', ids);
    if (error) {
      toast.error('فشل التحديث');
      return;
    }
    await fullRefresh();
  }, [pendingGroups, fullRefresh]);

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
            aria-label={soundOn ? 'كتم الصوت' : 'تفعيل الصوت'}
            aria-pressed={soundOn}
            className="flex min-h-[44px] items-center rounded-[8px] border border-[var(--color-kds-border)] bg-[var(--color-kds-surface)] px-3 text-xs font-semibold text-[#9CA3AF] transition-colors hover:border-[#4F46E5] hover:text-white"
          >
            <span aria-hidden="true">{soundOn ? '🔊' : '🔇'}</span>
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
            className="flex min-h-[44px] items-center rounded-[8px] border border-[var(--color-kds-border)] bg-[var(--color-kds-surface)] px-3 text-xs font-semibold text-[#9CA3AF] transition-colors hover:border-[#34D399] hover:text-white"
          >
            <span aria-hidden="true">🔊</span> اختبار
          </button>
        </div>
      </div>

      {/* Kanban columns — by ITEM status */}
      <div
        className="flex gap-4 overflow-x-auto p-5 lg:grid lg:grid-cols-3"
        role="region"
        aria-label="أعمدة المطبخ — مرّر أفقيًا للتنقل"
        tabIndex={0}
      >
        <KdsColumn title="جديد" count={pendingGroups.length}>
          {pendingGroups.length > 0 && (
            <button
              type="button"
              onClick={startAll}
              className="mb-2.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[7px] bg-[#C97A0F] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[#A8660C]"
            >
              ⚡ بدء الكل ({pendingGroups.reduce((s, g) => s + g.quantity, 0)})
            </button>
          )}
          {pendingGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#232838] py-10 text-[#6B7280]">
              <span className="text-2xl">✅</span>
              <span className="mt-2 text-xs">لا توجد أصناف جديدة</span>
            </div>
          )}
          {pendingGroups.map((g) => (
            <KdsGroupCard
              key={g.key}
              group={g}
              now={now}
              currency={currency}
              onAdvance={() => advanceItem(g.items.map((it) => it.id), g.order.id, 'preparing')}
              advanceLabel="بدء"
              onCancel={() => setConfirmCancel(g.order.id)}
            />
          ))}
        </KdsColumn>
        <KdsColumn title="قيد التجهيز" count={preparingGroups.length}>
          {preparingGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#232838] py-10 text-[#6B7280]">
              <span className="text-xs">لا توجد أصناف قيد التجهيز</span>
            </div>
          )}
          {preparingGroups.map((g) => (
            <KdsGroupCard
              key={g.key}
              group={g}
              now={now}
              currency={currency}
              onAdvance={() => advanceItem(g.items.map((it) => it.id), g.order.id, 'ready')}
              advanceLabel="تم"
              onCancel={() => setConfirmCancel(g.order.id)}
            />
          ))}
        </KdsColumn>
        <KdsColumn title="جاهز" count={readyGroups.length}>
          {readyGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#232838] py-10 text-[#6B7280]">
              <span className="text-xs">لا توجد أصناف جاهزة</span>
            </div>
          )}
          {readyGroups.map((g) => (
            <KdsGroupCard
              key={g.key}
              group={g}
              now={now}
              currency={currency}
              onAdvance={() => deliverOrder(g.order.id)}
              advanceLabel="تسليم"
              onCancel={null}
            />
          ))}
        </KdsColumn>
      </div>

      {confirmCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد إلغاء الطلب"
          onClick={() => setConfirmCancel(null)}
        >
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
        <h2 className="text-[11.5px] font-bold uppercase text-[#9CA3AF]">
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

function KdsGroupCard({
  group,
  now,
  currency,
  onAdvance,
  advanceLabel,
  onCancel,
}: {
  group: KdsGroup;
  now: number;
  currency: string;
  onAdvance: () => void;
  advanceLabel: string;
  onCancel: (() => void) | null;
}) {
  const order = group.order;
  const status = group.items[0]?.status ?? 'pending';
  const mins = Math.max(
    0,
    Math.floor((now - new Date(order.created_at).getTime()) / 60000)
  );

  let overdueClass = '';
  if (status === 'pending' && mins >= OVERDUE_MIN_PENDING) {
    overdueClass = 'kds-overdue';
  } else if (status === 'preparing' && mins >= OVERDUE_MIN_PREPARING) {
    overdueClass = 'kds-taking-long';
  }

  // Order summary — item count + total (uses the first item's unit price × qty).
  const orderItems = order.order_items ?? [];
  const orderTotal = orderItems.reduce(
    (s, it) => s + Number(it.unit_price) * it.quantity,
    0
  );

  return (
    <article className={`kds-card p-3 ${status} ${overdueClass}`}>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-[12px] font-bold text-[#9CA3AF]" dir="ltr">
          #{order.order_number}
          {order.tables ? ` · طاولة ${order.tables.number}` : ''}
        </p>
        <p className="text-[11px] text-[#6B7280]">
          <span className={overdueClass ? 'font-bold text-[#EF4444]' : ''}>
            {mins} د
          </span>
          {overdueClass && (
            <span className="mr-1 font-bold text-[#EF4444]">متأخر!</span>
          )}
        </p>
      </div>

      <p className="mb-1 text-[15px] font-extrabold leading-snug text-white">
        <span className="ml-1 inline-block min-w-[28px] text-right text-[#F59E0B]">
          {group.quantity}×
        </span>
        {group.productName}
      </p>
      {group.addons.length > 0 && (
        <p className="mb-0.5 text-[11px] text-[#6B7280]">
          {group.addons.map((a) => a.name).join(' · ')}
        </p>
      )}
      {group.notes && (
        <p className="mb-0.5 text-[11px] text-[#F59E0B]/80">📝 {group.notes}</p>
      )}
      {order.notes && (
        <p className="mb-1 rounded bg-[#1E2330]/50 px-2 py-1 text-[11px] text-[#F59E0B]/80">
          {order.notes}
        </p>
      )}
      {orderItems.length > 1 && (
        <p className="mb-1 text-[10px] text-[#6B7280]">
          {orderItems.length} أصناف ·{' '}
          <span dir="ltr">{formatMoney(orderTotal, currency)}</span>
        </p>
      )}
      {/* Touch targets ≥ 44px */}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onAdvance}
          className={`min-h-[44px] flex-1 rounded-[7px] px-4 text-[11.5px] font-bold transition-colors ${
            status === 'ready'
              ? 'bg-[#10B981] text-white hover:bg-[#059669]'
              : 'border border-[#323A4D] bg-[#232838] text-white hover:bg-[#2a3040]'
          }`}
        >
          {advanceLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] min-w-[80px] rounded-[7px] border border-[#323A4D] bg-[#232838] px-4 text-[11.5px] font-semibold text-[#9CA3AF] transition-colors hover:bg-[#2a3040]"
          >
            إلغاء
          </button>
        )}
      </div>
    </article>
  );
}
