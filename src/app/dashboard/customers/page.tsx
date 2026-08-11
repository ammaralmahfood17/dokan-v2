import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { CustomersClient } from './customers-client';
import type { Campaign, Customer } from '@/lib/types';

export default async function CustomersPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const supabase = await createClient();

  const [{ data: customers }, { data: campaigns }] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('project_id', ctx.project.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('campaigns')
      .select('*')
      .eq('project_id', ctx.project.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <CustomersClient
      projectId={ctx.project.id}
      currency={ctx.project.currency}
      initialCustomers={(customers ?? []) as Customer[]}
      initialCampaigns={(campaigns ?? []) as Campaign[]}
    />
  );
}
