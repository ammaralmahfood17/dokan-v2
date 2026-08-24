import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { CustomersClient } from './customers-client';
import type { Campaign, Customer } from '@/lib/types';

export default async function CustomersPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const supabase = await createClient();

  // Fetch ALL customers via a paged loop — a hard .limit() would truncate the
  // list and undercount any campaign audience (audienceCount() filters this
  // in-memory array).
  const allCustomers: Customer[] = [];
  const CUSTOMER_PAGE = 1000;
  for (let from = 0; ; from += CUSTOMER_PAGE) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('project_id', ctx.project.id)
      .order('created_at', { ascending: false })
      .range(from, from + CUSTOMER_PAGE - 1);
    if (error || !data) break;
    allCustomers.push(...(data as Customer[]));
    if (data.length < CUSTOMER_PAGE) break;
  }

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('project_id', ctx.project.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <CustomersClient
      projectId={ctx.project.id}
      currency={ctx.project.currency}
      initialCustomers={allCustomers}
      initialCampaigns={(campaigns ?? []) as Campaign[]}
    />
  );
}
