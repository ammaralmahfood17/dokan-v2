'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  type Order,
  type OrderItem,
  type OrderItemStatus,
  type OrderStatus,
  ORDER_STATUS_LABELS,
} from '@/lib/types';
import { toast } from 'sonner';

type OrderRow = Order & {
  tables?: { number: number } | null;
  order_items?: OrderItem[];
  service_type?: string | null;
  updated_at?: string;
};

/** Kitchen ticket = ONE full order (not a single item). */
type Ticket = {
  order: OrderRow;
  /** Merged identical lines inside the ticket: "قهوة عربية بالهيل ×4" */
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

const OVERDUE_MIN_PENDING = 15;
const OVERDUE_MIN_PREPARING = 30;

const TAB_LABELS: Record<string, string> = {
  all: 'الكل',
  dinein: 'الطاولات',
  drivethru: 'الدرايف ثرو',
  walkin: 'كاونتر',
};

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
      // Cancel any in-flight flash first — otherwise the OLD 10s timeout
      // would fire mid-new-flash, kill the new interval and restore the
      // title early.
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

  // Never survive the component: a late timeout firing after unmount would
  // clobber the next page's title.
  useEffect(() => {
    return () => {
      stopFlash();
      originalTitleRef.current = '';
    };
  }, [stopFlash]);

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
  // Ids added via realtime INSERT — fullRefresh must preserve them even if a
  // poll snapshot was taken before their commit (see fullRefresh merge).
  const realtimeAddedRef = useRef<Set<string>>(new Set());
  // Ids touched by a realtime UPDATE since the last poll — fullRefresh must
  // keep the fresher local row instead of letting an older snapshot win.
  const realtimeTouchedRef = useRef<Set<string>>(new Set());
  // M3: ids currently on our board. order_items has no project_id column and
  // Supabase realtime can't filter by a joined orders.project_id, so we
  // filter incoming order_items events client-side against this set — other
  // tenants' item changes are dropped without a fetch.
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const [soundOn, setSoundOn] = useState(true);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
  );
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<'all' | 'dinein' | 'drivethru' | 'walkin'>('all');

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
      // Newest 50 first, then flip so the board renders oldest-first.
      const rows = (data as unknown as OrderRow[]).reverse();

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
      // Merge instead of wholesale replace: a ticket inserted via realtime
      // between this snapshot and its commit must not vanish from the board
      // just because the poll response arrived without it.
      setOrders((prev) => {
        const byId = new Map(rows.map((o) => [o.id, o]));
        for (const o of prev) {
          if (realtimeAddedRef.current.has(o.id) && !byId.has(o.id)) {
            byId.set(o.id, o);
          }
          // A realtime UPDATE may have landed after this snapshot was taken —
          // prefer the local row so the poll can't overwrite fresher state.
          const snap = byId.get(o.id);
          if (
            snap &&
            realtimeTouchedRef.current.has(o.id) &&
            (o.updated_at ?? '') >= (snap.updated_at ?? '')
          ) {
            byId.set(o.id, o);
          }
        }
        return [...byId.values()];
      });
      realtimeAddedRef.current.clear();
      realtimeTouchedRef.current.clear();
    } catch (err) {
      // Silently fail the refresh — keep the previous board state.
      console.error('fullRefresh failed', err);
    }
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
  // board stays in sync even when the change came from elsewhere.
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

  // M3: keep the known-id set in sync with the board.
  useEffect(() => {
    knownOrderIdsRef.current = new Set(orders.map((o) => o.id));
  }, [orders]);

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

          try {
            const fullOrder = await fetchSingleOrder(newId);
            if (!fullOrder) return;

            knownIds.current.add(newId);
            realtimeAddedRef.current.add(newId);
            notifyNewOrder(fullOrder.order_number);
            setOrders((prev) => [fullOrder, ...prev]);
          } catch (err) {
            // Keep the board as-is; the next poll will pick the order up.
            console.error('fetchSingleOrder failed', err);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `project_id=eq.${projectId}` },
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
          // board correct. M3: order_items has no project_id and realtime
          // can't join-filter, so drop events for orders not on our board
          // before fetching — other tenants' updates are pure noise.
          const itemOrderId = (payload.new as { order_id: string }).order_id;
          if (!knownOrderIdsRef.current.has(itemOrderId)) return;
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

  // ---------- Ticket-level KDS ----------

  // Advance a WHOLE order: every line → toItem, order → toOrder status.
  // Uses the transactional advance_order_status RPC — status-checked
  // (a stale screen can't revive a cancelled order) and atomic
  // (order + items advance together; no stuck-items window).
  const advanceOrder = useCallback(
    async (orderId: string, toItem: OrderItemStatus, toOrder: OrderStatus) => {
      const supabase = createClient();
      // Expected state = what THIS screen believes is current. If the DB has
      // moved on (cancelled/advanced elsewhere), the RPC rejects it.
      const current = orders.find((o) => o.id === orderId)?.status;
      if (!current) return; // not on the board anymore
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

  // Deliver — order leaves the kitchen board. Status-checked via RPC:
  // only advances from 'ready', so a stale screen can't deliver a cancelled order.
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

  // Build tickets — one per order, identical lines merged inside.
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

  // Start EVERY pending order in one tap (fast-service flow).
  // Per-order RPC calls so a stale/cancelled order can't fail the whole
  // batch — failures are collected and surfaced, the rest still advance.
  const startAll = useCallback(async () => {
    const pendingOrders = orders.filter((o) => o.status === 'pending');
    if (!pendingOrders.length) return;
    const supabase = createClient();
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
  }, [orders, fullRefresh]);

  // ---------- Derived view ----------

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

  // Sort: new → preparing → ready; oldest first within each stage.
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

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]" onClick={clearBadge}>
      {/* Header — Scan Grid: tabs + display title + clock */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
        <nav className="flex items-center gap-5 text-[13px]" aria-label="تصنيف الطلبات">
          {(['all', 'dinein', 'drivethru', 'walkin'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`relative min-h-[44px] font-semibold transition-colors ${
                tab === t
                  ? 'text-[var(--color-text)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {TAB_LABELS[t]}
              <span className="ms-1 font-mono text-[11px] tabular-nums opacity-70">
                · {String(countByTab[t]).padStart(2, '0')}
              </span>
              {tab === t && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--color-primary)]" />
              )}
            </button>
          ))}
        </nav>

        <h1 className="font-display text-xl font-bold text-[var(--color-primary)]">
          {projectName} — شاشة المطبخ
        </h1>

        <div className="flex items-center gap-2.5">
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={startAll}
              className="flex min-h-[44px] items-center gap-1.5 rounded-[7px] bg-[var(--color-primary)] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              ⚡ بدء الكل ({pendingCount})
            </button>
          )}
          <span className="font-mono text-[15px] tabular-nums text-[var(--color-text-muted)]" dir="ltr">
            {time}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSoundOn((s) => !s);
            }}
            aria-label={soundOn ? 'كتم الصوت' : 'تفعيل الصوت'}
            aria-pressed={soundOn}
            className="flex min-h-[44px] items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)]"
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
            className="flex min-h-[44px] items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-success)]"
          >
            <span aria-hidden="true">🔊</span> اختبار
          </button>
        </div>
      </header>

      {/* Board — Scan Grid tickets */}
      <main
        className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3"
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
          />
        ))}
      </main>
    </div>
  );
}

/* ========== Ticket ========== */

function KitchenTicket({
  ticket,
  now,
  currency,
  onStart,
  onReady,
  onDeliver,
}: {
  ticket: Ticket;
  now: number;
  currency: string;
  onStart: () => void;
  onReady: () => void;
  onDeliver: () => void;
}) {
  const { order, lines, totalQty } = ticket;
  const status = order.status as OrderStatus;
  // Guard against a malformed/absent created_at — a NaN diff would silently
  // read "قبل NaN دقيقة" and never flag overdue.
  const createdMs = new Date(order.created_at).getTime();
  const mins = Number.isFinite(createdMs)
    ? Math.max(0, Math.floor((now - createdMs) / 60000))
    : 0;

  // Enterprise §6.8 — ticket border & status badge by order status.
  // mockup: جديد→success · قيد التحضير→warning · متأخر→danger
  const tone =
    status === 'pending'
      ? 'success'
      : status === 'preparing'
        ? 'warning'
        : 'success';

  let overdue = false;
  if (status === 'pending' && mins >= OVERDUE_MIN_PENDING) overdue = true;
  if (status === 'preparing' && mins >= OVERDUE_MIN_PREPARING) overdue = true;

  const badgeTone = overdue ? 'danger' : tone;
  const badgeLabel =
    overdue ? 'متأخر'
    : ORDER_STATUS_LABELS[status];

  // Timer color gradient — success → warning → danger (5 / 12 / 20 min)
  const timerTone =
    mins < 5
      ? 'var(--color-success)'
      : mins < 12
        ? 'var(--color-warn)'
        : mins < 20
          ? 'var(--color-warn-hover)'
          : 'var(--color-danger)';

  const toneBorder: Record<string, string> = {
    success: 'border-[var(--color-success)]',
    warning: 'border-[var(--color-warn)]',
    danger: 'border-[var(--color-danger)]',
  };
  const toneBadge: Record<string, string> = {
    success: 'bg-[var(--color-success-tint)] text-[var(--color-success)]',
    warning: 'bg-[var(--color-warn-tint)] text-[var(--color-warn)]',
    danger: 'bg-[var(--color-danger-tint)] text-[var(--color-danger)]',
  };

  const tableLabel = order.tables
    ? `TABLE·${String(order.tables.number).padStart(2, '0')}`
    : order.type === 'drivethru'
      ? `DRIVE-${String(order.order_number).padStart(2, '0')}`
      : `WALKIN·${String(order.order_number).padStart(2, '0')}`;

  const timeLabel = mins < 1 ? 'الآن' : `قبل ${mins} دقيقة`;

  return (
    <article
      className={`border-2 bg-[var(--color-surface)] p-4 ${toneBorder[badgeTone]}`}
    >
      {/* Head: order number + table/time */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums text-[var(--color-text)]" dir="ltr">
          #{String(order.order_number).padStart(3, '0')}
        </span>
        <div className="text-end">
          <p className="font-mono text-[12px] font-semibold tabular-nums text-[var(--color-text-secondary)]" dir="ltr">
            {tableLabel}
          </p>
          <p className="text-[11px]" style={{ color: timerTone }}>
            {timeLabel}
            {overdue && ' · متأخر!'}
          </p>
        </div>
      </div>

      {/* Status tag — pill (§6.3) */}
      <span
        className={`mb-2.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${toneBadge[badgeTone]}`}
      >
        {badgeLabel}
      </span>

      {/* Items — one line per merged product */}
      <ul className="mb-3 list-none p-0">
        {lines.map((l) => (
          <li
            key={l.key}
            className="flex items-start justify-between gap-2 border-b border-dashed border-[var(--color-border)] py-1.5 text-[14px] last:border-b-0"
          >
            <span>
              {l.productName}
              {l.addons.length > 0 && (
                <span className="block text-[11.5px] text-[var(--color-text-muted)]">
                  {l.addons.map((a) => a.name).join(' · ')}
                </span>
              )}
              {l.notes && (
                <span className="mt-0.5 block text-[11.5px] text-[var(--color-danger)]">
                  {l.notes}
                </span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-[var(--color-primary)]" dir="ltr">
              ×{l.quantity}
            </span>
          </li>
        ))}
        {order.notes && (
          <li className="mt-1.5 border-0 bg-[var(--color-bg)] px-2 py-1.5 text-[11.5px] text-[var(--color-danger)]">
            {order.notes}
          </li>
        )}
      </ul>

      {/* Actions — one primary per stage; ghost "تأخير" only while cooking */}
      <div className="flex gap-2">
        {status === 'pending' && (
          <button
            type="button"
            onClick={onStart}
            className="min-h-[44px] flex-1 rounded-[7px] bg-[var(--color-primary)] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            بدء التحضير
          </button>
        )}
        {status === 'preparing' && (
          <>
            <button
              type="button"
              onClick={onReady}
              className="min-h-[44px] flex-1 rounded-[7px] bg-[var(--color-primary)] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              جاهز للتسليم
            </button>
            <button
              type="button"
              onClick={() => toast.message('⏱ تأخير', { description: `#${order.order_number} — سنذكّرك لاحقًا` })}
              className="min-h-[44px] min-w-[96px] rounded-[7px] border border-[var(--color-border)] bg-transparent px-4 text-[13px] font-bold text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              تأخير
            </button>
          </>
        )}
        {status === 'ready' && (
          <button
            type="button"
            onClick={onDeliver}
            className="min-h-[44px] flex-1 rounded-[7px] bg-[var(--color-primary)] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            تم التسليم
          </button>
        )}
      </div>
    </article>
  );
}
