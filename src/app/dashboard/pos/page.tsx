import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getCurrentProject } from '@/lib/project';
import { createClient } from '@/lib/supabase/server';
import type { Product, ProductAddon } from '@/lib/types';

type ProductWithAddons = Product & { product_addons: ProductAddon[] };

/**
 * Dynamic import: PosClient lives in its own JS chunk.
 * It only loads when the user actually visits /dashboard/pos.
 * The skeleton shows instantly while the chunk downloads + hydrates.
 */
const PosClient = dynamic<{
  projectId: string;
  currency: string;
  products: (Product & { product_addons: ProductAddon[] })[];
}>(
  () => import('./pos-client').then((mod) => ({ default: mod.PosClient })),
  {
    ssr: true,
    loading: () => <PosLoader />,
  }
);

function PosLoader() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>نقطة البيع</h1>
          <p>جاري التحميل…</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card card-body animate-pulse h-20">
                <div className="h-4 w-3/4 rounded bg-[var(--color-border)]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[var(--color-border)]" />
              </div>
            ))}
          </div>
        </div>
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div className="h-4 w-16 rounded bg-[var(--color-border)]" />
          </div>
          <div className="card-body">
            <div className="h-32 rounded bg-[var(--color-border)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function PosPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  const supabase = await createClient();
  const { data: products } = await supabase
    .from('products')
    .select('*, product_addons(*)')
    .eq('project_id', ctx.project.id)
    .order('sort_order');

  return (
    <PosClient
      projectId={ctx.project.id}
      currency={ctx.project.currency}
      products={
        (products ?? []) as (Product & { product_addons: ProductAddon[] })[]
      }
    />
  );
}
