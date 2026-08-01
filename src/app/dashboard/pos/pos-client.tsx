'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import { formatMoney, money, currencyDecimals } from '@/lib/utils';
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

  // ---------- Quick actions: removed (top sellers + repeat last order) ----------

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
