import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Download, Filter, ArrowUpRight, ArrowDownRight, Wallet2, CreditCard } from 'lucide-react';
import { formatMoney } from '@/lib/utils';

export default async function TransactionsPage() {
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

  const weekIncome = (weekOrders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const weekCancelled = (cancelledOrders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const todayIncome = (todayOrders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-kicker"><span>المالية</span></div>
          <h1>المعاملات المالية</h1>
          <p>سجل كل الحركات المالية والمدفوعات</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary">
            <Filter className="h-4 w-4" />
            فلترة
          </button>
          <button className="btn btn-primary">
            <Download className="h-4 w-4" />
            تصدير Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">إيرادات الأسبوع</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-success-tint)] text-[var(--color-success)]">
              <ArrowUpRight className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-[var(--color-success)]" dir="ltr">
            {formatMoney(weekIncome, ctx.project.currency)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)]">
              <div className="h-1.5 rounded-full bg-[var(--color-success)]" style={{ width: '100%' }} />
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{(weekOrders ?? []).length.toLocaleString('ar-BH-u-nu-latn')} معاملة</span>
          </div>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">إيرادات اليوم</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-tint)] text-[var(--color-primary)]">
              <Wallet2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-[var(--color-text)]" dir="ltr">
            {formatMoney(todayIncome, ctx.project.currency)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)]">
              <div className="h-1.5 rounded-full bg-[var(--color-primary)]" style={{ width: '100%' }} />
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{(todayOrders ?? []).length.toLocaleString('ar-BH-u-nu-latn')} طلب</span>
          </div>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">طلبات ملغاة</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-danger-tint)] text-[var(--color-danger)]">
              <ArrowDownRight className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-[var(--color-danger)]" dir="ltr">
            {formatMoney(weekCancelled, ctx.project.currency)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)]">
              <div className="h-1.5 rounded-full bg-[var(--color-danger)]" style={{ width: `${Math.min(100, (weekCancelled / (weekIncome || 1)) * 100)}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{(cancelledOrders ?? []).length.toLocaleString('ar-BH-u-nu-latn')} ملغي</span>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card card-body">
        <h2 className="mb-4 text-lg font-bold text-[var(--color-text)]">المعاملات الأخيرة</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]">
                <th className="px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium">النوع</th>
                <th className="px-4 py-3 font-medium">طريقة الدفع</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium text-left" dir="ltr">المبلغ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(weekOrders ?? []).map((o) => {
                const isCancelled = o.status === 'cancelled';
                const methodLabel = '—';
                return (
                  <tr key={o.id} className={`hover:bg-[var(--color-bg)] ${isCancelled ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {new Date(o.created_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {o.type === 'dinein' ? 'تناول في المطعم' : o.type === 'walkin' ? 'محلي' : o.type === 'drivethru' ? 'سيارة ماشية' : 'طلب'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{methodLabel}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isCancelled ? 'bg-[var(--color-danger-tint)] text-[var(--color-danger)]' :
                        o.status === 'delivered' || o.status === 'ready' ? 'bg-[var(--color-success-tint)] text-[var(--color-success)]' :
                        'bg-[var(--color-warn-tint)] text-[var(--color-warn)]'
                      }`}>
                        {o.status === 'pending' ? 'قيد الانتظار' : o.status === 'preparing' ? 'قيد التحضير' : o.status === 'ready' ? 'جاهز' : o.status === 'delivered' ? 'تم التسليم' : o.status === 'cancelled' ? 'ملغي' : o.status}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-mono font-bold ${isCancelled ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`} dir="ltr">
                      {isCancelled ? '-' : '+'}{formatMoney(Number(o.total_amount ?? 0), ctx.project.currency)}
                    </td>
                  </tr>
                );
              })}
              {(weekOrders ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    لا توجد معاملات لهذا الأسبوع
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
