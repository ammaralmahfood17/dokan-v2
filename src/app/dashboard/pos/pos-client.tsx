'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { formatMoney, money } from '@/lib/utils';
import type { OrderType, Product, ProductAddon } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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
  currency,
  products,
}: {
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
    () => money(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)),
    [lines]
  );

  function openProduct(p: ProductWithAddons) {
    if (p.product_addons?.length) {
      setPicker(p);
      setSelectedAddons([]);
    } else {
      addLine(p, [], []);
    }
  }

  function addLine(
    p: ProductWithAddons,
    addonIds: string[],
    addonLabels: string[]
  ) {
    const addonTotal = money(
      (p.product_addons || [])
        .filter((a) => addonIds.includes(a.id))
        .reduce((s, a) => s + Number(a.price), 0)
    );
    const unitPrice = money(Number(p.price) + addonTotal);
    const key = `${p.id}:${addonIds.sort().join(',')}`;
    setLines((prev) => {
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
          unitPrice,
          quantity: 1,
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
    const startTime = Date.now();
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
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition-all min-h-[44px] ${type === value ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]'}`}
            aria-pressed={type === value}
          >
            {label}
          </button>
        ))}
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
                  className="card card-body text-start transition-colors hover:border-[var(--color-primary)]"
                >
                  <p className="text-sm font-bold">{p.name}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-primary)]">
                    {formatMoney(Number(p.price), currency)}
                  </p>
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
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setLines((prev) => prev.filter((x) => x.key !== l.key))
                        }
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
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اختياري"
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
              {submitting ? 'جاري الإرسال…' : 'تأكيد الطلب'}
            </Button>
          </div>
        </div>
      </div>

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
