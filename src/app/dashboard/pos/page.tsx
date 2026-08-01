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
    <div className="page md:max-w-[1440px]">
      <div className="page-header">
        <div>
          <h1>نقطة البيع</h1>
          <p>جاري التحميل…</p>
        </div>
      </div>
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex gap-1 rounded-[8px] bg-[var(--pos-bg)] p-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 flex-1 rounded-[6px] bg-[var(--pos-surface)]" />
            ))}
          </div>
          <div className="mb-3 flex gap-2">
            <div className="h-11 flex-1 rounded-[8px] border border-[var(--pos-border)] bg-[var(--pos-surface)]" />
            <div className="h-11 flex-1 rounded-[8px] border border-[var(--pos-border)] bg-[var(--pos-surface)]" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-[8px] border border-[var(--pos-border)] bg-[var(--pos-surface)]"
              >
                <div className="aspect-[4/3] w-full animate-pulse bg-[var(--pos-bg)]" />
                <div className="space-y-2 p-2.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--pos-border)]" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--pos-border)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className="hidden md:block">
          <div className="h-[calc(100dvh-57px)] rounded-[10px] border border-[var(--pos-border)] bg-[var(--pos-surface)] p-4 lg:h-dvh">
            <div className="h-6 w-20 animate-pulse rounded bg-[var(--pos-border)]" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-11 w-full animate-pulse rounded-[8px] bg-[var(--pos-bg)]" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--pos-border)]" />
                </div>
              ))}
            </div>
            <div className="mt-8 h-11 w-full animate-pulse rounded-[8px] bg-[var(--pos-green-light)]" />
          </div>
        </aside>
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
