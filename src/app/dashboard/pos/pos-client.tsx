'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { formatMoney, money, currencyDecimals } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { OrderType, Product, ProductAddon } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type ProductWithAddons = Product & { product_addons: ProductAddon[] };

type Line = {
  key: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  addonIds: string[];
  addonLabels: string[];
};

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
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [picker, setPicker] = useState<ProductWithAddons | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
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

  // Scroll lock + keyboard trap when picker is open
  useEffect(() => {
    if (!picker) return;
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
  }, [picker, pickerKeyDown]);

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
      addLine(p, [], []);
    }
  }

  function addLine(
    p: ProductWithAddons,
    addonIds: string[],
    addonLabels: string[],
    qty = 1
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
      addLine(p, addonIds, labels, it.quantity);
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
    } catch {
      toast.error('تعذّر الاتصال');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>نقطة البيع</h1>
          <p>طلبات سفري / سيارة — تسعير من السيرفر</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {(
          [
            ['walkin', 'سفري'],
            ['drivethru', 'سيارة'],
            ['dinein', 'طاولة'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setType(value)}
            disabled={submitting}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition-all min-h-[44px] ${type === value ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]'} ${submitting ? 'opacity-50' : ''}`}
            aria-pressed={type === value}
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
          className="flex-1 min-h-[44px] rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary-tint)] px-4 text-sm font-bold text-[var(--color-primary)] transition-colors hover:opacity-90"
        >
          ⚡ الأكثر مبيعًا
        </button>
        <button
          type="button"
          onClick={openQuick}
          disabled={submitting}
          className="flex-1 min-h-[44px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
        >
          🔄 آخر طلب
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {!available.length ? (
            <div className="card empty">
              <h3>ما فيه منتجات متاحة حالياً</h3>
              <p className="text-sm">أضف منتجاتك من صفحة المنتجات.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {available.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProduct(p)}
                  className="card card-body flex items-center gap-3 text-start transition-colors hover:border-[var(--color-primary)]"
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-tint)] text-[var(--color-primary)]">
                      🍽️
                    </span>
                  )}
                  <span className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--color-primary)]">
                      {formatMoney(Number(p.price), currency)}
                    </p>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header">
            <h3 className="text-sm font-bold">السلة</h3>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {lines.length} صنف
            </span>
          </div>
          <div className="card-body space-y-3">
            {!lines.length ? (
              <p className="text-center text-sm text-[var(--color-text-muted)]">
                اختر منتجات من القائمة
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li
                    key={l.key}
                    className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{l.productName}</p>
                      {l.addonLabels.length > 0 && (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {l.addonLabels.join(' · ')}
                        </p>
                      )}
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {formatMoney(l.unitPrice, currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => updateQty(l.key, -1)}
                        aria-label="تقليل الكمية"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold">
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => updateQty(l.key, 1)}
                        aria-label="زيادة الكمية"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setLines((prev) => prev.filter((x) => x.key !== l.key))
                        }
                        aria-label="حذف الصنف"
                      >
                        <Trash2 className="h-3 w-3 text-[var(--color-danger)]" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="field mb-0">
              <label className="label">ملاحظات</label>
              <input
                className="input"
                value={notes}
                onChange={(e) => { if (e.target.value.length <= 500) setNotes(e.target.value); }}
                placeholder="اختياري"
                maxLength={500}
              />
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
              <span className="text-sm font-semibold">الإجمالي</span>
              <span className="text-base font-bold">
                {formatMoney(total, currency)}
              </span>
            </div>

            <Button
              block
              disabled={!lines.length || submitting}
              onClick={submit}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:hidden" />
                  جاري الإرسال…
                </span>
              ) : (
                'تأكيد الطلب'
              )}
            </Button>
          </div>
        </div>
      </div>

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
            className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-[var(--color-surface)] p-4 pb-safe-bottom sm:max-h-[85vh] sm:rounded-[10px] animate-slide-up">
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
