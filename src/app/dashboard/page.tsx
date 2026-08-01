import Link from 'next/link';
import { Check, ChevronLeft, ShoppingBag, Clock, Banknote, TrendingUp } from 'lucide-react';
import { getCurrentProject, buildChecklist } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/utils';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';

/** Last-7-days buckets (Asia/Bahrain) — built outside the component so the
 * react-hooks purity rule doesn't flag Date.now() during render. */
function buildWeekBuckets(dayFmt: Intl.DateTimeFormat) {
  const now = Date.now();
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    dayKeys.push(dayFmt.format(new Date(now - i * 86_400_000)));
  }
  return {
    weekAgo: new Date(now - 7 * 86_400_000),
    byDay7: dayKeys.map((key) => ({
      key,
      label: new Date(`${key}T00:00:00+03:00`).toLocaleDateString('ar-BH', {
        weekday: 'short',
      }),
      revenue: 0,
    })),
  };
}

export default async function DashboardPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const checklist = await buildChecklist(ctx.project.id);
  const doneCount = checklist.filter((c) => c.done).length;
  const allDone = doneCount === checklist.length;

  const supabase = await createClient();
  // "Today" = Bahrain midnight (UTC+3). The server clock is UTC, so naive
  // setHours(0,0,0,0) would drop orders between 00:00–03:00 Bahrain time.
  // Mirrors the analytics screen's Asia/Bahrain bucketing.
  const TZ = 'Asia/Bahrain';
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = new Date(Date.parse(`${dayFmt.format(new Date())}T00:00:00+03:00`));

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
      .not('status', 'eq', 'cancelled')
      .gte('created_at', today.toISOString()),
  ]);

  const todaySales = (todaySalesData ?? []).reduce(
    (sum: number, o: { total_amount: number }) => sum + Number(o.total_amount),
    0
  );

  // ---- Last 7 days chart (Asia/Bahrain buckets, mirrors analytics) ----
  const { weekAgo, byDay7 } = buildWeekBuckets(dayFmt);
  const { data: weekOrders } = await supabase
    .from('orders')
    .select('id, status, total_amount, created_at, order_items(product_name, quantity)')
    .eq('project_id', ctx.project.id)
    .is('service_type', null)
    .gte('created_at', weekAgo.toISOString());

  const weekTop = new Map<string, number>();
  for (const o of (weekOrders ?? []) as {
    status: string;
    total_amount: number;
    created_at: string;
    order_items?: { product_name: string; quantity: number }[] | null;
  }[]) {
    if (o.status === 'cancelled') continue;
    const k = dayFmt.format(new Date(o.created_at));
    const day = byDay7.find((d) => d.key === k);
    if (day) day.revenue += Number(o.total_amount);
    for (const it of o.order_items ?? []) {
      weekTop.set(it.product_name, (weekTop.get(it.product_name) ?? 0) + Number(it.quantity));
    }
  }
  const top3 = [...weekTop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const maxDayRevenue = Math.max(...byDay7.map((d) => d.revenue), 0.001);

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
          <div
            role="progressbar"
            aria-label="تقدم قائمة الإعداد"
            aria-valuemin={0}
            aria-valuemax={checklist.length}
            aria-valuenow={doneCount}
            className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]"
          >
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

      <section className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Last 7 days revenue */}
        <div className="card card-body">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold">مبيعات آخر 7 أيام</h2>
            <TrendingUp className="h-4 w-4 text-[var(--color-text-muted)]" />
          </div>
          {byDay7.every((d) => d.revenue === 0) ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              ما فيه مبيعات هالأسبوع — أول طلب يظهر هنا.
            </p>
          ) : (
            <div
              className="flex h-28 items-end gap-1.5"
              dir="ltr"
              role="img"
              aria-label={`مبيعات آخر 7 أيام — ${byDay7.map((d) => `${d.label} ${formatMoney(d.revenue, ctx.project.currency)}`).join('، ')}`}
            >
              {byDay7.map((d) => (
                <div
                  key={d.key}
                  className="group relative flex flex-1 flex-col items-center gap-1"
                  title={`${d.label} — ${formatMoney(d.revenue, ctx.project.currency)}`}
                >
                  <div
                    className="w-full rounded-t-[4px] bg-[var(--color-primary)] transition-all group-hover:opacity-80"
                    style={{
                      height: `${Math.max((d.revenue / maxDayRevenue) * 100, d.revenue > 0 ? 4 : 2)}%`,
                    }}
                  />
                  <span className="text-[10px] text-[var(--color-text-secondary)]">
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 3 this week */}
        <div className="card card-body">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold">الأكثر مبيعًا هذا الأسبوع</h2>
            <Link
              href="/dashboard/analytics"
              className="text-xs font-semibold text-[var(--color-primary)]"
            >
              التفاصيل
            </Link>
          </div>
          {top3.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              ما فيه منتجات مباعة هالأسبوع.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {top3.map(([name, qty], idx) => (
                <li key={name} className="flex items-center gap-3 text-xs">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-tint)] font-bold text-[var(--color-primary)]">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
                  <span className="shrink-0 font-bold text-[var(--color-text-secondary)]">
                    {qty}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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
