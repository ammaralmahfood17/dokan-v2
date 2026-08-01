import { notFound } from 'next/navigation';
import { createAnonClient } from '@/lib/supabase/anon';
import { MenuClient } from './menu-client';
import type { Category, Product, ProductAddon, Project, Table } from '@/lib/types';

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ projectSlug: string; tableSlug: string }>;
}) {
  const { projectSlug, tableSlug } = await params;
  // anon client (no user cookies) → RLS anon role → public menu data,
  // so signed-in users see other restaurants' menus too
  const supabase = createAnonClient();

  // Resolve active project by slug
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', projectSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (!project) notFound();

  // Resolve active table inside project
  const { data: table } = await supabase
    .from('tables')
    .select('*')
    .eq('project_id', project.id)
    .eq('slug', tableSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (!table) notFound();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, sort_order, is_active')
      .eq('project_id', project.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('products')
      .select('*, product_addons(*)')
      .eq('project_id', project.id)
      .eq('is_available', true)
      .order('sort_order'),
  ]);

  return (
    <MenuClient
      project={project as Project}
      table={table as Table}
      categories={(categories ?? []) as Category[]}
      products={
        (products ?? []) as (Product & { product_addons: ProductAddon[] })[]
      }
    />
  );
}
