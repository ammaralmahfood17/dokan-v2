import { createClient } from '@/lib/supabase/server';
import type { Project, StaffMember } from '@/lib/types';
import type { ChecklistItem } from '@/lib/types';

export type ProjectContext = {
  project: Project;
  membership: StaffMember;
  userId: string;
};

/**
 * Resolve the current user's primary project (first membership).
 * Returns null if unauthenticated or no project yet.
 *
 * SECURITY: getUser() verifies the session with the Auth server (catches
 * revoked/expired tokens that a locally-decoded JWT would still accept).
 * getSession() alone trusts the unsigned cookie claims — fine for a fast
 * redirect in middleware, NOT for gating protected data.
 */
export async function getCurrentProject(): Promise<ProjectContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Parallel queries: staff_members + projects together
  const { data: membership } = await supabase
    .from('staff_members')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', membership.project_id)
    .single();

  if (!project) return null;

  return {
    project: project as Project,
    membership: membership as StaffMember,
    userId: user.id,
  };
}

/** Build live onboarding checklist from real DB counts */
export async function buildChecklist(projectId: string): Promise<ChecklistItem[]> {
  const supabase = await createClient();

  const [
    { count: productCount },
    { count: tableCount },
    { data: project },
    { count: orderCount },
  ] = await Promise.all([
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('tables')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('projects')
      .select('name, primary_color, slug')
      .eq('id', projectId)
      .single(),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
  ]);

  const hasBranding = Boolean(
    project?.name && project?.primary_color && project?.slug
  );
  const hasTable = (tableCount ?? 0) > 0;
  // QR is generated with every table (qrcode column always set)
  const hasQr = hasTable;
  const hasProduct = (productCount ?? 0) > 0;
  const hasOrder = (orderCount ?? 0) > 0;

  return [
    {
      id: 'product',
      label: 'أضف أول منتج',
      done: hasProduct,
      href: '/dashboard/products',
    },
    {
      id: 'branding',
      label: 'تأكيد اسم المتجر والهوية',
      done: hasBranding,
      href: '/dashboard/settings',
    },
    {
      id: 'table',
      label: 'أنشئ أول طاولة',
      done: hasTable,
      href: '/dashboard/tables',
    },
    {
      id: 'qr',
      label: 'ولّد أول رمز QR',
      done: hasQr,
      href: '/dashboard/tables',
    },
    {
      id: 'order',
      label: 'اختبر أول طلب',
      done: hasOrder,
      href: '/dashboard/orders',
    },
  ];
}
