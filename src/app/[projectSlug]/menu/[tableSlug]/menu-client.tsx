'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, ShoppingBag, X, Check, Bell, FileText, GripHorizontal } from 'lucide-react';
import Image from 'next/image';
import { formatMoney, money, currencyDecimals } from '@/lib/utils';
import type {
  CartLine,
  Category,
  OrderItemAddon,
  Product,
  ProductAddon,
  Project,
  Table,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/** Generic blur placeholder for product images — tiny 16×16 grey base64 */
const BLUR_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkYPj/n4EBBJgYKAQMFFiAKcBAUwsDUx0DxS5gYKA8DCh2AQNlYUBZCgDxpwgRg9RXOAAAAABJRU5ErkJggg==';

type ProductWithAddons = Product & { product_addons: ProductAddon[] };

export function MenuClient({
  project,
  table,
  categories,
  products,
}: {
  project: Project;
  table: Table;
  categories: Category[];
  products: ProductWithAddons[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [picker, setPicker] = useState<ProductWithAddons | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [itemNotes, setItemNotes] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderDone, setOrderDone] = useState<{
    id: string;
    totalAmount: number;
    orderNumber: number;
  } | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [busyAction, setBusyAction] = useState<'waiter' | 'bill' | null>(null);
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);
  const lastAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup lastAddedTimer on unmount
  useEffect(() => {
    return () => {
      if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
    };
  }, []);

  // Ref for smooth-scrolling to products section
  const productsRef = useRef<HTMLDivElement>(null);

  const currency = project.currency;

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return products;
    return products.filter((p) => p.category_id === activeCategory);
  }, [products, activeCategory]);

  const total = useMemo(
    () => money(cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), currencyDecimals(currency)),
    [cart, currency]
  );
  const itemCount = useMemo(
    () => cart.reduce((s, l) => s + l.quantity, 0),
    [cart]
  );

  /** Scroll products into view when category changes (mobile smooth UX) */
  const handleCategoryChange = useCallback((catId: string | 'all') => {
    setActiveCategory(catId);
    // Small delay so React renders filtered items first
    setTimeout(() => {
      productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  function openProduct(p: ProductWithAddons) {
    setPicker(p);
    setSelectedAddons([]);
    setItemNotes('');
  }

  function confirmAdd() {
    if (!picker) return;
    const addons: OrderItemAddon[] = (picker.product_addons || [])
      .filter((a) => selectedAddons.includes(a.id) && a.is_available)
      .map((a) => ({
        id: a.id,
        name: a.name,
        price: money(Number(a.price), currencyDecimals(currency)),
      }));
    const addonTotal = money(addons.reduce((s, a) => s + a.price, 0), currencyDecimals(currency));
    const unitPrice = money(Number(picker.price) + addonTotal, currencyDecimals(currency));
    const key = `${picker.id}:${addons
      .map((a) => a.id)
      .sort()
      .join(',')}:${itemNotes.trim()}`;

    const alreadyInCart = cart.some((l) => l.key === key);
    const wasEmpty = cart.length === 0;

    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          key,
          productId: picker.id,
          productName: picker.name,
          unitPrice,
          quantity: 1,
          addons,
          notes: itemNotes.trim(),
        },
      ];
    });
    setPicker(null);

    // Auto-open the cart on the FIRST item so the customer can review + send.
    // Later adds only toast (don't interrupt multi-item ordering).
    if (wasEmpty) setCartOpen(true);

    // Visual feedback: flash badge on the product card + toast
    setLastAddedKey(picker.id);
    if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
    lastAddedTimer.current = setTimeout(() => setLastAddedKey(null), 800);
    toast.success(alreadyInCart ? 'زادت الكمية' : 'أُضيف إلى السلة', { duration: 1200 });
  }

  // Quick-Add: add directly without addon picker
  function quickAdd(p: ProductWithAddons) {
    if ((p.product_addons || []).filter((a) => a.is_available).length > 0) {
      openProduct(p);
      return;
    }
    const key = `${p.id}::`;
    const alreadyInCart = cart.some((l) => l.key === key);
    const wasEmpty = cart.length === 0;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          key,
          productId: p.id,
          productName: p.name,
          unitPrice: money(Number(p.price), currencyDecimals(currency)),
          quantity: 1,
          addons: [],
          notes: '',
        },
      ];
    });
    // Auto-open the cart on the FIRST item (same UX as confirmAdd)
    if (wasEmpty) setCartOpen(true);
    // Visual feedback
    setLastAddedKey(p.id);
    if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
    lastAddedTimer.current = setTimeout(() => setLastAddedKey(null), 800);
    toast.success(alreadyInCart ? 'زادت الكمية' : 'أُضيف إلى السلة', { duration: 1200 });
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + delta } : l
        )
        .filter((l) => l.quantity > 0)
    );
  }

  async function placeOrder() {
    if (!cart.length) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectSlug: project.slug,
          tableSlug: table.slug,
          notes: orderNotes.trim() || undefined,
          items: cart.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            addonIds: l.addons.map((a) => a.id),
            notes: l.notes || undefined,
          })),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        order?: { id: string; status: string; totalAmount: number; orderNumber: number };
      };
      if (!res.ok || !data.order) {
        toast.error(data.error || 'فشل إرسال الطلب');
        return;
      }
      setOrderDone({
        id: data.order.id,
        totalAmount: data.order.totalAmount,
        orderNumber: data.order.orderNumber,
      });
      setCart([]);
      setCartOpen(false);
    } catch {
      toast.error('تعذّر الاتصال');
    } finally {
      setSubmitting(false);
    }
  }

  async function callService(kind: 'waiter' | 'bill') {
    setBusyAction(kind);
    try {
      const res = await fetch(`/api/public/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectSlug: project.slug,
          tableSlug: table.slug,
        }),
      });
      if (!res.ok) {
        toast.error('تعذّر إرسال الطلب');
        return;
      }
      toast.success(kind === 'waiter' ? 'تم استدعاء الموظف' : 'تم طلب الفاتورة');
    } catch {
      toast.error('تعذّر الاتصال');
    } finally {
      setBusyAction(null);
    }
  }

  // ======== ORDER DONE SCREEN (full-screen calm success) ========
  if (orderDone) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center page-enter">
        <div
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-full text-white"
          style={{ background: "var(--color-primary)" }}
        >
          <Check className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold">تم استلام طلبك</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          رقم الطلب{' '}
          <span dir="ltr" className="font-bold">
            order-{orderDone.orderNumber}
          </span>
        </p>
        <p className="mt-2 text-lg font-bold">
          {formatMoney(orderDone.totalAmount, currency)}
        </p>
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          يمكنك طلب الموظف أو الفاتورة من الأزرار أدناه
        </p>

        <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => callService('waiter')}
            className="min-h-[48px] flex w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
          >
            <Bell className="h-4 w-4" />
            {busyAction === 'waiter' ? 'جاري…' : 'طلب موظف'}
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => callService('bill')}
            className="min-h-[48px] flex w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            {busyAction === 'bill' ? 'جاري…' : 'طلب الفاتورة'}
          </button>
        </div>

        <Button
          className="mt-6"
          variant="secondary"
          onClick={() => setOrderDone(null)}
        >
          طلب المزيد
        </Button>
      </div>
    );
  }

  // ======== CART BAR BADGE ========
  const cartBadge = itemCount > 0;

  /** Render a single product row — mockup: square 72px image, teal mono price, ink add-btn */
  function renderProduct(p: ProductWithAddons, isFirst = false) {
    return (
      <div key={p.id} className="flex items-center gap-3 border-b pb-3 pt-1" style={{ borderColor: 'rgba(61,58,52,.08)' }}>
        <button
          type="button"
          onClick={() => quickAdd(p)}
          aria-label={`إضافة ${p.name}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-start"
        >
          {p.image_url ? (
            <Image
              src={p.image_url}
              alt={p.name}
              width={72}
              height={72}
              priority={isFirst}
              placeholder="blur"
              blurDataURL={BLUR_PLACEHOLDER}
              className="h-[72px] w-[72px] shrink-0 object-cover"
            />
          ) : (
            <div
              className="flex h-[72px] w-[72px] shrink-0 items-center justify-center text-[22px] font-bold bg-[#EDE7D6]"
              style={{ color: 'var(--color-primary)' }}
            >
              {p.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold">{p.name}</h3>
            {p.description && (
              <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-[1.5] text-[var(--color-text-secondary)]">
                {p.description}
              </p>
            )}
            <span className="mt-1 inline-block font-mono text-[14px] font-semibold tabular-nums text-[var(--color-success)]" dir="ltr">
              {formatMoney(Number(p.price), currency)}
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => quickAdd(p)}
          aria-label={`إضافة ${p.name} إلى السلة`}
          className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center bg-[var(--color-text)] text-[20px] font-semibold leading-none text-[var(--color-accent)] transition-transform duration-200 active:scale-95 ${
            lastAddedKey === p.id ? 'scale-110' : ''
          }`}
        >
          {lastAddedKey === p.id ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </button>
      </div>
    );
  }

  // ======== MAIN MENU ========
  return (
    <div className="min-h-dvh bg-[var(--color-bg)] pb-24 page-enter">
      {/* HEADER — Scan Grid: ink round brand mark + TABLE chip */}
      <header
        className="sticky top-0 z-20 border-b bg-[var(--color-bg)] px-4 py-3.5"
        style={{ borderColor: 'rgba(61,58,52,.12)' }}
      >
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--color-text)] font-display text-[18px] font-bold text-[var(--color-accent)]"
            >
              {project.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-[17px] font-bold">{project.name}</h1>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                امسح واطلب من طاولتك
              </p>
            </div>
          </div>
          {/* Table chip — corner brackets like the mockup */}
          <div className="flex items-center gap-1.5">
            <div
              className="relative px-2.5 py-1 font-mono text-[12px] font-semibold tabular-nums text-[var(--color-primary)]"
              style={{ border: '1.5px solid var(--color-accent)' }}
            >
              <span className="absolute -top-[1.5px] -right-[1.5px] h-[6px] w-[6px] border-t-[1.5px] border-r-[1.5px] border-[var(--color-accent)]" />
              <span className="absolute -bottom-[1.5px] -left-[1.5px] h-[6px] w-[6px] border-b-[1.5px] border-l-[1.5px] border-[var(--color-accent)]" />
              TABLE·{String(table.number).padStart(2, '0')}
            </div>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => callService('waiter')}
              className="min-h-[44px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-bold transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              موظف
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => callService('bill')}
              className="min-h-[44px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-bold transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              فاتورة
            </button>
          </div>
        </div>
      </header>

      {/* CATEGORIES — pills, active = ink with saffron text (mockup) */}
      {categories.length > 0 && (
        <div className="sticky top-[57px] z-10 border-b bg-[var(--color-bg)]" style={{ borderColor: 'rgba(61,58,52,.12)' }}>
          <div className="mx-auto flex max-w-[480px] gap-2 overflow-x-auto px-3 pb-1 pt-1" style={{ scrollbarWidth: 'none' }}>
            <button
              type="button"
              onClick={() => handleCategoryChange('all')}
              className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors ${
                activeCategory === 'all'
                  ? 'bg-[var(--color-text)] text-[var(--color-accent)]'
                  : 'bg-[#EDE7D6] text-[var(--color-text)] hover:bg-[var(--color-border)]'
              }`}
            >
              الكل
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleCategoryChange(c.id)}
                className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors ${
                  activeCategory === c.id
                    ? 'bg-[var(--color-text)] text-[var(--color-accent)]'
                    : 'bg-[#EDE7D6] text-[var(--color-text)] hover:bg-[var(--color-border)]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PRODUCTS — grouped by category */}
      <main ref={productsRef} className="mx-auto max-w-lg px-3 py-4">
        {!filtered.length ? (
          <div className="card empty">
            <h3>القائمة فارغة</h3>
            <p className="text-sm">لا توجد منتجات متاحة حالياً.</p>
          </div>
        ) : (
          <>
            {activeCategory === 'all' ? (
              /* All categories: group products under each category */
              <>
                {categories.filter((c) => products.some((p) => p.category_id === c.id)).map((cat, catIdx) => {
                  const catProducts = filtered.filter((p) => p.category_id === cat.id);
                  if (!catProducts.length) return null;
                  return (
                    <section key={cat.id} className="mb-6">
                      <div className="mb-3 flex items-baseline gap-2.5">
                        <h2 className="font-display text-[19px] font-semibold">{cat.name}</h2>
                        <span className="h-px flex-1 opacity-50" style={{ background: 'repeating-linear-gradient(90deg, var(--color-text-secondary) 0 4px, transparent 4px 8px)' }} />
                      </div>
                      <div>
                        {catProducts.map((p, idx) => renderProduct(p, idx === 0 && catIdx === 0))}
                      </div>
                    </section>
                  );
                })}
                {/* Uncategorized products (category deleted → SET NULL): keep them visible */}
                {products.some((p) => !p.category_id) && (
                  <section className="mb-6">
                    <div className="mb-3 flex items-baseline gap-2.5">
                      <h2 className="font-display text-[19px] font-semibold">بدون تصنيف</h2>
                      <span className="h-px flex-1 opacity-50" style={{ background: 'repeating-linear-gradient(90deg, var(--color-text-secondary) 0 4px, transparent 4px 8px)' }} />
                    </div>
                    <div>
                      {products
                        .filter((p) => !p.category_id)
                        .map((p, idx) => renderProduct(p, idx === 0 && categories.length === 0))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              /* Single category: flat list */
              <div className="space-y-3">
                {filtered.map((p, idx) => renderProduct(p, idx === 0))}
              </div>
            )}
          </>
        )}
      </main>

      {/* CART FLOATING BAR — ink bar with saffron corner brackets (mockup) */}
      {cartBadge && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-safe-bottom">
          <div className="mx-auto w-full max-w-[480px] px-1 pb-1">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex w-full items-center justify-between bg-[var(--color-text)] px-4 py-3.5 text-[var(--color-bg)] shadow-lg transition-transform active:scale-[0.98]"
            >
              {/* Corner brackets — saffron scan corners */}
              <span className="absolute -top-[2px] -right-[2px] h-[10px] w-[10px] border-t-2 border-r-2 border-[var(--color-accent)]" />
              <span className="absolute -bottom-[2px] -left-[2px] h-[10px] w-[10px] border-b-2 border-l-2 border-[var(--color-accent)]" />

              <span className="flex items-center gap-2.5">
                <span className="flex h-[26px] w-[26px] items-center justify-center bg-[var(--color-accent)] font-mono text-[13px] font-bold tabular-nums text-[var(--color-text)]">
                  {itemCount}
                </span>
                <span className="text-start">
                  <span className="block text-[14px] font-semibold">عرض السلة</span>
                  <span className="mt-0.5 block text-[11px] opacity-60">
                    الدفع نقدًا عند الاستلام
                  </span>
                </span>
              </span>
              <span className="font-mono text-[15px] font-bold tabular-nums text-[var(--color-accent)]" dir="ltr">
                {formatMoney(total, currency)}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* PRODUCT PICKER SHEET */}
      {picker && (
        <Sheet onClose={() => setPicker(null)} title={picker.name}>
          {picker.description && (
            <p className="mb-3 text-sm text-[var(--color-text-secondary)]">
              {picker.description}
            </p>
          )}
          <p className="mb-3 text-base font-bold" style={{ color: "var(--color-primary)" }}>
            {formatMoney(Number(picker.price), currency)}
          </p>
          {(picker.product_addons || []).filter((a) => a.is_available).length > 0 && (
            <div className="mb-4">
              <p className="section-title">إضافات</p>
              <ul className="space-y-2">
                {(picker.product_addons || [])
                  .filter((a) => a.is_available)
                  .map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--color-border)] px-3 py-2.5 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedAddons.includes(a.id)}
                          onChange={(e) =>
                            setSelectedAddons((prev) =>
                              e.target.checked
                                ? [...prev, a.id]
                                : prev.filter((id) => id !== a.id)
                            )
                          }
                          className="h-4 w-4"
                        />
                        {a.name}
                      </span>
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        +{formatMoney(Number(a.price), currency)}
                      </span>
                    </label>
                  ))}
              </ul>
            </div>
          )}
          <div className="field">
            <label className="label">ملاحظة على الصنف</label>
            <input
              className="input"
              value={itemNotes}
              onChange={(e) => {
                if (e.target.value.length <= 200) setItemNotes(e.target.value);
              }}
              placeholder="مثال: بدون سكر"
              maxLength={200}
            />
            <p className="hint">{itemNotes.length}/200</p>
          </div>
          <Button block onClick={confirmAdd} style={{ background: "var(--color-primary)" }}>
            أضف إلى السلة
          </Button>
        </Sheet>
      )}

      {/* CART SHEET */}
      {cartOpen && (
        <Sheet onClose={() => setCartOpen(false)} title="سلتك">
          <ul className="mb-4 space-y-3">
            {cart.map((l) => (
              <li
                key={l.key}
                className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold">{l.productName}</p>
                  {l.addons.length > 0 && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {l.addons.map((a) => a.name).join(' · ')}
                    </p>
                  )}
                  {l.notes && (
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {l.notes}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs font-semibold">
                    {formatMoney(l.unitPrice, currency)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="إنقاص الكمية"
                    className="min-h-[44px] min-w-[44px] rounded-lg border border-[var(--color-border)] text-sm font-bold transition-colors hover:bg-[var(--color-bg)]"
                    onClick={() => updateQty(l.key, -1)}
                  >
                    <Minus className="mx-auto h-4 w-4" />
                  </button>
                  <span className="flex w-8 items-center justify-center text-sm font-bold">
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="زيادة الكمية"
                    className="min-h-[44px] min-w-[44px] rounded-lg border border-[var(--color-border)] text-sm font-bold transition-colors hover:bg-[var(--color-bg)]"
                    onClick={() => updateQty(l.key, 1)}
                  >
                    <Plus className="mx-auto h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mb-4">
            <label className="label">ملاحظة للطلب</label>
            <input
              className="input"
              value={orderNotes}
              onChange={(e) => { if (e.target.value.length <= 500) setOrderNotes(e.target.value); }}
              placeholder="مثال: تحساسية من المكسرات"
              maxLength={500}
            />
            <p className="hint">{orderNotes.length}/500</p>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="font-semibold">الإجمالي</span>
            <span className="text-base font-bold">
              {formatMoney(total, currency)}
            </span>
          </div>
          <Button
            block
            disabled={submitting || !cart.length}
            onClick={placeOrder}
            style={{ background: "var(--color-primary)" }}
            className="min-h-[48px]"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:hidden" />
                جاري الإرسال…
              </span>
            ) : (
              'تأكيد الطلب'
            )}
          </Button>
          <p className="mt-2 text-center text-[11px] text-[var(--color-text-muted)]">
            الأسعار تُحسب من الخادم
          </p>
        </Sheet>
      )}
    </div>
  );
}

/**
 * Bottom sheet with drag-to-dismiss gesture.
 * Pull the handle down past threshold (80px) or tap X to close.
 */
function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  // Focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const el = sheetRef.current;
      if (!el) return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    },
    [onClose]
  );

  // Scroll lock + keyboard listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflowY = 'scroll';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      window.scrollTo(0, scrollY);
    };
  }, [handleKeyDown]);

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
    currentY.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    const dy = e.touches[0].clientY - startY.current;
    if (dy < 0) return;
    currentY.current = dy;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
      sheetRef.current.style.transition = 'none';
    }
  }

  function onTouchEnd() {
    if (currentY.current > 80) onClose();
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
      sheetRef.current.style.transition = '';
    }
    currentY.current = 0;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={sheetRef}
        className="max-h-dvh w-full max-w-lg overflow-y-auto rounded-t-[12px] bg-[var(--color-surface)] pb-safe-bottom shadow-xl transition-transform duration-300 sm:max-h-[85vh] sm:rounded-[12px] animate-slide-up"
      >
        {/* Drag handle + header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Drag handle indicator */}
            <div
              className="flex cursor-grab touch-none items-center justify-center active:cursor-grabbing"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <GripHorizontal className="h-4 w-4 text-[var(--color-text-muted)]" />
            </div>
            <h3 className="text-sm font-bold">{title}</h3>
          </div>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-[8px] transition-colors hover:bg-[var(--color-bg)]"
          >
            <X className="mx-auto h-5 w-5 text-[var(--color-text-muted)]" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
