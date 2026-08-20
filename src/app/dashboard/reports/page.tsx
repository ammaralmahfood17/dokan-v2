import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Download, Filter, Calendar, TrendingUp, BarChart3, FileText } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { Btn, Card, StatStrip, Tag } from '@/components/dashboard/primitives';
import { PageHeader } from '@/components/dashboard/page-header';

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
  const avgOrder = monthOrders && monthOrders.length > 0 ? monthRevenue / monthOrders.length : 0;

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

  const recentOrders = (monthOrders ?? []).slice(0, 20);
  const statusTag: Record<string, { bg: string; fg: string }> = {
    pending: { bg: '#FBF0DD', fg: '#D98E2C' },
    preparing: { bg: '#FBF0DD', fg: '#D98E2C' },
    ready: { bg: '#E5F3EA', fg: '#2F8F5B' },
    delivered: { bg: '#E5F3EA', fg: '#2F8F5B' },
    cancelled: { bg: '#FBE9E7', fg: '#C0483D' },
  };
  const statusLabel: Record<string, string> = {
    pending: 'قيد الانتظار',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
  };

  return (
    <div className="page">
      <PageHeader
        crumb={['دكان', 'المالية', 'التقارير']}
        title="التقارير والتحليلات"
        sub="تحليل أداء المبيعات والأصناف الأكثر ربحية"
        secondary={<Btn variant="secondary" icon={Filter}>فلترة</Btn>}
        primary={<Btn variant="gold" icon={Download}>تصدير PDF</Btn>}
      />

      {/* KPI strip */}
      <div className="mb-4">
        <StatStrip
          cells={[
            {
              label: 'إجمالي هذا الأسبوع',
              value: formatMoney(weekRevenue, ctx.project.currency),
              icon: TrendingUp,
            },
            {
              label: 'إجمالي هذا الشهر',
              value: formatMoney(monthRevenue, ctx.project.currency),
              icon: BarChart3,
            },
            {
              label: 'متوسط الطلب',
              value: formatMoney(avgOrder, ctx.project.currency),
              icon: FileText,
            },
            {
              label: 'أعلى صنف ربحية',
              value: top5[0]?.[0] ?? '—',
              icon: Calendar,
            },
          ]}
        />
      </div>

      {/* Top Products */}
      <Card className="mb-4">
        <h2 className="mb-4 text-sm font-bold">الأصناف الأكثر مبيعاً</h2>
        <div className="space-y-3">
          {top5.map(([name, data], idx) => (
            <div key={name} className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-tint)] text-xs font-bold text-[var(--color-primary)]">
                {idx + 1}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{name}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">{data.qty.toLocaleString('ar-BH-u-nu-latn')} مبيع</p>
              </div>
              <p className="font-mono text-sm font-bold tabular-nums" dir="ltr">
                {formatMoney(data.revenue, ctx.project.currency)}
              </p>
            </div>
          ))}
          {top5.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">لا بيانات كافية لهذه الفترة</p>
          )}
        </div>
      </Card>

      {/* Orders Table */}
      <div className="table-card">
        <div className="table-wrap">
          <table className="ref-table">
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className="font-mono text-xs font-bold text-[var(--color-primary)]" dir="ltr">
                      #{String(o.id).slice(-6)}
                    </span>
                  </td>
                  <td className="text-[var(--color-text-secondary)]">
                    {new Date(o.created_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <Tag bg={statusTag[o.status]?.bg ?? '#EEF0EC'} fg={statusTag[o.status]?.fg ?? '#66716D'} dot>
                      {statusLabel[o.status] ?? o.status}
                    </Tag>
                  </td>
                  <td className="font-mono text-base font-bold tabular-nums" dir="ltr">
                    {formatMoney(Number(o.total_amount ?? 0), ctx.project.currency)}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                    لا توجد طلبات لهذا الشهر
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pager">
          <p>
            عرض ١–{recentOrders.length.toLocaleString('ar-BH-u-nu-latn')} من {(monthOrders ?? []).length.toLocaleString('ar-BH-u-nu-latn')}
          </p>
        </div>
      </div>
    </div>
  );
}