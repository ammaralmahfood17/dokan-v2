import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Download, Plus, AlertTriangle, CheckCircle2, Receipt, BarChart3 } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { Btn, Card, StatStrip, Tag } from '@/components/dashboard/primitives';
import { PageHeader } from '@/components/dashboard/page-header';

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
      <PageHeader
        crumb={['دكان', 'المالية', 'الميزانية']}
        title="الميزانية والمصروفات"
        sub="تتبع المصروفات مقابل الإيرادات الشهرية"
        secondary={<Btn variant="secondary" icon={Download}>تصدير Excel</Btn>}
        primary={<Btn variant="gold" icon={Plus}>إضافة بند</Btn>}
      />

      {/* KPI strip */}
      <div className="mb-4">
        <StatStrip
          cells={[
            {
              label: 'إجمالي الإيرادات',
              value: formatMoney(totalRevenue, ctx.project.currency),
              icon: Receipt,
            },
            {
              label: 'إجمالي المصروفات',
              value: formatMoney(totalExpenses, ctx.project.currency),
              icon: AlertTriangle,
            },
            {
              label: 'صافي الرصيد',
              value: formatMoney(net, ctx.project.currency),
              icon: CheckCircle2,
            },
            {
              label: 'متوسط الطلب',
              value: formatMoney(avgOrder, ctx.project.currency),
              icon: BarChart3,
            },
          ]}
        />
      </div>

      {/* Categories */}
      <Card className="mb-4">
        <h2 className="mb-4 text-sm font-bold">توزيع المصروفات حسب البند</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topCategories.map(([cat, data]) => {
            const pct = Math.min(100, Math.round((data.amount / maxCategory) * 100));
            return (
              <div key={cat} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{cat}</p>
                  <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{data.count} مصروف</span>
                </div>
                <p className="mt-2 font-mono text-lg font-bold tabular-nums" dir="ltr">
                  {formatMoney(data.amount, ctx.project.currency)}
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                  {pct.toLocaleString('ar-BH-u-nu-latn')}٪ من أعلى بند
                </p>
              </div>
            );
          })}
          {topCategories.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-[var(--color-text-muted)]">
              لا توجد مصروفات لهذا الشهر
            </div>
          )}
        </div>
      </Card>

      {/* Recent Expenses */}
      <div className="table-card">
        <div className="table-wrap">
          <table className="ref-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الوصف</th>
                <th>البند</th>
                <th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {(expenses ?? []).slice(0, 20).map((e, idx) => (
                <tr key={`${e.created_at}-${e.amount}-${idx}`}>
                  <td className="text-[var(--color-text-secondary)]">
                    {new Date(e.created_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: TZ, month: 'short', day: 'numeric' })}
                  </td>
                  <td className="font-semibold">{e.description ?? '—'}</td>
                  <td>
                    <Tag bg="#EEF0EC" fg="#66716D">{e.category}</Tag>
                  </td>
                  <td className="font-mono text-base font-bold tabular-nums text-[var(--color-danger)]" dir="ltr">
                    -{formatMoney(Number(e.amount ?? 0), ctx.project.currency)}
                  </td>
                </tr>
              ))}
              {(expenses ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                    لا توجد مصروفات لهذا الشهر
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pager">
          <p>
            عرض ١–{Math.min((expenses ?? []).length, 20).toLocaleString('ar-BH-u-nu-latn')} من {(expenses ?? []).length.toLocaleString('ar-BH-u-nu-latn')}
          </p>
        </div>
      </div>
    </div>
  );
}