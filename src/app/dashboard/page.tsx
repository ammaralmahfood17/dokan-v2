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

/** Last-7-hours buckets (Asia/Bahrain) — mirrors the mockup's hourly chart. */
function buildHourBuckets() {
  const now = new Date();
  const hourFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bahrain',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const buckets: { key: string; label: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3_600_000);
    const parts = hourFmt.formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const key = `${get('year')}-${get('month')}-${get('day')}T${get('hour').padStart(2, '0')}`;
    // Arabic hour label: ٩ص / ١٢م — approximate meridiem from local hour
    const hour = Number(get('hour'));
    const label = new Intl.DateTimeFormat('ar-BH', { hour: 'numeric' }).format(
      new Date(d.getTime() + 3 * 3_600_000)
    );
    buckets.push({ key, label, revenue: 0 });
  }
  return buckets;
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
  const TZ = 'Asia/Bahrain';
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = new Date(Date.parse(`${dayFmt.format(new Date())}T00:00:00+03:00`));
  const yesterday = new Date(today.getTime() - 86_400_000);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [
    { count: todayOrders },
    { count: yesterdayOrders },
    { data: recentOrders },
    { count: pendingCount },
    { data: todaySalesData },
    { data: yesterdaySalesData },
    { data: activeTables },
    { data: openTableOrders },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString()),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', yesterday.toISOString())
      .lt('created_at', today.toISOString()),
    supabase
      .from('orders')
      .select('id, status, total_amount, type, created_at, order_number, table_id, tables(number)')
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
      .select('total_amount, created_at')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .not('status', 'eq', 'cancelled')
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString()),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .not('status', 'eq', 'cancelled')
      .gte('created_at', yesterday.toISOString())
      .lt('created_at', today.toISOString()),
    supabase
      .from('tables')
      .select('id')
      .eq('project_id', ctx.project.id)
      .eq('is_active', true),
    supabase
      .from('orders')
      .select('table_id')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .not('table_id', 'is', null)
      .in('status', ['pending', 'preparing', 'ready']),
  ]);

  const todaySales = (todaySalesData ?? []).reduce(
    (sum: number, o: { total_amount: number }) => sum + Number(o.total_amount),
    0
  );
  const yesterdaySales = (yesterdaySalesData ?? []).reduce(
    (sum: number, o: { total_amount: number }) => sum + Number(o.total_amount),
    0
  );

  // KPI deltas — real data only
  const salesDelta =
    yesterdaySales > 0
      ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)
      : null;
  const ordersDelta =
    (todayOrders ?? 0) - (yesterdayOrders ?? 0);

  // Active tables: occupied (open order) / total active
  const totalActiveTables = (activeTables ?? []).length;
  const occupiedTableIds = new Set(
    (openTableOrders ?? []).map((o: { table_id: string | null }) => o.table_id)
  );
  const occupiedCount = occupiedTableIds.size;

  // ---- Hourly sales today (Asia/Bahrain, last 7 hours) ----
  const hourBuckets = buildHourBuckets();
  const hourIndex = new Map(hourBuckets.map((b, i) => [b.key, i]));
  for (const o of (todaySalesData ?? []) as { total_amount: number; created_at: string }[]) {
    const d = new Date(o.created_at);
    const hFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bahrain',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    });
    const parts = hFmt.formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const key = `${get('year')}-${get('month')}-${get('day')}T${get('hour').padStart(2, '0')}`;
    const idx = hourIndex.get(key);
    if (idx !== undefined) hourBuckets[idx].revenue += Number(o.total_amount);
  }
  const maxHourRevenue = Math.max(...hourBuckets.map((b) => b.revenue), 0.001);

  // ---- Last 7 days chart + top 3 (Asia/Bahrain buckets) ----
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

  const nowTime = new Date().toLocaleTimeString('ar-BH', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const todayLabel = new Date().toLocaleDateString('ar-BH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Status badge → Scan Grid accent
  const statusBadge = (status: string) => {
    const base = 'inline-block px-2 py-0.5 text-[10.5px] font-bold text-[var(--color-surface)]';
    if (status === 'pending') return <span className={`${base} bg-[var(--color-danger)]`}>جديد</span>;
    if (status === 'preparing') return <span className={`${base} bg-[var(--color-primary)]`}>تحضير</span>;
    if (status === 'ready') return <span className={`${base} bg-[var(--color-success)]`}>جاهز</span>;
    if (status === 'delivered') return <span className={`${base} bg-[var(--color-text-muted)]`}>تم التسليم</span>;
    return <span className={`${base} bg-[var(--color-text-muted)]`}>ملغي</span>;
  };

  const tableLabel = (o: {
    tables?: { number: number } | null;
    type: string;
    order_number: number;
  }) => {
    if (o.tables) return String(o.tables.number).padStart(2, '0');
    if (o.type === 'drivethru') return `Drive-${String(o.order_number).padStart(2, '0')}`;
    return `Walk-${String(o.order_number).padStart(2, '0')}`;
  };

  return (
    <div className="page">
      {/* Topbar — Scan Grid: display greeting + today chip */}
      <div className="mb-7 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold">
            مرحبًا، {ctx.project.name} ☕
          </h1>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-text-secondary)]">
            {todayLabel}
          </p>
        </div>
        <div
          className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 font-mono text-[12.5px] tabular-nums text-[var(--color-text)]"
          dir="ltr"
        >
          TODAY · {nowTime}
        </div>
      </div>

      {/* KPIs — Scan Grid cards with saffron corner bracket */}
      <div className="mb-7 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="scan-corners border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_1px_3px_rgba(23,20,15,0.05)]">
          <p className="mb-2 text-[12px] text-[var(--color-text-secondary)]">إجمالي مبيعات اليوم</p>
          <p className="font-mono text-[26px] font-bold tabular-nums leading-none" dir="ltr">
            {formatMoney(todaySales, ctx.project.currency)}
          </p>
          {salesDelta !== null ? (
            <p className={`mt-1.5 text-[11.5px] font-semibold ${salesDelta >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
              {salesDelta >= 0 ? '↑' : '↓'} {Math.abs(salesDelta)}٪ عن أمس
            </p>
          ) : (
            <p className="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">— لا مبيعات أمس</p>
          )}
        </div>

        <div className="scan-corners border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_1px_3px_rgba(23,20,15,0.05)]">
          <p className="mb-2 text-[12px] text-[var(--color-text-secondary)]">عدد الطلبات</p>
          <p className="font-mono text-[26px] font-bold tabular-nums leading-none" dir="ltr">
            {todayOrders ?? 0}
          </p>
          {ordersDelta !== 0 ? (
            <p className={`mt-1.5 text-[11.5px] font-semibold ${ordersDelta > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
              {ordersDelta > 0 ? '↑' : '↓'} {Math.abs(ordersDelta)} طلبات
            </p>
          ) : (
            <p className="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">— مثل أمس</p>
          )}
        </div>

        <div className="scan-corners border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_1px_3px_rgba(23,20,15,0.05)]">
          <p className="mb-2 text-[12px] text-[var(--color-text-secondary)]">قيد التنفيذ</p>
          <p className="font-mono text-[26px] font-bold tabular-nums leading-none" dir="ltr">
            {pendingCount ?? 0}
          </p>
          {(pendingCount ?? 0) > 0 ? (
            <Link href="/dashboard/kitchen" className="mt-1.5 inline-block text-[11.5px] font-semibold text-[var(--color-primary)]">
              شاشة المطبخ ←
            </Link>
          ) : (
            <p className="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">— كل شيء جاهز</p>
          )}
        </div>

        <div className="scan-corners border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_1px_3px_rgba(23,20,15,0.05)]">
          <p className="mb-2 text-[12px] text-[var(--color-text-secondary)]">الطاولات النشطة</p>
          <p className="font-mono text-[26px] font-bold tabular-nums leading-none" dir="ltr">
            {occupiedCount}
            <span className="text-[16px] text-[var(--color-text-muted)]">/{totalActiveTables}</span>
          </p>
          <p className="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">
            {occupiedCount > 0 ? `${occupiedCount} مشغولة الآن` : '— كلها متاحة'}
          </p>
        </div>
      </div>

      {!allDone ? (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-bold">قائمة الإعداد</h2>
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

      {/* Grid 2 — hourly sales + latest orders table (mockup layout) */}
      <section className="mb-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_1px_3px_rgba(23,20,15,0.05)]">
          <h2 className="mb-3.5 flex items-center justify-between font-display text-[14.5px] font-bold">
            المبيعات بالساعة
            <span className="text-[11px] font-normal text-[var(--color-text-secondary)]">
              آخر ٧ ساعات
            </span>
          </h2>
          {hourBuckets.every((b) => b.revenue === 0) ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              ما فيه مبيعات اليوم — أول طلب يظهر هنا.
            </p>
          ) : (
            <div
              className="flex h-[140px] items-end gap-2.5"
              role="img"
              aria-label={`المبيعات بالساعة — ${hourBuckets.map((b) => `${b.label} ${formatMoney(b.revenue, ctx.project.currency)}`).join('، ')}`}
            >
              {hourBuckets.map((b) => (
                <div
                  key={b.key}
                  className="group relative flex flex-1 flex-col items-center"
                  title={`${b.label} — ${formatMoney(b.revenue, ctx.project.currency)}`}
                >
                  <div
                    className="w-full transition-all group-hover:opacity-80"
                    style={{
                      height: `${Math.max((b.revenue / maxHourRevenue) * 100, b.revenue > 0 ? 8 : 2)}%`,
                      background: 'linear-gradient(to top, var(--color-accent), #F3C67D)',
                    }}
                  />
                  <span className="absolute -bottom-5 text-[10px] text-[var(--color-text-secondary)]">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_1px_3px_rgba(23,20,15,0.05)]">
          <h2 className="mb-3.5 flex items-center justify-between font-display text-[14.5px] font-bold">
            آخر الطلبات
            <Link
              href="/dashboard/orders"
              className="text-[11px] font-normal text-[var(--color-primary)]"
            >
              عرض الكل
            </Link>
          </h2>
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
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-[var(--color-border)] p-1.5 text-start text-[11.5px] font-medium text-[var(--color-text-secondary)]">#</th>
                  <th className="border-b border-[var(--color-border)] p-1.5 text-start text-[11.5px] font-medium text-[var(--color-text-secondary)]">الطاولة</th>
                  <th className="border-b border-[var(--color-border)] p-1.5 text-start text-[11.5px] font-medium text-[var(--color-text-secondary)]">المبلغ</th>
                  <th className="border-b border-[var(--color-border)] p-1.5 text-start text-[11.5px] font-medium text-[var(--color-text-secondary)]">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="border-b border-[var(--color-border)] p-2 font-mono text-[12px] tabular-nums" dir="ltr">
                      #{String(o.order_number).padStart(3, '0')}
                    </td>
                    <td className="border-b border-[var(--color-border)] p-2 font-mono text-[12px] tabular-nums">
                      {tableLabel(o as never)}
                    </td>
                    <td className="border-b border-[var(--color-border)] p-2 font-mono text-[12px] font-bold tabular-nums">
                      {formatMoney(Number(o.total_amount), ctx.project.currency)}
                    </td>
                    <td className="border-b border-[var(--color-border)] p-2">
                      {statusBadge(o.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Last 7 days + top 3 */}
      <section className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="card card-body">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[14.5px] font-bold">مبيعات آخر 7 أيام</h2>
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

        <div className="card card-body">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[14.5px] font-bold">الأكثر مبيعًا هذا الأسبوع</h2>
            <Link
              href="/dashboard/analytics"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--color-primary)]"
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
    </div>
  );
}
