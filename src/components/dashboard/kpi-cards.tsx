// D1: Enhanced KPI stat cards — redesigned for better visual hierarchy
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Users,
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
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  accent: string;
  bg: string;
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
      delta: salesDelta !== null ? `${Math.abs(salesDelta)}٪ عن أمس` : null,
      positive: salesDelta === null ? true : salesDelta >= 0,
      icon: ShoppingBag,
      href: '/dashboard/analytics',
      accent: 'text-[var(--color-primary)]',
      bg: 'bg-[var(--color-primary-tint)]',
    },
    {
      label: 'عدد الطلبات',
      value: (todayOrders ?? 0).toLocaleString('ar-BH-u-nu-latn'),
      delta: ordersDelta !== 0 ? `${Math.abs(ordersDelta)} طلبات` : null,
      positive: ordersDelta >= 0,
      icon: ChefHat,
      href: '/dashboard/orders',
      accent: 'text-[var(--color-success)]',
      bg: 'bg-[var(--color-success-tint)]',
    },
    {
      label: 'قيد التحضير',
      value: (pendingCount ?? 0).toLocaleString('ar-BH-u-nu-latn'),
      icon: Clock,
      href: '/dashboard/kitchen',
      accent: 'text-[var(--color-warn)]',
      bg: 'bg-[var(--color-warn-tint)]',
    },
    {
      label: 'الطاولات النشطة',
      value: `${occupiedCount.toLocaleString('ar-BH-u-nu-latn')}<span class="text-[16px] font-semibold text-[var(--color-text-muted)]">/${totalActiveTables}</span>`,
      icon: MapPin,
      href: '/dashboard/tables',
      accent: 'text-[var(--color-info)]',
      bg: 'bg-[var(--color-info-tint)]',
    },
  ];

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-[var(--color-primary)] hover:shadow-md"
          >
            {/* Top accent line */}
            <div className={`absolute inset-x-0 top-0 h-1 ${item.bg}`} />

            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.bg} ${item.accent}`}>
                <Icon className="h-5 w-5" />
              </div>

              {item.delta && (
                <div
                  className={`flex items-center gap-0.5 text-[11px] font-semibold ${
                    item.positive ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                  }`}
                >
                  {item.positive ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  )}
                  {item.delta}
                </div>
              )}
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{item.label}</p>
              <p
                className="mt-1 font-mono text-[28px] font-bold tabular-nums leading-none text-[var(--color-text)]"
                dir="ltr"
                dangerouslySetInnerHTML={{ __html: item.value }}
              />
            </div>

            {/* Peak hour hint for sales card */}
            {item.href === '/dashboard/analytics' && peakHour && peakHour.revenue > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
                <Clock className="h-3 w-3 text-[var(--color-text-muted)]" />
                وقت الذروة: {peakHour.label} — {formatMoney(peakHour.revenue, currency)}
              </p>
            )}

            {/* Kitchen link hint */}
            {item.href === '/dashboard/kitchen' && (pendingCount ?? 0) > 0 && (
              <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-[var(--color-primary)]">
                شاشة المطبخ
                <ArrowUpRight className="h-3 w-3 rtl:rotate-180" />
              </p>
            )}

            {/* Tables hint */}
            {item.href === '/dashboard/tables' && occupiedCount > 0 && (
              <p className="mt-3 flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)]">
                <Users className="h-3 w-3" />
                {occupiedCount} مشغولة الآن
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
