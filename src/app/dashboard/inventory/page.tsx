import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { InventoryClient } from './inventory-client';
import type { Expense, InventoryItem, Supplier } from '@/lib/types';

export default async function InventoryPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const supabase = await createClient();

  const [{ data: items }, { data: suppliers }, { data: expenses }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('*')
      .eq('project_id', ctx.project.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('suppliers')
      .select('*')
      .eq('project_id', ctx.project.id)
      .order('name'),
    supabase
      .from('expenses')
      .select('*')
      .eq('project_id', ctx.project.id)
      .order('occurred_on', { ascending: false })
      .limit(100),
  ]);

  return (
    <InventoryClient
      projectId={ctx.project.id}
      currency={ctx.project.currency}
      initialItems={(items ?? []) as InventoryItem[]}
      initialSuppliers={(suppliers ?? []) as Supplier[]}
      initialExpenses={(expenses ?? []) as Expense[]}
    />
  );
}
