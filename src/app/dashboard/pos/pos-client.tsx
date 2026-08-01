'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import { formatMoney, money, currencyDecimals } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { OrderType, Product, ProductAddon } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { CartPanel } from '@/components/pos/cart-panel';
import { ProductCard } from '@/components/pos/product-card';
import type { PosLine } from '@/components/pos/types';
import { toast } from 'sonner';

type ProductWithAddons = Product & { product_addons: ProductAddon[] };

const ORDER_TYPES: [OrderType, string][] = [
  ['walkin', 'سفري'],
  ['drivethru', 'سيارة'],
  ['dinein', 'طاولة'],
];

export function PosClient({
  projectId,
  currency,
  products,
}: {
  projectId: string;
  currency: string;
  products: ProductWithAddons[];
}) {
  const [type, setType] = useState<OrderType>('walkin');
  const [lines, setLines] = useState<PosLine[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [picker, setPicker] = useState<ProductWithAddons | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const pickerKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { setPicker(null); return; }
    if (e.key !== 'Tab') return;
    const el = pickerRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }, []);

  // Scroll lock + keyboard trap while ANY overlay (addon picker, cart sheet) is open
  useEffect(() => {
    if (!picker && !cartOpen) return;
    document.addEventListener('keydown', pickerKeyDown);
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflowY = 'scroll';
    return () => {
      document.removeEventListener('keydown', pickerKeyDown);
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      window.scrollTo(0, scrollY);
    };
  }, [picker, cartOpen, pickerKeyDown]);

  const available = useMemo(
    () => products.filter((p) => p.is_available),
    [products]
  );

  const total = useMemo(
    () => money(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0), currencyDecimals(currency)),
    [lines, currency]
  );

  function openProduct(p: ProductWithAddons) {
    // Open the picker only when there are AVAILABLE addons; otherwise quick-add
    if (p.product_addons?.some((a) => a.is_available)) {
      setPicker(p);
      setSelectedAddons([]);
    } else {
      addLine(p, [], [], 1, false);
    }
  }

  function addLine(
    p: ProductWithAddons,
    addonIds: string[],
    addonLabels: string[],
    qty = 1,
    silent = false
  ) {
    const addonTotal = money(
      (p.product_addons || [])
        .filter((a) => addonIds.includes(a.id))
        .reduce((s, a) => s + Number(a.price), 0),
      currencyDecimals(currency)
    );
    const unitPrice = money(Number(p.price) + addonTotal, currencyDecimals(currency));
    const key = `${p.id}:${[...addonIds].sort().join(',')}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + qty } : l
        );
      }
      return [
        ...prev,
        {
          key,
          productId: p.id,
          productName: p.name,
          unitPrice,
          quantity: qty,
          addonIds,
          addonLabels,
        },
      ];
    });
    if (!silent) toast.success('تمت الإضافة إلى السلة');
    setPicker(null);
  }

  function confirmAddons() {
    if (!picker) return;
    const labels = (picker.product_addons || [])
      .filter((a) => selectedAddons.includes(a.id))
      .map((a) => a.name);
    addLine(picker, selectedAddons, labels);
  }

  // ---------- Quick actions: top sellers + repeat last order ----------
  const [showQuick, setShowQuick] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [topItems, setTopItems] = useState<
    { product_id: string; name: string; qty: number }[]
  >([]);
  const [lastOrder, setLastOrder] = useState<{
    order_number: number;
    created_at: string;
    items: {
      product_id: string | null;
      quantity: number;
      addons: { id: string; name: string }[] | null;
    }[];
  } | null>(null);

  async function openQuick() {
    setShowQuick(true);
    setQuickLoading(true);
    const supabase = createClient();
    // Top sellers: aggregate recent non-cancelled order lines.
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, product_name, quantity, orders!inner(status)')
      .eq('orders.project_id', projectId)
      .neq('orders.status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(500);
    const m = new Map<string, { name: string; qty: number }>();
    for (const it of (items ?? []) as {
      product_id: string | null;
      product_name: string;
      quantity: number;
    }[]) {
      if (!it.product_id) continue;
      const cur = m.get(it.product_id) ?? { name: it.product_name, qty: 0 };
      cur.qty += Number(it.quantity || 1);
      m.set(it.product_id, cur);
    }
    setTopItems(
      [...m.entries()]
        .map(([product_id, v]) => ({ product_id, name: v.name, qty: v.qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 8)
    );
    // Last non-cancelled order with its lines.
    const { data: last } = await supabase
      .from('orders')
      .select(
        'order_number, created_at, order_items(product_id, quantity, addons)'
      )
      .eq('project_id', projectId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) {
      setLastOrder({
        order_number: last.order_number,
        created_at: last.created_at,
        items: ((last.order_items ?? []) as {
          product_id: string | null;
          quantity: number;
          addons: { id: string; name: string }[] | null;
        }[]).map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity || 1),
          addons: Array.isArray(it.addons) ? (it.addons as { id: string; name: string }[]) : null,
        })),
      });
    } else {
      setLastOrder(null);
    }
    setQuickLoading(false);
  }

  function quickAddTop(item: { product_id: string }) {
    const p = products.find((x) => x.id === item.product_id);
    if (!p) return;
    setShowQuick(false);
    openProduct(p);
  }

  function repeatLastOrder() {
    if (!lastOrder) return;
    let added = 0;
    for (const it of lastOrder.items) {
      const p = products.find((x) => x.id === it.product_id);
      if (!p) continue;
      const addonIds = (it.addons ?? []).map((a) => a.id);
      const labels = (it.addons ?? []).map((a) => a.name);
      addLine(p, addonIds, labels, it.quantity, true);
      added += 1;
    }
    setShowQuick(false);
    toast.success(
      added > 0 ? `تمت إعادة الطلب — ${added} صنف` : 'المنتجات غير متاحة حالياً'
    );
  }

  function updateQty(key: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + delta } : l
        )
        .filter((l) => l.quantity > 0)
    );
  }

  async function submit() {
    if (!lines.length) {
      toast.error('السلة فارغة');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/pos/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          notes: notes.trim() || undefined,
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            addonIds: l.addonIds,
          })),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        order?: { id: string; totalAmount: number; orderNumber: number };
      };
      if (!res.ok) {
        console.error('[POS] Order creation failed', { error: data.error, type, itemCount: lines.length });
        toast.error(data.error || 'فشل إنشاء الطلب');
        return;
      }
      toast.success(
        `تم الطلب order-${data.order?.orderNumber} — ${formatMoney(
          data.order?.totalAmount ?? total,
          currency
        )}`
      );
      setLines([]);
      setNotes('');
      setCartOpen(false);
    } catch {
      toast.error('تعذّر الاتصال');
    } finally {
      setSubmitting(false);
    }
  }

  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="page md:max-w-[1440px]">
      <div className="page-header">
        <div>
          <h1>نقطة البيع</h1>
          <p>طلبات سفري / سيارة — تسعير من السيرفر</p>
        </div>
      </div>

      <div data-pos-shell className="md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-4">
        {/* ── Left: product grid ─────────────────────────────────────── */}
        <div className="min-w-0">
          {/* Mobile order type — desktop keeps it in the cart header */}
          <div className="mb-3 flex gap-1 rounded-[8px] bg-[var(--pos-bg)] p-1 md:hidden" role="tablist" aria-label="نوع الطلب">
            {ORDER_TYPES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={type === value}
                onClick={() => setType(value)}
                disabled={submitting}
                className={`min-h-[44px] flex-1 rounded-[6px] text-sm font-semibold transition-colors ${type === value ? 'bg-[var(--pos-surface)] text-[var(--pos-text-primary)] shadow-sm' : 'text-[var(--pos-text-subdued)] hover:text-[var(--pos-text-primary)]'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Quick actions — top sellers + repeat last order */}
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={openQuick}
              disabled={submitting}
              className="flex-1 min-h-[44px] rounded-[8px] border border-[var(--pos-border)] bg-[var(--pos-surface)] px-4 text-sm font-semibold text-[var(--pos-text-primary)] transition-colors hover:bg-[var(--pos-bg)]"
            >
              ⚡ الأكثر مبيعًا
            </button>
            <button
              type="button"
              onClick={openQuick}
              disabled={submitting}
              className="flex-1 min-h-[44px] rounded-[8px] border border-[var(--pos-border)] bg-[var(--pos-surface)] px-4 text-sm font-semibold text-[var(--pos-text-primary)] transition-colors hover:bg-[var(--pos-bg)]"
            >
              🔄 آخر طلب
            </button>
          </div>

          {!available.length ? (
            <div className="card empty">
              <h3>ما فيه منتجات متاحة حالياً</h3>
              <p className="text-sm">أضف منتجاتك من صفحة المنتجات.</p>
            </div>
          ) : (
            <div data-pos-grid className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {available.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  currency={currency}
                  onSelect={(prod) => openProduct(prod as ProductWithAddons)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: cart panel (desktop, sticky full-height) ─────────── */}
        <aside data-pos-cart className="hidden md:block">
          <div className="md:sticky md:top-[57px] md:h-[calc(100dvh-57px)] lg:top-0 lg:h-dvh">
            <CartPanel
              lines={lines}
              products={products}
              currency={currency}
              type={type}
              onTypeChange={setType}
              notes={notes}
              onNotesChange={setNotes}
              onClear={() => setLines([])}
              onIncrement={(key) => updateQty(key, 1)}
              onDecrement={(key) => updateQty(key, -1)}
              onRemove={(key) => setLines((prev) => prev.filter((x) => x.key !== key))}
              onSubmit={submit}
              submitting={submitting}
              className="rounded-[10px] border border-[var(--pos-border)] shadow-sm"
            />
          </div>
        </aside>
      </div>

      {/* ── Mobile: floating total bar ───────────────────────────────── */}
      <div data-pos-floating-bar className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--pos-border)] bg-[var(--pos-surface)]/95 p-3 pb-safe-bottom backdrop-blur-md md:hidden">
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          disabled={submitting}
          aria-haspopup="dialog"
          aria-label="عرض السلة"
          className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-[8px] bg-[var(--color-primary)] px-4 text-white transition-colors active:scale-[0.98] hover:bg-[var(--color-primary-hover)]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBag className="h-4 w-4" />
            {itemCount > 0 ? `${itemCount} قطعة` : 'السلة فارغة'}
          </span>
          <span className="flex items-center gap-1 text-base font-bold tabular-nums">
            {formatMoney(total, currency)}
          </span>
        </button>
      </div>

      {/* ── Mobile: cart bottom sheet ────────────────────────────────── */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="سلة الطلب"
          onClick={(e) => { if (e.target === e.currentTarget) setCartOpen(false); }}
        >
          <div className="flex h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[var(--pos-surface)] animate-slide-up">
            <div className="flex items-center justify-between border-b border-[var(--pos-border)] px-4 py-2">
              <span className="mx-auto h-1 w-10 rounded-full bg-[var(--pos-border)]" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="btn btn-ghost btn-sm absolute end-3"
                aria-label="إغلاق السلة"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <CartPanel
              lines={lines}
              products={products}
              currency={currency}
              type={type}
              onTypeChange={setType}
              notes={notes}
              onNotesChange={setNotes}
              onClear={() => setLines([])}
              onIncrement={(key) => updateQty(key, 1)}
              onDecrement={(key) => updateQty(key, -1)}
              onRemove={(key) => setLines((prev) => prev.filter((x) => x.key !== key))}
              onSubmit={submit}
              submitting={submitting}
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      )}

      {/* ── Quick actions sheet ──────────────────────────────────────── */}
      {showQuick && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="إعادة طلب سريع"
          onClick={(e) => { if (e.target === e.currentTarget) setShowQuick(false); }}
        >
          <div className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-[var(--color-surface)] p-4 pb-safe-bottom sm:max-h-[85vh] sm:rounded-[10px] animate-slide-up">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">إعادة طلب سريع</h3>
              <button
                type="button"
                onClick={() => setShowQuick(false)}
                className="btn btn-ghost btn-sm"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {quickLoading ? (
              <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                جاري التحميل…
              </p>
            ) : (
              <div className="space-y-5">
                {/* Top sellers */}
                <div>
                  <h4 className="mb-2 text-xs font-bold text-[var(--color-text-secondary)]">
                    الأكثر مبيعًا
                  </h4>
                  {topItems.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      ما فيه مبيعات بعد — أول طلب يظهر هنا.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {topItems.map((t) => (
                        <button
                          key={t.product_id}
                          type="button"
                          onClick={() => quickAddTop(t)}
                          className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-start transition-colors hover:border-[var(--color-primary)]"
                        >
                          <span className="truncate text-sm font-semibold">{t.name}</span>
                          <span className="shrink-0 rounded-full bg-[var(--color-primary-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
                            {t.qty}×
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Repeat last order */}
                <div>
                  <h4 className="mb-2 text-xs font-bold text-[var(--color-text-secondary)]">
                    آخر طلب
                  </h4>
                  {lastOrder ? (
                    <div className="rounded-lg border border-[var(--color-border)] p-3">
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        <span dir="ltr">order-{lastOrder.order_number}</span> ·{' '}
                        {new Date(lastOrder.created_at).toLocaleString('ar-BH')}
                      </p>
                      <p className="mt-1 text-xs">
                        {lastOrder.items.length} صنف —{' '}
                        {lastOrder.items.reduce((s, i) => s + i.quantity, 0)} قطعة
                      </p>
                      <button
                        type="button"
                        onClick={repeatLastOrder}
                        className="mt-3 min-h-[44px] w-full rounded-lg bg-[var(--color-primary)] px-4 text-sm font-bold text-white transition-colors hover:opacity-90"
                      >
                        🔄 إعادة الطلب للسلة
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      ما فيه طلبات سابقة.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Addon picker ─────────────────────────────────────────────── */}
      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`إضافات — ${picker.name}`}
          onClick={(e) => { if (e.target === e.currentTarget) setPicker(null); }}
        >
          <div
            ref={pickerRef}
            className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-[var(--color-surface)] p-4 pb-safe-bottom sm:max-h-[85vh] sm:rounded-[10px] animate-slide-up"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">{picker.name}</h3>
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="btn btn-ghost btn-sm"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
              اختر الإضافات
            </p>
            <ul className="mb-4 space-y-2">
              {(picker.product_addons || [])
                .filter((a) => a.is_available)
                .map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedAddons.includes(a.id)}
                        onChange={(e) => {
                          setSelectedAddons((prev) =>
                            e.target.checked
                              ? [...prev, a.id]
                              : prev.filter((id) => id !== a.id)
                          );
                        }}
                      />
                      {a.name}
                    </span>
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      +{formatMoney(Number(a.price), currency)}
                    </span>
                  </label>
                ))}
            </ul>
            <div className="flex gap-2">
              <Button block onClick={confirmAddons}>
                إضافة للسلة
              </Button>
              <Button variant="secondary" onClick={() => setPicker(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
