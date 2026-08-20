// D1: Enhanced KPI stat strip — reference "دكان" Shopify-style single card
// with divided cells (no per-card decorative blobs).
import Link from 'next/link';
import {
  Clock,
  ShoppingBag,
  ChefHat,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import type { HourBucket } from '@/lib/dashboard-data';

type KpiItem = {
  label: string;
  value: string;
  delta?: string | null;
  positive?: boolean;
  icon: React.ComponentType<{ size?: number }>;
  href: string;
  hint?: string;
};

export function KpiCards({
  todaySales,
  currency,
  salesDelta,
  peakHour,
  todayOrders,
  ordersDelta,
  pendingCount,
  occupiedCount,
  totalActiveTables,
}: {
  todaySales: number;
  currency: string;
  salesDelta: number | null;
  peakHour: HourBucket | undefined;
  todayOrders: number | null;
  ordersDelta: number;
  pendingCount: number | null;
  occupiedCount: number;
  totalActiveTables: number;
}) {
  const items: KpiItem[] = [
    {
      label: 'مبيعات اليوم',
      value: formatMoney(todaySales, currency),
      delta: salesDelta !== null ? `${salesDelta >= 0 ? '+' : ''}${salesDelta}٪` : null,
      positive: salesDelta === null ? true : salesDelta >= 0,
      icon: ShoppingBag,
      href: '/dashboard/analytics',
      hint: peakHour && peakHour.revenue > 0 ? `وقت الذروة: ${peakHour.label}` : undefined,
    },
    {
      label: 'الطلبات',
      value: (todayOrders ?? 0).toLocaleString('ar-BH-u-nu-latn'),
      delta: ordersDelta !== 0 ? `${ordersDelta >= 0 ? '+' : ''}${ordersDelta}` : null,
      positive: ordersDelta >= 0,
      icon: ChefHat,
      href: '/dashboard/orders',
      hint: (pendingCount ?? 0) > 0 ? `${pendingCount} قيد التحضير` : undefined,
    },
    {
      label: 'قيد التحضير',
      value: (pendingCount ?? 0).toLocaleString('ar-BH-u-nu-latn'),
      icon: Clock,
      href: '/dashboard/kitchen',
    },
    {
      label: 'الطاولات النشطة',
      value: `${occupiedCount.toLocaleString('ar-BH-u-nu-latn')}/${totalActiveTables.toLocaleString('ar-BH-u-nu-latn')}`,
      icon: MapPin,
      href: '/dashboard/tables',
      hint: occupiedCount > 0 ? `${occupiedCount} مشغولة الآن` : undefined,
    },
  ];

  return (
    <div className="stat-strip mb-6">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.label} href={item.href} className="stat-cell group">
            <div className="stat-cell-label">
              <Icon size={14} />
              <span>{item.label}</span>
            </div>
            <div className="stat-cell-value">
              <span className="group-hover:opacity-80 transition-opacity">{item.value}</span>
              {item.delta && (
                <span className={`stat-cell-delta ${item.positive ? 'up' : 'down'}`}>
                  {item.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {item.delta}
                </span>
              )}
            </div>
            {item.hint && <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{item.hint}</p>}
          </Link>
        );
      })}
    </div>
  );
}