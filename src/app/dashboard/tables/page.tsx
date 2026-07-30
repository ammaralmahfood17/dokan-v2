import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import { TablesClient } from './tables-client';
import type { Table } from '@/lib/types';

export default async function TablesPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const supabase = await createClient();
  const { data: tables } = await supabase
    .from('tables')
    .select('*')
    .eq('project_id', ctx.project.id)
    .order('number');

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'http://localhost:3000';

  return (
    <TablesClient
      projectId={ctx.project.id}
      projectSlug={ctx.project.slug}
      siteUrl={siteUrl}
      initialTables={(tables ?? []) as Table[]}
    />
  );
}
