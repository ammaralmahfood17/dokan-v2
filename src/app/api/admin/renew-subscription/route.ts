import { NextRequest, NextResponse } from 'next/server';
// F4: purge the project's cached public menu after subscription changes.
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/admin/renew-subscription
 * Owner-only manual renewal after cash payment is collected.
 * Body: { projectId: string, days?: number } (days defaults to 30 in the RPC)
 *
 * The RPC renew_subscription() itself enforces owner-or-super-admin; this
 * route resolves the authenticated user id and passes it through as
 * p_caller_user_id (service_role calls have auth.uid() = NULL).
 */
export async function POST(request: NextRequest) {
  try {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const body = (await request.json()) as { projectId?: string; days?: number };
    if (!body.projectId || typeof body.projectId !== 'string') {
      return NextResponse.json({ error: 'projectId مطلوب' }, { status: 400 });
    }

    const days = typeof body.days === 'number' && body.days > 0 && body.days <= 365 ? Math.floor(body.days) : 30;

    const admin = createAdminClient();
    const { data: newExpiry, error } = await admin.rpc('renew_subscription', {
      p_project_id: body.projectId,
      p_days: days,
      p_caller_user_id: user.id,
    });

    if (error) {
      // RPC raises 42501 for non-owners and P0002 for missing project.
      if (error.code === '42501' || error.message?.includes('42501')) {
        return NextResponse.json({ error: 'صلاحية المالك مطلوبة' }, { status: 403 });
      }
      Sentry.captureException(error);
      return NextResponse.json({ error: 'فشل التجديد' }, { status: 500 });
    }

    // F4: purge the cached public menu so a renewed store comes back live
    // immediately instead of up to 60s later.
    revalidateTag(`menu-${body.projectId}`, 'max');

    return NextResponse.json({ subscription_expires_at: newExpiry });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
