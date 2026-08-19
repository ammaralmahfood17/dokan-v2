import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Download, Plus, AlertTriangle, CheckCircle2, Receipt, BarChart3 } from 'lucide-react';
import { formatMoney } from '@/lib/utils';

export default async function BudgetPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const supabase = await createClient();
  const TZ = 'Asia/Bahrain';
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = new Date(Date.parse(`${dayFmt.format(new Date())}T00:00:00+03:00`));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    { data: expenses },
    { data: monthOrders },
    { data: cancelledOrders },
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount, category, description, created_at')
      .eq('project_id', ctx.project.id)
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', monthStart.toISOString())
      .eq('status', 'cancelled'),
  ]);

  const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  const totalRevenue = (monthOrders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const totalCancelled = (cancelledOrders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const orderCount = (monthOrders ?? []).length;
  const avgOrder = orderCount > 0 ? totalRevenue / orderCount : 0;
  const net = totalRevenue - totalExpenses - totalCancelled;

  const categoryMap = new Map<string, { amount: number; count: number }>();
  for (const e of expenses ?? []) {
    const cur = categoryMap.get(e.category) ?? { amount: 0, count: 0 };
    cur.amount += Number(e.amount ?? 0);
    cur.count += 1;
    categoryMap.set(e.category, cur);
  }
  const topCategories = [...categoryMap.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 6);
  const maxCategory = topCategories[0]?.[1].amount ?? 1;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-kicker"><span>المالية</span></div>
          <h1>الميزانية والمصروفات</h1>
          <p>تتبع المصروفات مقابل الإيرادات الشهرية</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary">
            <Download className="h-4 w-4" />
            تصدير Excel
          </button>
          <button className="btn btn-primary">
            <Plus className="h-4 w-4" />
            إضافة مصروف
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">إجمالي الإيرادات</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-success-tint)] text-[var(--color-success)]">
              <Receipt className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-[var(--color-success)]" dir="ltr">
            {formatMoney(totalRevenue, ctx.project.currency)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)]">
              <div className="h-1.5 rounded-full bg-[var(--color-success)]" style={{ width: '100%' }} />
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{orderCount.toLocaleString('ar-BH-u-nu-latn')} طلب</span>
          </div>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">إجمالي المصروفات</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-danger-tint)] text-[var(--color-danger)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-[var(--color-danger)]" dir="ltr">
            {formatMoney(totalExpenses, ctx.project.currency)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)]">
              <div className="h-1.5 rounded-full bg-[var(--color-danger)]" style={{ width: `${Math.min(100, totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0)}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{(expenses ?? []).length.toLocaleString('ar-BH-u-nu-latn')} مصروف</span>
          </div>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">صافي الرصيد</p>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${net >= 0 ? 'bg-[var(--color-success-tint)] text-[var(--color-success)]' : 'bg-[var(--color-danger-tint)] text-[var(--color-danger)]'}`}>
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className={`mt-3 font-mono text-[28px] font-bold tabular-nums ${net >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`} dir="ltr">
            {formatMoney(net, ctx.project.currency)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">بعد خصم المصروفات والملغى</p>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">متوسط الطلب</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-warn-tint)] text-[var(--color-warn)]">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-[var(--color-text)]" dir="ltr">
            {formatMoney(avgOrder, ctx.project.currency)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">متوسط قيمة الطلب</p>
        </div>
      </div>

      {/* Categories */}
      <div className="mb-8 card card-body">
        <h2 className="mb-4 text-lg font-bold text-[var(--color-text)]">توزيع المصروفات حسب البند</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topCategories.map(([cat, data]) => (
            <div key={cat} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--color-text)]">{cat}</p>
                <span className="text-xs text-[var(--color-text-secondary)]">{data.count} مصروف</span>
              </div>
              <p className="mt-2 font-mono text-lg font-bold text-[var(--color-text)]" dir="ltr">
                {formatMoney(data.amount, ctx.project.currency)}
              </p>
              <div className="mt-3 h-2 w-full rounded-full bg-[var(--color-border)]">
                <div
                  className="h-2 rounded-full bg-[var(--color-primary)]"
                  style={{ width: `${Math.min(100, (data.amount / maxCategory) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {topCategories.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-[var(--color-text-muted)]">
              لا توجد مصروفات لهذا الشهر
            </div>
          )}
        </div>
      </div>

      {/* Recent Expenses */}
      <div className="card card-body">
        <h2 className="mb-4 text-lg font-bold text-[var(--color-text)]">المصروفات الأخيرة</h2>
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide">التاريخ</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide">الوصف</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide">البند</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-left" dir="ltr">المبلغ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(expenses ?? []).slice(0, 20).map((e, idx) => (
                <tr key={`${e.created_at}-${e.amount}-${idx}`} className="group transition-colors hover:bg-[var(--color-primary-tint)]">
                  <td className="px-5 py-4 text-[var(--color-text-secondary)]">
                    {new Date(e.created_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: TZ, month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-5 py-4 font-semibold text-[var(--color-text)]">{e.description ?? '—'}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center rounded-full bg-[var(--color-bg)] px-2.5 py-1 text-xs font-bold text-[var(--color-text-secondary)]">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono text-base font-bold text-[var(--color-danger)]" dir="ltr">
                    -{formatMoney(Number(e.amount ?? 0), ctx.project.currency)}
                  </td>
                </tr>
              ))}
              {(expenses ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                    لا توجد مصروفات لهذا الشهر
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
