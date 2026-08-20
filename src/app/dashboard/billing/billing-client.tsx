'use client';

import { useState } from 'react';
import { Check, CreditCard, Percent, Landmark, BadgeCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { PageHeader } from '@/components/dashboard/page-header';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { PLAN_LABELS, type SubscriptionPlan } from '@/lib/types';

export function BillingClient({
  projectId,
  currency,
  currentPlan,
  vatRate,
  plans,
}: {
  projectId: string;
  currency: string;
  currentPlan: string;
  vatRate: number;
  plans: SubscriptionPlan[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [switching, setSwitching] = useState<string | null>(null);

  async function switchPlan(plan: SubscriptionPlan) {
    setSwitching(plan.code);
    const { error } = await supabase
      .from('projects')
      .update({ plan_code: plan.code })
      .eq('id', projectId);
    setSwitching(null);
    if (error) {
      toast.error('تعذّر تغيير الخطة');
      return;
    }
    toast.success(`تم التبديل إلى خطة ${plan.name}`);
    router.refresh();
  }

  const current = plans.find((p) => p.code === currentPlan);

  return (
    <div className="page">
      <PageHeader
        crumb={['دكان', 'المالية', 'الاشتراك والفواتير']}
        title="الاشتراك والفواتير"
        sub="خطط الأسعار، حدود الاستخدام، وإعدادات ضريبة القيمة المضافة"
      />

      {/* Current plan summary */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary-tint)]">
          <BadgeCheck className="h-5 w-5 text-[var(--color-primary)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            الخطة الحالية
          </p>
          <p className="mt-0.5 text-lg font-semibold">
            {PLAN_LABELS[currentPlan as keyof typeof PLAN_LABELS]?.ar ?? currentPlan}
            <span dir="ltr" className="ms-2 font-serif text-sm italic text-[var(--color-text-muted)]">
              {PLAN_LABELS[currentPlan as keyof typeof PLAN_LABELS]?.en ?? currentPlan}
            </span>
          </p>
        </div>
        <div className="text-end">
          <p className="text-[11px] font-semibold text-[var(--color-text-secondary)]">التكلفة الشهرية</p>
          <p className="font-mono text-lg font-bold tabular-nums" dir="ltr">
            {formatMoney(current?.price ?? 0, currency)}
          </p>
        </div>
      </div>

      {/* Plans grid */}
      <h2 className="section-title">اختر الخطة المناسبة لمشروعك</h2>
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.code === currentPlan;
          const isEnterprise = plan.code === 'enterprise';
          return (
            <div
              key={plan.code}
              className={`relative flex flex-col border bg-[var(--color-surface)] p-6 shadow-sm transition-all ${
                isCurrent
                  ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
              }`}
            >
              {isEnterprise && (
                <span className="absolute -top-2.5 start-5 badge badge-pending">الأكثر تقدمًا</span>
              )}
              <h3 className="font-display text-xl font-semibold">
                {plan.name}
                <span dir="ltr" className="ms-2 font-serif text-sm italic text-[var(--color-text-muted)]">
                  {plan.name_en}
                </span>
              </h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-mono text-3xl font-bold tabular-nums" dir="ltr">
                  {formatMoney(plan.price, currency)}
                </span>
                <span className="text-[12px] text-[var(--color-text-muted)]">/ شهريًا</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                {(plan.features as string[]).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
                    <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
                    {f}
                  </li>
                ))}
                <li className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
                  حتى {plan.max_staff ?? '∞'} موظف
                </li>
                <li className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
                  {plan.max_branches ?? '∞'} فرع · {plan.max_tables ?? '∞'} طاولة
                </li>
              </ul>
              <Button
                className="mt-6 w-full"
                variant={isCurrent ? 'secondary' : 'default'}
                disabled={isCurrent || switching === plan.code}
                onClick={() => void switchPlan(plan)}
              >
                {isCurrent
                  ? 'خطتك الحالية'
                  : switching === plan.code
                    ? 'جاري التبديل…'
                    : `التبديل إلى ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      {/* VAT + payments info */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2.5">
            <Percent className="h-4 w-4 text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">ضريبة القيمة المضافة (VAT)</h3>
          </div>
          <p className="text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
            معدل ضريبة القيمة المضافة في البحرين هو <strong className="text-[var(--color-text)]">10%</strong>.
            تُطبَّق تلقائيًا على التقارير المالية والإيصالات. معدل متجرك الحالي:
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary-tint)] px-3 py-1.5 font-mono text-sm font-bold tabular-nums text-[var(--color-primary)]">
            {vatRate}٪
          </p>
        </div>

        <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2.5">
            <CreditCard className="h-4 w-4 text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">بوابات الدفع</h3>
          </div>
          <ul className="space-y-2 text-[12.5px] text-[var(--color-text-secondary)]">
            <li className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-[var(--color-text-muted)]" />
              BenefitPay — متاح على خطة المؤسسة
            </li>
            <li className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[var(--color-text-muted)]" />
              Stripe — قيد الإعداد
            </li>
          </ul>
          <p className="mt-4 text-[11.5px] text-[var(--color-text-muted)]">
            تُفعَّل بوابات الدفع تلقائيًا بعد تفعيل الخطة المناسبة.
          </p>
        </div>
      </div>
    </div>
  );
}
