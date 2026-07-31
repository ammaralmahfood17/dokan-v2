import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { AnalyticsClient } from './analytics-client';

export type Range = 'today' | '7d' | '30d';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  status: string;
  total_amount: number;
  type: string;
  created_at: string;
  order_items?: { product_name: string; quantity: number }[] | null;
};

export type AnalyticsData = {
  kpi: {
    orders: number;
    revenue: number;
    avgOrder: number;
    cancelled: number;
  };
  prevKpi: {
    orders: number;
    revenue: number;
    avgOrder: number;
    cancelled: number;
  };
  byDay: { key: string; label: string; revenue: number; count: number }[];
  byHour: { label: string; count: number }[];
  topProducts: { name: string; quantity: number }[];
  byType: { type: string; count: number }[];
};

const TYPE_AR: Record<string, string> = {
  walkin: 'سفري',
  drivethru: 'سيارة',
  dinein: 'طاولة',
};

// ── Gulf timezone bucketing ────────────────────────────────────────────────
// Supabase stores timestamptz (UTC). Bucketing with the server's local time
// (Vercel = UTC) would put a 1AM Bahrain order on the PREVIOUS day and shift
// peak-hour stats by 3 hours. Bucket by Asia/Bahrain (UTC+3) instead.
// Multi-Gulf per-project timezone support = future enhancement.
const TZ = 'Asia/Bahrain';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false });
const arWeekdayFmt = new Intl.DateTimeFormat('ar', { timeZone: TZ, weekday: 'long' });

function tzDayKey(d: Date): string {
  return dayFmt.format(d); // YYYY-MM-DD in Asia/Bahrain
}
function tzHour(d: Date): number {
  return Number(hourFmt.format(d)) % 24;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const range: Range = rangeParam === 'today' || rangeParam === '30d' ? rangeParam : '7d';

  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const count = range === 'today' ? 1 : range === '7d' ? 7 : 30;

  // "Today" at Asia/Bahrain midnight → UTC instant, then walk back N days.
  const [y, m, d] = tzDayKey(new Date()).split('-').map(Number);
  const todayUTCms = Date.UTC(y, m - 1, d);
  const startUTC = new Date(todayUTCms - (count - 1) * 86400000);

  // Previous period (for comparison): same length, immediately before `startUTC`
  // For 'today': compare with the SAME TIME WINDOW of yesterday (00:00 → now-24h),
  // otherwise at 11AM today vs full yesterday always looks like a crash.
  const prevEnd =
    range === 'today'
      ? new Date(Date.now() - 24 * 3600000)
      : new Date(startUTC.getTime() - 1);
  const prevStart =
    range === 'today'
      ? new Date(todayUTCms - 86400000)
      : new Date(startUTC.getTime() - count * 86400000);

  const supabase = await createClient();
  const [{ data, error }, { data: prevData, error: prevError }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, total_amount, type, created_at, order_items(product_name, quantity)')
      .eq('project_id', ctx.project.id)
      .is('service_type', null) // null = real order (not waiter/bill)
      .gte('created_at', startUTC.toISOString())
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('orders')
      .select('id, status, total_amount')
      .eq('project_id', ctx.project.id)
      .is('service_type', null)
      .gte('created_at', prevStart.toISOString())
      .lt('created_at', prevEnd.toISOString())
      .limit(2000),
  ]);

  const orders = (data ?? []) as unknown as OrderRow[];
  const prevOrders = (prevData ?? []) as unknown as OrderRow[];
  const fetchError = error || prevError ? 'تعذر تحميل البيانات' : null;

  // ---- KPI helper ----
  const computeKpi = (list: OrderRow[]) => {
    const active = list.filter((o) => o.status !== 'cancelled');
    const revenue = active.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    return {
      orders: list.length,
      revenue,
      avgOrder: active.length ? revenue / active.length : 0,
      cancelled: list.length - active.length,
    };
  };

  const kpi = computeKpi(orders);
  const prevKpi = computeKpi(prevOrders);
  const active = orders.filter((o) => o.status !== 'cancelled');

  // ---- Revenue by day (Asia/Bahrain buckets, oldest → newest) ----
  const dayMap = new Map<string, { key: string; label: string; revenue: number; count: number }>();
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(todayUTCms - i * 86400000);
    const k = tzDayKey(t);
    dayMap.set(k, { key: k, label: arWeekdayFmt.format(t), revenue: 0, count: 0 });
  }
  for (const o of active) {
    const bucket = dayMap.get(tzDayKey(new Date(o.created_at)));
    if (bucket) {
      bucket.revenue += Number(o.total_amount || 0);
      bucket.count += 1;
    }
  }
  const byDay = [...dayMap.values()];

  // ---- Orders by hour (0-23, Asia/Bahrain) ----
  const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ label: String(h), count: 0 }));
  for (const o of active) {
    hourBuckets[tzHour(new Date(o.created_at))].count += 1;
  }
  const byHour = hourBuckets;

  // ---- Top products (only active orders) ----
  const productMap = new Map<string, number>();
  for (const o of active) {
    for (const item of o.order_items ?? []) {
      productMap.set(item.product_name, (productMap.get(item.product_name) ?? 0) + Number(item.quantity || 1));
    }
  }
  const topProducts = [...productMap.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  // ---- By type ----
  const typeMap = new Map<string, number>();
  for (const o of orders) {
    typeMap.set(o.type, (typeMap.get(o.type) ?? 0) + 1);
  }
  const byType = [...typeMap.entries()]
    .map(([type, count]) => ({ type: TYPE_AR[type] ?? type, count }))
    .sort((a, b) => b.count - a.count);

  const data_: AnalyticsData = { kpi, prevKpi, byDay, byHour, topProducts, byType };

  return (
    <AnalyticsClient
      range={range}
      currency={ctx.project.currency}
      data={data_}
      projectName={ctx.project.name}
      fetchError={fetchError}
    />
  );
}
