import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Download, Filter, Calendar, TrendingUp, BarChart3, FileText } from 'lucide-react';
import { formatMoney } from '@/lib/utils';

export default async function ReportsPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const supabase = await createClient();
  const TZ = 'Asia/Bahrain';
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = new Date(Date.parse(`${dayFmt.format(new Date())}T00:00:00+03:00`));
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);

  const [
    { data: weekOrders },
    { data: monthOrders },
    { data: topProductsRaw },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('total_amount, status, created_at')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', weekAgo.toISOString()),
    supabase
      .from('orders')
      .select('id, total_amount, status, created_at')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', monthAgo.toISOString()),
    supabase
      .from('order_items')
      .select('product_name, quantity, unit_price, orders!inner(created_at, status, project_id)')
      .eq('orders.project_id', ctx.project.id)
      .is('orders.service_type', null)
      .gte('orders.created_at', monthAgo.toISOString())
      .neq('orders.status', 'cancelled'),
  ]);

  const weekRevenue = (weekOrders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const monthRevenue = (monthOrders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const weekCount = (weekOrders ?? []).length;
  const monthCount = (monthOrders ?? []).length;
  const avgOrder = monthCount > 0 ? monthRevenue / monthCount : 0;

  const productMap = new Map<string, { qty: number; revenue: number }>();
  for (const item of topProductsRaw ?? []) {
    const cur = productMap.get(item.product_name) ?? { qty: 0, revenue: 0 };
    cur.qty += Number(item.quantity ?? 0);
    cur.revenue += Number(item.quantity ?? 0) * Number(item.unit_price ?? 0);
    productMap.set(item.product_name, cur);
  }
  const top5 = [...productMap.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-kicker"><span>التقارير</span></div>
          <h1>التقارير والتحليلات</h1>
          <p>تحليل أداء المبيعات والأصناف الأكثر ربحية</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary">
            <Filter className="h-4 w-4" />
            فلترة
          </button>
          <button className="btn btn-primary">
            <Download className="h-4 w-4" />
            تصدير PDF
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">إجمالي هذا الأسبوع</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-tint)] text-[var(--color-primary)]">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-[var(--color-text)]" dir="ltr">
            {formatMoney(weekRevenue, ctx.project.currency)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)]">
              <div className="h-1.5 rounded-full bg-[var(--color-primary)]" style={{ width: `${Math.min(100, (weekRevenue / (monthRevenue || 1)) * 100)}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{weekCount.toLocaleString('ar-BH-u-nu-latn')} طلب</span>
          </div>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">إجمالي هذا الشهر</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-gold-tint)] text-[var(--color-gold)]">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-[var(--color-text)]" dir="ltr">
            {formatMoney(monthRevenue, ctx.project.currency)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)]">
              <div className="h-1.5 rounded-full bg-[var(--color-gold)]" style={{ width: `${Math.min(100, (monthRevenue / (monthRevenue || 1)) * 100)}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{monthCount.toLocaleString('ar-BH-u-nu-latn')} طلب</span>
          </div>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">متوسط الطلب</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-info-tint)] text-[var(--color-info)]">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-[var(--color-text)]" dir="ltr">
            {formatMoney(avgOrder, ctx.project.currency)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">متوسط قيمة الطلب</p>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">أعلى صنف ربحية</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-success-tint)] text-[var(--color-success)]">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-[20px] font-bold text-[var(--color-text)]">
            {top5[0]?.[0] ?? '—'}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {top5[0] ? `${top5[0][1].qty.toLocaleString('ar-BH-u-nu-latn')} مبيع` : 'لا بيانات'}
          </p>
        </div>
      </div>

      {/* Top Products */}
      <div className="mb-8 card card-body">
        <h2 className="mb-4 text-lg font-bold text-[var(--color-text)]">الأصناف الأكثر مبيعاً</h2>
        <div className="space-y-3">
          {top5.map(([name, data], idx) => (
            <div key={name} className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary-tint)] text-xs font-bold text-[var(--color-primary)]">
                {idx + 1}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--color-text)]">{name}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">{data.qty.toLocaleString('ar-BH-u-nu-latn')} مبيع</p>
              </div>
              <p className="font-mono text-sm font-bold text-[var(--color-text)]" dir="ltr">
                {formatMoney(data.revenue, ctx.project.currency)}
              </p>
            </div>
          ))}
          {top5.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">لا بيانات كافية لهذه الفترة</p>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="card card-body">
        <h2 className="mb-4 text-lg font-bold text-[var(--color-text)]">الطلبات الأخيرة</h2>
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide">رقم الطلب</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide">التاريخ</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide">الحالة</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-left" dir="ltr">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(monthOrders ?? []).slice(0, 20).map((o) => (
                <tr key={o.id} className="group transition-colors hover:bg-[var(--color-primary-tint)]">
                  <td className="px-5 py-4">
                    <span className="inline-flex h-8 w-16 items-center justify-center rounded-lg bg-[var(--color-bg)] font-mono text-xs font-bold text-[var(--color-text)]">
                      #{String(o.id).slice(-6)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[var(--color-text-secondary)]">
                    {new Date(o.created_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                      o.status === 'cancelled' ? 'bg-[var(--color-danger-tint)] text-[var(--color-danger)]' :
                      o.status === 'delivered' || o.status === 'ready' ? 'bg-[var(--color-success-tint)] text-[var(--color-success)]' :
                      'bg-[var(--color-warn-tint)] text-[var(--color-warn)]'
                    }`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {o.status === 'pending' ? 'قيد الانتظار' : o.status === 'preparing' ? 'قيد التحضير' : o.status === 'ready' ? 'جاهز' : o.status === 'delivered' ? 'تم التسليم' : o.status === 'cancelled' ? 'ملغي' : o.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono text-base font-bold text-[var(--color-text)]" dir="ltr">
                    {formatMoney(Number(o.total_amount ?? 0), ctx.project.currency)}
                  </td>
                </tr>
              ))}
              {(monthOrders ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                    لا توجد طلبات لهذا الشهر
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
