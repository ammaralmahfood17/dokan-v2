'use client';

import { useRouter } from 'next/navigation';
import { TrendingUp, ShoppingBag, Banknote, ReceiptText, XCircle, Printer, RefreshCcw } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { Btn, Card, FilterBar, StatStrip } from '@/components/dashboard/primitives';
import { PageHeader } from '@/components/dashboard/page-header';
import type { AnalyticsData, Range } from './page';

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'اليوم' },
  { value: '7d', label: '٧ أيام' },
  { value: '30d', label: '٣٠ يوم' },
];

/** Percent change vs previous period; null when there's no baseline */
function pctChange(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return 100;
  return Math.round(((curr - prev) / prev) * 100);
}

/** Stat-strip delta: sign + pct (inverted for cancelled), null when no baseline */
function deltaInfo(curr: number, prev: number, invert = false): { delta: string; positive: boolean } | null {
  const pct = pctChange(curr, prev);
  if (pct === null) return null;
  const up = pct >= 0;
  return {
    delta: `${up ? '▲' : '▼'} ${Math.abs(pct).toLocaleString('ar-BH-u-nu-latn')}٪`,
    positive: invert ? !up : up,
  };
}

export function AnalyticsClient({
  range,
  currency,
  data,
  projectName,
  fetchError,
}: {
  range: Range;
  currency: string;
  data: AnalyticsData;
  projectName: string;
  fetchError: string | null;
}) {
  const router = useRouter();
  const { kpi, prevKpi, byDay, byHour, topProducts, byType } = data;

  const maxDayRevenue = Math.max(...byDay.map((d) => d.revenue), 1);
  const maxHourCount = Math.max(...byHour.map((h) => h.count), 1);
  const maxProductQty = Math.max(...topProducts.map((p) => p.quantity), 1);
  const totalByType = byType.reduce((s, t) => s + t.count, 0) || 1;

  const dOrders = deltaInfo(kpi.orders, prevKpi.orders);
  const dRevenue = deltaInfo(kpi.revenue, prevKpi.revenue);
  const dAvg = deltaInfo(kpi.avgOrder, prevKpi.avgOrder);
  const dCancelled = deltaInfo(kpi.cancelled, prevKpi.cancelled, true);

  function setRange(r: Range) {
    router.push(r === '7d' ? '/dashboard/analytics' : `/dashboard/analytics?range=${r}`);
  }

  return (
    <div className="page">
      <PageHeader
        className="print-hidden"
        crumb={['دكان', 'المالية', 'الإحصائيات']}
        title="الإحصائيات"
        sub={`أداء ${projectName} — ${RANGES.find((r) => r.value === range)?.label}`}
        primary={
          <Btn variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
            طباعة
          </Btn>
        }
      />

      {/* Print-only header — FIX-A-008: h2 بدل h1 (هرمية عنوان واحدة لكل صفحة) */}
      <div className="hidden print:block mb-4">
        <h2 className="text-lg font-bold">تقرير الإحصائيات — {projectName}</h2>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {RANGES.find((r) => r.value === range)?.label} · {new Date().toLocaleDateString('ar-BH-u-nu-latn', { timeZone: 'Asia/Bahrain' })}
        </p>
      </div>

      {/* Range filter */}
      <div className="print-hidden">
        <FilterBar
          segments={RANGES.map((r) => r.label)}
          active={RANGES.find((r) => r.value === range)?.label ?? ''}
          onChange={(label) => {
            const r = RANGES.find((x) => x.label === label);
            if (r) setRange(r.value);
          }}
        />
      </div>

      {/* KPI strip */}
      <div className="mb-6">
        <StatStrip
          cells={[
            {
              label: 'الطلبات',
              value: kpi.orders.toLocaleString('ar-BH-u-nu-latn'),
              icon: ShoppingBag,
              ...(dOrders ?? {}),
            },
            {
              label: 'الإيراد',
              value: formatMoney(kpi.revenue, currency),
              icon: Banknote,
              ...(dRevenue ?? {}),
            },
            {
              label: 'متوسط الطلب',
              value: formatMoney(kpi.avgOrder, currency),
              icon: ReceiptText,
              ...(dAvg ?? {}),
            },
            {
              label: 'ملغى',
              value: kpi.cancelled.toLocaleString('ar-BH-u-nu-latn'),
              icon: XCircle,
              ...(dCancelled ?? {}),
            },
          ]}
        />
      </div>

      {fetchError ? (
        <Card className="py-10 text-center">
          <RefreshCcw className="mx-auto mb-3 h-8 w-8 text-[var(--color-danger)]" />
          <h3 className="text-sm font-bold text-[var(--color-danger)]">{fetchError}</h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            تحقق من اتصالك ثم أعد المحاولة.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="btn btn-secondary btn-sm mt-4"
          >
            إعادة المحاولة
          </button>
        </Card>
      ) : kpi.orders === 0 ? (
        <Card className="py-10 text-center">
          <TrendingUp className="mx-auto mb-3 h-8 w-8 text-[var(--color-text-muted)]" />
          <h3 className="text-sm font-bold">ما فيه بيانات في هذه الفترة</h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            أول طلب سيظهر هنا — جرّب فترات أطول أو افتح POS.
          </p>
        </Card>
      ) : (
        <>
          {/* Revenue by day */}
          <Card className="mb-4">
            <h2 className="mb-4 text-sm font-bold">الإيراد اليومي</h2>
            <div
              className="flex h-36 items-end gap-1.5"
              dir="ltr"
              role="img"
              aria-label={`الإيراد اليومي — ${byDay.map((d) => `${d.label} ${formatMoney(d.revenue, currency)}`).join('، ')}`}
            >
              {byDay.map((d, idx) => (
                <div key={d.key} className="group relative flex flex-1 flex-col items-center gap-1" title={`${d.label} — ${formatMoney(d.revenue, currency)}`}>
                  {/* Value: only on the top bar (always) or on hover (desktop) */}
                  <span
                    className={`whitespace-nowrap text-[9px] font-semibold text-[var(--color-text-muted)] ${
                      d.revenue === maxDayRevenue
                        ? 'opacity-100'
                        : 'opacity-0 transition-opacity group-hover:opacity-100'
                    }`}
                  >
                    {d.revenue > 0 ? formatMoney(d.revenue, currency).split(' ')[0] : ''}
                  </span>
                  <div
                    className="w-full rounded-t-[4px] bg-[var(--color-primary)] transition-all group-hover:opacity-80"
                    style={{ height: `${Math.max((d.revenue / maxDayRevenue) * 100, d.revenue > 0 ? 4 : 2)}%` }}
                  />
                  {/* Weekday label: all for ≤7d, every 5th for 30d (fits on mobile) */}
                  <span
                    className={`text-[10px] text-[var(--color-text-secondary)] ${
                      byDay.length > 7 && idx % 5 !== 0 && idx !== byDay.length - 1 ? 'invisible' : ''
                    }`}
                  >
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            {/* Peak hours */}
            <Card>
              <h2 className="mb-4 text-sm font-bold">ذروة الساعات</h2>
              <div
                className="flex h-28 items-end gap-1"
                dir="ltr"
                role="img"
                aria-label={`ذروة الساعات — ${byHour.map((h, i) => (h.count > 0 ? `ساعة ${i} عدد ${h.count}` : '')).filter(Boolean).join('، ') || 'لا توجد طلبات'}`}
              >
                {byHour.map((h) => (
                  <div key={h.label} className="group relative flex flex-1 flex-col justify-end">
                    <div
                      className={`w-full rounded-t-[4px] transition-all ${
                        h.count === maxHourCount
                          ? 'bg-[var(--color-primary)]'
                          : 'bg-[var(--color-primary-tint)] group-hover:bg-[var(--color-primary)]'
                      }`}
                      style={{ height: `${Math.max((h.count / maxHourCount) * 100, h.count > 0 ? 3 : 1.5)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-[var(--color-text-muted)]" dir="ltr">
                <span>12ص</span>
                <span>6ص</span>
                <span>12م</span>
                <span>6م</span>
                <span>11م</span>
              </div>
            </Card>

            {/* Top products */}
            <Card>
              <h2 className="mb-4 text-sm font-bold">الأكثر مبيعًا</h2>
              {topProducts.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">ما فيه منتجات مباعة في هذه الفترة</p>
              ) : (
                <ul className="space-y-2.5">
                  {topProducts.map((p) => (
                    <li key={p.name}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold">{p.name}</span>
                        <span className="shrink-0 font-bold text-[var(--color-text-secondary)]">
                          {p.quantity} · <span dir="ltr">{formatMoney(p.revenue, currency)}</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
                        <div
                          className="h-full rounded-full bg-[var(--color-primary)]"
                          style={{ width: `${(p.quantity / maxProductQty) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* By type */}
            <Card>
              <h2 className="mb-4 text-sm font-bold">حسب نوع الطلب</h2>
              <ul className="space-y-2.5">
                {byType.map((t) => (
                  <li key={t.type}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold">{t.type}</span>
                      <span className="text-[var(--color-text-secondary)]">{t.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary)]"
                        style={{ width: `${(t.count / totalByType) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}