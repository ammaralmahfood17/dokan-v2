import Link from 'next/link';
import { Check, ChevronLeft, ShoppingBag, Clock, Banknote } from 'lucide-react';
import { getCurrentProject, buildChecklist } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/utils';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';

export default async function DashboardPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const checklist = await buildChecklist(ctx.project.id);
  const doneCount = checklist.filter((c) => c.done).length;
  const allDone = doneCount === checklist.length;

  const supabase = await createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    { count: todayOrders },
    { data: recentOrders },
    { count: pendingCount },
    { data: todaySalesData },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', today.toISOString()),
    supabase
      .from('orders')
      .select('id, status, total_amount, type, created_at, order_number')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .in('status', ['pending', 'preparing']),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', today.toISOString()),
  ]);

  const todaySales = (todaySalesData ?? []).reduce(
    (sum: number, o: { total_amount: number }) => sum + Number(o.total_amount),
    0
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>نظرة عامة</h1>
          <p>مرحباً — {ctx.project.name}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="dashboard-stat card card-body flex items-center gap-3">
          <div className="rounded-xl bg-[var(--color-primary-tint)] p-2 text-[var(--color-primary)]">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <p className="section-title mb-0.5">طلبات اليوم</p>
            <p className="text-2xl font-bold">{todayOrders ?? 0}</p>
          </div>
        </div>
        <div className="dashboard-stat card card-body flex items-center gap-3">
          <div className="rounded-xl bg-[var(--color-warn-tint)] p-2 text-[var(--color-warn)]">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="section-title mb-0.5">قيد التنفيذ</p>
            <p className="text-2xl font-bold">{pendingCount ?? 0}</p>
          </div>
        </div>
        <div className="dashboard-stat card card-body flex items-center gap-3">
          <div className="rounded-xl bg-[var(--color-success-tint)] p-2 text-[var(--color-success)]">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <p className="section-title mb-0.5">مبيعات اليوم</p>
            <p className="text-2xl font-bold">{formatMoney(todaySales, ctx.project.currency)}</p>
          </div>
        </div>
      </div>

      {!allDone ? (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">قائمة الإعداد</h2>
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
              {doneCount} / {checklist.length}
            </span>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${(doneCount / checklist.length) * 100}%` }}
            />
          </div>
          <div className="space-y-2">
            {checklist.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`checklist-item ${item.done ? 'done' : 'checklist-item-pulse'}`}
              >
                <span className={`check-dot ${item.done ? 'done' : ''}`}>
                  {item.done && <Check className="h-3 w-3" />}
                </span>
                <span
                  className={`flex-1 text-sm font-semibold ${
                    item.done
                      ? 'text-[var(--color-text-secondary)] line-through'
                      : 'text-[var(--color-text)]'
                  }`}
                >
                  {item.label}
                </span>
                <ChevronLeft className="h-4 w-4 text-[var(--color-text-muted)]" />
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="mb-8 card card-body text-center">
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <Check className="h-6 w-6" />
            </div>
            <h2 className="text-base font-bold">متجرك جاهز لإستقبال الطلبات</h2>
            <Link
              href="/dashboard/pos"
              className="mt-2 rounded-[8px] bg-[var(--color-primary)] px-6 py-2 text-sm font-bold text-white transition-colors hover:opacity-90"
            >
              افتح POS
            </Link>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">آخر الطلبات</h2>
          <Link
            href="/dashboard/orders"
            className="text-xs font-semibold text-[var(--color-primary)]"
          >
            عرض الكل
          </Link>
        </div>
        <div className="card overflow-hidden">
          {!recentOrders?.length ? (
            <EmptyState
              icon={<ShoppingBag className="h-8 w-8" />}
              title="ما فيه طلبات حالياً"
              description="أول طلب بيظهر هنا مباشرة."
              action={
                <Link href="/dashboard/pos" className="btn btn-primary">
                  افتح POS
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {recentOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold" dir="ltr">order-{o.order_number}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      <span className="block">{new Date(o.created_at).toLocaleTimeString('ar-BH', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="block">{new Date(o.created_at).toLocaleDateString('ar-BH')}</span>
                    </p>
                  </div>
                  <div className="text-end">
                    <span className={`badge badge-${o.status}`}>
                      {o.status === 'pending' ? 'قيد الانتظار' :
                       o.status === 'preparing' ? 'قيد التحضير' :
                       o.status === 'ready' ? 'جاهز' :
                       o.status === 'delivered' ? 'تم التسليم' :
                       o.status === 'cancelled' ? 'ملغي' : o.status}
                    </span>
                    <p className="mt-1 text-sm font-bold">
                      {formatMoney(Number(o.total_amount), ctx.project.currency)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
