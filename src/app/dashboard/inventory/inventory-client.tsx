'use client';

import { useMemo, useState } from 'react';
import { Plus, Boxes, Truck, Wallet, Trash2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, money, currencyDecimals } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { PageHeader } from '@/components/dashboard/page-header';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type InventoryItem,
  type Supplier,
} from '@/lib/types';

type Tab = 'inventory' | 'suppliers' | 'expenses';

export function InventoryClient({
  projectId,
  currency,
  initialItems,
  initialSuppliers,
  initialExpenses,
}: {
  projectId: string;
  currency: string;
  initialItems: InventoryItem[];
  initialSuppliers: Supplier[];
  initialExpenses: Expense[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>('inventory');
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);

  const [showItem, setShowItem] = useState(false);
  const [showSupplier, setShowSupplier] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [saving, setSaving] = useState(false);

  const decimals = currencyDecimals(currency);
  const lowStock = useMemo(
    () => items.filter((i) => i.is_active && i.qty_on_hand <= i.reorder_level),
    [items]
  );

  const expenseTotal = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount), 0),
    [expenses]
  );

  async function refresh() {
    router.refresh();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(form.get('name') ?? '').trim();
    if (!name) {
      toast.error('اسم الصنف مطلوب');
      return;
    }
    const qty = Number(form.get('qty') ?? 0);
    const cost = money(Number(form.get('cost') ?? 0), decimals);
    setSaving(true);
    const { error } = await supabase.from('inventory_items').insert({
      project_id: projectId,
      name,
      sku: String(form.get('sku') ?? '').trim() || null,
      unit: String(form.get('unit') ?? 'قطعة').trim() || 'قطعة',
      qty_on_hand: qty,
      reorder_level: Number(form.get('reorder') ?? 0),
      cost,
      supplier_id: String(form.get('supplier') ?? '') || null,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      toast.error('تعذّر إضافة الصنف');
      return;
    }
    toast.success('أُضيف الصنف للمخزون');
    setShowItem(false);
    router.refresh();
  }

  async function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(form.get('name') ?? '').trim();
    if (!name) {
      toast.error('اسم المورد مطلوب');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('suppliers').insert({
      project_id: projectId,
      name,
      contact_name: String(form.get('contact') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      email: String(form.get('email') ?? '').trim() || null,
      notes: String(form.get('notes') ?? '').trim() || null,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      toast.error('تعذّر إضافة المورد');
      return;
    }
    toast.success('أُضيف المورد');
    setShowSupplier(false);
    router.refresh();
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const amount = money(Number(form.get('amount') ?? 0), decimals);
    if (amount <= 0) {
      toast.error('أدخل مبلغًا صحيحًا');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      project_id: projectId,
      category: String(form.get('category') ?? 'أخرى'),
      amount,
      description: String(form.get('description') ?? '').trim() || null,
      occurred_on: String(form.get('date') ?? new Date().toISOString().slice(0, 10)),
    });
    setSaving(false);
    if (error) {
      toast.error('تعذّر تسجيل المصروف');
      return;
    }
    toast.success('سُجّل المصروف');
    setShowExpense(false);
    router.refresh();
  }

  async function deleteRow(table: 'inventory_items' | 'suppliers' | 'expenses', id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) {
      toast.success('حُذف السجل');
      router.refresh();
    } else {
      toast.error('تعذّر الحذف');
    }
  }

  const tabs: { value: Tab; label: string; icon: typeof Boxes; count?: number }[] = [
    { value: 'inventory', label: 'المخزون', icon: Boxes, count: items.length },
    { value: 'suppliers', label: 'الموردون', icon: Truck, count: suppliers.length },
    { value: 'expenses', label: 'المصروفات', icon: Wallet },
  ];

  return (
    <div className="page">
      <PullToRefresh onRefresh={refresh}>
        <PageHeader
          kicker="الإدارة · ERP / Back-Office"
          title="المخزون والموردون"
          description="إدارة الأصناف، حدود التنبيه، الموردين، وتسجيل المصروفات"
        />

        {/* Low stock alert */}
        {lowStock.length > 0 && tab === 'inventory' && (
          <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-warn)]/25 bg-[var(--color-warn-tint)] px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warn)]" />
            <div>
              <p className="text-[12.5px] font-bold text-[var(--color-warn)]">
                تنبيه مخزون منخفض — {lowStock.length} صنف تحت حد الطلب
              </p>
              <p className="mt-0.5 text-[11.5px] text-[var(--color-warn-hover)]">
                {lowStock.slice(0, 4).map((i) => i.name).join('، ')}
                {lowStock.length > 4 ? ` +${lowStock.length - 4}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs mb-5">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`tab flex min-h-11 items-center gap-1.5 ${tab === t.value ? 'active' : ''}`}
              onClick={() => setTab(t.value)}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {typeof t.count === 'number' && ` (${t.count})`}
            </button>
          ))}
        </div>

        {tab === 'inventory' && (
          <>
            <div className="mb-4 flex justify-end">
              <Button size="sm" onClick={() => setShowItem(true)}>
                <Plus className="h-4 w-4" />
                صنف جديد
              </Button>
            </div>
            {items.length === 0 ? (
              <div className="border border-[var(--color-border)] bg-[var(--color-surface)]">
                <EmptyState
                  icon={<Boxes className="h-8 w-8" />}
                  title="المخزون فارغ"
                  description="أضف أول صنف لتتبّع الكميات وتكاليف المطبخ."
                  action={
                    <Button size="sm" onClick={() => setShowItem(true)}>
                      <Plus className="h-4 w-4" />
                      إضافة صنف
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                <table className="data-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th>الصنف</th>
                      <th>الوحدة</th>
                      <th>الكمية</th>
                      <th>حد الطلب</th>
                      <th>تكلفة الوحدة</th>
                      <th>قيمة المخزون</th>
                      <th className="text-end">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const low = i.qty_on_hand <= i.reorder_level;
                      return (
                        <tr key={i.id}>
                          <td>
                            <div className="font-semibold">{i.name}</div>
                            {i.sku && (
                              <div className="font-mono text-[11px] text-[var(--color-text-muted)]" dir="ltr">
                                {i.sku}
                              </div>
                            )}
                          </td>
                          <td className="text-[12px] text-[var(--color-text-secondary)]">{i.unit}</td>
                          <td>
                            <span
                              className={`inline-flex items-center gap-1.5 font-mono text-[12.5px] font-bold tabular-nums ${
                                low ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'
                              }`}
                            >
                              {low && <AlertTriangle className="h-3 w-3" />}
                              {i.qty_on_hand}
                            </span>
                          </td>
                          <td className="font-mono text-[12px] tabular-nums text-[var(--color-text-secondary)]">
                            {i.reorder_level}
                          </td>
                          <td className="font-mono text-[12.5px] tabular-nums" dir="ltr">
                            {formatMoney(i.cost, currency)}
                          </td>
                          <td className="font-mono text-[12.5px] font-bold tabular-nums" dir="ltr">
                            {formatMoney(Number(i.qty_on_hand) * Number(i.cost), currency)}
                          </td>
                          <td>
                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => deleteRow('inventory_items', i.id)}
                                aria-label="حذف الصنف"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'suppliers' && (
          <>
            <div className="mb-4 flex justify-end">
              <Button size="sm" onClick={() => setShowSupplier(true)}>
                <Plus className="h-4 w-4" />
                مورد جديد
              </Button>
            </div>
            {suppliers.length === 0 ? (
              <div className="border border-[var(--color-border)] bg-[var(--color-surface)]">
                <EmptyState
                  icon={<Truck className="h-8 w-8" />}
                  title="لا يوجد موردون"
                  description="أضف مورديك لإسناد الأصناف إليهم وتنظيم الطلبيات."
                  action={
                    <Button size="sm" onClick={() => setShowSupplier(true)}>
                      <Plus className="h-4 w-4" />
                      إضافة مورد
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                <table className="data-table min-w-[680px]">
                  <thead>
                    <tr>
                      <th>المورد</th>
                      <th>جهة الاتصال</th>
                      <th>الهاتف</th>
                      <th>الأصناف</th>
                      <th className="text-end">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => {
                      const itemCount = items.filter((i) => i.supplier_id === s.id).length;
                      return (
                        <tr key={s.id}>
                          <td className="font-semibold">{s.name}</td>
                          <td className="text-[12.5px] text-[var(--color-text-secondary)]">
                            {s.contact_name || '—'}
                          </td>
                          <td className="font-mono text-[12px] tabular-nums" dir="ltr">
                            {s.phone || '—'}
                          </td>
                          <td className="text-[12.5px] text-[var(--color-text-secondary)]">
                            {itemCount} صنف
                          </td>
                          <td>
                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => deleteRow('suppliers', s.id)}
                                aria-label="حذف المورد"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'expenses' && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 shadow-sm">
                <p className="text-[11px] font-semibold text-[var(--color-text-secondary)]">إجمالي المصروفات (آخر 100)</p>
                <p className="font-mono text-lg font-bold tabular-nums" dir="ltr">
                  {formatMoney(expenseTotal, currency)}
                </p>
              </div>
              <Button size="sm" onClick={() => setShowExpense(true)}>
                <Plus className="h-4 w-4" />
                تسجيل مصروف
              </Button>
            </div>
            {expenses.length === 0 ? (
              <div className="border border-[var(--color-border)] bg-[var(--color-surface)]">
                <EmptyState
                  icon={<Wallet className="h-8 w-8" />}
                  title="لا توجد مصروفات"
                  description="سجّل المصروفات اليومية لتظهر في تقارير الأرباح والخسائر."
                  action={
                    <Button size="sm" onClick={() => setShowExpense(true)}>
                      <Plus className="h-4 w-4" />
                      تسجيل مصروف
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                <table className="data-table min-w-[680px]">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>التصنيف</th>
                      <th>الوصف</th>
                      <th>المبلغ</th>
                      <th className="text-end">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((x) => (
                      <tr key={x.id}>
                        <td className="font-mono text-[12px] tabular-nums text-[var(--color-text-secondary)]">
                          {new Date(`${x.occurred_on}T00:00:00`).toLocaleDateString('ar-BH-u-nu-latn', {
                            timeZone: 'Asia/Bahrain',
                          })}
                        </td>
                        <td>
                          <span className="badge bg-[var(--color-surface-sunken)] text-[var(--color-text-secondary)]">
                            {x.category}
                          </span>
                        </td>
                        <td className="max-w-[260px] truncate text-[12.5px] text-[var(--color-text-secondary)]">
                          {x.description || '—'}
                        </td>
                        <td className="font-mono text-[12.5px] font-bold tabular-nums text-[var(--color-danger)]" dir="ltr">
                          −{formatMoney(x.amount, currency)}
                        </td>
                        <td>
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => deleteRow('expenses', x.id)}
                              aria-label="حذف المصروف"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </PullToRefresh>

      {/* Add inventory item */}
      {showItem && (
        <Modal title="إضافة صنف مخزون" onClose={() => setShowItem(false)} className="max-w-md">
          <form onSubmit={addItem} className="space-y-4">
            <div className="field">
              <label className="label">اسم الصنف *</label>
              <input className="input" name="name" maxLength={100} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="label">SKU (اختياري)</label>
                <input className="input" name="sku" maxLength={40} />
              </div>
              <div className="field">
                <label className="label">الوحدة</label>
                <input className="input" name="unit" maxLength={20} defaultValue="قطعة" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="label">الكمية الحالية</label>
                <input className="input" name="qty" inputMode="decimal" maxLength={12} defaultValue="0" />
              </div>
              <div className="field">
                <label className="label">حد إعادة الطلب</label>
                <input className="input" name="reorder" inputMode="decimal" maxLength={12} defaultValue="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="label">تكلفة الوحدة ({currency})</label>
                <input className="input" name="cost" inputMode="decimal" maxLength={12} defaultValue="0" />
              </div>
              <div className="field">
                <label className="label">المورد</label>
                <select className="select" name="supplier">
                  <option value="">بدون</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowItem(false)}>
                إلغاء
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'جاري الحفظ…' : 'إضافة'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add supplier */}
      {showSupplier && (
        <Modal title="إضافة مورد" onClose={() => setShowSupplier(false)} className="max-w-md">
          <form onSubmit={addSupplier} className="space-y-4">
            <div className="field">
              <label className="label">اسم المورد *</label>
              <input className="input" name="name" maxLength={100} required />
            </div>
            <div className="field">
              <label className="label">جهة الاتصال</label>
              <input className="input" name="contact" maxLength={100} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="label">الهاتف</label>
                <input className="input" name="phone" type="tel" inputMode="tel" maxLength={20} />
              </div>
              <div className="field">
                <label className="label">البريد</label>
                <input className="input" name="email" type="email" maxLength={200} />
              </div>
            </div>
            <div className="field">
              <label className="label">ملاحظات</label>
              <textarea className="textarea" name="notes" maxLength={300} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowSupplier(false)}>
                إلغاء
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'جاري الحفظ…' : 'إضافة'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add expense */}
      {showExpense && (
        <Modal title="تسجيل مصروف" onClose={() => setShowExpense(false)} className="max-w-md">
          <form onSubmit={addExpense} className="space-y-4">
            <div className="field">
              <label className="label">التصنيف</label>
              <select className="select" name="category" defaultValue="مواد خام">
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">المبلغ ({currency}) *</label>
              <input className="input" name="amount" inputMode="decimal" maxLength={12} required />
            </div>
            <div className="field">
              <label className="label">التاريخ</label>
              <input
                className="input"
                name="date"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                maxLength={10}
              />
            </div>
            <div className="field">
              <label className="label">الوصف</label>
              <textarea className="textarea" name="description" maxLength={300} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowExpense(false)}>
                إلغاء
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'جاري الحفظ…' : 'تسجيل'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
