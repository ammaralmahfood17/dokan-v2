import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { OrdersClient } from './orders-client';
import type { Order, OrderItem } from '@/lib/types';

export default async function OrdersPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

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

  const { data: orders } = await supabase
    .from('orders')
    .select('*, tables(number, slug), order_items(*)')
    .eq('project_id', ctx.project.id)
    .is('service_type', null) // null = real order (not waiter/bill)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <OrdersClient
      projectId={ctx.project.id}
      currency={ctx.project.currency}
      initialOrders={
        (orders ?? []) as unknown as (Order & {
          tables?: { number: number; slug: string } | null;
          order_items?: OrderItem[];
        })[]
      }
    />
  );
}
