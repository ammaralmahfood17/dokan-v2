'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Minus, Plus, ShoppingBag, X, Check, Bell, FileText, GripHorizontal } from 'lucide-react';
import Image from 'next/image';
import { formatMoney, money } from '@/lib/utils';
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

  // Ref for smooth-scrolling to products section
  const productsRef = useRef<HTMLDivElement>(null);

  const primary = project.primary_color || '#4338CA';
  const currency = project.currency;

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return products;
    return products.filter((p) => p.category_id === activeCategory);
  }, [products, activeCategory]);

  const total = useMemo(
    () => money(cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0)),
    [cart]
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
        price: money(Number(a.price)),
      }));
    const addonTotal = money(addons.reduce((s, a) => s + a.price, 0));
    const unitPrice = money(Number(picker.price) + addonTotal);
    const key = `${picker.id}:${addons
      .map((a) => a.id)
      .sort()
      .join(',')}:${itemNotes.trim()}`;

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

    // Visual feedback: flash badge + toast
    setLastAddedKey(key);
    if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
    lastAddedTimer.current = setTimeout(() => setLastAddedKey(null), 800);
    toast.success('أُضيف إلى السلة', { duration: 1200 });
  }

  // Quick-Add: add directly without addon picker
  function quickAdd(p: ProductWithAddons) {
    if ((p.product_addons || []).filter((a) => a.is_available).length > 0) {
      openProduct(p);
      return;
    }
    const key = `${p.id}::`;
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
          unitPrice: money(Number(p.price)),
          quantity: 1,
          addons: [],
          notes: '',
        },
      ];
    });
    // Visual feedback
    setLastAddedKey(p.id);
    if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
    lastAddedTimer.current = setTimeout(() => setLastAddedKey(null), 800);
    toast.success('أُضيف إلى السلة', { duration: 1200 });
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
          style={{ background: primary }}
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

  // ======== MAIN MENU ========
  return (
    <div className="min-h-dvh bg-[var(--color-bg)] pb-24 page-enter">
      {/* HEADER */}
      <header
        className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
        style={{ borderBottomColor: `${primary}22` }}
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-sm font-bold text-white"
              style={{ background: primary }}
            >
              {project.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold">{project.name}</h1>
              <p className="text-xs text-[var(--color-text-secondary)]">
                طاولة {table.number}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => callService('waiter')}
              className="min-h-[44px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-bold transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
            موظف
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => callService('bill')}
              className="min-h-[44px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-bold transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              فاتورة
            </button>
          </div>
        </div>
      </header>

      {/* CATEGORIES */}
      {categories.length > 0 && (
        <div className="sticky top-[57px] z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="mx-auto flex max-w-lg gap-1 overflow-x-auto px-3 py-2">
            <button
              type="button"
              onClick={() => handleCategoryChange('all')}
              className={`min-h-[44px] shrink-0 rounded-full px-4 py-1.5 text-xs font-bold ${
                activeCategory === 'all'
                  ? 'text-white'
                  : 'border border-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
              style={
                activeCategory === 'all' ? { background: primary } : undefined
              }
            >
              الكل
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleCategoryChange(c.id)}
                className={`min-h-[44px] shrink-0 rounded-full px-4 py-1.5 text-xs font-bold ${
                  activeCategory === c.id
                    ? 'text-white'
                    : 'border border-[var(--color-border)] text-[var(--color-text-secondary)]'
                }`}
                style={
                  activeCategory === c.id ? { background: primary } : undefined
                }
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PRODUCTS */}
      <main ref={productsRef} className="mx-auto max-w-lg space-y-3 px-3 py-4">
        {!filtered.length ? (
          <div className="card empty">
            <h3>القائمة فارغة</h3>
            <p className="text-sm">لا توجد منتجات متاحة حالياً.</p>
          </div>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => quickAdd(p)}
              className="card flex w-full items-start gap-3 p-3 text-start transition-all duration-150 hover:border-slate-300 active:scale-[0.98]"
            >
              {p.image_url ? (
                <Image
                  src={p.image_url}
                  alt={p.name}
                  width={64}
                  height={64}
                  placeholder="blur"
                  blurDataURL={BLUR_PLACEHOLDER}
                  className="h-16 w-16 shrink-0 rounded-[8px] object-cover"
                />
              ) : (
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[8px] text-lg font-bold text-white/90"
                  style={{ background: `${primary}22`, color: primary }}
                >
                  {p.name.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{p.name}</p>
                {p.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-secondary)]">
                    {p.description}
                  </p>
                )}
                <p
                  className="mt-1 text-sm font-bold"
                  style={{ color: primary }}
                >
                  {formatMoney(Number(p.price), currency)}
                </p>
              </div>
              <span
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-white transition-transform duration-200 ${
                  lastAddedKey === p.id ? 'scale-125' : 'scale-100'
                }`}
                style={{ background: primary }}
              >
                <Plus className="h-5 w-5" />
                {/* Quick flash badge */}
                {lastAddedKey === p.id && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </span>
            </button>
          ))
        )}
      </main>

      {/* CART FLOATING BAR */}
      {cartBadge && (
        <div className="fixed inset-x-0 bottom-0 z-30 animate-slide-up p-3 pb-safe-bottom">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-lg items-center justify-between rounded-[10px] px-4 py-3 text-white shadow-lg transition-transform active:scale-[0.98]"
            style={{ background: primary }}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <span className="relative">
                <ShoppingBag className="h-5 w-5" />
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white text-[10px] font-bold"
                  style={{ color: primary }}
                >
                  {itemCount}
                </span>
              </span>
              السلة
            </span>
            <span className="text-sm font-bold">
              {formatMoney(total, currency)}
            </span>
          </button>
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
          <p className="mb-3 text-base font-bold" style={{ color: primary }}>
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
              onChange={(e) => setItemNotes(e.target.value)}
              placeholder="مثال: بدون سكر"
            />
          </div>
          <Button block onClick={confirmAdd} style={{ background: primary }}>
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
                    className="min-h-[44px] min-w-[44px] rounded-lg border border-[var(--color-border)] text-sm font-bold transition-colors hover:bg-[var(--color-bg)]"
                    onClick={() => updateQty(l.key, 1)}
                  >
                    <Plus className="mx-auto h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
            style={{ background: primary }}
            className="min-h-[48px]"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
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

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
    currentY.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    const dy = e.touches[0].clientY - startY.current;
    if (dy < 0) return; // don't push up
    currentY.current = dy;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
      sheetRef.current.style.transition = 'none';
    }
  }

  function onTouchEnd() {
    if (currentY.current > 80) {
      onClose();
    }
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
      sheetRef.current.style.transition = '';
    }
    currentY.current = 0;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        ref={sheetRef}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[12px] bg-[var(--color-surface)] shadow-xl transition-transform duration-300 sm:rounded-[12px] animate-slide-up"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
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
