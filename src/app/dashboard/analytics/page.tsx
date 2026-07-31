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
  byDay: { label: string; revenue: number; count: number }[];
  byHour: { label: string; count: number }[];
  topProducts: { name: string; quantity: number }[];
  byType: { type: string; count: number }[];
};

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const TYPE_AR: Record<string, string> = {
  walkin: 'سفري',
  drivethru: 'سيارة',
  dinein: 'طاولة',
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === '7d') start.setDate(now.getDate() - 6);
  if (range === '30d') start.setDate(now.getDate() - 29);

  // Previous period (for comparison): same length, immediately before `start`
  const prevEnd = new Date(start);
  prevEnd.setMilliseconds(-1);
  const prevStart = new Date(start);
  if (range === 'today') {
    prevStart.setDate(start.getDate() - 1);
  } else if (range === '7d') {
    prevStart.setDate(start.getDate() - 7);
  } else {
    prevStart.setDate(start.getDate() - 30);
  }
  prevStart.setHours(0, 0, 0, 0);

  const supabase = await createClient();
  const [{ data }, { data: prevData }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, total_amount, type, created_at, order_items(product_name, quantity)')
      .eq('project_id', ctx.project.id)
      .is('service_type', null) // null = real order (not waiter/bill)
      .gte('created_at', start.toISOString())
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

  // ---- Revenue by day ----
  const dayMap = new Map<string, { label: string; revenue: number; count: number }>();
  for (let i = 0; i < (range === '30d' ? 30 : range === '7d' ? 7 : 1); i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dayMap.set(dayKey(d), { label: WEEKDAYS[d.getDay()], revenue: 0, count: 0 });
  }
  for (const o of active) {
    const d = new Date(o.created_at);
    const bucket = dayMap.get(dayKey(d));
    if (bucket) {
      bucket.revenue += Number(o.total_amount || 0);
      bucket.count += 1;
    }
  }
  const byDay = [...dayMap.values()];

  // ---- Orders by hour (0-23) ----
  const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ label: String(h), count: 0 }));
  for (const o of active) {
    const h = new Date(o.created_at).getHours();
    hourBuckets[h].count += 1;
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
    />
  );
}
