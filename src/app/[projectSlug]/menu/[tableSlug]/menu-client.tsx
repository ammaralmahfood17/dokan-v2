'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, ShoppingBag, X, Check, Bell, FileText, Search, Languages } from 'lucide-react';
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
// D2: extracted sections — bottom sheet + product row now live in
// src/components/menu/ (menu-client stays the orchestrator).
import { Sheet } from '@/components/menu/sheet';
import { MenuProductRow } from '@/components/menu/product-card';
// D7: offline indicator on the customer-facing menu (banner, not blocker).
import { OfflineBanner } from '@/components/ui/offline-banner';

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
  // D10: persistent order error with a retry button (toast alone vanishes
  // and the customer is left guessing what happened).
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderDone, setOrderDone] = useState<{
    id: string;
    totalAmount: number;
    orderNumber: number;
  } | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [busyAction, setBusyAction] = useState<'waiter' | 'bill' | null>(null);
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);
  const lastAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // بحث في المنتجات (فقط للمنيو الكبير — 12+ منتج)
  const [menuQuery, setMenuQuery] = useState('');
  // تبديل لغة العرض: عربي / English (يستخدم name_en عندما متاح)
  const [lang, setLang] = useState<'ar' | 'en'>('ar');

  const displayName = useCallback(
    (p: ProductWithAddons) =>
      lang === 'en' && p.name_en ? p.name_en : p.name,
    [lang]
  );

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
    let list = products;
    if (activeCategory !== 'all') {
      list = list.filter((p) => p.category_id === activeCategory);
    }
    const q = menuQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.name_en ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, activeCategory, menuQuery]);

  // البحث يظهر فقط للمنيو الكبير (12+ منتج) — لا يزحم المنيو الصغير
  const showMenuSearch = products.length >= 12;

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
        // D10: keep the error visible next to the confirm button so the
        // customer can retry — a toast disappears and leaves them stuck.
        setOrderError(data.error || 'فشل إرسال الطلب');
        return;
      }
      setOrderError(null);
      setOrderDone({
        id: data.order.id,
        totalAmount: data.order.totalAmount,
        orderNumber: data.order.orderNumber,
      });
      setCart([]);
      setCartOpen(false);
      setOrderNotes('');
      setItemNotes('');
    } catch {
      setOrderError('تعذّر الاتصال — تحقق من الإنترنت ثم أعد المحاولة');
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

  /** Render a single product row — mockup: square 72px image, price, add-btn */
  function renderProduct(p: ProductWithAddons, isFirst = false) {
    return (
      <MenuProductRow
        key={p.id}
        product={p}
        currency={currency}
        isFirst={isFirst}
        lastAdded={lastAddedKey === p.id}
        displayName={displayName(p)}
        onQuickAdd={quickAdd}
      />
    );
  }

  // ======== MAIN MENU ========
  return (
    <div className="min-h-dvh bg-[var(--color-bg)] pb-24 page-enter">
      {/* D7: offline notice — replaces the full-screen blocker (design: the
          customer should still be able to browse the cached menu) */}
      <OfflineBanner />
      {/* HEADER — brand mark + TABLE chip */}
      <header
        className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3.5"
      >
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-text)] font-display text-[18px] font-bold text-[var(--color-primary)]"
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
          {/* Table chip */}
          <div className="flex items-center gap-1.5">
            <div
              className="relative px-2.5 py-1 font-mono text-[12px] font-semibold tabular-nums text-[var(--color-primary)]"
              style={{ border: '1.5px solid var(--color-primary)' }}
            >
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

      {/* CATEGORIES — pills, active = primary (mockup) */}
      {categories.length > 0 && (
        <div className="sticky top-[57px] z-[var(--z-sticky)] border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          {/* FIX-R-003: fade على الحواف يشير لوجود محتوى إضافي (scrollbar مخفي) */}
          <div
            className="mx-auto flex max-w-[480px] gap-2 overflow-x-auto px-3 pb-1 pt-1"
            style={{
              scrollbarWidth: 'none',
              maskImage: 'linear-gradient(to left, transparent, black 24px)',
              WebkitMaskImage: 'linear-gradient(to left, transparent, black 24px)',
            }}
          >
            <button
              type="button"
              onClick={() => handleCategoryChange('all')}
              className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors ${
                activeCategory === 'all'
                  ? 'bg-[var(--color-text)] text-[var(--color-primary)]'
                  : 'bg-[var(--color-surface-sunken)] text-[var(--color-text)] hover:bg-[var(--color-border)]'
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
                    ? 'bg-[var(--color-text)] text-[var(--color-primary)]'
                    : 'bg-[var(--color-surface-sunken)] text-[var(--color-text)] hover:bg-[var(--color-border)]'
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
        {/* Search + language toggle — search only for big menus */}
        <div className="mb-4 flex items-center gap-2">
          {showMenuSearch && (
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type="search"
                inputMode="search"
                value={menuQuery}
                onChange={(e) => setMenuQuery(e.target.value)}
                placeholder="ابحث عن منتج…"
                aria-label="ابحث في القائمة"
                maxLength={60}
                className="input min-h-[44px] w-full ps-10 pe-10"
              />
              {menuQuery && (
                <button
                  type="button"
                  onClick={() => setMenuQuery('')}
                  aria-label="مسح البحث"
                  className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {products.some((p) => p.name_en) && (
            <button
              type="button"
              onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
              aria-label={lang === 'ar' ? 'التبديل إلى الإنجليزية' : 'Switch to Arabic'}
              aria-pressed={lang === 'en'}
              className="flex h-[44px] shrink-0 items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)]"
            >
              <Languages className="h-4 w-4" />
              {lang === 'ar' ? 'EN' : 'عربي'}
            </button>
          )}
        </div>
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

      {/* CART FLOATING BAR — ink bar (mockup), primary accents */}
      {cartBadge && (
        <div className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] p-3 pb-safe-bottom">
          <div className="mx-auto w-full max-w-[480px] px-1 pb-1">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex w-full items-center justify-between bg-[var(--color-text)] px-4 py-3.5 text-[var(--color-bg)] shadow-lg transition-transform active:scale-[0.98]"
            >

              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center bg-[var(--color-primary)] font-mono text-[13px] font-bold tabular-nums text-[var(--color-text)]">
                  {itemCount}
                </span>
                <span className="text-start">
                  <span className="block text-[14px] font-semibold">عرض السلة</span>
                  <span className="mt-0.5 block text-[11px] opacity-60">
                    الدفع نقدًا عند الاستلام
                  </span>
                </span>
              </span>
              <span className="font-mono text-[15px] font-bold tabular-nums text-[var(--color-primary)]" dir="ltr">
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
          {/* D10: retry — persistent error with a one-tap retry button */}
          {orderError && (
            <div
              role="alert"
              className="mt-3 rounded-[8px] border border-[var(--color-danger)] bg-[var(--color-danger-tint)] p-3 text-center"
            >
              <p className="mb-2 text-[12.5px] font-semibold text-[var(--color-danger)]">
                {orderError}
              </p>
              <Button
                block
                size="sm"
                variant="danger"
                disabled={submitting}
                onClick={() => {
                  setOrderError(null);
                  placeOrder();
                }}
              >
                إعادة المحاولة
              </Button>
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-[var(--color-text-muted)]">
            الأسعار تُحسب من الخادم
          </p>
        </Sheet>
      )}
    </div>
  );
}
