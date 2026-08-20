import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Download, Filter, ArrowUpRight, ArrowDownRight, Wallet2, Banknote } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { Btn, Pagination, StatStrip, Tag } from '@/components/dashboard/primitives';
import { PageHeader } from '@/components/dashboard/page-header';

type TxFilter = 'all' | 'income' | 'expense';

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const txFilter: TxFilter = filter === 'income' || filter === 'expense' ? filter : 'all';

  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const supabase = await createClient();
  const TZ = 'Asia/Bahrain';
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = new Date(Date.parse(`${dayFmt.format(new Date())}T00:00:00+03:00`));
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);

  const [
    { data: weekOrders },
    { data: cancelledOrders },
    { data: todayOrders },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, total_amount, status, created_at, type')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', weekAgo.toISOString())
      .eq('status', 'cancelled'),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', today.toISOString())
      .neq('status', 'cancelled'),
  ]);

  const rows = weekOrders ?? [];
  const incomeRows = rows.filter((o) => o.status !== 'cancelled');
  const expenseRows = rows.filter((o) => o.status === 'cancelled');
  const visible = txFilter === 'income' ? incomeRows : txFilter === 'expense' ? expenseRows : rows;

  const weekIncome = incomeRows.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const weekCancelled = (cancelledOrders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const todayIncome = (todayOrders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);

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
        crumb={['دكان', 'المالية', 'المعاملات']}
        title="المعاملات المالية"
        sub="سجل كل الحركات المالية والمدفوعات"
        secondary={<Btn variant="secondary" icon={Filter}>فلترة</Btn>}
        primary={<Btn variant="gold" icon={Download}>تصدير Excel</Btn>}
      />

      {/* KPI strip */}
      <div className="mb-4">
        <StatStrip
          cells={[
            {
              label: 'إيرادات الأسبوع',
              value: formatMoney(weekIncome, ctx.project.currency),
              icon: ArrowUpRight,
            },
            {
              label: 'إيرادات اليوم',
              value: formatMoney(todayIncome, ctx.project.currency),
              icon: Wallet2,
            },
            {
              label: 'طلبات ملغاة',
              value: formatMoney(weekCancelled, ctx.project.currency),
              icon: ArrowDownRight,
            },
            {
              label: 'صافي الأسبوع',
              value: formatMoney(weekIncome - weekCancelled, ctx.project.currency),
              icon: Banknote,
            },
          ]}
        />
      </div>

      {/* Filter — URL-driven segments (server component) */}
      <div className="filter-bar">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'all' as TxFilter, label: 'الكل', href: '/dashboard/transactions', count: rows.length },
            { key: 'income' as TxFilter, label: 'إيرادات', href: '/dashboard/transactions?filter=income', count: incomeRows.length },
            { key: 'expense' as TxFilter, label: 'مصروفات', href: '/dashboard/transactions?filter=expense', count: expenseRows.length },
          ].map((s) => (
            <a
              key={s.key}
              href={s.href}
              aria-current={txFilter === s.key ? 'page' : undefined}
              className={`filter-seg ${txFilter === s.key ? 'active' : ''}`}
            >
              {s.label}
              <span className="count">{s.count.toLocaleString('ar-BH-u-nu-latn')}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="table-card">
        <div className="table-wrap">
          <table className="ref-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>طريقة الدفع</th>
                <th>الحالة</th>
                <th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const isCancelled = o.status === 'cancelled';
                const orderTypeLabel =
                  o.type === 'dinein' ? 'تناول في المطعم' : o.type === 'walkin' ? 'محلي' : o.type === 'drivethru' ? 'سيارة ماشية' : 'طلب';
                return (
                  <tr key={o.id} className={isCancelled ? 'opacity-60' : ''}>
                    <td className="text-[var(--color-text-secondary)]">
                      {new Date(o.created_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <Tag bg={isCancelled ? '#FBE9E7' : '#E5F3EA'} fg={isCancelled ? '#C0483D' : '#2F8F5B'}>
                          {isCancelled ? 'مصروف' : 'إيراد'}
                        </Tag>
                        <span className="text-[11px] text-[var(--color-text-muted)]">{orderTypeLabel}</span>
                      </div>
                    </td>
                    <td>
                      <Tag bg="#EEF0EC" fg="#66716D">—</Tag>
                    </td>
                    <td>
                      <Tag bg={statusTag[o.status]?.bg ?? '#EEF0EC'} fg={statusTag[o.status]?.fg ?? '#66716D'} dot>
                        {statusLabel[o.status] ?? o.status}
                      </Tag>
                    </td>
                    <td className={`font-mono text-base font-bold tabular-nums ${isCancelled ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`} dir="ltr">
                      {isCancelled ? '-' : '+'}{formatMoney(Number(o.total_amount ?? 0), ctx.project.currency)}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                    لا توجد معاملات لهذا الأسبوع
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination label={`عرض ١–${visible.length.toLocaleString('ar-BH-u-nu-latn')} من ${rows.length.toLocaleString('ar-BH-u-nu-latn')}`} />
      </div>
    </div>
  );
}