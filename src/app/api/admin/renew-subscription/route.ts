import { NextRequest, NextResponse } from 'next/server';
// F4: purge the project's cached public menu after subscription changes.
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit';

const UUID_RE = /^[0-9a-f-]{36}$/i;

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
    if (!body.projectId || typeof body.projectId !== 'string' || !UUID_RE.test(body.projectId)) {
      return NextResponse.json({ error: 'projectId مطلوب' }, { status: 400 });
    }

    // Renewal is a paid business action and repeatable in a loop — cap per
    // (user, project). The RPC also clamps p_days to ≤365 (see migration 0010).
    const rl = await rateLimit(`${user.id}:${body.projectId}`, {
      limit: 10,
      windowMs: 3600 * 1000,
      keyPrefix: 'renew-subscription',
      projectId: body.projectId,
      callerUserId: user.id,
    });
    if (!rl.allowed) {
      const r = createRateLimitResponse(rl.resetIn);
      return NextResponse.json({ error: r.error }, { status: r.status });
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
