// D1: Dashboard orchestrator — data fetching + wiring only.
// UI sections live in src/components/dashboard/* (extracted from the old
// ~590-line god component). Data aggregation helpers in src/lib/dashboard-data.ts.
import { getCurrentProject, buildChecklist } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  buildHourBuckets,
  buildHourKeyFmt,
  buildWeekBuckets,
  type RecentOrder,
  type WeekOrder,
} from '@/lib/dashboard-data';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { ChecklistSection } from '@/components/dashboard/checklist';
import { HourlySalesChart } from '@/components/dashboard/hourly-sales-chart';
import { RecentOrdersTable } from '@/components/dashboard/recent-orders-table';
import { WeeklySalesChart } from '@/components/dashboard/weekly-sales-chart';
import { TopProducts } from '@/components/dashboard/top-products';
import { PageHeader } from '@/components/dashboard/page-header';
import Link from 'next/link';
import { Plus } from 'lucide-react';

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
  // Yesterday's KPI window is the SAME elapsed time as today-so-far
  // (midnight→now vs midnight→now−24h). Comparing a partial today against a
  // full yesterday makes the delta read ~−50% every morning.
  const nowMs = new Date().getTime();
  const yesterdaySameWindow = new Date(nowMs - 86_400_000);

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
      .lt('created_at', yesterdaySameWindow.toISOString()),
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
      .lt('created_at', yesterdaySameWindow.toISOString()),
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

  const salesDelta =
    yesterdaySales > 0
      ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)
      : null;
  const ordersDelta = (todayOrders ?? 0) - (yesterdayOrders ?? 0);

  const totalActiveTables = (activeTables ?? []).length;
  const occupiedTableIds = new Set(
    (openTableOrders ?? []).map((o: { table_id: string | null }) => o.table_id)
  );
  const occupiedCount = occupiedTableIds.size;

  // ---- Hourly sales today (Asia/Bahrain, last 7 hours) ----
  const hourBuckets = buildHourBuckets();
  const hourIndex = new Map(hourBuckets.map((b, i) => [b.key, i]));
  const hFmt = buildHourKeyFmt();
  for (const o of (todaySalesData ?? []) as { total_amount: number; created_at: string }[]) {
    const d = new Date(o.created_at);
    const parts = hFmt.formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const key = `${get('year')}-${get('month')}-${get('day')}T${get('hour').padStart(2, '0')}`;
    const idx = hourIndex.get(key);
    if (idx !== undefined) hourBuckets[idx].revenue += Number(o.total_amount);
  }
  const peakHour = [...hourBuckets].sort((a, b) => b.revenue - a.revenue)[0];

  // ---- Last 7 days chart + top 3 (Asia/Bahrain buckets) ----
  const { weekAgo, byDay7 } = buildWeekBuckets(dayFmt);
  const { data: weekOrders } = await supabase
    .from('orders')
    .select('id, status, total_amount, created_at, order_items(product_name, quantity, unit_price)')
    .eq('project_id', ctx.project.id)
    .is('service_type', null)
    .gte('created_at', weekAgo.toISOString());

  const weekTop = new Map<string, { qty: number; revenue: number }>();
  for (const o of (weekOrders ?? []) as WeekOrder[]) {
    if (o.status === 'cancelled') continue;
    const k = dayFmt.format(new Date(o.created_at));
    const day = byDay7.find((d) => d.key === k);
    if (day) day.revenue += Number(o.total_amount);
    for (const it of o.order_items ?? []) {
      const cur = weekTop.get(it.product_name) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity);
      cur.revenue += Number(it.quantity) * Number(it.unit_price ?? 0);
      weekTop.set(it.product_name, cur);
    }
  }
  const top3 = [...weekTop.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 3);

  // Vercel runs UTC — without an explicit timeZone the date would flip a day
  // between 00:00–03:00 Bahrain time.
  const todayLabel = new Date().toLocaleDateString('ar-BH-u-nu-latn', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bahrain',
  });

  return (
    <div className="page">
      <PageHeader
        crumb={['دكان', 'الرئيسية']}
        title={`مرحبًا، ${ctx.project.name}`}
        sub={todayLabel}
        secondary={
          <Link href="/dashboard/orders" className="btn btn-secondary">
            الطلبات
          </Link>
        }
        primary={
          <Link href="/dashboard/pos" className="btn btn-gold">
            <Plus className="h-4 w-4" />
            طلب جديد
          </Link>
        }
      />

      {/* CTA Section — primary actions */}
      <section className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Plus className="h-4 w-4" />
          إضافة منتج
        </Link>
      </section>

      <KpiCards
        todaySales={todaySales}
        currency={ctx.project.currency}
        salesDelta={salesDelta}
        peakHour={peakHour}
        todayOrders={todayOrders}
        ordersDelta={ordersDelta}
        pendingCount={pendingCount}
        occupiedCount={occupiedCount}
        totalActiveTables={totalActiveTables}
      />

      <ChecklistSection checklist={checklist} doneCount={doneCount} allDone={allDone} />

      {/* Grid 2 — hourly sales + latest orders table */}
      <section className="mb-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <HourlySalesChart hourBuckets={hourBuckets} currency={ctx.project.currency} />
        <RecentOrdersTable
          recentOrders={(recentOrders ?? []) as RecentOrder[]}
          currency={ctx.project.currency}
        />
      </section>

      {/* Last 7 days + top 3 */}
      <section className="mb-8 grid gap-6 lg:grid-cols-2">
        <WeeklySalesChart byDay7={byDay7} currency={ctx.project.currency} />
        <TopProducts top3={top3} currency={ctx.project.currency} />
      </section>
    </div>
  );
}
