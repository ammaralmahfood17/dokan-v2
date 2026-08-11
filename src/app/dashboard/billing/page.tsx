import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { BillingClient } from './billing-client';
import type { SubscriptionPlan } from '@/lib/types';

export default async function BillingPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const supabase = await createClient();

  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  return (
    <BillingClient
      projectId={ctx.project.id}
      currency={ctx.project.currency}
      currentPlan={ctx.project.plan_code}
      vatRate={ctx.project.vat_rate}
      plans={(plans ?? []) as SubscriptionPlan[]}
    />
  );
}
